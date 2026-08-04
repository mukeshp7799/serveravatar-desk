/**
 * Project Message Board routes.
 *
 * Lenient membership model:
 *   - Anyone authenticated can READ messages for any project (the message
 *     board is part of the project dashboard and is meant to be
 *     discoverable).
 *   - Only project members (project_members row) or the project owner
 *     (projects.manager_id) can WRITE — create / edit / delete / pin /
 *     unpin / reorder-pinned / react.
 *
 * Endpoints (all JSON, all behind `auth`):
 *   GET    /api/projects/:projectId/messages           — list (pinned first, then newest)
 *   POST   /api/projects/:projectId/messages           — create
 *   PUT    /api/messages/:id                          — edit (sets edited_at)
 *   DELETE /api/messages/:id                          — delete (cascade removes reactions)
 *   POST   /api/messages/:id/pin                      — pin (assigns next pin_order)
 *   POST   /api/messages/:id/unpin                    — unpin
 *   PUT    /api/messages/pinned-order                 — bulk reorder { projectId, messageIds[] }
 *   POST   /api/messages/:id/reactions                — toggle reaction { emoji }
 *
 * Reactions are stored separately so each user can react once per emoji;
 * the UNIQUE constraint enforces this at the DB level. The toggle
 * behaviour is implemented in /reactions: presence → delete; absence → insert.
 */

const express = require("express");
const pool = require("../config/database");
const { auth } = require("../middleware/auth");
const { isProjectMember, requireProjectMember } = require("../middleware/projectMember");
const { t } = require("../i18n");
const { recordActivity } = require("../utils/activity");
const { processAndNotifyMentions, SOURCE_TYPES } = require("../utils/mentions");

const router = express.Router();

/** Hydrate messages with author info + reaction summary.
 *  Shape:
 *   [{ id, project_id, author_id, author_name, author_email,
 *      title, body_html, category, is_pinned, pin_order,
 *      created_at, updated_at, edited_at,
 *      reactions: [{ emoji, count, mine }] }]
 */
const hydrateMessages = async (messageIdsOrRows, currentUserId) => {
  // Accept either an array of message rows OR an array of ids we should fetch.
  let rows = messageIdsOrRows;
  if (!rows || rows.length === 0) return [];
  if (typeof rows[0] === "number" || typeof rows[0] === "string") {
    const [r] = await pool.query(
      `SELECT pm.*, u.first_name, u.last_name, u.email, u.avatar_url
       FROM project_messages pm JOIN users u ON pm.author_id = u.id
       WHERE pm.id IN (?)`,
      [rows]
    );
    rows = r;
  }
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  // NOTE: we previously used `COUNT(*) OVER (PARTITION BY message_id, emoji)` here.
  // That window-function form collapses distinct emoji values to a single row when
  // `emoji` has a `utf8mb4_bin` collation (MySQL optimizer bug with binary-collation
  // partition columns). A plain GROUP BY avoids that and gives us one row per
  // (message_id, emoji) with the correct count + mine flag.
  //
  // We also fetch the user names for each (message_id, emoji) so the frontend can
  // render hover tooltips ("Liked by Mukesh, Rahul, ...") — the chip itself only
  // shows the aggregate count.
  const [reactionRows] = await pool.query(
    `SELECT pmr.message_id, pmr.emoji, pmr.user_id,
            u.first_name, u.last_name, u.email
     FROM project_message_reactions pmr
     JOIN users u ON pmr.user_id = u.id
     WHERE pmr.message_id IN (?)
     ORDER BY pmr.created_at ASC`,
    [ids]
  );
  const [aggregateRows] = await pool.query(
    `SELECT message_id, emoji,
            COUNT(*) AS count,
            MAX(user_id = ?) AS mine
     FROM project_message_reactions
     WHERE message_id IN (?)
     GROUP BY message_id, emoji`,
    [currentUserId, ids]
  );

  // Build the per-message reaction map. `aggregateRows` gives count + mine
  // per (message_id, emoji); `reactionRows` gives the per-user details we
  // need for hover tooltips.
  const reactMap = {};
  // First seed every (message_id, emoji) group with count + mine.
  aggregateRows.forEach((r) => {
    if (!reactMap[r.message_id]) reactMap[r.message_id] = {};
    reactMap[r.message_id][r.emoji] = { emoji: r.emoji, count: r.count, mine: !!r.mine, users: [] };
  });
  // Then fill in the user names for each group, in chronological order.
  reactionRows.forEach((r) => {
    const grp = reactMap[r.message_id] && reactMap[r.message_id][r.emoji];
    if (!grp) return;
    const name = [r.first_name, r.last_name].filter(Boolean).join(" ").trim() || r.email || "Unknown";
    grp.users.push(name);
  });

  return rows.map((r) => {
    const authorName = [r.first_name, r.last_name].filter(Boolean).join(" ").trim() || r.email || "Unknown";
    return {
      id: r.id,
      project_id: r.project_id,
      author_id: r.author_id,
      author_name: authorName,
      author_email: r.email,
      author_avatar: r.avatar_url || null,
      author_initials: authorName.split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase(),
      title: r.title,
      body_html: r.body_html,
      category: r.category,
      is_pinned: !!r.is_pinned,
      pin_order: r.pin_order,
      created_at: r.created_at,
      updated_at: r.updated_at,
      edited_at: r.edited_at,
      reactions: Object.values(reactMap[r.id] || {}),
      is_mine: r.author_id === currentUserId,
    };
  });
};

