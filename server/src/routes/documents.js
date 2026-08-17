/**
 * Project Documents routes — backs the Files & Documents section.
 *
 * Both rich-text docs and uploaded files share the `documents` table
 * (disambiguated by whether `content_html` / `file_url` is set).
 *
 * Endpoints (all JSON, all behind `auth`):
 *   GET    /api/documents?projectId=…                  — list (most recent first)
 *   POST   /api/documents                              — create rich-text doc { title, content_html, project_id }
 *   GET    /api/documents/:id                          — single doc incl. reactions + comments
 *   PUT    /api/documents/:id                          — update title/content (author or project owner)
 *   DELETE /api/documents/:id                          — delete (author or project owner)
 *   POST   /api/documents/upload                       — multipart file upload (project_id in form body)
 *
 *   GET    /api/documents/:id/comments                 — list comments
 *   POST   /api/documents/:id/comments                 — add comment { body }
 *   PUT    /api/documents/:id/comments/:commentId      — edit own comment { body }
 *   DELETE /api/documents/:id/comments/:commentId      — delete own comment (or project owner override)
 *
 *   POST   /api/documents/:id/reactions                — upsert reaction { emoji }
 *                                                       (no row → insert; same → delete; diff → update)
 *
 * Membership model (LENIENT): anyone authed can read documents on projects
 * they can see. Only project members + project owner can create/edit/delete
 * documents, comment, and react. Mirrors the message-board rules so the
 * UX is consistent across the project hub.
 */

const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const pool = require("../config/database");
const { auth } = require("../middleware/auth");
const { isProjectMember: sharedIsProjectMember, requireProjectMember } = require("../middleware/projectMember");
const { t } = require("../i18n");
const { recordActivity } = require("../utils/activity");
const { processAndNotifyMentions, SOURCE_TYPES } = require("../utils/mentions");

const router = express.Router();

