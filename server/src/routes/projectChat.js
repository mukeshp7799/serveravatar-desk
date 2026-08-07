/**
 * Project Chat Board routes.
 *
 * Real-time chat scoped to a single project. Each project has ONE chat
 * (no channels — the message board feature covers pinned/structured
 * updates; this one is just chronological conversation).
 *
 * Access model:
 *   • Both reading and writing require the user to be a project member
 *     (project_members row) OR the project owner (projects.manager_id).
 *     "Project Members" membership is the only gate — there is no
 *     role-permission check beyond being on the team.
 *   • Editing and deleting a message: only the author may do so.
 *   • Soft-delete: deletes set `deleted_at`; the row stays in the DB so
 *     reactions and attachments remain intact for audit/history.
 *
 * Endpoints (all JSON, all behind `auth`):
 *   GET    /api/projects/:projectId/chat                       — list messages
 *   GET    /api/projects/:projectId/chat?since=<iso>           — only messages updated after <iso> (used by the polling loop)
 *   POST   /api/projects/:projectId/chat                       — create { body }
 *   PUT    /api/projects/:projectId/chat/:messageId            — edit { body } (own only)
 *   DELETE /api/projects/:projectId/chat/:messageId            — soft-delete (own only)
 *   POST   /api/projects/:projectId/chat/:messageId/attachments — multipart file upload
 *   DELETE /api/projects/:projectId/chat/:messageId/attachments/:attachmentId — remove attachment (own message only)
 *   POST   /api/projects/:projectId/chat/:messageId/reactions  — toggle reaction { emoji }
 *
 * Reaction semantics:
 *   • UNIQUE(message_id, user_id) — at most one row per user per message.
 *   • Same emoji as existing  → DELETE (toggle off).
 *   • Different emoji         → UPDATE the row's emoji (switch in place).
 *   • No existing reaction    → INSERT the new emoji.
 */

const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const pool = require("../config/database");
const { auth } = require("../middleware/auth");
const { isProjectMember, requireProjectMember } = require("../middleware/projectMember");
const { t } = require("../i18n");
const { recordActivity } = require("../utils/activity");
const { processAndNotifyMentions, SOURCE_TYPES } = require("../utils/mentions");

const router = express.Router({ mergeParams: true });

/* ──────────────────────────────────────────────────────────────────
 * File upload setup
 *
 * Mirrors documents.js — files are written to
 * /var/www/seravavatar-hub/uploads/<random>.<ext>. The full path is
 * stored in `project_chat_attachments.file_path` so the server can
 * stream/delete them later.
 * ────────────────────────────────────────────────────────────────── */
const UPLOAD_DIR = "/var/www/seravavatar-hub/uploads";
const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, `chat-${unique}${path.extname(file.originalname)}`);
  },
});
// Exposed via nginx static alias — same pattern as documents + task
// attachments. Storing the public URL in `file_url` means <img src> tags
// in the React UI load inline without needing an Authorization header
// (which browsers can't attach to <img> requests).
const publicUrlFor = (filename) => `/uploads/${filename}`;
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB per file
});

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/** Trim + collapse whitespace + clamp message body length. */
const normaliseBody = (raw) => {
  if (typeof raw !== "string") return "";
  return raw.replace(/\s+/g, " ").trim().slice(0, 4000);
};

/** Hydrate a set of message rows with author info, attachments,
 *  reaction aggregates, and the per-emoji user list (for hover tooltips).
 *
 *  Shape:
 *   [{
 *      id, project_id, author_id,
 *      author_name, author_email, author_avatar, author_initials,
 *      body, created_at, updated_at, edited_at, deleted_at,
 *      is_mine,
 *      attachments: [{ id, file_name, mime_type, file_size, file_url, is_image }],
 *      reactions:   [{ emoji, count, mine, users: string[] }]
 *   }]
 */
