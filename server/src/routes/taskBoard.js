/**
 * Task Board routes — Kanban-style task board per project.
 *
 * Replaces the previous "tasks" endpoints (the old `tasks` table was dropped
 * in favour of the `tb_tasks` family: tb_columns, tb_tasks, tb_assignees,
 * tb_comments, tb_subtasks, tb_attachments, tb_activity, tb_labels, …).
 *
 * Mounted at /api — routes:
 *   GET    /projects/:projectId/task-board              — full board (columns + tasks + members)
 *   POST   /projects/:projectId/task-columns            — create column
 *   PUT    /task-columns/:columnId                      — rename column
 *   DELETE /task-columns/:columnId                      — delete column (cascade)
 *   PUT    /projects/:projectId/task-columns/reorder    — bulk reorder columns
 *   POST   /projects/:projectId/tasks                   — create task
 *   PUT    /tasks/:taskId                               — edit task
 *   DELETE /tasks/:taskId                               — soft-archive task
 *   POST   /tasks/:taskId/restore                       — restore archived task
 *   DELETE /tasks/:taskId/permanent                     — permanent delete (must be archived)
 *   POST   /tasks/:taskId/move                          — move to a column + position
 *   PUT    /projects/:projectId/tasks/reorder           — bulk reorder tasks
 *   GET    /projects/:projectId/tasks?status=archived   — list archived tasks
 *   GET    /tasks/:taskId/subtasks                      — list subtasks
 *   POST   /tasks/:taskId/subtasks                      — add subtask
 *   PUT    /tasks/:taskId/subtasks/:subtaskId           — update subtask
 *   DELETE /tasks/:taskId/subtasks/:subtaskId           — delete subtask
 *   GET    /tasks/:taskId/comments                      — list comments (+ reactions)
 *   POST   /tasks/:taskId/comments                      — add comment
 *   PUT    /tasks/:taskId/comments/:commentId           — edit own comment
 *   DELETE /tasks/:taskId/comments/:commentId           — delete own comment (or owner override)
 *   POST   /tasks/:taskId/comments/:commentId/reactions — toggle reaction (replace / off / on)
 *   GET    /tasks/:taskId/attachments                   — list attachments
 *   POST   /tasks/:taskId/attachments                   — multipart upload (field: file)
 *   DELETE /tasks/:taskId/attachments/:attachmentId     — delete attachment
 *   GET    /tasks/:taskId/activity                      — task activity log
 *
 * Authorisation model: any project member (or owner) can read+write. Same as
 * the project chat / message board / todos / schedule features.
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

const router = express.Router();

/* ─── File upload setup ────────────────────────────────────────────────────
 * Tasks share the global /var/www/seravavatar-hub/uploads dir (same pattern
 * as documents.js and projectChat.js). Files are served by nginx as
 * /uploads/<filename> so the React UI can embed them inline without an
 * Authorization header.
 * ─────────────────────────────────────────────────────────────────────── */