/* ─── File upload setup ─────────────────────────────────────────── */
const storage = multer.diskStorage({
  destination: "/var/www/seravavatar-hub/uploads",
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB

fs.mkdirSync("/var/www/seravavatar-hub/uploads", { recursive: true });

/* ─── Permission helpers ────────────────────────────────────────── */
const userHasProjectAccess = async (projectId, userId) => {
  if (!projectId) return true;
  const [p] = await pool.query("SELECT manager_id FROM projects WHERE id = ?", [projectId]);
  if (p.length === 0) return false;
  if (p[0].manager_id === userId) return true;
  const [m] = await pool.query(
    "SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ? LIMIT 1",
    [projectId, userId],
  );
  return m.length > 0;
};

// isProjectMember: uses shared helper for project-scoped docs,
// but userHasProjectAccess is kept for docs that may have no project (projectId=null → allowed)
const isProjectMember = async (projectId, userId) => {
  if (!projectId) return true; // docs without a project are accessible to all authenticated users
  return sharedIsProjectMember(projectId, userId);
};

const docAuthorOrOwner = async (docId, userId) => {
  const [rows] = await pool.query("SELECT uploaded_by, project_id FROM documents WHERE id = ?", [docId]);
  if (rows.length === 0) return { ok: false, doc: null };
  const doc = rows[0];
  if (doc.uploaded_by === userId) return { ok: true, doc };
  if (doc.project_id) {
    const [p] = await pool.query("SELECT manager_id FROM projects WHERE id = ?", [doc.project_id]);
    if (p.length > 0 && p[0].manager_id === userId) return { ok: true, doc };
  }
  return { ok: false, doc };
};

/* ─── Hydration helpers ─────────────────────────────────────────── */

/** Cheap avatar-color generator (matches what the frontend does for guests).
 *  Backend keeps avatar_url as-is when present; otherwise returns null and the
 *  frontend will fall back to initials + a deterministic color. */
const initialsOf = (first, last, email) => {
  const f = (first || "").trim();
  const l = (last || "").trim();
  if (f || l) return ((f[0] || "") + (l[0] || "")).toUpperCase() || "U";
  return ((email || "?")[0] || "?").toUpperCase();
};

/** Hydrate documents with author + reactions + comment counts.
 *  Returns the shape the frontend expects:
 *    { id, project_id, title, content_html, file_url, file_type, file_size,
 *      kind: 'doc' | 'file', author_id, author_name, author_email,
 *      author_initials, author_avatar, created_at, updated_at, last_modified,
 *      reactions: [{ emoji, count, mine, users: [{name, initials, avatar}] }],
 *      comment_count }
 */
const hydrateDocuments = async (rows, currentUserId) => {
  if (!rows || rows.length === 0) return [];
  const ids = rows.map((r) => r.id);

  const [reactionRows] = await pool.query(
    `SELECT dr.document_id, dr.emoji, dr.user_id,
            u.first_name, u.last_name, u.email, u.avatar_url
     FROM document_reactions dr
     JOIN users u ON dr.user_id = u.id
     WHERE dr.document_id IN (?)
     ORDER BY dr.created_at ASC`,
    [ids]
  );
  const [aggregateRows] = await pool.query(
    `SELECT document_id, emoji,
            COUNT(*) AS count,
            MAX(user_id = ?) AS mine
     FROM document_reactions
     WHERE document_id IN (?)
     GROUP BY document_id, emoji`,
    [currentUserId, ids]
  );
  const [commentRows] = await pool.query(
    `SELECT document_id, COUNT(*) AS c
     FROM document_comments
     WHERE document_id IN (?)
     GROUP BY document_id`,
    [ids]
  );

  const reactMap = {};
  aggregateRows.forEach((r) => {
    if (!reactMap[r.document_id]) reactMap[r.document_id] = {};
    reactMap[r.document_id][r.emoji] = { emoji: r.emoji, count: r.count, mine: !!r.mine, users: [] };
  });
  reactionRows.forEach((r) => {
    const grp = reactMap[r.document_id] && reactMap[r.document_id][r.emoji];
    if (!grp) return;
    const name = [r.first_name, r.last_name].filter(Boolean).join(" ").trim() || r.email || "Unknown";
    grp.users.push({
      name,
      initials: initialsOf(r.first_name, r.last_name, r.email),
      avatar: r.avatar_url || null,
    });
  });

  const commentMap = {};
  commentRows.forEach((r) => { commentMap[r.document_id] = r.c; });

  return rows.map((r) => {
    const authorName = [r.first_name, r.last_name].filter(Boolean).join(" ").trim() || r.author_email || "Unknown";
    return {
      id: r.id,
      project_id: r.project_id,
      title: r.title || r.filename,
      content_html: r.content_html || "",
      file_url: r.file_url || null,
      file_type: r.file_type || null,
      file_size: r.file_size || null,
      kind: r.file_url ? "file" : "doc",
      author_id: r.uploaded_by,
      author_name: authorName,
      author_email: r.author_email,
      author_initials: initialsOf(r.first_name, r.last_name, r.author_email),
      author_avatar: r.avatar_url || null,
      created_at: r.created_at,
      updated_at: r.updated_at,
      last_modified: r.updated_at || r.created_at,
      reactions: Object.values(reactMap[r.id] || {}),
      comment_count: commentMap[r.id] || 0,
    };
  });
};

/** Hydrate comments with author info. */
const hydrateComments = (rows) => {
  if (!rows || rows.length === 0) return [];
  return rows.map((r) => ({
    id: r.id,
    document_id: r.document_id,
    body: r.body,
    created_at: r.created_at,
    updated_at: r.updated_at,
    author_id: r.user_id,
    author_name: [r.first_name, r.last_name].filter(Boolean).join(" ").trim() || r.email || "Unknown",
    author_email: r.email,
    author_initials: initialsOf(r.first_name, r.last_name, r.email),
    author_avatar: r.avatar_url || null,
    is_mine: r.user_id, // caller will compare
  }));
};

/** Hydrate comment rows with reactions summary. */
const hydrateDocumentCommentReactions = async (commentRows, currentUserId) => {
  if (!commentRows || commentRows.length === 0) return commentRows;
  const ids = commentRows.map((r) => r.id);
  const [reactionRows] = await pool.query(
    `SELECT r.comment_id, r.emoji, r.user_id,
            u.first_name, u.last_name, u.email
     FROM document_comment_reactions r
     JOIN users u ON r.user_id = u.id
     WHERE r.comment_id IN (?)
     ORDER BY r.created_at ASC`,
    [ids]
  );
  const [aggregateRows] = await pool.query(
    `SELECT comment_id, emoji,
            COUNT(*) AS count,
            MAX(user_id = ?) AS mine
     FROM document_comment_reactions
     WHERE comment_id IN (?)
     GROUP BY comment_id, emoji`,
    [currentUserId, ids]
  );
  const reactMap = {};
  aggregateRows.forEach((r) => {
    if (!reactMap[r.comment_id]) reactMap[r.comment_id] = {};
    reactMap[r.comment_id][r.emoji] = { emoji: r.emoji, count: r.count, mine: !!r.mine, users: [] };
  });
  reactionRows.forEach((r) => {
    const grp = reactMap[r.comment_id] && reactMap[r.comment_id][r.emoji];
    if (!grp) return;
    const name = [r.first_name, r.last_name].filter(Boolean).join(" ").trim() || r.email || "Unknown";
    grp.users.push(name);
  });
  return commentRows.map((r) => ({
    ...r,
    reactions: Object.values(reactMap[r.id] || {}),
  }));
};

/* ─── GET /api/documents ────────────────────────────────────────── */
router.get("/", auth, async (req, res, next) => {
  try {
    const { projectId } = req.query;
    let query = `SELECT d.*, u.first_name, u.last_name, u.email AS author_email, u.avatar_url
                 FROM documents d
                 JOIN users u ON d.uploaded_by = u.id WHERE 1=1`;
    const params = [];
    if (projectId) { query += " AND d.project_id = ?"; params.push(projectId); }
    query += " ORDER BY COALESCE(d.updated_at, d.created_at) DESC";
    const [rows] = await pool.query(query, params);
    const documents = await hydrateDocuments(rows, req.user.id);
    res.json({ documents });
  } catch (err) { next(err); }
});

/* ─── GET /api/documents/:id ────────────────────────────────────── */
router.get("/:id", auth, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT d.*, u.first_name, u.last_name, u.email AS author_email, u.avatar_url
       FROM documents d
       JOIN users u ON d.uploaded_by = u.id
       WHERE d.id = ?`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: t(req.lang, 'errors.documentNotFound') });
    const [doc] = await hydrateDocuments(rows, req.user.id);
    res.json({ document: doc });
  } catch (err) { next(err); }
});

/* ─── POST /api/documents ───────────────────────────────────────── */
router.post("/", auth, async (req, res, next) => {
  try {
    const { title, content_html, project_id } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ error: t(req.lang, 'errors.documentTitleRequired') });
    }
    if (project_id) {
      const ok = await isProjectMember(project_id, req.user.id);
      if (!ok) return res.status(403).json({ error: t(req.lang, 'errors.permissionDenied') });
    }
    const [result] = await pool.query(
      `INSERT INTO documents (user_id, project_id, filename, title, content_html, file_url, uploaded_by)
       VALUES (?, ?, ?, ?, ?, '', ?)`,
      [req.user.id, project_id || null, title.trim(), title.trim(), content_html || '', req.user.id]
    );
    const [rows] = await pool.query(
      `SELECT d.*, u.first_name, u.last_name, u.email AS author_email, u.avatar_url
       FROM documents d JOIN users u ON d.uploaded_by = u.id WHERE d.id = ?`,
      [result.insertId]
    );
    const [doc] = await hydrateDocuments(rows, req.user.id);
    await recordActivity(pool, {
      projectId: project_id ? Number(project_id) : null,
      actorId: req.user.id,
      feature: 'files',
      action: 'document_created',
      targetType: 'document',
      targetId: result.insertId,
      targetLabel: title.trim(),
    });
    res.status(201).json({ document: doc, message: t(req.lang, 'errors.documentCreated') });
  } catch (err) { next(err); }
});

/* ─── PUT /api/documents/:id ────────────────────────────────────── */
router.put("/:id", auth, async (req, res, next) => {
  try {
    const { title, content_html } = req.body;
    const { ok, doc } = await docAuthorOrOwner(req.params.id, req.user.id);
    if (!doc) return res.status(404).json({ error: t(req.lang, 'errors.documentNotFound') });
    if (!ok) return res.status(403).json({ error: t(req.lang, 'errors.permissionDenied') });

    // Files (have file_url) can only have their title changed — content is the binary.
    if (doc.file_url && content_html !== undefined) {
      return res.status(400).json({ error: 'File content cannot be edited — only the title' });
    }
    const newTitle = (title || doc.title || doc.filename || '').trim();
    if (!newTitle) return res.status(400).json({ error: t(req.lang, 'errors.documentTitleRequired') });

    await pool.query(
      `UPDATE documents SET title = ?, content_html = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [newTitle, content_html ?? doc.content_html ?? '', req.params.id]
    );
    const [rows] = await pool.query(
      `SELECT d.*, u.first_name, u.last_name, u.email AS author_email, u.avatar_url
       FROM documents d JOIN users u ON d.uploaded_by = u.id WHERE d.id = ?`,
      [req.params.id]
    );
    const [updated] = await hydrateDocuments(rows, req.user.id);
    if (doc.project_id) {
      await recordActivity(pool, {
        projectId: doc.project_id,
        actorId: req.user.id,
        feature: 'files',
        action: 'document_updated',
        targetType: 'document',
        targetId: doc.id,
        targetLabel: newTitle,
      });
    }
    res.json({ document: updated, message: t(req.lang, 'errors.documentUpdated') });
  } catch (err) { next(err); }
});