const hydrateMessages = async (rows, currentUserId, currentUserEmail) => {
  if (!rows || rows.length === 0) return [];
  const ids = rows.map((r) => r.id);

  // Author names already come back from the SELECT JOIN; extract once.
  const messages = rows.map((r) => {
    const authorName =
      [r.first_name, r.last_name].filter(Boolean).join(" ").trim() ||
      r.email ||
      "Unknown";
    return {
      id: r.id,
      project_id: r.project_id,
      author_id: r.author_id,
      author_name: authorName,
      author_email: r.email,
      author_avatar: r.avatar_url || null,
      author_initials: authorName
        .split(/\s+/)
        .map((p) => p[0])
        .filter(Boolean)
        .slice(0, 2)
        .join("")
        .toUpperCase(),
      body: r.deleted_at ? "" : r.body,
      created_at: r.created_at,
      updated_at: r.updated_at,
      edited_at: r.edited_at,
      deleted_at: r.deleted_at,
      is_mine: r.email === currentUserEmail,
      attachments: [],
      reactions: [],
    };
  });

  // Attachments for all messages in one query.
  const [attachmentRows] = await pool.query(
    `SELECT id, message_id, file_name, file_path, mime_type, file_size
     FROM project_chat_attachments
     WHERE message_id IN (?)`,
    [ids]
  );
  const byMsg = {};
  attachmentRows.forEach((a) => {
    if (!byMsg[a.message_id]) byMsg[a.message_id] = [];
    byMsg[a.message_id].push({
      id: a.id,
      file_name: a.file_name,
      file_path: a.file_path,
      mime_type: a.mime_type,
      file_size: a.file_size,
      is_image: typeof a.mime_type === "string" && a.mime_type.startsWith("image/"),
    });
  });
  messages.forEach((m) => {
    const atts = byMsg[m.id] || [];
    m.attachments = atts.map((a) => ({
      id: a.id,
      file_name: a.file_name,
      mime_type: a.mime_type,
      file_size: a.file_size,
      is_image: a.is_image,
      // Public static URL — the React UI uses this directly in <img src>
      // (browsers can't send Authorization headers on <img> requests).
      // Force-download via the same URL with ?download=1 is handled by
      // nginx Content-Disposition rules for non-image MIME types.
      file_url: publicUrlFor(path.basename(a.file_path)),
    }));
  });

  // Reactions: aggregate per (message_id, emoji) + per-user list for tooltips.
  const [reactionRows] = await pool.query(
    `SELECT pcr.message_id, pcr.emoji, pcr.user_id,
            u.first_name, u.last_name, u.email
     FROM project_chat_reactions pcr
     JOIN users u ON pcr.user_id = u.id
     WHERE pcr.message_id IN (?)
     ORDER BY pcr.created_at ASC`,
    [ids]
  );
  const [aggregateRows] = await pool.query(
    `SELECT message_id, emoji,
            COUNT(*) AS count,
            MAX(user_id = ?) AS mine
     FROM project_chat_reactions
     WHERE message_id IN (?)
     GROUP BY message_id, emoji`,
    [currentUserId, ids]
  );
  const reactMap = {};
  aggregateRows.forEach((r) => {
    if (!reactMap[r.message_id]) reactMap[r.message_id] = {};
    reactMap[r.message_id][r.emoji] = { emoji: r.emoji, count: r.count, mine: !!r.mine, users: [] };
  });
  reactionRows.forEach((r) => {
    const grp = reactMap[r.message_id] && reactMap[r.message_id][r.emoji];
    if (!grp) return;
    const name =
      [r.first_name, r.last_name].filter(Boolean).join(" ").trim() || r.email || "Unknown";
    grp.users.push(name);
  });
  messages.forEach((m) => {
    m.reactions = Object.values(reactMap[m.id] || {});
  });

  return messages;
};

/* ──────────────────────────────────────────────────────────────────
 * Routes
 * ────────────────────────────────────────────────────────────────── */

/**
 * GET /api/projects/:projectId/chat
 *
 * List chat messages for a project, newest first (chronological in
 * the UI but stored with created_at for stability). Supports a
 * `since=<iso>` query param used by the polling loop on the frontend
 * — only messages with `updated_at > since` are returned, which lets
 * the client merge updates without re-fetching the entire history.
 */