/** Sanitise incoming HTML to a safe subset. Very small allowlist —
 *  sufficient for the tiptap editor output which we control. */
const sanitizeHtml = (raw) => {
  if (typeof raw !== "string") return "";
  // Remove script/style/iframe/object/embed/on* handlers
  let s = raw
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<object[\s\S]*?<\/object>/gi, "")
    .replace(/<embed[\s\S]*?<\/embed>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/javascript:/gi, "");
  // Force <a target="_blank" rel="noopener noreferrer"> if missing rel
  s = s.replace(/<a\s+([^>]*?)>/gi, (m, attrs) => {
    if (!/rel\s*=/i.test(attrs)) return `<a ${attrs} rel="noopener noreferrer">`;
    return m;
  });
  return s;
};

/* ──────────────────────────────────────────────────────────────────
 * GET /api/projects/:projectId/messages
 * ────────────────────────────────────────────────────────────────── */
router.get("/projects/:projectId/messages", auth, requireProjectMember("projectId"), async (req, res, next) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    if (!projectId) return res.status(400).json({ error: t(req.lang, "errors.projectNotFound") });
    // requireProjectMember already validates membership; project existence is also verified there

    const [rows] = await pool.query(
      `SELECT pm.*, u.first_name, u.last_name, u.email, u.avatar_url
       FROM project_messages pm JOIN users u ON pm.author_id = u.id
       WHERE pm.project_id = ?
       ORDER BY pm.is_pinned DESC,
                pm.pin_order  ASC,
                pm.created_at DESC`,
      [projectId]
    );
    const messages = await hydrateMessages(rows, req.user.id);
    res.json({ messages });
  } catch (err) { next(err); }
});

/* ──────────────────────────────────────────────────────────────────
 * POST /api/projects/:projectId/messages
 * ────────────────────────────────────────────────────────────────── */
router.post("/projects/:projectId/messages", auth, requireProjectMember("projectId"), async (req, res, next) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    if (!projectId) return res.status(400).json({ error: t(req.lang, "errors.projectNotFound") });

    const { title, body_html, category } = req.body || {};
    const cleanBody = sanitizeHtml(body_html || "");
    if (!cleanBody.trim()) {
      return res.status(400).json({ error: t(req.lang, "errors.messageContentRequired") });
    }
    const allowedCats = ["update", "discussion", "question", "announcement"];
    const cat = allowedCats.includes(category) ? category : "update";

    const [result] = await pool.query(
      `INSERT INTO project_messages (project_id, author_id, title, body_html, category)
       VALUES (?, ?, ?, ?, ?)`,
      [projectId, req.user.id, title ? title.trim().slice(0, 255) : null, cleanBody, cat]
    );
    const messageId = result.insertId;

    // Process @mentions — store records and send in-app notifications.
    await processAndNotifyMentions({
      projectId,
      sourceType: SOURCE_TYPES.PROJECT_MESSAGE,
      sourceId: messageId,
      content: cleanBody,
      mentionedByUserId: req.user.id,
      lang: req.lang,
      link: `/projects/${projectId}/message-board`,
    });

    const [rows] = await pool.query(
      `SELECT pm.*, u.first_name, u.last_name, u.email, u.avatar_url
       FROM project_messages pm JOIN users u ON pm.author_id = u.id
       WHERE pm.id = ?`,
      [messageId]
    );
    const [hydrated] = await hydrateMessages(rows, req.user.id);
    await recordActivity(pool, {
      projectId,
      actorId: req.user.id,
      feature: 'message-board',
      action: 'message_posted',
      targetType: 'message',
      targetId: messageId,
      targetLabel: title ? title.trim() : cleanBody.replace(/<[^>]+>/g, ' ').trim().slice(0, 120),
      meta: { category: cat },
    });
    res.status(201).json({ message: hydrated, successKey: "messageCreated" });
  } catch (err) { next(err); }
});