/* ─── POST /api/documents/upload ───────────────────────────────── */
router.post("/upload", auth, upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: t(req.lang, "errors.noFileUploaded") });
    const { projectId } = req.body;
    const projectIdNum = projectId ? parseInt(projectId) : null;
    if (projectIdNum) {
      const ok = await isProjectMember(projectIdNum, req.user.id);
      if (!ok) {
        try { fs.unlinkSync(req.file.path); } catch (_) {}
        return res.status(403).json({ error: t(req.lang, 'errors.permissionDenied') });
      }
    }
    const fileUrl = `/uploads/${req.file.filename}`;
    const [result] = await pool.query(
      "INSERT INTO documents (user_id, project_id, filename, title, file_url, file_type, file_size, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [
        req.user.id, projectIdNum, req.file.originalname, req.file.originalname,
        fileUrl, req.file.mimetype, req.file.size, req.user.id,
      ],
    );
    const [rows] = await pool.query(
      `SELECT d.*, u.first_name, u.last_name, u.email AS author_email, u.avatar_url
       FROM documents d JOIN users u ON d.uploaded_by = u.id WHERE d.id = ?`,
      [result.insertId]
    );
    const [doc] = await hydrateDocuments(rows, req.user.id);
    if (projectIdNum) {
      await recordActivity(pool, {
        projectId: projectIdNum,
        actorId: req.user.id,
        feature: 'files',
        action: 'file_uploaded',
        targetType: 'file',
        targetId: result.insertId,
        targetLabel: req.file.originalname,
        meta: { size: req.file.size, type: req.file.mimetype },
      });
    }
    res.status(201).json({ document: doc, message: 'File uploaded' });
  } catch (err) { next(err); }
});

