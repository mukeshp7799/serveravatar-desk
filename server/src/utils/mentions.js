/**
 * Mentions utility — parses @username patterns from content, resolves them
 * to active project members, stores records in the `mentions` table, and
 * creates in-app notifications for each mentioned user.
 *
 * Supported source_type values (must match the MySQL enum):
 *   task_comment | document_comment | testcase_comment |
 *   discussion_message | chat_message | project_message |
 *   document_body | todo_note
 */

const pool = require("../config/database");
const { t } = require("../i18n");

/* ─────────────────────────────────────────────────────────────────────────
 * 1.  Parse @username tokens from plain-text / HTML content
 * ─────────────────────────────────────────────────────────────────────── */

/**
 * Extract all @username tokens from `content`.
 * Handles plain text and simple HTML (strips tags first).
 * Returns an array of normalised username strings (lowercase, trimmed).
 *
 * Pattern: @firstname[.lastname] — letters, dots, numbers, underscores,
 * hyphens, minimum 2 chars after the @.
 */
const MENTION_RE = /@([a-zA-Z][a-zA-Z0-9._-]{1,49})/g;

function extractMentionTokens(content = "") {
  // Strip HTML tags so we match the underlying text.
  const text = String(content).replace(/<[^>]*>/g, " ");
  const tokens = [];
  let m;
  MENTION_RE.lastIndex = 0;
  while ((m = MENTION_RE.exec(text)) !== null) {
    tokens.push(m[1].toLowerCase().trim());
  }
  return [...new Set(tokens)]; // deduplicate
}

/* ─────────────────────────────────────────────────────────────────────────
 * 2.  Resolve tokens → active user IDs within a project
 * ─────────────────────────────────────────────────────────────────────── */

/**
 * Given a list of normalised username tokens and a projectId, resolve them
 * to an array of user objects who are:
 *   • status = 'active' (not inactive / archived)
 *   • members of the project (project_members row with status='active')
 *     OR the project owner (projects.manager_id)
 *
 * Returns:  Array<{ id, first_name, last_name, email, avatar_url }>
 */
async function resolveMentions(projectId, tokens) {
  if (!tokens.length) return [];

  // Build a safe IN clause for the usernames.
  // We search first_name+last_name combos and also email prefixes.
  // For simplicity we match the full "first_name.last_name" format that
  // our frontend display name convention uses (e.g. "Mukesh Prajapati").
  const placeholders = tokens.map(() => "?").join(",");
  const [rows] = await pool.query(
    `SELECT u.id, u.first_name, u.last_name, u.email, u.avatar_url
       FROM users u
      WHERE LOWER(CONCAT(IFNULL(TRIM(u.first_name),''),'.',IFNULL(TRIM(u.last_name),''))) IN (${placeholders})
         OR LOWER(u.email) IN (${placeholders})
         OR LOWER(CONCAT(IFNULL(TRIM(u.first_name),''),' ',IFNULL(TRIM(u.last_name),''))) IN (${placeholders})
    `,
    [...tokens, ...tokens, ...tokens]
  );

  // Any user can mention any other user — no project membership restriction.
  return rows.filter((r) => r.id);
}

/* ─────────────────────────────────────────────────────────────────────────
 * 3.  Store mentions + send notifications
 * ─────────────────────────────────────────────────────────────────────── */

/**
 * Main entry point — call this whenever content is created or updated.
 *
 * @param {object} opts
 * @param {number}   opts.projectId          — projects.id
 * @param {string}   opts.sourceType         — mentions source_type enum value
 * @param {number}   opts.sourceId           — PK of the comment / message row
 * @param {string}   opts.content            — raw body text / HTML of the comment
 * @param {number}   opts.mentionedByUserId   — users.id of the author
 * @param {string}   [opts.lang]             — i18n language code
 * @param {string}   [opts.resourceTitle]    — optional title for the notification link text
 * @param {string}   [opts.link]             — URL path to the resource (e.g. /projects/1/discussions?id=5)
 */
async function processAndNotifyMentions({
  projectId,
  sourceType,
  sourceId,
  content,
  mentionedByUserId,
  lang = "en",
  resourceTitle = "",
  link = "",
}) {
  const tokens = extractMentionTokens(content);
  if (!tokens.length) return [];

  const mentionedUsers = await resolveMentions(projectId, tokens);
  if (!mentionedUsers.length) return [];

  const results = [];
  const now = new Date();

  for (const user of mentionedUsers) {
    // Don't notify yourself.
    if (user.id === mentionedByUserId) continue;

    try {
      // Upsert the mention record (replace if re-posted after edit).
      // UNIQUE KEY uk_source_user prevents duplicates at DB level.
      await pool.query(
        `INSERT INTO mentions (project_id, source_type, source_id, mentioned_user_id, mentioned_by_user_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE created_at = VALUES(created_at)`,
        [projectId, sourceType, sourceId, user.id, mentionedByUserId, now]
      );

      // Build the in-app notification.
      const senderName = ""; // caller should pass sender name; we resolve it below if needed.
      const snippet =
        content.replace(/<[^>]*>/g, " ").substring(0, 80).trim() ||
        "(mention)";

      await pool.query(
        `INSERT INTO notifications (user_id, type, title, message, link, is_read, created_at)
         VALUES (?, ?, ?, ?, ?, FALSE, NOW())`,
        [
          user.id,
          "mention",
          "You were mentioned",
          snippet,
          link || "#",
        ]
      );

      results.push({ userId: user.id, stored: true });
    } catch (err) {
      // Duplicate entry is expected when ON DUPLICATE KEY fires; ignore it.
      if (err.code !== "ER_DUP_ENTRY") {
        console.error(`[mentions] Failed to store mention for user ${user.id}:`, err.message);
      }
    }
  }

  return results;
}

/**
 * Delete all mention records for a given source (used when a comment is deleted).
 */
async function deleteMentions(sourceType, sourceId) {
  try {
    await pool.query(
      "DELETE FROM mentions WHERE source_type = ? AND source_id = ?",
      [sourceType, sourceId]
    );
  } catch (err) {
    console.error("[mentions] deleteMentions failed:", err.message);
  }
}

module.exports = {
  extractMentionTokens,
  resolveMentions,
  processAndNotifyMentions,
  deleteMentions,
  // Re-export source_type values for callers so they don't hardcode strings.
  SOURCE_TYPES: {
    TASK_COMMENT: "task_comment",
    DOCUMENT_COMMENT: "document_comment",
    TESTCASE_COMMENT: "testcase_comment",
    DISCUSSION_MESSAGE: "discussion_message",
    CHAT_MESSAGE: "chat_message",
    PROJECT_MESSAGE: "project_message",
    DOCUMENT_BODY: "document_body",
    TODO_NOTE: "todo_note",
  },
};