router.get("/projects/:projectId/chat", auth, requireProjectMember("projectId"), async (req, res, next) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    const since = typeof req.query.since === "string" ? req.query.since : null;
    let sql = `
      SELECT pcm.*, u.first_name, u.last_name, u.email, u.avatar_url
      FROM project_chat_messages pcm
      JOIN users u ON pcm.author_id = u.id
      WHERE pcm.project_id = ?`;
    const params = [projectId];
    if (since) {
      sql += " AND pcm.updated_at > ?";
      params.push(since);
    }
    sql += " ORDER BY pcm.created_at ASC LIMIT 200";
    const [rows] = await pool.query(sql, params);
    const messages = await hydrateMessages(rows, req.user.id, req.user.email);
    res.json({ messages });
  } catch (e) {
    console.error("[chat GET]", e);
    next(e);
  }
});

/**
 * POST /api/projects/:projectId/chat
 *
 * Create a chat message. Body: { body: string }.
 *
 * The frontend first uploads any attachments via the
 * /chat/:messageId/attachments endpoint AFTER creating the message —
 * which means we accept `attachment_ids: number[]` here too, so the
 * client can attach already-uploaded files in one round-trip.
 */
router.post("/projects/:projectId/chat", auth, requireProjectMember("projectId"), async (req, res, next) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    const body = normaliseBody(req.body?.body);
    if (!body) return res.status(400).json({ error: t(req.lang, "errors.invalidRequest") });

    const [result] = await pool.query(
      "INSERT INTO project_chat_messages (project_id, author_id, body) VALUES (?, ?, ?)",
      [projectId, req.user.id, body]
    );
    const messageId = result.insertId;

    // Process @mentions — store records and send in-app notifications.
    await processAndNotifyMentions({
      projectId,
      sourceType: SOURCE_TYPES.CHAT_MESSAGE,
      sourceId: messageId,
      content: body,
      mentionedByUserId: req.user.id,
      lang: req.lang,
      link: `/projects/${projectId}/chat`,
    });

    // Optionally attach any pre-uploaded file IDs (currently unused —
    // the frontend uses the post-create attachment endpoint — but kept
    // here for future flexibility, e.g. draft-and-send flows).
    const attIds = Array.isArray(req.body?.attachment_ids) ? req.body.attachment_ids.filter((n) => Number.isFinite(n)) : [];
    if (attIds.length > 0) {
      await pool.query(
        `UPDATE project_chat_attachments SET message_id = ?
         WHERE id IN (?) AND message_id IS NULL`,
        [messageId, attIds]
      );
    }

    // Re-fetch + hydrate so the response is identical to GET shape.
    const [rows] = await pool.query(
      `SELECT pcm.*, u.first_name, u.last_name, u.email, u.avatar_url
       FROM project_chat_messages pcm
       JOIN users u ON pcm.author_id = u.id
       WHERE pcm.id = ?`,
      [messageId]
    );
    const messages = await hydrateMessages(rows, req.user.id, req.user.email);
    await recordActivity(pool, {
      projectId,
      actorId: req.user.id,
      feature: 'chat',
      action: 'message_posted',
      targetType: 'chat_message',
      targetId: messageId,
      targetLabel: body.slice(0, 120),
    });
    res.status(201).json({ message: messages[0] });
  } catch (e) {
    console.error("[chat POST]", e);
    next(e);
  }
});

/**
 * PUT /api/projects/:projectId/chat/:messageId
 *
 * Edit a message body. Only the author can edit. Cannot edit a deleted
 * message. Sets `edited_at` so the UI can show "(edited)".
 */