/* ─── DELETE /api/documents/:id ─────────────────────────────────── */
router.delete("/:id", auth, async (req, res, next) => {
  try {
    const { ok, doc } = await docAuthorOrOwner(req.params.id, req.user.id);
    if (!doc) return res.status(404).json({ error: t(req.lang, 'errors.documentNotFound') });
    if (!ok) return res.status(403).json({ error: t(req.lang, 'errors.permissionDenied') });
    if (doc.file_url) {
      const filePath = path.join("/var/www/seravavatar-hub/uploads", path.basename(doc.file_url));
      try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (_) {}
    }
    await pool.query("DELETE FROM documents WHERE id = ?", [req.params.id]);
    if (doc.project_id) {
      await recordActivity(pool, {
        projectId: doc.project_id,
        actorId: req.user.id,
        feature: 'files',
        action: doc.file_url ? 'file_deleted' : 'document_deleted',
        targetType: doc.file_url ? 'file' : 'document',
        targetId: doc.id,
        targetLabel: doc.title || doc.filename,
      });
    }
    res.json({ message: t(req.lang, "errors.documentDeleted") });
  } catch (err) { next(err); }
});

/* ─── Comments ──────────────────────────────────────────────────── */

/* GET /api/documents/:id/comments */
router.get("/:id/comments", auth, async (req, res, next) => {
  try {
    const [doc] = await pool.query("SELECT id, project_id FROM documents WHERE id = ?", [req.params.id]);
    if (doc.length === 0) return res.status(404).json({ error: t(req.lang, 'errors.documentNotFound') });
    const [rows] = await pool.query(
      `SELECT dc.*, u.first_name, u.last_name, u.email, u.avatar_url
       FROM document_comments dc
       JOIN users u ON dc.user_id = u.id
       WHERE dc.document_id = ?
       ORDER BY dc.created_at ASC`,
      [req.params.id]
    );
    const hydrated = await hydrateDocumentCommentReactions(hydrateComments(rows), req.user.id);
    const comments = hydrated.map((c) => ({ ...c, is_mine: c.author_id === req.user.id }));
    res.json({ comments });
  } catch (err) { next(err); }
});