const UPLOAD_DIR = "/var/www/seravavatar-hub/uploads";
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, `task-${unique}${path.extname(file.originalname)}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/* ─── Helpers ───────────────────────────────────────────────────────────── */

const fmtUser = (u) => ({
  id: u.id,
  name: [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || u.email,
  initials: ((u.first_name?.[0] || u.email?.[0] || "?") + "" + (u.last_name?.[0] || "")).toUpperCase(),
  email: u.email,
  avatar: u.avatar_url || null,
});

const initialsOf = (first, last, email) => {
  const f = (first || "").trim();
  const l = (last || "").trim();
  if (f || l) return ((f[0] || "") + (l[0] || "")).toUpperCase() || "U";
  return ((email || "?")[0] || "?").toUpperCase();
};

/**
 * Resolve a task id to its project_id, or null if the task does not exist.
 * Used by every route that only has :taskId (the rest of the URL structure
 * doesn't carry a projectId, so we have to look it up).
 */
const fetchTaskProjectId = async (taskId) => {
  const [rows] = await pool.query("SELECT project_id FROM tb_tasks WHERE id = ?", [taskId]);
  if (rows.length === 0) return null;
  return rows[0].project_id;
};

/**
 * Append a row to `tb_activity` (the task-internal activity log surfaced via
 * /tasks/:taskId/activity). Always swallows errors so activity recording
 * never breaks the parent operation.
 */
const recordTaskActivity = async (taskId, userId, action, details) => {
  try {
    await pool.query(
      "INSERT INTO tb_activity (task_id, user_id, action, details_json) VALUES (?, ?, ?, ?)",
      [taskId, userId, action, details == null ? null : JSON.stringify(details)]
    );
  } catch (err) {
    console.error("[taskBoard] recordTaskActivity failed:", err.message);
  }
};

/**
 * Hydrate a single task row into the JSON shape the frontend consumes.
 * Returns:
 *   { id, project_id, column_id, title, description_html, priority,
 *     due_date, position, created_by, created_at, updated_at,
 *     author, assignees, subtasks }
 */
const hydrateTask = async (tc) => {
  // Author
  const [[authorRow]] = await pool.query(
    `SELECT id, first_name, last_name, email, avatar_url
       FROM users WHERE id = ?`,
    [tc.created_by]
  );

  // Assignees
  const [assigneeRows] = await pool.query(
    `SELECT u.id, u.first_name, u.last_name, u.email, u.avatar_url
       FROM tb_assignees a JOIN users u ON u.id = a.user_id
      WHERE a.task_id = ?`,
    [tc.id]
  );

  // Subtasks
  const [subtaskRows] = await pool.query(
    `SELECT id, title, done, position FROM tb_subtasks WHERE task_id = ? ORDER BY position ASC, id ASC`,
    [tc.id]
  );

  return {
    id: tc.id,
    project_id: tc.project_id,
    column_id: tc.column_id,
    title: tc.title,
    description_html: tc.description_html || "",
    priority: tc.priority,
    due_date: tc.due_date,
    position: tc.position,
    created_by: tc.created_by,
    created_at: tc.created_at,
    updated_at: tc.updated_at,
    archived_at: tc.archived_at || null,
    archived_by: tc.archived_by || null,
    author: authorRow
      ? fmtUser(authorRow)
      : { id: tc.created_by, name: "Unknown", initials: "??", email: null, avatar: null },
    assignees: assigneeRows.map(fmtUser),
    subtasks: subtaskRows.map((s) => ({
      id: s.id,
      title: s.title,
      done: !!s.done,
      position: s.position,
    })),
  };
};

/* ─────────────────────────────────────────────────────────────────────────
 * 1. GET /projects/:projectId/task-board
 *    Returns { board: BoardColumn[], members: BoardMember[] }
 * ───────────────────────────────────────────────────────────────────────── */
router.get(
  "/projects/:projectId/task-board",
  auth,
  requireProjectMember("projectId"),
  async (req, res, next) => {
    try {
      const projectId = Number(req.params.projectId);
      if (!projectId) return res.status(400).json({ error: t(req.lang, "errors.invalidRequest") });

      // Columns (active tasks only — archived tasks live in a separate view)
      const [columns] = await pool.query(
        `SELECT id, project_id, name, position, is_backlog, created_at
           FROM tb_columns
          WHERE project_id = ?
          ORDER BY position ASC, id ASC`,
        [projectId]
      );

      // Tasks for these columns (single round-trip with IN(...))
      let board = [];
      if (columns.length > 0) {
        const columnIds = columns.map((c) => c.id);
        const [tasks] = await pool.query(
          `SELECT id, project_id, column_id, title, description_html, priority,
                  due_date, position, created_by, created_at, updated_at,
                  archived_at, archived_by
             FROM tb_tasks
            WHERE column_id IN (?) AND archived_at IS NULL
            ORDER BY position ASC, id ASC`,
          [columnIds]
        );

        // Hydrate every task (assignees + subtasks)
        const hydrated = [];
        for (const tc of tasks) {
          hydrated.push(await hydrateTask(tc));
        }

        board = columns.map((c) => ({
          id: c.id,
          project_id: c.project_id,
          name: c.name,
          position: c.position,
          is_backlog: !!c.is_backlog,
          created_at: c.created_at,
          tasks: hydrated.filter((t) => Number(t.column_id) === Number(c.id)),
        }));
      }

      // Project members (for assignee picker)
      // Returns all members (active + pending) with isPending flag.
      const [memberRows] = await pool.query(
        `SELECT u.id, u.first_name, u.last_name, u.email, u.avatar_url,
                pm.role_in_project, pm.status AS member_status,
                (u.status = 'inactive') AS is_external
           FROM project_members pm
           JOIN users u ON u.id = pm.user_id
          WHERE pm.project_id = ?
          UNION
          SELECT u.id, u.first_name, u.last_name, u.email, u.avatar_url,
                 'manager' AS role_in_project, 'active' AS member_status,
                 0 AS is_external
            FROM users u
            JOIN projects p ON p.manager_id = u.id
           WHERE p.id = ?`,
        [projectId, projectId]
      );
      const seen = new Set();
      const members = [];
      for (const m of memberRows) {
        if (seen.has(m.id)) continue;
        seen.add(m.id);
        const isPending = m.member_status === 'pending' || m.is_external;
        members.push({ ...fmtUser(m), role: m.role_in_project, isPending: !!isPending });
      }

      res.json({ board, members });
    } catch (err) {
      console.error("[taskBoard GET]", err);
      next(err);
    }
  }
);

/* ─────────────────────────────────────────────────────────────────────────
 * Columns
 * ───────────────────────────────────────────────────────────────────────── */

/* POST /projects/:projectId/task-columns — create column */
router.post(
  "/projects/:projectId/task-columns",
  auth,
  requireProjectMember("projectId"),
  async (req, res, next) => {
    try {
      const projectId = Number(req.params.projectId);
      const { name } = req.body || {};
      if (!name || !String(name).trim()) {
        return res.status(400).json({ error: t(req.lang, "errors.columnNameRequired") || "Column name is required" });
      }
      const trimmed = String(name).trim().slice(0, 80);

      const [[{ nextPos }]] = await pool.query(
        "SELECT COALESCE(MAX(position), 0) + 1000 AS nextPos FROM tb_columns WHERE project_id = ?",
        [projectId]
      );
      const [r] = await pool.query(
        "INSERT INTO tb_columns (project_id, name, position, is_backlog) VALUES (?, ?, ?, 0)",
        [projectId, trimmed, nextPos]
      );
      const [[col]] = await pool.query(
        "SELECT id, project_id, name, position, is_backlog, created_at FROM tb_columns WHERE id = ?",
        [r.insertId]
      );
      await recordActivity(pool, {
        projectId,
        actorId: req.user.id,
        feature: "task-board",
        action: "column_created",
        targetType: "task_column",
        targetId: r.insertId,
        targetLabel: trimmed,
      });
      res.status(201).json({
        column: {
          id: col.id,
          project_id: col.project_id,
          name: col.name,
          position: col.position,
          is_backlog: !!col.is_backlog,
          created_at: col.created_at,
          tasks: [],
        },
      });
    } catch (err) {
      console.error("[taskBoard POST column]", err);
      next(err);
    }
  }
);

/* PUT /task-columns/:columnId — rename column */
router.put("/task-columns/:columnId", auth, async (req, res, next) => {
  try {
    const columnId = Number(req.params.columnId);
    if (!columnId) return res.status(400).json({ error: t(req.lang, "errors.invalidRequest") });

    const [rows] = await pool.query("SELECT * FROM tb_columns WHERE id = ?", [columnId]);
    if (rows.length === 0) return res.status(404).json({ error: "Column not found" });
    const col = rows[0];

    if (!(await isProjectMember(col.project_id, req.user.id))) {
      return res.status(403).json({ error: t(req.lang, "errors.permissionDenied") });
    }

    const { name } = req.body || {};
    if (name === undefined) return res.status(400).json({ error: "Nothing to update" });
    const trimmed = String(name).trim();
    if (!trimmed) return res.status(400).json({ error: "Column name cannot be empty" });

    await pool.query("UPDATE tb_columns SET name = ? WHERE id = ?", [trimmed.slice(0, 80), columnId]);
    const [[updated]] = await pool.query(
      "SELECT id, project_id, name, position, is_backlog, created_at FROM tb_columns WHERE id = ?",
      [columnId]
    );
    await recordActivity(pool, {
      projectId: col.project_id,
      actorId: req.user.id,
      feature: "task-board",
      action: "column_renamed",
      targetType: "task_column",
      targetId: columnId,
      targetLabel: trimmed,
    });
    res.json({ column: updated });
  } catch (err) {
    console.error("[taskBoard PUT column]", err);
    next(err);
  }
});

/* DELETE /task-columns/:columnId — delete column (cascade tasks) */
router.delete("/task-columns/:columnId", auth, async (req, res, next) => {
  try {
    const columnId = Number(req.params.columnId);
    if (!columnId) return res.status(400).json({ error: t(req.lang, "errors.invalidRequest") });

    const [rows] = await pool.query("SELECT * FROM tb_columns WHERE id = ?", [columnId]);
    if (rows.length === 0) return res.status(404).json({ error: "Column not found" });
    const col = rows[0];

    if (!(await isProjectMember(col.project_id, req.user.id))) {
      return res.status(403).json({ error: t(req.lang, "errors.permissionDenied") });
    }

    await pool.query("DELETE FROM tb_columns WHERE id = ?", [columnId]);
    await recordActivity(pool, {
      projectId: col.project_id,
      actorId: req.user.id,
      feature: "task-board",
      action: "column_deleted",
      targetType: "task_column",
      targetId: columnId,
      targetLabel: col.name,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("[taskBoard DELETE column]", err);
    next(err);
  }
});

/* PUT /projects/:projectId/task-columns/reorder — bulk reorder columns */
router.put(
  "/projects/:projectId/task-columns/reorder",
  auth,
  requireProjectMember("projectId"),
  async (req, res, next) => {
    try {
      const projectId = Number(req.params.projectId);
      const { columnIds } = req.body || {};
      if (!Array.isArray(columnIds) || !columnIds.length) {
        return res.status(400).json({ error: "columnIds must be a non-empty array" });
      }
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        for (let i = 0; i < columnIds.length; i++) {
          await conn.query(
            "UPDATE tb_columns SET position = ? WHERE id = ? AND project_id = ?",
            [(i + 1) * 1000, Number(columnIds[i]), projectId]
          );
        }
        await conn.commit();
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
      res.json({ ok: true });
    } catch (err) {
      console.error("[taskBoard reorder columns]", err);
      next(err);
    }
  }
);

/* ─────────────────────────────────────────────────────────────────────────
 * Tasks
 * ───────────────────────────────────────────────────────────────────────── */

/* POST /projects/:projectId/tasks — create task */
router.post(
  "/projects/:projectId/tasks",
  auth,
  requireProjectMember("projectId"),
  async (req, res, next) => {
    try {
      const projectId = Number(req.params.projectId);
      const {
        column_id, title, description_html, priority, due_date,
        assignee_ids,
      } = req.body || {};

      if (!title || !String(title).trim()) {
        return res.status(400).json({ error: "Title is required" });
      }
      if (!column_id) {
        return res.status(400).json({ error: "column_id is required" });
      }

      // Verify column belongs to project
      const [[col]] = await pool.query(
        "SELECT id, is_backlog FROM tb_columns WHERE id = ? AND project_id = ?",
        [column_id, projectId]
      );
      if (!col) return res.status(404).json({ error: "Column not found" });

      const ALLOWED_PRIORITIES = ["low", "medium", "high", "urgent"];
      const safePriority = ALLOWED_PRIORITIES.includes(priority) ? priority : "medium";

      // Position at the end of the column
      const [[{ nextPos }]] = await pool.query(
        "SELECT COALESCE(MAX(position), 0) + 1000 AS nextPos FROM tb_tasks WHERE column_id = ?",
        [column_id]
      );

      const [r] = await pool.query(
        `INSERT INTO tb_tasks
           (project_id, column_id, title, description_html, priority, due_date, position, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          projectId,
          column_id,
          String(title).trim().slice(0, 255),
          description_html ? String(description_html) : "",
          safePriority,
          due_date || null,
          nextPos,
          req.user.id,
        ]
      );

      // Assignees (validate they're project members)
      const ids = Array.isArray(assignee_ids) ? assignee_ids.map((x) => Number(x)).filter(Boolean) : [];
      for (const uid of ids) {
        // Only insert if the user is a project member or the owner.
        const [[allowed]] = await pool.query(
          `(SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ? LIMIT 1)
           UNION
           (SELECT 1 FROM projects WHERE id = ? AND manager_id = ? LIMIT 1)`,
          [projectId, uid, projectId, uid]
        );
        if (allowed) {
          await pool.query(
            "INSERT IGNORE INTO tb_assignees (task_id, user_id) VALUES (?, ?)",
            [r.insertId, uid]
          );
        }
      }

      // Hydrate and return
      const [[created]] = await pool.query(
        `SELECT id, project_id, column_id, title, description_html, priority,
                due_date, position, created_by, created_at, updated_at,
                archived_at, archived_by
           FROM tb_tasks WHERE id = ?`,
        [r.insertId]
      );
      const task = await hydrateTask(created);

      await recordTaskActivity(r.insertId, req.user.id, "created", { title: task.title });
      await recordActivity(pool, {
        projectId,
        actorId: req.user.id,
        feature: "task-board",
        action: "task_created",
        targetType: "task",
        targetId: r.insertId,
        targetLabel: task.title,
      });

      res.status(201).json({ task });
    } catch (err) {
      console.error("[taskBoard POST task]", err);
      next(err);
    }
  }
);