router.put("/projects/:projectId/chat/:messageId", auth, requireProjectMember("projectId"), async (req, res, next) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    const messageId = parseInt(req.params.messageId, 10);
    if (!projectId || !messageId) return res.status(400).json({ error: t(req.lang, "errors.invalidRequest") });
    const body = normaliseBody(req.body?.body);
    if (!body) return res.status(400).json({ error: t(req.lang, "errors.invalidRequest") });

    const [rows] = await pool.query(
      "SELECT id, project_id, author_id, deleted_at FROM project_chat_messages WHERE id = ?",
      [messageId]
    );
    if (rows.length === 0) return res.status(404).json({ error: t(req.lang, "errors.messageNotFound") });
    const m = rows[0];
    if (m.project_id !== projectId) return res.status(404).json({ error: t(req.lang, "errors.messageNotFound") });
    if (m.author_id !== req.user.id) return res.status(403).json({ error: t(req.lang, "errors.permissionDenied") });
    if (m.deleted_at) return res.status(400).json({ error: t(req.lang, "errors.cannotEditDeleted") });

    await pool.query(
      "UPDATE project_chat_messages SET body = ?, edited_at = CURRENT_TIMESTAMP WHERE id = ?",
      [body, messageId]
    );
    const [updatedRows] = await pool.query(
      `SELECT pcm.*, u.first_name, u.last_name, u.email, u.avatar_url
       FROM project_chat_messages pcm
       JOIN users u ON pcm.author_id = u.id
       WHERE pcm.id = ?`,
      [messageId]
    );
    const messages = await hydrateMessages(updatedRows, req.user.id, req.user.email);
    await recordActivity(pool, {
      projectId,
      actorId: req.user.id,
      feature: 'chat',
      action: 'message_updated',
      targetType: 'chat_message',
      targetId: messageId,
      targetLabel: body.slice(0, 120),
    });
    res.json({ message: messages[0] });
  } catch (e) {
    console.error("[chat PUT]", e);
    next(e);
  }
});

/**
 * DELETE /api/projects/:projectId/chat/:messageId
 *
 * Soft-delete (sets deleted_at). Only the author can delete.
 * Reactions and attachments are kept for audit history.
 */
router.delete("/projects/:projectId/chat/:messageId", auth, requireProjectMember("projectId"), async (req, res, next) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    const messageId = parseInt(req.params.messageId, 10);
    if (!projectId || !messageId) return res.status(400).json({ error: t(req.lang, "errors.invalidRequest") });
    const [rows] = await pool.query(
      "SELECT id, project_id, author_id, deleted_at FROM project_chat_messages WHERE id = ?",
      [messageId]
    );
    if (rows.length === 0) return res.status(404).json({ error: t(req.lang, "errors.messageNotFound") });
    const m = rows[0];
    if (m.project_id !== projectId) return res.status(404).json({ error: t(req.lang, "errors.messageNotFound") });
    if (m.author_id !== req.user.id) return res.status(403).json({ error: t(req.lang, "errors.permissionDenied") });

    // Idempotent: if already deleted, just return success.
    if (m.deleted_at) return res.json({ ok: true, alreadyDeleted: true });

    await pool.query(
      "UPDATE project_chat_messages SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?",
      [messageId]
    );
    await recordActivity(pool, {
      projectId,
      actorId: req.user.id,
      feature: 'chat',
      action: 'message_deleted',
      targetType: 'chat_message',
      targetId: messageId,
      targetLabel: null,
    });
    res.json({ ok: true });
  } catch (e) {
    console.error("[chat DELETE]", e);
    next(e);
  }
});

/**
 * POST /api/projects/:projectId/chat/:messageId/attachments
 *
 * Multipart file upload. Up to 5 files per request, 10MB each. Attaches
 * them to the message. Only the message author may attach (matches the
 * edit/delete rule).
 */