/* ──────────────────────────────────────────────────────────────────
 * PUT /api/messages/pinned-order
 * Body: { projectId, messageIds: number[] }  (ordered)
 * ────────────────────────────────────────────────────────────────── */
router.put("/messages/pinned-order", auth, async (req, res, next) => {
  try {
    const { projectId, messageIds } = req.body || {};
    if (!projectId || !Array.isArray(messageIds)) {
      return res.status(400).json({ error: t(req.lang, "errors.invalidRequest") });
    }
    if (!(await isProjectMember(projectId, req.user.id))) {
      return res.status(403).json({ error: t(req.lang, "errors.projectAccessDenied") || "You are not authorized to access this project." });
    }

    // Reassign pin_order 1..N for the given IDs. Validate all are pinned and belong to project.
    const ids = messageIds.map((n) => parseInt(n, 10)).filter(Number.isFinite);
    if (ids.length === 0) return res.json({ success: true });

    const [existing] = await pool.query(
      `SELECT id FROM project_messages
       WHERE project_id = ? AND is_pinned = 1 AND id IN (?)`,
      [projectId, ids]
    );
    const validIds = new Set(existing.map((r) => r.id));
    if (validIds.size !== ids.length) {
      return res.status(400).json({ error: t(req.lang, "errors.invalidRequest") });
    }

    // Use a single transaction-style update via CASE
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const cases = ids.map((id, idx) => `WHEN ${id} THEN ${idx + 1}`).join(" ");
      await conn.query(
        `UPDATE project_messages
         SET pin_order = CASE id ${cases} END
         WHERE id IN (?)`,
        [ids]
      );
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
    res.json({ success: true });
  } catch (err) { next(err); }
});

/* ──────────────────────────────────────────────────────────────────
 * POST /api/messages/:id/reactions
 * Body: { emoji }
 * Toggle behaviour: if reaction exists → DELETE; else INSERT.
 * ────────────────────────────────────────────────────────────────── */