/* PUT /tasks/:taskId — edit task (also used for assignees via assignee_ids) */
router.put("/tasks/:taskId", auth, async (req, res, next) => {
  try {
    const taskId = Number(req.params.taskId);
    if (!taskId) return res.status(400).json({ error: t(req.lang, "errors.invalidRequest") });

    const [rows] = await pool.query("SELECT * FROM tb_tasks WHERE id = ?", [taskId]);
    if (rows.length === 0) return res.status(404).json({ error: t(req.lang, "errors.taskNotFound") });
    const existing = rows[0];

    if (!(await isProjectMember(existing.project_id, req.user.id))) {
      return res.status(403).json({ error: t(req.lang, "errors.permissionDenied") });
    }

    const ALLOWED_PRIORITIES = ["low", "medium", "high", "urgent"];
    const updates = [];
    const params = [];
    const changes = [];
    const {
      title, description_html, priority, due_date,
      column_id, position,
      assignee_ids,
    } = req.body || {};

    if (title !== undefined) {
      const t1 = String(title).trim();
      if (!t1) return res.status(400).json({ error: "Title cannot be empty" });
      updates.push("title = ?"); params.push(t1.slice(0, 255));
      changes.push("title");
    }
    if (description_html !== undefined) {
      updates.push("description_html = ?"); params.push(description_html ? String(description_html) : "");
      changes.push("description_html");
    }
    if (priority !== undefined) {
      if (!ALLOWED_PRIORITIES.includes(priority)) {
        return res.status(400).json({ error: `Invalid priority. Must be one of: ${ALLOWED_PRIORITIES.join(", ")}` });
      }
      updates.push("priority = ?"); params.push(priority);
      changes.push("priority");
    }
    if (due_date !== undefined) {
      updates.push("due_date = ?"); params.push(due_date || null);
      changes.push("due_date");
    }
    if (column_id !== undefined) {
      const cid = Number(column_id);
      const [[colCheck]] = await pool.query(
        "SELECT id FROM tb_columns WHERE id = ? AND project_id = ?",
        [cid, existing.project_id]
      );
      if (!colCheck) return res.status(404).json({ error: "Column not found" });
      updates.push("column_id = ?"); params.push(cid);
      changes.push("column_id");
    }
    if (position !== undefined) {
      updates.push("position = ?"); params.push(Number(position));
      changes.push("position");
    }

    if (updates.length > 0) {
      params.push(taskId);
      await pool.query(`UPDATE tb_tasks SET ${updates.join(", ")} WHERE id = ?`, params);
      await recordTaskActivity(taskId, req.user.id, "edited", { changed: changes });
    }

    // Assignees — full replace
    if (Array.isArray(assignee_ids)) {
      const ids = assignee_ids.map((x) => Number(x)).filter(Boolean);
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await conn.query("DELETE FROM tb_assignees WHERE task_id = ?", [taskId]);
        for (const uid of ids) {
          // Validate user is a project member or the owner
          const [[allowed]] = await conn.query(
            `(SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ? LIMIT 1)
             UNION
             (SELECT 1 FROM projects WHERE id = ? AND manager_id = ? LIMIT 1)`,
            [existing.project_id, uid, existing.project_id, uid]
          );
          if (allowed) {
            await conn.query(
              "INSERT IGNORE INTO tb_assignees (task_id, user_id) VALUES (?, ?)",
              [taskId, uid]
            );
          }
        }
        await conn.commit();
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
      await recordTaskActivity(taskId, req.user.id, "assignees_updated", { assignee_ids: ids });
    }

    // Return the hydrated task so the UI can patch its local state without a refetch
    const [[updated]] = await pool.query(
      `SELECT id, project_id, column_id, title, description_html, priority,
              due_date, position, created_by, created_at, updated_at,
              archived_at, archived_by
         FROM tb_tasks WHERE id = ?`,
      [taskId]
    );
    const task = await hydrateTask(updated);

    await recordActivity(pool, {
      projectId: existing.project_id,
      actorId: req.user.id,
      feature: "task-board",
      action: "task_updated",
      targetType: "task",
      targetId: taskId,
      targetLabel: task.title,
      meta: { changed: changes },
    });

    res.json({ task });
  } catch (err) {
    console.error("[taskBoard PUT task]", err);
    next(err);
  }
});