router.post(
  "/projects/:projectId/chat/:messageId/attachments",
  auth,
  requireProjectMember("projectId"),
  upload.array("files", 5),
  async (req, res, next) => {
    try {
      const projectId = parseInt(req.params.projectId, 10);
      const messageId = parseInt(req.params.messageId, 10);
      if (!projectId || !messageId) return res.status(400).json({ error: t(req.lang, "errors.invalidRequest") });
      const [rows] = await pool.query(
        "SELECT id, project_id, author_id, deleted_at FROM project_chat_messages WHERE id = ?",
        [messageId]
      );
      if (rows.length === 0) return res.status(404).json({ error: t(req.lang, "errors.messageNotFound") });
      const m = rows[0];
      if (m.project_id !== projectId) return res.status(404).json({ error: t(req.lang, "errors.messageNotFound") });
      if (m.author_id !== req.user.id) return res.status(403).json({ error: t(req.lang, "errors.permissionDenied") });
      if (m.deleted_at) return res.status(400).json({ error: t(req.lang, "errors.cannotEditDeleted") });

      const files = Array.isArray(req.files) ? req.files : [];
      if (files.length === 0) return res.status(400).json({ error: t(req.lang, "errors.noFilesUploaded") });

      const created = [];
      for (const f of files) {
        const [r] = await pool.query(
          `INSERT INTO project_chat_attachments
             (message_id, file_name, file_path, mime_type, file_size)
           VALUES (?, ?, ?, ?, ?)`,
          [messageId, f.originalname, f.path, f.mimetype || null, f.size || 0]
        );
        created.push({
          id: r.insertId,
          message_id: messageId,
          file_name: f.originalname,
          file_path: f.path,
          file_url: publicUrlFor(path.basename(f.path)),
          mime_type: f.mimetype || null,
          file_size: f.size || 0,
          is_image: typeof f.mimetype === 'string' && f.mimetype.startsWith('image/'),
        });
      }
      // Touch updated_at so the polling loop on other clients picks up the
      // new attachments.
      await pool.query(
        "UPDATE project_chat_messages SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [messageId]
      );
      res.status(201).json({ attachments: created });
    } catch (e) {
      console.error("[chat attachments POST]", e);
      next(e);
    }
  }
);

/**
 * POST /api/projects/:projectId/chat/:messageId/reactions
 *
 * Toggle reaction semantics:
 *   • No existing reaction   → INSERT new emoji.
 *   • Same emoji as existing → DELETE (toggle off).
 *   • Different emoji        → UPDATE in place (switch).
 *   UNIQUE(message_id, user_id) guarantees at most one row per user.
 */