/* POST /api/documents/:id/comments */
router.post("/:id/comments", auth, async (req, res, next) => {
  try {
    const [doc] = await pool.query("SELECT id, project_id FROM documents WHERE id = ?", [req.params.id]);
    if (doc.length === 0) return res.status(404).json({ error: t(req.lang, 'errors.documentNotFound') });
    if (doc[0].project_id) {
      const ok = await isProjectMember(doc[0].project_id, req.user.id);
      if (!ok) return res.status(403).json({ error: t(req.lang, 'errors.permissionDenied') });
    }
    const body = (req.body?.body || "").trim();
    if (!body) return res.status(400).json({ error: 'Comment body is required' });
    const [result] = await pool.query(
      "INSERT INTO document_comments (document_id, user_id, body) VALUES (?, ?, ?)",
      [req.params.id, req.user.id, body]
    );
    const commentId = result.insertId;
    const projectId = doc[0].project_id;

    // Process @mentions — store records and send in-app notifications.
    if (projectId) {
      await processAndNotifyMentions({
        projectId,
        sourceType: SOURCE_TYPES.DOCUMENT_COMMENT,
        sourceId: commentId,
        content: body,
        mentionedByUserId: req.user.id,
        lang: req.lang,
        link: `/projects/${projectId}/files/${req.params.id}`,
      });
    }

    const [rows] = await pool.query(
      `SELECT dc.*, u.first_name, u.last_name, u.email, u.avatar_url
       FROM document_comments dc JOIN users u ON dc.user_id = u.id WHERE dc.id = ?`,
      [commentId]
    );
    const hydrated = await hydrateDocumentCommentReactions(hydrateComments(rows), req.user.id);
    const [comment] = hydrated.map((c) => ({ ...c, is_mine: true }));
    if (doc[0].project_id) {
      await recordActivity(pool, {
        projectId: doc[0].project_id,
        actorId: req.user.id,
        feature: 'files',
        action: 'commented',
        targetType: 'document_comment',
        targetId: commentId,
        targetLabel: `comment on doc #${req.params.id}`,
        meta: { document_id: Number(req.params.id), excerpt: body.slice(0, 120) },
      });
    }
    res.status(201).json({ comment });
  } catch (err) { next(err); }
});

/* PUT /api/documents/:id/comments/:commentId */
router.put("/:id/comments/:commentId", auth, async (req, res, next) => {
  try {
    const [rows] = await pool.query("SELECT * FROM document_comments WHERE id = ? AND document_id = ?", [
      req.params.commentId, req.params.id,
    ]);
    if (rows.length === 0) return res.status(404).json({ error: 'Comment not found' });
    const comment = rows[0];
    if (comment.user_id !== req.user.id) {
      // Project owner can edit any comment.
      const [doc] = await pool.query("SELECT project_id FROM documents WHERE id = ?", [req.params.id]);
      let allowed = false;
      if (doc.length > 0 && doc[0].project_id) {
        const [p] = await pool.query("SELECT manager_id FROM projects WHERE id = ?", [doc[0].project_id]);
        allowed = p.length > 0 && p[0].manager_id === req.user.id;
      }
      if (!allowed) return res.status(403).json({ error: t(req.lang, 'errors.permissionDenied') });
    }
    const body = (req.body?.body || "").trim();
    if (!body) return res.status(400).json({ error: 'Comment body is required' });
    await pool.query(
      "UPDATE document_comments SET body = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [body, req.params.commentId]
    );
    const [fresh] = await pool.query(
      `SELECT dc.*, u.first_name, u.last_name, u.email, u.avatar_url
       FROM document_comments dc JOIN users u ON dc.user_id = u.id WHERE dc.id = ?`,
      [req.params.commentId]
    );
    const hydrated = await hydrateDocumentCommentReactions(hydrateComments(fresh), req.user.id);
    const [updated] = hydrated.map((c) => ({ ...c, is_mine: c.author_id === req.user.id }));
    res.json({ comment: updated });
  } catch (err) { next(err); }
});