/* DELETE /tasks/:taskId — soft archive */
router.delete("/tasks/:taskId", auth, async (req, res, next) => {
  try {
    const taskId = Number(req.params.taskId);
    if (!taskId) return res.status(400).json({ error: t(req.lang, "errors.invalidRequest") });

    const [rows] = await pool.query("SELECT * FROM tb_tasks WHERE id = ?", [taskId]);
    if (rows.length === 0) return res.status(404).json({ error: t(req.lang, "errors.taskNotFound") });
    const existing = rows[0];

    if (!(await isProjectMember(existing.project_id, req.user.id))) {
      return res.status(403).json({ error: t(req.lang, "errors.permissionDenied") });
    }

    if (existing.archived_at) {
      // Already archived — treat as success
      return res.json({ ok: true, archived: true });
    }

    await pool.query(
      "UPDATE tb_tasks SET archived_at = NOW(), archived_by = ? WHERE id = ?",
      [req.user.id, taskId]
    );
    await recordTaskActivity(taskId, req.user.id, "archived", { title: existing.title });
    await recordActivity(pool, {
      projectId: existing.project_id,
      actorId: req.user.id,
      feature: "task-board",
      action: "task_archived",
      targetType: "task",
      targetId: taskId,
      targetLabel: existing.title,
    });

    res.json({ ok: true, archived: true });
  } catch (err) {
    console.error("[taskBoard DELETE task]", err);
    next(err);
  }
});

/* POST /tasks/:taskId/restore */
router.post("/tasks/:taskId/restore", auth, async (req, res, next) => {
  try {
    const taskId = Number(req.params.taskId);
    if (!taskId) return res.status(400).json({ error: t(req.lang, "errors.invalidRequest") });

    const [rows] = await pool.query("SELECT * FROM tb_tasks WHERE id = ?", [taskId]);
    if (rows.length === 0) return res.status(404).json({ error: t(req.lang, "errors.taskNotFound") });
    const existing = rows[0];

    if (!(await isProjectMember(existing.project_id, req.user.id))) {
      return res.status(403).json({ error: t(req.lang, "errors.permissionDenied") });
    }

    if (!existing.archived_at) {
      // Not archived — return the current task as-is
      const task = await hydrateTask(existing);
      return res.json({ task });
    }

    await pool.query(
      "UPDATE tb_tasks SET archived_at = NULL, archived_by = NULL WHERE id = ?",
      [taskId]
    );
    await recordTaskActivity(taskId, req.user.id, "restored", { title: existing.title });
    await recordActivity(pool, {
      projectId: existing.project_id,
      actorId: req.user.id,
      feature: "task-board",
      action: "task_restored",
      targetType: "task",
      targetId: taskId,
      targetLabel: existing.title,
    });

    const [[updated]] = await pool.query(
      `SELECT id, project_id, column_id, title, description_html, priority,
              due_date, position, created_by, created_at, updated_at,
              archived_at, archived_by
         FROM tb_tasks WHERE id = ?`,
      [taskId]
    );
    const task = await hydrateTask(updated);
    res.json({ task });
  } catch (err) {
    console.error("[taskBoard restore]", err);
    next(err);
  }
});

/* DELETE /tasks/:taskId/permanent — must already be archived */
router.delete("/tasks/:taskId/permanent", auth, async (req, res, next) => {
  try {
    const taskId = Number(req.params.taskId);
    if (!taskId) return res.status(400).json({ error: t(req.lang, "errors.invalidRequest") });

    const [rows] = await pool.query("SELECT * FROM tb_tasks WHERE id = ?", [taskId]);
    if (rows.length === 0) return res.status(404).json({ error: t(req.lang, "errors.taskNotFound") });
    const existing = rows[0];

    if (!(await isProjectMember(existing.project_id, req.user.id))) {
      return res.status(403).json({ error: t(req.lang, "errors.permissionDenied") });
    }

    if (!existing.archived_at) {
      return res.status(400).json({ error: "Task must be archived before it can be permanently deleted" });
    }

    // Pull the task label BEFORE we delete the row
    await pool.query("DELETE FROM tb_tasks WHERE id = ?", [taskId]);
    await recordActivity(pool, {
      projectId: existing.project_id,
      actorId: req.user.id,
      feature: "task-board",
      action: "task_deleted",
      targetType: "task",
      targetId: taskId,
      targetLabel: existing.title,
    });

    res.json({ ok: true });
  } catch (err) {
    console.error("[taskBoard DELETE permanent]", err);
    next(err);
  }
});

/* POST /tasks/:taskId/move */
router.post("/tasks/:taskId/move", auth, async (req, res, next) => {
  try {
    const taskId = Number(req.params.taskId);
    if (!taskId) return res.status(400).json({ error: t(req.lang, "errors.invalidRequest") });

    const [rows] = await pool.query("SELECT * FROM tb_tasks WHERE id = ?", [taskId]);
    if (rows.length === 0) return res.status(404).json({ error: t(req.lang, "errors.taskNotFound") });
    const existing = rows[0];

    if (!(await isProjectMember(existing.project_id, req.user.id))) {
      return res.status(403).json({ error: t(req.lang, "errors.permissionDenied") });
    }

    const { columnId, position } = req.body || {};
    if (!columnId || position === undefined) {
      return res.status(400).json({ error: "columnId and position are required" });
    }

    // Verify target column belongs to the same project
    const [[col]] = await pool.query(
      "SELECT id, name FROM tb_columns WHERE id = ? AND project_id = ?",
      [Number(columnId), existing.project_id]
    );
    if (!col) return res.status(404).json({ error: "Column not found" });

    const fromColumnId = existing.column_id;
    const [[fromCol]] = await pool.query("SELECT name FROM tb_columns WHERE id = ?", [fromColumnId]);

    await pool.query(
      "UPDATE tb_tasks SET column_id = ?, position = ? WHERE id = ?",
      [Number(columnId), Number(position), taskId]
    );

    await recordTaskActivity(taskId, req.user.id, "moved", {
      from_column_id: fromColumnId,
      to_column_id: Number(columnId),
      position: Number(position),
    });
    await recordActivity(pool, {
      projectId: existing.project_id,
      actorId: req.user.id,
      feature: "task-board",
      action: "task_moved",
      targetType: "task",
      targetId: taskId,
      targetLabel: existing.title,
      meta: {
        from_column_id: fromColumnId,
        from_column_name: fromCol?.name || null,
        to_column_id: Number(columnId),
        to_column_name: col.name,
      },
    });

    res.json({
      ok: true,
      fromColumnId,
      fromColumnName: fromCol?.name || null,
      toColumnId: Number(columnId),
      toColumnName: col.name,
    });
  } catch (err) {
    console.error("[taskBoard move]", err);
    next(err);
  }
});