router.post("/projects/:projectId/chat/:messageId/reactions", auth, requireProjectMember("projectId"), async (req, res, next) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    const messageId = parseInt(req.params.messageId, 10);
    if (!projectId || !messageId) return res.status(400).json({ error: t(req.lang, "errors.invalidRequest") });
    const { emoji } = req.body || {};
    if (!emoji || typeof emoji !== "string" || emoji.length > 16) {
      return res.status(400).json({ error: t(req.lang, "errors.invalidRequest") });
    }
    const [rows] = await pool.query(
      "SELECT id, project_id, deleted_at FROM project_chat_messages WHERE id = ?",
      [messageId]
    );
    if (rows.length === 0) return res.status(404).json({ error: t(req.lang, "errors.messageNotFound") });
    const m = rows[0];
    if (m.project_id !== projectId) return res.status(404).json({ error: t(req.lang, "errors.messageNotFound") });
    if (m.deleted_at) return res.status(400).json({ error: t(req.lang, "errors.cannotReactDeleted") });

    const { old_emoji } = req.body || {};
    if (old_emoji && typeof old_emoji === "string" && old_emoji !== emoji) {
      // Replace: delete old emoji first
      await pool.query(
        "DELETE FROM project_chat_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?",
        [messageId, req.user.id, old_emoji]
      );
      // Insert new emoji if not already present
      const [alreadyHas] = await pool.query(
        "SELECT id FROM project_chat_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?",
        [messageId, req.user.id, emoji]
      );
      if (alreadyHas.length === 0) {
        await pool.query(
          "INSERT INTO project_chat_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)",
          [messageId, req.user.id, emoji]
        );
      }
    } else {
      // Toggle: delete if exists, insert if not
      const [existing] = await pool.query(
        "SELECT id FROM project_chat_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?",
        [messageId, req.user.id, emoji]
      );
      if (existing.length > 0) {
        await pool.query("DELETE FROM project_chat_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?", [messageId, req.user.id, emoji]);
      } else {
        await pool.query("INSERT INTO project_chat_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)", [messageId, req.user.id, emoji]);
      }
    }

    // Touch the message's updated_at so the polling loop on other clients
    // sees the reaction change and refetches the message (which carries the
    // new reaction aggregate).
    await pool.query(
      "UPDATE project_chat_messages SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [messageId]
    );

    // Return updated reactions so the frontend can patch state without
    // re-fetching the full message list.
    const [aggregateRows] = await pool.query(
      `SELECT emoji, COUNT(*) AS count,
              MAX(user_id = ?) AS mine
       FROM project_chat_reactions
       WHERE message_id = ?
       GROUP BY emoji`,
      [req.user.id, messageId]
    );
    const [userRows] = await pool.query(
      `SELECT pcr.emoji, u.first_name, u.last_name, u.email
       FROM project_chat_reactions pcr
       JOIN users u ON pcr.user_id = u.id
       WHERE pcr.message_id = ?
       ORDER BY pcr.created_at ASC`,
      [messageId]
    );
    const usersByEmoji = {};
    userRows.forEach((r) => {
      if (!usersByEmoji[r.emoji]) usersByEmoji[r.emoji] = [];
      const name =
        [r.first_name, r.last_name].filter(Boolean).join(" ").trim() || r.email || "Unknown";
      usersByEmoji[r.emoji].push(name);
    });
    res.json({
      reactions: aggregateRows.map((r) => ({
        emoji: r.emoji,
        count: r.count,
        mine: !!r.mine,
        users: usersByEmoji[r.emoji] || [],
      })),
    });
  } catch (e) {
    // If we ever hit a UNIQUE-key race, fall through to a clean retry.
    if (e && e.code === "ER_DUP_ENTRY") {
      try {
        const messageId = parseInt(req.params.messageId, 10);
        const { emoji } = req.body || {};
        await pool.query("DELETE FROM project_chat_reactions WHERE message_id = ? AND user_id = ?", [messageId, req.user.id]);
        await pool.query(
          "INSERT INTO project_chat_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)",
          [messageId, req.user.id, emoji]
        );
        await pool.query(
          "UPDATE project_chat_messages SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
          [messageId]
        );
      } catch (_) { /* fallthrough */ }
    }
    console.error("[chat reactions POST]", e);
    next(e);
  }
});

/**
 * GET /api/chat-attachments/:id
 *
 * Stream a chat attachment back to the browser. Public to anyone
 * authenticated (chat membership is checked at the project level when
 * the message is loaded). Supports `?download=1` to force a download
 * instead of inline display.
 */
router.get("/chat-attachments/:id", auth, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: t(req.lang, "errors.invalidRequest") });
    const [rows] = await pool.query(
      `SELECT a.*, pcm.project_id
       FROM project_chat_attachments a
       JOIN project_chat_messages pcm ON a.message_id = pcm.id
       WHERE a.id = ?`,
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ error: t(req.lang, "errors.notFound") });
    const att = rows[0];
    if (!(await isProjectMember(att.project_id, req.user.id))) {
      return res.status(403).json({ error: t(req.lang, "errors.projectAccessDenied") || "You are not authorized to access this project." });
    }
    if (!fs.existsSync(att.file_path)) {
      return res.status(404).json({ error: t(req.lang, "errors.fileMissing") });
    }
    if (att.mime_type) res.setHeader("Content-Type", att.mime_type);
    res.setHeader("Content-Length", att.file_size || "");
    if (req.query.download === "1") {
      res.setHeader("Content-Disposition", `attachment; filename="${att.file_name.replace(/"/g, "")}"`);
    } else if (att.mime_type && !att.mime_type.startsWith("image/")) {
      // Force download for non-images by default — safer UX.
      res.setHeader("Content-Disposition", `attachment; filename="${att.file_name.replace(/"/g, "")}"`);
    }
    fs.createReadStream(att.file_path).pipe(res);
  } catch (e) {
    console.error("[chat attachment GET]", e);
    next(e);
  }
});

module.exports = router;