/* DELETE /api/documents/:id/comments/:commentId */
router.delete("/:id/comments/:commentId", auth, async (req, res, next) => {
  try {
    const [rows] = await pool.query("SELECT * FROM document_comments WHERE id = ? AND document_id = ?", [
      req.params.commentId, req.params.id,
    ]);
    if (rows.length === 0) return res.status(404).json({ error: 'Comment not found' });
    const comment = rows[0];
    let allowed = comment.user_id === req.user.id;
    if (!allowed) {
      const [doc] = await pool.query("SELECT project_id FROM documents WHERE id = ?", [req.params.id]);
      if (doc.length > 0 && doc[0].project_id) {
        const [p] = await pool.query("SELECT manager_id FROM projects WHERE id = ?", [doc[0].project_id]);
        allowed = p.length > 0 && p[0].manager_id === req.user.id;
      }
    }
    if (!allowed) return res.status(403).json({ error: t(req.lang, 'errors.permissionDenied') });
    await pool.query("DELETE FROM document_comments WHERE id = ?", [req.params.commentId]);
    res.json({ message: 'Comment deleted' });
  } catch (err) { next(err); }
});

/* POST /api/documents/:id/comments/:commentId/reactions — add or replace a reaction emoji
 *
 * Body: { emoji, old_emoji? }
 *   - REPLACE (old_emoji provided): removes old_emoji first, then adds emoji.
 *   - ADD (no old_emoji): adds emoji only if user hasn't reacted with it yet.
 */
router.post("/:id/comments/:commentId/reactions", auth, async (req, res, next) => {
  try {
    const { emoji, old_emoji } = req.body;
    if (!emoji || typeof emoji !== "string" || emoji.length > 16) {
      return res.status(400).json({ error: "Invalid emoji" });
    }
    const [comment] = await pool.query(
      "SELECT id FROM document_comments WHERE id = ? AND document_id = ?",
      [req.params.commentId, req.params.id]
    );
    if (comment.length === 0) return res.status(404).json({ error: "Comment not found" });

    // REPLACE: remove old_emoji if switching to a different emoji.
    if (old_emoji && typeof old_emoji === "string" && old_emoji !== emoji) {
      await pool.query(
        "DELETE FROM document_comment_reactions WHERE comment_id = ? AND user_id = ? AND emoji = ?",
        [req.params.commentId, req.user.id, old_emoji]
      );
    }

    // Add — silently no-op if user already reacted with this exact emoji.
    const [alreadyHas] = await pool.query(
      "SELECT id FROM document_comment_reactions WHERE comment_id = ? AND user_id = ? AND emoji = ?",
      [req.params.commentId, req.user.id, emoji]
    );
    if (alreadyHas.length === 0) {
      await pool.query(
        "INSERT INTO document_comment_reactions (comment_id, user_id, emoji) VALUES (?, ?, ?)",
        [req.params.commentId, req.user.id, emoji]
      );
    }

    const [rows] = await pool.query(
      `SELECT dc.*, u.first_name, u.last_name, u.email, u.avatar_url
       FROM document_comments dc JOIN users u ON dc.user_id = u.id WHERE dc.id = ?`,
      [req.params.commentId]
    );
    const hydrated = await hydrateDocumentCommentReactions(hydrateComments(rows), req.user.id);
    const [c] = hydrated.map((r) => ({ ...r, is_mine: r.author_id === req.user.id }));
    res.json({ reactions: c?.reactions || [] });
  } catch (err) { next(err); }
});

/* DELETE /api/documents/:id/comments/:commentId/reactions — remove a specific reaction emoji
 *
 * Query or Body: emoji — removes ALL rows where user + comment + emoji match.
 * Silently no-ops if no matching row exists (safe to call multiple times).
 */