/* PUT /projects/:projectId/tasks/reorder — bulk reorder */
router.put(
  "/projects/:projectId/tasks/reorder",
  auth,
  requireProjectMember("projectId"),
  async (req, res, next) => {
    try {
      const projectId = Number(req.params.projectId);
      const { tasks } = req.body || {};
      if (!Array.isArray(tasks) || !tasks.length) {
        return res.status(400).json({ error: "tasks must be a non-empty array of {id, column_id, position}" });
      }
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        for (const row of tasks) {
          await conn.query(
            "UPDATE tb_tasks SET column_id = ?, position = ? WHERE id = ? AND project_id = ?",
            [Number(row.column_id), Number(row.position), Number(row.id), projectId]
          );
        }
        await conn.commit();
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
      res.json({ ok: true });
    } catch (err) {
      console.error("[taskBoard reorder tasks]", err);
      next(err);
    }
  }
);

/* GET /projects/:projectId/tasks?status=archived — list archived tasks */
router.get(
  "/projects/:projectId/tasks",
  auth,
  requireProjectMember("projectId"),
  async (req, res, next) => {
    try {
      const projectId = Number(req.params.projectId);
      const status = (req.query.status || "").toString();
      const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);

      if (status !== "archived") {
        return res.json({ tasks: [], total: 0 });
      }

      const [[{ total }]] = await pool.query(
        "SELECT COUNT(*) AS total FROM tb_tasks WHERE project_id = ? AND archived_at IS NOT NULL",
        [projectId]
      );

      const [rows] = await pool.query(
        `SELECT tk.id, tk.project_id, tk.column_id, tk.title, tk.priority, tk.due_date,
                tk.archived_at, tk.archived_by,
                c.name AS column_name,
                ab.first_name AS ab_first, ab.last_name AS ab_last, ab.email AS ab_email,
                (SELECT COUNT(*) FROM tb_subtasks WHERE task_id = tk.id) AS subtask_total,
                (SELECT COUNT(*) FROM tb_subtasks WHERE task_id = tk.id AND done = 1) AS subtask_done,
                (SELECT COUNT(*) FROM tb_comments WHERE task_id = tk.id) AS comment_count,
                (SELECT COUNT(*) FROM tb_attachments WHERE task_id = tk.id) AS attachment_count
           FROM tb_tasks tk
           LEFT JOIN tb_columns c ON c.id = tk.column_id
           LEFT JOIN users ab ON ab.id = tk.archived_by
          WHERE tk.project_id = ? AND tk.archived_at IS NOT NULL
          ORDER BY tk.archived_at DESC, tk.id DESC
          LIMIT ?`,
        [projectId, limit]
      );

      // Hydrate assignees
      const taskIds = rows.map((r) => r.id);
      let assigneesByTask = {};
      if (taskIds.length) {
        const [arows] = await pool.query(
          `SELECT a.task_id, u.id, u.first_name, u.last_name, u.email, u.avatar_url
             FROM tb_assignees a JOIN users u ON u.id = a.user_id
            WHERE a.task_id IN (?)`,
          [taskIds]
        );
        for (const a of arows) {
          if (!assigneesByTask[a.task_id]) assigneesByTask[a.task_id] = [];
          assigneesByTask[a.task_id].push(fmtUser(a));
        }
      }

      const tasks = rows.map((r) => ({
        id: r.id,
        project_id: r.project_id,
        column_id: r.column_id,
        column_name: r.column_name,
        title: r.title,
        priority: r.priority,
        due_date: r.due_date,
        archived_at: r.archived_at,
        archived_by: r.archived_by,
        archived_by_name: r.ab_first
          ? [r.ab_first, r.ab_last].filter(Boolean).join(" ").trim()
          : null,
        archived_by_email: r.ab_email || null,
        subtask_total: Number(r.subtask_total || 0),
        subtask_done: Number(r.subtask_done || 0),
        comment_count: Number(r.comment_count || 0),
        attachment_count: Number(r.attachment_count || 0),
        assignees: assigneesByTask[r.id] || [],
        labels: [],
      }));

      res.json({ tasks, total });
    } catch (err) {
      console.error("[taskBoard archived tasks]", err);
      next(err);
    }
  }
);

/* ─────────────────────────────────────────────────────────────────────────
 * Subtasks
 * ───────────────────────────────────────────────────────────────────────── */

router.get("/tasks/:taskId/subtasks", auth, async (req, res, next) => {
  try {
    const taskId = Number(req.params.taskId);
    const projectId = await fetchTaskProjectId(taskId);
    if (!projectId) return res.status(404).json({ error: t(req.lang, "errors.taskNotFound") });
    if (!(await isProjectMember(projectId, req.user.id))) {
      return res.status(403).json({ error: t(req.lang, "errors.permissionDenied") });
    }
    const [rows] = await pool.query(
      "SELECT id, task_id, title, done, position, created_at FROM tb_subtasks WHERE task_id = ? ORDER BY position ASC, id ASC",
      [taskId]
    );
    const subtasks = rows.map((s) => ({
      id: s.id,
      task_id: s.task_id,
      title: s.title,
      done: !!s.done,
      position: s.position,
      created_at: s.created_at,
    }));
    res.json({ subtasks });
  } catch (err) { next(err); }
});

router.post("/tasks/:taskId/subtasks", auth, async (req, res, next) => {
  try {
    const taskId = Number(req.params.taskId);
    const projectId = await fetchTaskProjectId(taskId);
    if (!projectId) return res.status(404).json({ error: t(req.lang, "errors.taskNotFound") });
    if (!(await isProjectMember(projectId, req.user.id))) {
      return res.status(403).json({ error: t(req.lang, "errors.permissionDenied") });
    }
    const { title } = req.body || {};
    if (!title || !String(title).trim()) {
      return res.status(400).json({ error: "Subtask title is required" });
    }
    const [[{ nextPos }]] = await pool.query(
      "SELECT COALESCE(MAX(position), 0) + 1000 AS nextPos FROM tb_subtasks WHERE task_id = ?",
      [taskId]
    );
    const [r] = await pool.query(
      "INSERT INTO tb_subtasks (task_id, title, done, position) VALUES (?, ?, 0, ?)",
      [taskId, String(title).trim().slice(0, 255), nextPos]
    );
    const [[sub]] = await pool.query(
      "SELECT id, task_id, title, done, position, created_at FROM tb_subtasks WHERE id = ?",
      [r.insertId]
    );
    await recordTaskActivity(taskId, req.user.id, "subtask_added", { subtask_id: r.insertId, title: sub.title });
    res.status(201).json({
      subtask: {
        id: sub.id,
        task_id: sub.task_id,
        title: sub.title,
        done: !!sub.done,
        position: sub.position,
        created_at: sub.created_at,
      },
    });
  } catch (err) { next(err); }
});