router.put("/messages/:id", auth, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: t(req.lang, "errors.messageNotFound") });

    const [rows] = await pool.query("SELECT * FROM project_messages WHERE id = ?", [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: t(req.lang, "errors.messageNotFound") });
    }
    const existing = rows[0];

    // Permission: author OR project owner OR project member
    let allowed = existing.author_id === req.user.id;
    if (!allowed) {
      const [p] = await pool.query("SELECT manager_id FROM projects WHERE id = ?", [existing.project_id]);
      allowed = p.length > 0 && p[0].manager_id === req.user.id;
    }
    if (!allowed) {
      allowed = await isProjectMember(existing.project_id, req.user.id);
    }
    if (!allowed) return res.status(403).json({ error: t(req.lang, "errors.permissionDenied") });

    const { title, body_html, category } = req.body || {};
    const cleanBody = body_html != null ? sanitizeHtml(body_html) : existing.body_html;
    if (!cleanBody.trim()) {
      return res.status(400).json({ error: t(req.lang, "errors.messageContentRequired") });
    }
    const allowedCats = ["update", "discussion", "question", "announcement"];
    const newCat = allowedCats.includes(category) ? category : existing.category;
    const newTitle = title != null ? title.trim().slice(0, 255) : existing.title;

    await pool.query(
      `UPDATE project_messages
       SET title = ?, body_html = ?, category = ?, edited_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [newTitle, cleanBody, newCat, id]
    );

    const [updated] = await pool.query(
      `SELECT pm.*, u.first_name, u.last_name, u.email, u.avatar_url
       FROM project_messages pm JOIN users u ON pm.author_id = u.id WHERE pm.id = ?`,
      [id]
    );
    const [hydrated] = await hydrateMessages(updated, req.user.id);
    await recordActivity(pool, {
      projectId: existing.project_id,
      actorId: req.user.id,
      feature: 'message-board',
      action: 'message_updated',
      targetType: 'message',
      targetId: id,
      targetLabel: newTitle || existing.title,
    });
    res.json({ message: hydrated });
  } catch (err) { next(err); }
});

/* ──────────────────────────────────────────────────────────────────
 * DELETE /api/messages/:id
 * ────────────────────────────────────────────────────────────────── */
router.delete("/messages/:id", auth, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: t(req.lang, "errors.messageNotFound") });

    const [rows] = await pool.query("SELECT * FROM project_messages WHERE id = ?", [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: t(req.lang, "errors.messageNotFound") });
    }
    const existing = rows[0];

    // Permission: author OR project owner OR project member
    let allowed = existing.author_id === req.user.id;
    if (!allowed) {
      const [p] = await pool.query("SELECT manager_id FROM projects WHERE id = ?", [existing.project_id]);
      allowed = p.length > 0 && p[0].manager_id === req.user.id;
    }
    if (!allowed) {
      allowed = await isProjectMember(existing.project_id, req.user.id);
    }
    if (!allowed) return res.status(403).json({ error: t(req.lang, "errors.permissionDenied") });

    await pool.query("DELETE FROM project_messages WHERE id = ?", [id]);
    await recordActivity(pool, {
      projectId: existing.project_id,
      actorId: req.user.id,
      feature: 'message-board',
      action: 'message_deleted',
      targetType: 'message',
      targetId: id,
      targetLabel: existing.title,
    });
    res.json({ success: true });
  } catch (err) { next(err); }
});

/* ──────────────────────────────────────────────────────────────────
 * POST /api/messages/:id/pin
 *   Pin and assign the next pin_order (highest + 1) for that project.
 * ────────────────────────────────────────────────────────────────── */
router.post("/messages/:id/pin", auth, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: t(req.lang, "errors.messageNotFound") });

    const [rows] = await pool.query("SELECT * FROM project_messages WHERE id = ?", [id]);
    if (rows.length === 0) return res.status(404).json({ error: t(req.lang, "errors.messageNotFound") });
    const m = rows[0];

    if (!(await isProjectMember(m.project_id, req.user.id))) {
      return res.status(403).json({ error: t(req.lang, "errors.permissionDenied") });
    }

    if (m.is_pinned) {
      // Already pinned — no-op
      const [updated] = await pool.query(
        `SELECT pm.*, u.first_name, u.last_name, u.email, u.avatar_url
         FROM project_messages pm JOIN users u ON pm.author_id = u.id WHERE pm.id = ?`, [id]);
      const [hydrated] = await hydrateMessages(updated, req.user.id);
      return res.json({ message: hydrated });
    }

    // Get max pin_order for this project
    const [maxRow] = await pool.query(
      "SELECT COALESCE(MAX(pin_order), 0) AS maxOrder FROM project_messages WHERE project_id = ? AND is_pinned = 1",
      [m.project_id]
    );
    const nextOrder = (maxRow[0].maxOrder || 0) + 1;
    await pool.query(
      "UPDATE project_messages SET is_pinned = 1, pin_order = ? WHERE id = ?",
      [nextOrder, id]
    );
    const [updated] = await pool.query(
      `SELECT pm.*, u.first_name, u.last_name, u.email, u.avatar_url
       FROM project_messages pm JOIN users u ON pm.author_id = u.id WHERE pm.id = ?`, [id]);
    const [hydrated] = await hydrateMessages(updated, req.user.id);
    res.json({ message: hydrated });
  } catch (err) { next(err); }
});

/* ──────────────────────────────────────────────────────────────────
 * POST /api/messages/:id/unpin
 * ────────────────────────────────────────────────────────────────── */
router.post("/messages/:id/unpin", auth, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: t(req.lang, "errors.messageNotFound") });

    const [rows] = await pool.query("SELECT * FROM project_messages WHERE id = ?", [id]);
    if (rows.length === 0) return res.status(404).json({ error: t(req.lang, "errors.messageNotFound") });
    const m = rows[0];

    if (!(await isProjectMember(m.project_id, req.user.id))) {
      return res.status(403).json({ error: t(req.lang, "errors.permissionDenied") });
    }

    await pool.query(
      "UPDATE project_messages SET is_pinned = 0, pin_order = NULL WHERE id = ?",
      [id]
    );
    const [updated] = await pool.query(
      `SELECT pm.*, u.first_name, u.last_name, u.email, u.avatar_url
       FROM project_messages pm JOIN users u ON pm.author_id = u.id WHERE pm.id = ?`, [id]);
    const [hydrated] = await hydrateMessages(updated, req.user.id);
    res.json({ message: hydrated });
  } catch (err) { next(err); }
});
router.post("/messages/:id/reactions", auth, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { emoji, old_emoji } = req.body || {};
    if (!id || !emoji || typeof emoji !== "string" || emoji.length > 16) {
      return res.status(400).json({ error: t(req.lang, "errors.invalidRequest") });
    }

    const [rows] = await pool.query("SELECT id, project_id FROM project_messages WHERE id = ?", [id]);
    if (rows.length === 0) return res.status(404).json({ error: t(req.lang, "errors.messageNotFound") });
    const m = rows[0];

    if (!(await isProjectMember(m.project_id, req.user.id))) {
      return res.status(403).json({ error: t(req.lang, "errors.permissionDenied") });
    }

    // One reaction per user per message.
    // Replace flow (old_emoji provided): delete old_emoji, then insert emoji if not already present.
    // Toggle flow (no old_emoji): toggle the emoji on/off.
    if (old_emoji && typeof old_emoji === "string" && old_emoji !== emoji) {
      // Replace: delete old emoji first
      await pool.query(
        "DELETE FROM project_message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?",
        [id, req.user.id, old_emoji]
      );
      // Insert new emoji if user doesn't already have it
      const [alreadyHas] = await pool.query(
        "SELECT id FROM project_message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?",
        [id, req.user.id, emoji]
      );
      if (alreadyHas.length === 0) {
        await pool.query(
          "INSERT INTO project_message_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)",
          [id, req.user.id, emoji]
        );
      }
    } else {
      // Toggle: delete if exists, insert if not
      const [existing] = await pool.query(
        "SELECT id FROM project_message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?",
        [id, req.user.id, emoji]
      );
      if (existing.length > 0) {
        await pool.query("DELETE FROM project_message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?", [id, req.user.id, emoji]);
      } else {
        await pool.query("INSERT INTO project_message_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)", [id, req.user.id, emoji]);
      }
    }

    // Return updated reactions for this message — including the per-emoji user
    // list so the frontend can update the hover tooltip without a full refetch.
    const [aggregateRows] = await pool.query(
      `SELECT emoji, COUNT(*) AS count,
              MAX(user_id = ?) AS mine
       FROM project_message_reactions
       WHERE message_id = ?
       GROUP BY emoji`,
      [req.user.id, id]
    );
    const [userRows] = await pool.query(
      `SELECT pmr.emoji, u.first_name, u.last_name, u.email
       FROM project_message_reactions pmr
       JOIN users u ON pmr.user_id = u.id
       WHERE pmr.message_id = ?
       ORDER BY pmr.created_at ASC`,
      [id]
    );
    const usersByEmoji = {};
    userRows.forEach((r) => {
      if (!usersByEmoji[r.emoji]) usersByEmoji[r.emoji] = [];
      const name = [r.first_name, r.last_name].filter(Boolean).join(" ").trim() || r.email || "Unknown";
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
  } catch (err) {
    // Duplicate key on the UNIQUE index — should not happen with the new constraint
    // shape (only one row per (message_id, user_id) exists at a time) but keep the
    // safety net.
    if (err && err.code === "ER_DUP_ENTRY") {
      try {
        const id = parseInt(req.params.id, 10);
        const { emoji } = req.body || {};
        await pool.query(
          "DELETE FROM project_message_reactions WHERE message_id = ? AND user_id = ?",
          [id, req.user.id]
        );
        await pool.query(
          "INSERT INTO project_message_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)",
          [id, req.user.id, emoji]
        );
        const [aggregateRows] = await pool.query(
          `SELECT emoji, COUNT(*) AS count, MAX(user_id = ?) AS mine
           FROM project_message_reactions WHERE message_id = ? GROUP BY emoji`,
          [req.user.id, id]
        );
        const [userRows] = await pool.query(
          `SELECT pmr.emoji, u.first_name, u.last_name, u.email
           FROM project_message_reactions pmr JOIN users u ON pmr.user_id = u.id
           WHERE pmr.message_id = ? ORDER BY pmr.created_at ASC`,
          [id]
        );
        const usersByEmoji = {};
        userRows.forEach((r) => {
          if (!usersByEmoji[r.emoji]) usersByEmoji[r.emoji] = [];
          const name = [r.first_name, r.last_name].filter(Boolean).join(" ").trim() || r.email || "Unknown";
          usersByEmoji[r.emoji].push(name);
        });
        return res.json({
          reactions: aggregateRows.map((r) => ({
            emoji: r.emoji,
            count: r.count,
            mine: !!r.mine,
            users: usersByEmoji[r.emoji] || [],
          })),
        });
      } catch (_) { /* fallthrough */ }
    }
    next(err);
  }
});

module.exports = router;