router.delete("/:id/comments/:commentId/reactions", auth, async (req, res, next) => {
  try {
    const emoji = req.query.emoji || req.body?.emoji;
    if (!emoji || typeof emoji !== "string" || emoji.length > 16) {
      return res.status(400).json({ error: "Invalid emoji" });
    }
    const [comment] = await pool.query(
      "SELECT id FROM document_comments WHERE id = ? AND document_id = ?",
      [req.params.commentId, req.params.id]
    );
    if (comment.length === 0) return res.status(404).json({ error: "Comment not found" });

    await pool.query(
      "DELETE FROM document_comment_reactions WHERE comment_id = ? AND user_id = ? AND emoji = ?",
      [req.params.commentId, req.user.id, emoji]
    );

    const [rows] = await pool.query(
      `SELECT dc.*, u.first_name, u.last_name, u.email, u.avatar_url
       FROM document_comments dc JOIN users u ON dc.user_id = u.id WHERE dc.id = ?`,
      [req.params.commentId]
    );
    const hydrated = await hydrateDocumentCommentReactions(hydrateComments(rows), req.user.id);
    const [c] = hydrated.map((r) => ({ ...r, is_mine: r.author_id === req.user.id }));
    res.json({ reactions: c?.reactions || [] });
  } catch (err) { next(err); }
});

/* ─── Reactions ─────────────────────────────────────────────────── */

/* POST /api/documents/:id/reactions  body: { emoji, old_emoji? }
 * Replace (old_emoji provided): delete old_emoji, insert emoji if not already present.
 * Toggle (no old_emoji): toggle emoji on/off.
 * One reaction per user per document. */
router.post("/:id/reactions", auth, async (req, res, next) => {
  try {
    const { emoji, old_emoji } = req.body || {};
    if (!emoji || typeof emoji !== "string" || emoji.length > 16) {
      return res.status(400).json({ error: 'A valid emoji is required' });
    }
    const [doc] = await pool.query("SELECT id, project_id FROM documents WHERE id = ?", [req.params.id]);
    if (doc.length === 0) return res.status(404).json({ error: t(req.lang, 'errors.documentNotFound') });
    if (doc[0].project_id) {
      const ok = await isProjectMember(doc[0].project_id, req.user.id);
      if (!ok) return res.status(403).json({ error: t(req.lang, 'errors.permissionDenied') });
    }
    if (old_emoji && typeof old_emoji === "string" && old_emoji !== emoji) {
      // Replace: delete old emoji first
      await pool.query(
        "DELETE FROM document_reactions WHERE document_id = ? AND user_id = ? AND emoji = ?",
        [req.params.id, req.user.id, old_emoji]
      );
      // Insert new emoji if not already present
      const [alreadyHas] = await pool.query(
        "SELECT id FROM document_reactions WHERE document_id = ? AND user_id = ? AND emoji = ?",
        [req.params.id, req.user.id, emoji]
      );
      if (alreadyHas.length === 0) {
        try {
          await pool.query(
            "INSERT INTO document_reactions (document_id, user_id, emoji) VALUES (?, ?, ?)",
            [req.params.id, req.user.id, emoji]
          );
        } catch (e) {
          if (e?.code !== 'ER_DUP_ENTRY') throw e;
        }
      }
    } else {
      // Toggle: delete if exists, insert if not
      const [existing] = await pool.query(
        "SELECT id FROM document_reactions WHERE document_id = ? AND user_id = ? AND emoji = ?",
        [req.params.id, req.user.id, emoji]
      );
      if (existing.length > 0) {
        await pool.query("DELETE FROM document_reactions WHERE document_id = ? AND user_id = ? AND emoji = ?", [req.params.id, req.user.id, emoji]);
      } else {
        try {
          await pool.query("INSERT INTO document_reactions (document_id, user_id, emoji) VALUES (?, ?, ?)", [req.params.id, req.user.id, emoji]);
        } catch (e) {
          if (e?.code !== 'ER_DUP_ENTRY') throw e;
        }
      }
    }
    // Return updated reactions list (with user details for tooltip)
    const [rows] = await pool.query(
      `SELECT d.*, u.first_name, u.last_name, u.email AS author_email, u.avatar_url
       FROM documents d JOIN users u ON d.uploaded_by = u.id WHERE d.id = ?`,
      [req.params.id]
    );
    const [hydrated] = await hydrateDocuments(rows, req.user.id);
    res.json({ reactions: hydrated.reactions });
  } catch (err) { next(err); }
});

module.exports = router;