router.put("/tasks/:taskId/subtasks/:subtaskId", auth, async (req, res, next) => {
  try {
    const taskId = Number(req.params.taskId);
    const subtaskId = Number(req.params.subtaskId);
    const projectId = await fetchTaskProjectId(taskId);
    if (!projectId) return res.status(404).json({ error: t(req.lang, "errors.taskNotFound") });
    if (!(await isProjectMember(projectId, req.user.id))) {
      return res.status(403).json({ error: t(req.lang, "errors.permissionDenied") });
    }
    const [rows] = await pool.query(
      "SELECT * FROM tb_subtasks WHERE id = ? AND task_id = ?",
      [subtaskId, taskId]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Subtask not found" });
    const existing = rows[0];

    const updates = [];
    const params = [];
    const { title, done, position } = req.body || {};
    if (title !== undefined) {
      const v = String(title).trim();
      if (!v) return res.status(400).json({ error: "Subtask title cannot be empty" });
      updates.push("title = ?"); params.push(v.slice(0, 255));
    }
    if (done !== undefined) {
      updates.push("done = ?"); params.push(done ? 1 : 0);
    }
    if (position !== undefined) {
      updates.push("position = ?"); params.push(Number(position));
    }
    if (!updates.length) return res.status(400).json({ error: "Nothing to update" });
    params.push(subtaskId);
    await pool.query(`UPDATE tb_subtasks SET ${updates.join(", ")} WHERE id = ?`, params);

    if (done !== undefined && !!existing.done !== !!done) {
      await recordTaskActivity(taskId, req.user.id, done ? "subtask_done" : "subtask_reopened", {
        subtask_id: subtaskId,
        title: existing.title,
      });
    }

    const [[updated]] = await pool.query(
      "SELECT id, task_id, title, done, position, created_at FROM tb_subtasks WHERE id = ?",
      [subtaskId]
    );
    res.json({
      subtask: {
        id: updated.id,
        task_id: updated.task_id,
        title: updated.title,
        done: !!updated.done,
        position: updated.position,
        created_at: updated.created_at,
      },
    });
  } catch (err) { next(err); }
});

router.delete("/tasks/:taskId/subtasks/:subtaskId", auth, async (req, res, next) => {
  try {
    const taskId = Number(req.params.taskId);
    const subtaskId = Number(req.params.subtaskId);
    const projectId = await fetchTaskProjectId(taskId);
    if (!projectId) return res.status(404).json({ error: t(req.lang, "errors.taskNotFound") });
    if (!(await isProjectMember(projectId, req.user.id))) {
      return res.status(403).json({ error: t(req.lang, "errors.permissionDenied") });
    }
    const [[existing]] = await pool.query(
      "SELECT title FROM tb_subtasks WHERE id = ? AND task_id = ?",
      [subtaskId, taskId]
    );
    const [r] = await pool.query("DELETE FROM tb_subtasks WHERE id = ? AND task_id = ?", [subtaskId, taskId]);
    if (!r.affectedRows) return res.status(404).json({ error: "Subtask not found" });
    await recordTaskActivity(taskId, req.user.id, "subtask_deleted", {
      subtask_id: subtaskId,
      title: existing?.title || null,
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/* ─────────────────────────────────────────────────────────────────────────
 * Comments
 * ───────────────────────────────────────────────────────────────────────── */

const hydrateCommentReactions = async (commentRows, currentUserId) => {
  if (!commentRows || commentRows.length === 0) return commentRows;
  const ids = commentRows.map((r) => r.id);
  const [aggregateRows] = await pool.query(
    `SELECT comment_id, emoji, COUNT(*) AS count, MAX(user_id = ?) AS mine
       FROM task_comment_reactions
      WHERE comment_id IN (?)
      GROUP BY comment_id, emoji`,
    [currentUserId, ids]
  );
  const [userRows] = await pool.query(
    `SELECT tcr.comment_id, tcr.emoji, u.first_name, u.last_name, u.email
       FROM task_comment_reactions tcr JOIN users u ON u.id = tcr.user_id
      WHERE tcr.comment_id IN (?)
      ORDER BY tcr.created_at ASC`,
    [ids]
  );
  const reactMap = {};
  aggregateRows.forEach((r) => {
    if (!reactMap[r.comment_id]) reactMap[r.comment_id] = {};
    reactMap[r.comment_id][r.emoji] = { emoji: r.emoji, count: r.count, mine: !!r.mine, users: [] };
  });
  userRows.forEach((r) => {
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

router.get("/tasks/:taskId/comments", auth, async (req, res, next) => {
  try {
    const taskId = Number(req.params.taskId);
    const projectId = await fetchTaskProjectId(taskId);
    if (!projectId) return res.status(404).json({ error: t(req.lang, "errors.taskNotFound") });
    if (!(await isProjectMember(projectId, req.user.id))) {
      return res.status(403).json({ error: t(req.lang, "errors.permissionDenied") });
    }
    const [rows] = await pool.query(
      `SELECT c.id, c.task_id, c.user_id, c.body, c.created_at, c.updated_at,
              u.first_name, u.last_name, u.email, u.avatar_url
         FROM tb_comments c JOIN users u ON u.id = c.user_id
        WHERE c.task_id = ?
        ORDER BY c.created_at ASC, c.id ASC`,
      [taskId]
    );
    const baseRows = rows.map((r) => ({
      id: r.id,
      task_id: r.task_id,
      body: r.body,
      created_at: r.created_at,
      updated_at: r.updated_at,
      author: {
        id: r.user_id,
        name: [r.first_name, r.last_name].filter(Boolean).join(" ").trim() || r.email,
        initials: initialsOf(r.first_name, r.last_name, r.email),
        email: r.email,
        avatar: r.avatar_url || null,
      },
    }));
    const withReactions = await hydrateCommentReactions(baseRows, req.user.id);
    res.json({ comments: withReactions });
  } catch (err) { next(err); }
});

router.post("/tasks/:taskId/comments", auth, async (req, res, next) => {
  try {
    const taskId = Number(req.params.taskId);
    const projectId = await fetchTaskProjectId(taskId);
    if (!projectId) return res.status(404).json({ error: t(req.lang, "errors.taskNotFound") });
    if (!(await isProjectMember(projectId, req.user.id))) {
      return res.status(403).json({ error: t(req.lang, "errors.permissionDenied") });
    }
    const { body } = req.body || {};
    const clean = typeof body === "string" ? body.trim() : "";
    if (!clean) return res.status(400).json({ error: "Comment body is required" });

    const [r] = await pool.query(
      "INSERT INTO tb_comments (task_id, user_id, body) VALUES (?, ?, ?)",
      [taskId, req.user.id, clean]
    );
    const [[row]] = await pool.query(
      `SELECT c.id, c.task_id, c.user_id, c.body, c.created_at, c.updated_at,
              u.first_name, u.last_name, u.email, u.avatar_url
         FROM tb_comments c JOIN users u ON u.id = c.user_id WHERE c.id = ?`,
      [r.insertId]
    );
    const comment = {
      id: row.id,
      task_id: row.task_id,
      body: row.body,
      created_at: row.created_at,
      updated_at: row.updated_at,
      author: {
        id: row.user_id,
        name: [row.first_name, row.last_name].filter(Boolean).join(" ").trim() || row.email,
        initials: initialsOf(row.first_name, row.last_name, row.email),
        email: row.email,
        avatar: row.avatar_url || null,
      },
      reactions: [],
    };

    await recordTaskActivity(taskId, req.user.id, "commented", { comment_id: r.insertId });
    await recordActivity(pool, {
      projectId,
      actorId: req.user.id,
      feature: "task-board",
      action: "task_commented",
      targetType: "task",
      targetId: taskId,
      targetLabel: null,
      meta: { comment_id: r.insertId },
    });

    res.status(201).json({ comment });
  } catch (err) { next(err); }
});

router.put("/tasks/:taskId/comments/:commentId", auth, async (req, res, next) => {
  try {
    const taskId = Number(req.params.taskId);
    const commentId = Number(req.params.commentId);
    const projectId = await fetchTaskProjectId(taskId);
    if (!projectId) return res.status(404).json({ error: t(req.lang, "errors.taskNotFound") });
    if (!(await isProjectMember(projectId, req.user.id))) {
      return res.status(403).json({ error: t(req.lang, "errors.permissionDenied") });
    }
    const [rows] = await pool.query(
      "SELECT * FROM tb_comments WHERE id = ? AND task_id = ?",
      [commentId, taskId]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Comment not found" });
    const existing = rows[0];
    if (existing.user_id !== req.user.id) {
      // Owner can override
      const [p] = await pool.query("SELECT manager_id FROM projects WHERE id = ?", [projectId]);
      const isOwner = p.length > 0 && p[0].manager_id === req.user.id;
      if (!isOwner) return res.status(403).json({ error: t(req.lang, "errors.permissionDenied") });
    }
    const { body } = req.body || {};
    const clean = typeof body === "string" ? body.trim() : "";
    if (!clean) return res.status(400).json({ error: "Comment body is required" });
    await pool.query(
      "UPDATE tb_comments SET body = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [clean, commentId]
    );
    const [[row]] = await pool.query(
      `SELECT c.id, c.task_id, c.user_id, c.body, c.created_at, c.updated_at,
              u.first_name, u.last_name, u.email, u.avatar_url
         FROM tb_comments c JOIN users u ON u.id = c.user_id WHERE c.id = ?`,
      [commentId]
    );
    const comment = {
      id: row.id,
      task_id: row.task_id,
      body: row.body,
      created_at: row.created_at,
      updated_at: row.updated_at,
      author: {
        id: row.user_id,
        name: [row.first_name, row.last_name].filter(Boolean).join(" ").trim() || row.email,
        initials: initialsOf(row.first_name, row.last_name, row.email),
        email: row.email,
        avatar: row.avatar_url || null,
      },
    };
    const withReactions = await hydrateCommentReactions([comment], req.user.id);
    res.json({ comment: withReactions[0] });
  } catch (err) { next(err); }
});

router.delete("/tasks/:taskId/comments/:commentId", auth, async (req, res, next) => {
  try {
    const taskId = Number(req.params.taskId);
    const commentId = Number(req.params.commentId);
    const projectId = await fetchTaskProjectId(taskId);
    if (!projectId) return res.status(404).json({ error: t(req.lang, "errors.taskNotFound") });
    if (!(await isProjectMember(projectId, req.user.id))) {
      return res.status(403).json({ error: t(req.lang, "errors.permissionDenied") });
    }
    const [rows] = await pool.query(
      "SELECT user_id FROM tb_comments WHERE id = ? AND task_id = ?",
      [commentId, taskId]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Comment not found" });
    if (rows[0].user_id !== req.user.id) {
      const [p] = await pool.query("SELECT manager_id FROM projects WHERE id = ?", [projectId]);
      const isOwner = p.length > 0 && p[0].manager_id === req.user.id;
      if (!isOwner) return res.status(403).json({ error: t(req.lang, "errors.permissionDenied") });
    }
    await pool.query("DELETE FROM tb_comments WHERE id = ?", [commentId]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.post("/tasks/:taskId/comments/:commentId/reactions", auth, async (req, res, next) => {
  try {
    const taskId = Number(req.params.taskId);
    const commentId = Number(req.params.commentId);
    const { emoji, old_emoji } = req.body || {};
    if (!emoji || typeof emoji !== "string" || emoji.length > 16) {
      return res.status(400).json({ error: t(req.lang, "errors.invalidRequest") });
    }
    const projectId = await fetchTaskProjectId(taskId);
    if (!projectId) return res.status(404).json({ error: t(req.lang, "errors.taskNotFound") });
    if (!(await isProjectMember(projectId, req.user.id))) {
      return res.status(403).json({ error: t(req.lang, "errors.permissionDenied") });
    }
    const [rows] = await pool.query(
      "SELECT id, task_id FROM tb_comments WHERE id = ?",
      [commentId]
    );
    if (rows.length === 0 || rows[0].task_id !== taskId) {
      return res.status(404).json({ error: "Comment not found" });
    }

    // Replace flow (old_emoji provided): delete old_emoji first, then add new if not present.
    // Toggle flow (no old_emoji): toggle the emoji on/off.
    if (old_emoji && typeof old_emoji === "string" && old_emoji !== emoji) {
      await pool.query(
        "DELETE FROM task_comment_reactions WHERE comment_id = ? AND user_id = ? AND emoji = ?",
        [commentId, req.user.id, old_emoji]
      );
      const [alreadyHas] = await pool.query(
        "SELECT id FROM task_comment_reactions WHERE comment_id = ? AND user_id = ? AND emoji = ?",
        [commentId, req.user.id, emoji]
      );
      if (alreadyHas.length === 0) {
        await pool.query(
          "INSERT INTO task_comment_reactions (comment_id, user_id, emoji) VALUES (?, ?, ?)",
          [commentId, req.user.id, emoji]
        );
      }
    } else {
      const [existing] = await pool.query(
        "SELECT id FROM task_comment_reactions WHERE comment_id = ? AND user_id = ? AND emoji = ?",
        [commentId, req.user.id, emoji]
      );
      if (existing.length > 0) {
        await pool.query(
          "DELETE FROM task_comment_reactions WHERE comment_id = ? AND user_id = ? AND emoji = ?",
          [commentId, req.user.id, emoji]
        );
      } else {
        await pool.query(
          "INSERT INTO task_comment_reactions (comment_id, user_id, emoji) VALUES (?, ?, ?)",
          [commentId, req.user.id, emoji]
        );
      }
    }

    // Return updated reactions for this comment
    const [aggregateRows] = await pool.query(
      `SELECT emoji, COUNT(*) AS count, MAX(user_id = ?) AS mine
         FROM task_comment_reactions
        WHERE comment_id = ?
        GROUP BY emoji`,
      [req.user.id, commentId]
    );
    const [userRows] = await pool.query(
      `SELECT tcr.emoji, u.first_name, u.last_name, u.email
         FROM task_comment_reactions tcr JOIN users u ON u.id = tcr.user_id
        WHERE tcr.comment_id = ?
        ORDER BY tcr.created_at ASC`,
      [commentId]
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
  } catch (err) { next(err); }
});

/* ─────────────────────────────────────────────────────────────────────────
 * Attachments
 * ───────────────────────────────────────────────────────────────────────── */

router.get("/tasks/:taskId/attachments", auth, async (req, res, next) => {
  try {
    const taskId = Number(req.params.taskId);
    const projectId = await fetchTaskProjectId(taskId);
    if (!projectId) return res.status(404).json({ error: t(req.lang, "errors.taskNotFound") });
    if (!(await isProjectMember(projectId, req.user.id))) {
      return res.status(403).json({ error: t(req.lang, "errors.permissionDenied") });
    }
    const [rows] = await pool.query(
      `SELECT a.id, a.task_id, a.file_url, a.file_type, a.file_size, a.uploaded_by, a.created_at,
              u.first_name AS u_first, u.last_name AS u_last, u.email AS u_email
         FROM tb_attachments a JOIN users u ON u.id = a.uploaded_by
        WHERE a.task_id = ?
        ORDER BY a.created_at ASC, a.id ASC`,
      [taskId]
    );
    const attachments = rows.map((r) => ({
      id: r.id,
      task_id: r.task_id,
      file_url: r.file_url,
      file_type: r.file_type,
      file_size: r.file_size,
      uploaded_by: r.uploaded_by,
      created_at: r.created_at,
      name: r.file_url ? r.file_url.split("/").pop() : "file",
      uploader: {
        id: r.uploaded_by,
        name: [r.u_first, r.u_last].filter(Boolean).join(" ").trim() || r.u_email,
        email: r.u_email,
      },
    }));
    res.json({ attachments });
  } catch (err) { next(err); }
});

router.post("/tasks/:taskId/attachments", auth, upload.single("file"), async (req, res, next) => {
  try {
    const taskId = Number(req.params.taskId);
    const projectId = await fetchTaskProjectId(taskId);
    if (!projectId) return res.status(404).json({ error: t(req.lang, "errors.taskNotFound") });
    if (!(await isProjectMember(projectId, req.user.id))) {
      return res.status(403).json({ error: t(req.lang, "errors.permissionDenied") });
    }
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const fileUrl = `/uploads/${path.basename(req.file.path)}`;
    const [r] = await pool.query(
      "INSERT INTO tb_attachments (task_id, file_url, file_type, file_size, uploaded_by) VALUES (?, ?, ?, ?, ?)",
      [taskId, fileUrl, req.file.mimetype || null, req.file.size || 0, req.user.id]
    );
    const [[row]] = await pool.query(
      `SELECT a.id, a.task_id, a.file_url, a.file_type, a.file_size, a.uploaded_by, a.created_at
         FROM tb_attachments a WHERE a.id = ?`,
      [r.insertId]
    );
    const attachment = {
      id: row.id,
      task_id: row.task_id,
      file_url: row.file_url,
      file_type: row.file_type,
      file_size: row.file_size,
      uploaded_by: row.uploaded_by,
      created_at: row.created_at,
      name: path.basename(req.file.path),
    };
    await recordTaskActivity(taskId, req.user.id, "attached", { attachment_id: r.insertId, name: attachment.name });
    res.status(201).json({ attachment });
  } catch (err) { next(err); }
});

router.delete("/tasks/:taskId/attachments/:attachmentId", auth, async (req, res, next) => {
  try {
    const taskId = Number(req.params.taskId);
    const attachmentId = Number(req.params.attachmentId);
    const projectId = await fetchTaskProjectId(taskId);
    if (!projectId) return res.status(404).json({ error: t(req.lang, "errors.taskNotFound") });
    if (!(await isProjectMember(projectId, req.user.id))) {
      return res.status(403).json({ error: t(req.lang, "errors.permissionDenied") });
    }
    const [[row]] = await pool.query(
      "SELECT file_url, uploaded_by FROM tb_attachments WHERE id = ? AND task_id = ?",
      [attachmentId, taskId]
    );
    if (!row) return res.status(404).json({ error: "Attachment not found" });

    // Only uploader, project owner, or task creator can delete.
    let allowed = row.uploaded_by === req.user.id;
    if (!allowed) {
      const [p] = await pool.query("SELECT manager_id FROM projects WHERE id = ?", [projectId]);
      if (p.length > 0 && p[0].manager_id === req.user.id) allowed = true;
      if (!allowed) {
        const [t] = await pool.query("SELECT created_by FROM tb_tasks WHERE id = ?", [taskId]);
        if (t.length > 0 && t[0].created_by === req.user.id) allowed = true;
      }
    }
    if (!allowed) return res.status(403).json({ error: t(req.lang, "errors.permissionDenied") });

    await pool.query("DELETE FROM tb_attachments WHERE id = ?", [attachmentId]);

    // Try to remove the file from disk (best-effort)
    if (row.file_url) {
      try {
        const fp = path.join(UPLOAD_DIR, path.basename(row.file_url));
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
      } catch (_) { /* best-effort */ }
    }
    await recordTaskActivity(taskId, req.user.id, "attachment_deleted", {
      attachment_id: attachmentId,
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/* ─────────────────────────────────────────────────────────────────────────
 * Activity
 * ───────────────────────────────────────────────────────────────────────── */

router.get("/tasks/:taskId/activity", auth, async (req, res, next) => {
  try {
    const taskId = Number(req.params.taskId);
    const projectId = await fetchTaskProjectId(taskId);
    if (!projectId) return res.status(404).json({ error: t(req.lang, "errors.taskNotFound") });
    if (!(await isProjectMember(projectId, req.user.id))) {
      return res.status(403).json({ error: t(req.lang, "errors.permissionDenied") });
    }
    const [rows] = await pool.query(
      `SELECT a.id, a.task_id, a.action, a.details_json, a.created_at,
              u.id AS user_id, u.first_name, u.last_name, u.email, u.avatar_url
         FROM tb_activity a JOIN users u ON u.id = a.user_id
        WHERE a.task_id = ?
        ORDER BY a.created_at DESC, a.id DESC
        LIMIT 200`,
      [taskId]
    );
    const activity = rows.map((r) => {
      let details = null;
      if (r.details_json && typeof r.details_json === "string") {
        try { details = JSON.parse(r.details_json); } catch (_) { details = r.details_json; }
      } else if (r.details_json) {
        details = r.details_json;
      }
      return {
        id: r.id,
        task_id: r.task_id,
        action: r.action,
        details,
        created_at: r.created_at,
        actor: {
          id: r.user_id,
          name: [r.first_name, r.last_name].filter(Boolean).join(" ").trim() || r.email,
          initials: initialsOf(r.first_name, r.last_name, r.email),
          email: r.email,
          avatar: r.avatar_url || null,
        },
      };
    });
    res.json({ activity });
  } catch (err) { next(err); }
});

module.exports = router;
