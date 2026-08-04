/**
 * Test Cases routes.
 *
 * Mounted at /api — page routes are `/api/projects/:projectId/test-cases`.
 *
 * Lenient membership model (same as task board / message board):
 *   - Anyone authenticated who is a project member (or the project owner)
 *     can READ + WRITE test cases.
 *
 * Endpoints (all JSON, all behind `auth`):
 *   ── Test cases ──
 *   GET    /api/projects/:projectId/test-cases                     — list w/ search/filter/pagination
 *   POST   /api/projects/:projectId/test-cases                     — create
 *   GET    /api/projects/:projectId/test-cases/:caseId             — single w/ steps/comments/attachments
 *   PUT    /api/projects/:projectId/test-cases/:caseId             — update
 *   PATCH  /api/projects/:projectId/test-cases/:caseId/status      — inline status update
 *   PATCH  /api/projects/:projectId/test-cases/:caseId/priority    — inline priority update
 *   DELETE /api/projects/:projectId/test-cases/:caseId             — delete
 *
 *   ── Steps ──
 *   POST   /api/projects/:projectId/test-cases/:caseId/steps                 — add
 *   PUT    /api/projects/:projectId/test-cases/:caseId/steps/:stepId         — update
 *   DELETE /api/projects/:projectId/test-cases/:caseId/steps/:stepId         — delete
 *
 *   ── Comments ──
 *   GET    /api/projects/:projectId/test-cases/:caseId/comments              — list
 *   POST   /api/projects/:projectId/test-cases/:caseId/comments              — add { body }
 *   PUT    /api/projects/:projectId/test-cases/:caseId/comments/:commentId   — edit
 *   DELETE /api/projects/:projectId/test-cases/:caseId/comments/:commentId    — delete
 *
 *   ── Attachments ──
 *   GET    /api/projects/:projectId/test-cases/:caseId/attachments           — list
 *   POST   /api/projects/:projectId/test-cases/:caseId/attachments           — upload (multipart)
 *   DELETE /api/projects/:projectId/test-cases/:caseId/attachments/:attachmentId — delete
 */

const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const pool = require("../config/database");
const { auth } = require("../middleware/auth");
const { isProjectMember: sharedIsProjectMember, requireProjectMember } = require("../middleware/projectMember");
const { recordActivity } = require("../utils/activity");
const { processAndNotifyMentions, SOURCE_TYPES } = require("../utils/mentions");

const router = express.Router();

// Upload directory for test case attachments
const UPLOAD_DIR = "/var/www/seravavatar-hub/uploads/test-attachments";
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^\w.\-]+/g, "_").slice(-80);
    cb(null, `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safe}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

/* ──────────────────────────────────────────────────────────────────
 * Helpers
 * ────────────────────────────────────────────────────────────────── */
const VALID_PRIORITIES = ["low", "medium", "high", "critical"];
const VALID_STATUSES = ["draft", "ready", "in_progress", "failed", "skipped"];
// Auto-status: computed based on assignee execution_status.
// Returns { status, computed_status } for a given tc with passed_count & total_assignees.
// Blocking conditions (any of these = don't auto-compute):
//   1. computed_status is already set (sticky manual override — user explicitly changed status)
//   2. status is 'draft' or 'skipped' (manual-only statuses)
//   3. no assignees
//
// 'ready', 'in_progress', 'failed', 'passed' ALL allow auto-recomputation because
// they can all be arrived at automatically and should all re-compute when
// an assignee changes their execution status.
function computeAutoStatus(tcStatus, tcComputedStatus, executionCounts, totalAssignees) {
  // executionCounts: { pending: number, passed: number, failed: number }
  // If a manual override is active (computed_status already set), don't recompute
  if (tcComputedStatus !== null && tcComputedStatus !== undefined) {
    return null; // keep manual sticky override
  }
  // Auto-status only applies when the current TC status is NOT a manual-only status.
  // 'draft' is always manual. 'skipped' is manual UNLESS an assignee triggers a change.
  // We include 'skipped' here so the function is called whenever an assignee changes,
  // and the logic below correctly handles: skipped + anyFailed → failed, etc.
  if (!['ready', 'in_progress', 'failed', 'passed', 'skipped'].includes(tcStatus)) {
    return null; // manual-only status (draft only)
  }
  if (totalAssignees === 0) return null; // no assignees — manual status
  const { pending, passed, failed } = executionCounts;
  const allPassed     = pending === 0 && passed === totalAssignees && failed === 0;
  const anyFailed    = failed > 0;
  const someStarted   = (passed + failed) > 0; // at least one assignee executed
  const noneStarted  = pending === totalAssignees;

  // Priority: failed > in_progress > passed > ready
  if (anyFailed) {
    return { status: 'failed', computed_status: 'failed' };
  }
  if (allPassed) {
    return { status: 'passed', computed_status: 'passed' };
  }
  if (someStarted) {
    // At least one executed, none failed → in_progress
    return { status: 'in_progress', computed_status: 'in_progress' };
  }
  // noneStarted (all pending) → ready
  return { status: 'ready', computed_status: 'ready' };
}

// Recompute and persist auto-status for a test case
async function maybeRecomputeStatus(pool, caseId) {
  const [rows] = await pool.query(
    `SELECT tc.status, tc.computed_status,
            COUNT(a.id) AS total_assignees,
            SUM(CASE WHEN a.execution_status = 'pending' THEN 1 ELSE 0 END) AS pending_count,
            SUM(CASE WHEN a.execution_status = 'passed' THEN 1 ELSE 0 END) AS passed_count,
            SUM(CASE WHEN a.execution_status = 'failed' THEN 1 ELSE 0 END) AS failed_count
     FROM tb_test_cases tc
     LEFT JOIN tb_test_case_assignees a ON a.test_case_id = tc.id
     WHERE tc.id = ?`,
    [caseId]
  );
  if (!rows.length) return;
  const tc = rows[0];
  const total = Number(tc.total_assignees || 0);
  const result = computeAutoStatus(tc.status, tc.computed_status, {
    pending: Number(tc.pending_count || 0),
    passed: Number(tc.passed_count || 0),
    failed: Number(tc.failed_count || 0),
  }, total);
  if (result) {
    await pool.query(
      "UPDATE tb_test_cases SET status = ?, computed_status = ?, updated_at = NOW() WHERE id = ?",
      [result.status, result.computed_status, caseId]
    );
  }
}


const isProjectMember = sharedIsProjectMember;

const requireMemberOrOwner = async (req, res, next) => {
  const userId = req.user?.id;
  const projectId = Number(req.params.projectId || req.body?.projectId || 0);
  if (!projectId || !userId) return res.status(400).json({ message: "Invalid request" });
  if (!(await isProjectMember(projectId, userId))) {
    return res.status(403).json({ message: "Not a project member" });
  }
  next();
};

// Resolve a test case's project_id from its id (for routes that only carry :caseId)
const requireCaseProjectMember = async (req, res, next) => {
  const userId = req.user?.id;
  const caseId = Number(req.params.caseId || req.params.id);
  if (!caseId || !userId) return res.status(400).json({ message: "Invalid request" });
  const [t] = await pool.query("SELECT project_id FROM tb_test_cases WHERE id = ?", [caseId]);
  if (t.length === 0) return res.status(404).json({ message: "Test case not found" });
  if (!(await isProjectMember(t[0].project_id, userId))) {
    return res.status(403).json({ message: "Not a project member" });
  }
  req._caseProjectId = t[0].project_id;
  next();
};

const fmtUser = (u) => ({
  id: u.id,
  name: [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || u.email,
  initials: ((u.first_name?.[0] || u.email?.[0] || "?") + "" + (u.last_name?.[0] || "")).toUpperCase(),
  email: u.email,
  avatar: u.avatar_url || null,
});

// Hydrate assignees for a test case
const hydrateAssignees = async (caseId) => {
  const [rows] = await pool.query(
    `SELECT u.id, u.first_name, u.last_name, u.email, u.avatar_url
       FROM tb_test_case_assignees ta
       JOIN users u ON u.id = ta.user_id
      WHERE ta.test_case_id = ?`,
    [caseId]
  );
  return rows.map(fmtUser);
};

// Hydrate a single test case row into the JSON shape the frontend consumes.
// Returns the test case object plus (optionally) inline steps/comments/attachments.
const hydrateTestCase = async (tc, opts = {}) => {
  const includeSteps = !!opts.steps;
  const includeComments = !!opts.comments;
  const includeAttachments = !!opts.attachments;
  const currentUserId = opts.currentUserId;

  const out = {
    id: tc.id,
    project_id: tc.project_id,
    suite_id: tc.suite_id,
    task_id: tc.task_id || null,
    title: tc.title,
    priority: tc.priority,
    status: tc.status,
    assigned_tester_id: tc.assigned_tester_id || null,
    preconditions: tc.preconditions,
    expected_result: tc.expected_result,
    actual_result: tc.actual_result,
    created_by: tc.created_by,
    created_at: tc.created_at,
    updated_at: tc.updated_at,
    author: tc.u_first != null
      ? fmtUser({
          id: tc.created_by,
          first_name: tc.u_first,
          last_name: tc.u_last,
          email: tc.u_email,
          avatar_url: tc.u_avatar,
        })
      : null,
    suite_name: tc.suite_name || null,
    tester: tc.t_first != null
      ? fmtUser({
          id: tc.assigned_tester_id,
          first_name: tc.t_first,
          last_name: tc.t_last,
          email: tc.t_email,
          avatar_url: tc.t_avatar,
        })
      : null,
    task_title: tc.task_title || null,
    step_count: tc.step_count != null ? Number(tc.step_count) : undefined,
    comment_count: tc.comment_count != null ? Number(tc.comment_count) : undefined,
    attachment_count: tc.attachment_count != null ? Number(tc.attachment_count) : undefined,
  };

  // Always include assignees with their execution status
  out.assignees = await hydrateAssigneesWithStatus(tc.id);
  out.passed_count = Number(tc.passed_count || 0);
  out.failed_count = Number(tc.failed_count || 0);
  out.pending_count = Number(tc.pending_count || 0);
  out.total_assignees = Number(tc.total_assignees || 0);
  // Effective status: if computed_status is set, use it; otherwise use status
  out.computed_status = tc.computed_status || null;
  out.effective_status = (tc.computed_status || tc.status);

  if (includeSteps) {
    const [steps] = await pool.query(
      "SELECT id, test_case_id, step_number, description, expected_result FROM tb_test_case_steps WHERE test_case_id = ? ORDER BY step_number ASC",
      [tc.id]
    );
    out.steps = steps;
  }
  if (includeComments) {
    const [comments] = await pool.query(
      `SELECT c.*, u.first_name, u.last_name, u.email, u.avatar_url
         FROM tb_test_case_comments c JOIN users u ON u.id = c.author_id
        WHERE c.test_case_id = ? ORDER BY c.created_at ASC`,
      [tc.id]
    );
    out.comments = await hydrateTestCaseCommentReactions(comments, currentUserId);
  }
  if (includeAttachments) {
    const [attachments] = await pool.query(
      `SELECT a.*, u.first_name, u.last_name, u.email
         FROM tb_test_case_attachments a JOIN users u ON u.id = a.uploaded_by
        WHERE a.test_case_id = ? ORDER BY a.created_at ASC`,
      [tc.id]
    );
    out.attachments = attachments.map((a) => ({
      ...a,
      name: path.basename(a.file_url),
    }));
  }

  return out;
};

// Hydrate assignees WITH their execution status
async function hydrateAssigneesWithStatus(caseId) {
  const [rows] = await pool.query(
    `SELECT ta.id, ta.user_id, ta.execution_status, ta.created_at,
            u.first_name, u.last_name, u.email, u.avatar_url
     FROM tb_test_case_assignees ta
     JOIN users u ON u.id = ta.user_id
     WHERE ta.test_case_id = ?
     ORDER BY ta.created_at ASC`,
    [caseId]
  );
  return rows.map((r) => ({
    id: r.id,
    user_id: r.user_id,
    execution_status: r.execution_status || 'pending',
    created_at: r.created_at,
    name: [r.first_name, r.last_name].filter(Boolean).join(" ").trim() || r.email || "?",
    initials: ((r.first_name?.[0] || r.email?.[0] || "?") + "" + (r.last_name?.[0] || "")).toUpperCase(),
    email: r.email,
    avatar: r.avatar_url || null,
  }));
}

/* ──────────────────────────────────────────────────────────────────
 * Hydrate test-case comments with reactions.
 * ────────────────────────────────────────────────────────────────── */
async function hydrateTestCaseCommentReactions(commentRows, currentUserId) {
  if (!commentRows || commentRows.length === 0) return commentRows;
  const ids = commentRows.map((r) => r.id);
  const [reactionRows] = await pool.query(
    `SELECT r.comment_id, r.emoji, r.user_id,
            u.first_name, u.last_name, u.email
     FROM tb_test_case_comment_reactions r
     JOIN users u ON r.user_id = u.id
     WHERE r.comment_id IN (?)
     ORDER BY r.created_at ASC`,
    [ids]
  );
  const [aggregateRows] = await pool.query(
    `SELECT comment_id, emoji,
            COUNT(*) AS count,
            MAX(user_id = ?) AS mine
     FROM tb_test_case_comment_reactions
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
  return commentRows.map((c) => ({
    ...c,
    author: fmtUser(c),
    reactions: Object.values(reactMap[c.id] || {}),
  }));
};

/* ──────────────────────────────────────────────────────────────────
 * 1. List test cases (with search / filter / pagination / My Test Cases)
 * ────────────────────────────────────────────────────────────────── */
router.get("/projects/:projectId/test-cases", auth, requireProjectMember("projectId"), async (req, res) => {
  try {
    const projectId = Number(req.params.projectId);
    if (!projectId) return res.status(400).json({ message: "Invalid request" });

    const search = String(req.query.search || "").trim();
    const suiteId = req.query.suite_id ? Number(req.query.suite_id) : null;
    const status = req.query.status ? String(req.query.status) : null;
    const priority = req.query.priority ? String(req.query.priority) : null;
    const assignedToMe = req.query.assigned_to_me === "true";
    const page = Math.max(1, Number(req.query.page) || 1);
    const perPage = Math.min(100, Math.max(1, Number(req.query.per_page) || 15));

    const where = ["tc.project_id = ?"];
    const params = [projectId];
    if (search) {
      where.push("(tc.title LIKE ? OR tc.preconditions LIKE ? OR tc.expected_result LIKE ?)");
      const like = `%${search}%`;
      params.push(like, like, like);
    }
    if (suiteId) { where.push("tc.suite_id = ?"); params.push(suiteId); }
    if (status && VALID_STATUSES.includes(status)) { where.push("tc.status = ?"); params.push(status); }
    if (priority && VALID_PRIORITIES.includes(priority)) { where.push("tc.priority = ?"); params.push(priority); }
    if (assignedToMe) { where.push("EXISTS (SELECT 1 FROM tb_test_case_assignees ta WHERE ta.test_case_id = tc.id AND ta.user_id = ?)"); params.push(req.user.id); }

    const whereSql = `WHERE ${where.join(" AND ")}`;

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM tb_test_cases tc ${whereSql}`,
      params
    );
    const total = Number(countRows[0].total || 0);

    const offset = (page - 1) * perPage;
    const [rows] = await pool.query(
      `SELECT tc.*,
              u.first_name AS u_first, u.last_name AS u_last, u.email AS u_email, u.avatar_url AS u_avatar,
              t.first_name AS t_first, t.last_name AS t_last, t.email AS t_email, t.avatar_url AS t_avatar,
              s.name AS suite_name,
              tk.title AS task_title,
              (SELECT COUNT(*) FROM tb_test_case_steps st WHERE st.test_case_id = tc.id) AS step_count,
              (SELECT COUNT(*) FROM tb_test_case_comments cm WHERE cm.test_case_id = tc.id) AS comment_count,
              (SELECT COUNT(*) FROM tb_test_case_attachments at WHERE at.test_case_id = tc.id) AS attachment_count,
              (SELECT COUNT(*) FROM tb_test_case_assignees ta WHERE ta.test_case_id = tc.id) AS total_assignees,
              (SELECT SUM(a.execution_status = 'passed') FROM tb_test_case_assignees a WHERE a.test_case_id = tc.id) AS passed_count,
              (SELECT SUM(a.execution_status = 'failed') FROM tb_test_case_assignees a WHERE a.test_case_id = tc.id) AS failed_count,
              (SELECT SUM(a.execution_status = 'pending') FROM tb_test_case_assignees a WHERE a.test_case_id = tc.id) AS pending_count
         FROM tb_test_cases tc
         JOIN users u ON u.id = tc.created_by
         LEFT JOIN users t ON t.id = tc.assigned_tester_id
         LEFT JOIN tb_test_suites s ON s.id = tc.suite_id
         LEFT JOIN tb_tasks tk ON tk.id = tc.task_id
         ${whereSql}
         ORDER BY tc.updated_at DESC, tc.id DESC
         LIMIT ? OFFSET ?`,
      [...params, perPage, offset]
    );

    const testCases = [];
    for (const r of rows) {
      testCases.push(await hydrateTestCase(r));
    }

    return res.json({
      testCases,
      total,
      page,
      per_page: perPage,
    });
  } catch (e) {
    console.error("[test-cases GET]", e);
    return res.status(500).json({ message: "Server error", error: e.message });
  }
});

/* ──────────────────────────────────────────────────────────────────
 * 2. Create test case
 * ────────────────────────────────────────────────────────────────── */
router.post("/projects/:projectId/test-cases", auth, requireMemberOrOwner, async (req, res) => {
  try {
    const projectId = Number(req.params.projectId);
    const title = String(req.body?.title || "").trim();
    const suiteId = Number(req.body?.suite_id);
    const priority = VALID_PRIORITIES.includes(req.body?.priority) ? req.body.priority : "medium";
    const status = VALID_STATUSES.includes(req.body?.status) ? req.body.status : "draft";
    if (!title) return res.status(400).json({ message: "Title required" });
    if (title.length > 255) return res.status(400).json({ message: "Title too long (max 255 chars)" });
    if (!suiteId) return res.status(400).json({ message: "Suite required" });

    // Verify suite belongs to project
    const [suite] = await pool.query(
      "SELECT id, name FROM tb_test_suites WHERE id = ? AND project_id = ?",
      [suiteId, projectId]
    );
    if (suite.length === 0) return res.status(400).json({ message: "Invalid suite" });

    const taskId = req.body?.task_id ? Number(req.body.task_id) : null;
    const assignedTesterId = req.body?.assigned_tester_id ? Number(req.body.assigned_tester_id) : null;
    const preconditions = req.body?.preconditions ? String(req.body.preconditions) : null;
    const expectedResult = req.body?.expected_result ? String(req.body.expected_result) : null;
    const actualResult = req.body?.actual_result ? String(req.body.actual_result) : null;
    const assigneeIds = Array.isArray(req.body?.assignee_ids) ? req.body.assignee_ids : [];

    // Validate task + tester
    if (taskId) {
      const [t] = await pool.query("SELECT id FROM tb_tasks WHERE id = ? AND project_id = ?", [taskId, projectId]);
      if (t.length === 0) return res.status(400).json({ message: "Invalid task" });
    }
    if (assignedTesterId && !(await isProjectMember(projectId, assignedTesterId))) {
      return res.status(400).json({ message: "Tester must be a project member" });
    }

    // Validate assignee_ids are project members
    for (const uid of assigneeIds) {
      if (!(await isProjectMember(projectId, Number(uid)))) {
        return res.status(400).json({ message: "All assignees must be project members" });
      }
    }

    const [r] = await pool.query(
      `INSERT INTO tb_test_cases
        (project_id, suite_id, task_id, title, priority, status, assigned_tester_id,
         preconditions, expected_result, actual_result, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [projectId, suiteId, taskId, title, priority, status, assignedTesterId,
       preconditions, expectedResult, actualResult, req.user.id]
    );
    const caseId = r.insertId;

    // Insert assignees (default execution_status='pending')
    for (const uid of assigneeIds) {
      await pool.query(
        "INSERT IGNORE INTO tb_test_case_assignees (test_case_id, user_id) VALUES (?, ?)",
        [caseId, Number(uid)]
      );
    }
    // Do NOT recompute auto-status on creation — status stays as provided (default: draft)
    for (const uid of assigneeIds) {
      await pool.query(
        "INSERT IGNORE INTO tb_test_case_assignees (test_case_id, user_id) VALUES (?, ?)",
        [caseId, Number(uid)]
      );
    }

    // Insert steps if provided (array of { description, expected_result })
    const steps = Array.isArray(req.body?.steps) ? req.body.steps : [];
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      const desc = String(s?.description || "").trim();
      if (!desc) continue;
      await pool.query(
        "INSERT INTO tb_test_case_steps (test_case_id, step_number, description, expected_result) VALUES (?, ?, ?, ?)",
        [caseId, i + 1, desc, s?.expected_result ? String(s.expected_result) : null]
      );
    }

    // Read back the full hydrated test case
    const [rows] = await pool.query(
      `SELECT tc.*,
              u.first_name AS u_first, u.last_name AS u_last, u.email AS u_email, u.avatar_url AS u_avatar,
              t.first_name AS t_first, t.last_name AS t_last, t.email AS t_email, t.avatar_url AS t_avatar,
              s.name AS suite_name,
              tk.title AS task_title
         FROM tb_test_cases tc
         JOIN users u ON u.id = tc.created_by
         LEFT JOIN users t ON t.id = tc.assigned_tester_id
         LEFT JOIN tb_test_suites s ON s.id = tc.suite_id
         LEFT JOIN tb_tasks tk ON tk.id = tc.task_id
        WHERE tc.id = ?`,
      [caseId]
    );

    await recordActivity(pool, {
      projectId,
      actorId: req.user.id,
      feature: "test-cases",
      action: "test_case_created",
      targetType: "test_case",
      targetId: caseId,
      targetLabel: title,
      meta: { suite_id: suiteId, priority, status },
    });

    const testCase = await hydrateTestCase(rows[0], { steps: true, comments: true, attachments: true, currentUserId: req.user.id });
    return res.json({ testCase });
  } catch (e) {
    console.error("[test-cases POST]", e);
    return res.status(500).json({ message: "Server error", error: e.message });
  }
});

/* ──────────────────────────────────────────────────────────────────
 * 3. Get single test case (with steps, comments, attachments)
 * ────────────────────────────────────────────────────────────────── */
router.get("/projects/:projectId/test-cases/:caseId", auth, requireProjectMember("projectId"), async (req, res) => {
  try {
    const projectId = Number(req.params.projectId);
    const caseId = Number(req.params.caseId);
    if (!projectId || !caseId) return res.status(400).json({ message: "Invalid request" });

    const [rows] = await pool.query(
      `SELECT tc.*,
              u.first_name AS u_first, u.last_name AS u_last, u.email AS u_email, u.avatar_url AS u_avatar,
              t.first_name AS t_first, t.last_name AS t_last, t.email AS t_email, t.avatar_url AS t_avatar,
              s.name AS suite_name,
              tk.title AS task_title,
              (SELECT COUNT(*) FROM tb_test_case_assignees ta WHERE ta.test_case_id = tc.id) AS total_assignees,
              (SELECT SUM(a.execution_status = 'passed') FROM tb_test_case_assignees a WHERE a.test_case_id = tc.id) AS passed_count,
              (SELECT SUM(a.execution_status = 'failed') FROM tb_test_case_assignees a WHERE a.test_case_id = tc.id) AS failed_count,
              (SELECT SUM(a.execution_status = 'pending') FROM tb_test_case_assignees a WHERE a.test_case_id = tc.id) AS pending_count
         FROM tb_test_cases tc
         JOIN users u ON u.id = tc.created_by
         LEFT JOIN users t ON t.id = tc.assigned_tester_id
         LEFT JOIN tb_test_suites s ON s.id = tc.suite_id
         LEFT JOIN tb_tasks tk ON tk.id = tc.task_id
        WHERE tc.id = ? AND tc.project_id = ?`,
      [caseId, projectId]
    );
    if (rows.length === 0) return res.status(404).json({ message: "Test case not found" });
    const testCase = await hydrateTestCase(rows[0], { steps: true, comments: true, attachments: true, currentUserId: req.user.id });
    return res.json({ testCase });
  } catch (e) {
    console.error("[test-cases GET single]", e);
    return res.status(500).json({ message: "Server error", error: e.message });
  }
});

/* ──────────────────────────────────────────────────────────────────
 * 4. Update test case
 * ────────────────────────────────────────────────────────────────── */
router.put("/projects/:projectId/test-cases/:caseId", auth, requireProjectMember("projectId"), async (req, res) => {
  try {
    const projectId = Number(req.params.projectId);
    const caseId = Number(req.params.caseId);
    if (!projectId || !caseId) return res.status(400).json({ message: "Invalid request" });

    const [old] = await pool.query(
      "SELECT * FROM tb_test_cases WHERE id = ? AND project_id = ?",
      [caseId, projectId]
    );
    if (old.length === 0) return res.status(404).json({ message: "Test case not found" });

    const fields = [];
    const params = [];
    const changes = {};
    const push = (col, val, changeKey) => {
      fields.push(`${col} = ?`); params.push(val);
      if (changeKey) changes[changeKey] = val;
    };

    if (typeof req.body?.title === "string") {
      const t = req.body.title.trim();
      if (!t) return res.status(400).json({ message: "Title required" });
      if (t.length > 255) return res.status(400).json({ message: "Title too long" });
      push("title", t, "title");
    }
    if (typeof req.body?.priority === "string" && VALID_PRIORITIES.includes(req.body.priority)) {
      push("priority", req.body.priority, "priority");
    }
    if (typeof req.body?.status === "string" && VALID_STATUSES.includes(req.body.status)) {
      push("status", req.body.status, "status");
    }
    if (req.body?.suite_id !== undefined) {
      const sid = Number(req.body.suite_id);
      const [suite] = await pool.query("SELECT id FROM tb_test_suites WHERE id = ? AND project_id = ?", [sid, projectId]);
      if (suite.length === 0) return res.status(400).json({ message: "Invalid suite" });
      push("suite_id", sid, "suite_id");
    }
    if (req.body?.task_id !== undefined) {
      const tid = req.body.task_id ? Number(req.body.task_id) : null;
      if (tid) {
        const [t] = await pool.query("SELECT id FROM tb_tasks WHERE id = ? AND project_id = ?", [tid, projectId]);
        if (t.length === 0) return res.status(400).json({ message: "Invalid task" });
      }
      push("task_id", tid, "task_id");
    }
    if (req.body?.assigned_tester_id !== undefined) {
      const aid = req.body.assigned_tester_id ? Number(req.body.assigned_tester_id) : null;
      if (aid && !(await isProjectMember(projectId, aid))) {
        return res.status(400).json({ message: "Tester must be a project member" });
      }
      push("assigned_tester_id", aid, "assigned_tester_id");
    }
    if (req.body?.preconditions !== undefined) {
      push("preconditions", req.body.preconditions ? String(req.body.preconditions) : null, "preconditions");
    }
    if (req.body?.expected_result !== undefined) {
      push("expected_result", req.body.expected_result ? String(req.body.expected_result) : null, "expected_result");
    }
    if (req.body?.actual_result !== undefined) {
      push("actual_result", req.body.actual_result ? String(req.body.actual_result) : null, "actual_result");
    }

    // Handle assignee_ids array update
    if (Array.isArray(req.body?.assignee_ids)) {
      // Validate all assignees are project members
      for (const uid of req.body.assignee_ids) {
        if (!(await isProjectMember(projectId, Number(uid)))) {
          return res.status(400).json({ message: "All assignees must be project members" });
        }
      }
      // Replace all assignees
      await pool.query("DELETE FROM tb_test_case_assignees WHERE test_case_id = ?", [caseId]);
      for (const uid of req.body.assignee_ids) {
        await pool.query(
          "INSERT IGNORE INTO tb_test_case_assignees (test_case_id, user_id) VALUES (?, ?)",
          [caseId, Number(uid)]
        );
      }
      changes.assignees = true;
      // Note: do NOT recompute auto-status when assignees change.
      // Adding/removing assignees must NOT automatically change the status
      // (e.g. from Draft to Ready). User must explicitly change status.
    }

    if (fields.length === 0 && !Array.isArray(req.body?.assignee_ids)) {
      return res.status(400).json({ message: "Nothing to update" });
    }

    if (fields.length > 0) {
      params.push(caseId);
      await pool.query(`UPDATE tb_test_cases SET ${fields.join(", ")} WHERE id = ?`, params);
    }

    // If steps were provided, replace the entire list
    if (Array.isArray(req.body?.steps)) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await conn.query("DELETE FROM tb_test_case_steps WHERE test_case_id = ?", [caseId]);
        for (let i = 0; i < req.body.steps.length; i++) {
          const s = req.body.steps[i];
          const desc = String(s?.description || "").trim();
          if (!desc) continue;
          await conn.query(
            "INSERT INTO tb_test_case_steps (test_case_id, step_number, description, expected_result) VALUES (?, ?, ?, ?)",
            [caseId, i + 1, desc, s?.expected_result ? String(s.expected_result) : null]
          );
        }
        await conn.commit();
      } catch (e) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }
    }

    const [rows] = await pool.query(
      `SELECT tc.*,
              u.first_name AS u_first, u.last_name AS u_last, u.email AS u_email, u.avatar_url AS u_avatar,
              t.first_name AS t_first, t.last_name AS t_last, t.email AS t_email, t.avatar_url AS t_avatar,
              s.name AS suite_name,
              tk.title AS task_title,
              (SELECT COUNT(*) FROM tb_test_case_assignees ta WHERE ta.test_case_id = tc.id) AS total_assignees,
              (SELECT SUM(a.execution_status = 'passed') FROM tb_test_case_assignees a WHERE a.test_case_id = tc.id) AS passed_count,
              (SELECT SUM(a.execution_status = 'failed') FROM tb_test_case_assignees a WHERE a.test_case_id = tc.id) AS failed_count,
              (SELECT SUM(a.execution_status = 'pending') FROM tb_test_case_assignees a WHERE a.test_case_id = tc.id) AS pending_count
         FROM tb_test_cases tc
         JOIN users u ON u.id = tc.created_by
         LEFT JOIN users t ON t.id = tc.assigned_tester_id
         LEFT JOIN tb_test_suites s ON s.id = tc.suite_id
         LEFT JOIN tb_tasks tk ON tk.id = tc.task_id
        WHERE tc.id = ?`,
      [caseId]
    );
    const testCase = await hydrateTestCase(rows[0], { steps: true, comments: true, attachments: true, currentUserId: req.user.id });

    if (Object.keys(changes).length) {
      await recordActivity(pool, {
        projectId,
        actorId: req.user.id,
        feature: "test-cases",
        action: "test_case_updated",
        targetType: "test_case",
        targetId: caseId,
        targetLabel: testCase.title,
        meta: { changed: Object.keys(changes) },
      });
    }

    return res.json({ testCase });
  } catch (e) {
    console.error("[test-cases PUT]", e);
    return res.status(500).json({ message: "Server error", error: e.message });
  }
});

/* ──────────────────────────────────────────────────────────────────
 * 4b. Inline status update (PATCH)
 * ────────────────────────────────────────────────────────────────── */
router.patch("/projects/:projectId/test-cases/:caseId/status", auth, requireProjectMember("projectId"), async (req, res) => {
  try {
    const projectId = Number(req.params.projectId);
    const caseId = Number(req.params.caseId);
    if (!projectId || !caseId) return res.status(400).json({ message: "Invalid request" });

    const status = String(req.body?.status || "");
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const [old] = await pool.query(
      "SELECT title FROM tb_test_cases WHERE id = ? AND project_id = ?",
      [caseId, projectId]
    );
    if (old.length === 0) return res.status(404).json({ message: "Test case not found" });

    // Manual status change — clear computed_status so auto doesn't override
    await pool.query("UPDATE tb_test_cases SET status = ?, computed_status = NULL, updated_at = NOW() WHERE id = ?", [status, caseId]);

    await recordActivity(pool, {
      projectId,
      actorId: req.user.id,
      feature: "test-cases",
      action: "test_case_status_changed",
      targetType: "test_case",
      targetId: caseId,
      targetLabel: old[0].title,
      meta: { status },
    });

    return res.json({ ok: true, status });
  } catch (e) {
    console.error("[test-cases PATCH status]", e);
    return res.status(500).json({ message: "Server error", error: e.message });
  }
});

/* ──────────────────────────────────────────────────────────────────
 * 4c. Inline priority update (PATCH)
 * ────────────────────────────────────────────────────────────────── */
router.patch("/projects/:projectId/test-cases/:caseId/priority", auth, requireProjectMember("projectId"), async (req, res) => {
  try {
    const projectId = Number(req.params.projectId);
    const caseId = Number(req.params.caseId);
    if (!projectId || !caseId) return res.status(400).json({ message: "Invalid request" });

    const priority = String(req.body?.priority || "");
    if (!VALID_PRIORITIES.includes(priority)) {
      return res.status(400).json({ message: "Invalid priority" });
    }

    const [old] = await pool.query(
      "SELECT title FROM tb_test_cases WHERE id = ? AND project_id = ?",
      [caseId, projectId]
    );
    if (old.length === 0) return res.status(404).json({ message: "Test case not found" });

    await pool.query("UPDATE tb_test_cases SET priority = ?, updated_at = NOW() WHERE id = ?", [priority, caseId]);

    await recordActivity(pool, {
      projectId,
      actorId: req.user.id,
      feature: "test-cases",
      action: "test_case_priority_changed",
      targetType: "test_case",
      targetId: caseId,
      targetLabel: old[0].title,
      meta: { priority },
    });

    return res.json({ ok: true, priority });
  } catch (e) {
    console.error("[test-cases PATCH priority]", e);
    return res.status(500).json({ message: "Server error", error: e.message });
  }
});

/* ──────────────────────────────────────────────────────────────────
 * 5. Delete test case
 * ────────────────────────────────────────────────────────────────── */
router.delete("/projects/:projectId/test-cases/:caseId", auth, requireProjectMember("projectId"), async (req, res) => {
  try {
    const projectId = Number(req.params.projectId);
    const caseId = Number(req.params.caseId);
    if (!projectId || !caseId) return res.status(400).json({ message: "Invalid request" });
    const [existing] = await pool.query(
      "SELECT title FROM tb_test_cases WHERE id = ? AND project_id = ?",
      [caseId, projectId]
    );
    if (existing.length === 0) return res.status(404).json({ message: "Test case not found" });
    await pool.query("DELETE FROM tb_test_cases WHERE id = ?", [caseId]);
    await recordActivity(pool, {
      projectId,
      actorId: req.user.id,
      feature: "test-cases",
      action: "test_case_deleted",
      targetType: "test_case",
      targetId: caseId,
      targetLabel: existing[0].title,
    });
    return res.json({ ok: true });
  } catch (e) {
    console.error("[test-cases DELETE]", e);
    return res.status(500).json({ message: "Server error", error: e.message });
  }
});

/* ──────────────────────────────────────────────────────────────────
 * 6. Steps — add / update / delete
 * ────────────────────────────────────────────────────────────────── */
router.post("/projects/:projectId/test-cases/:caseId/steps", auth, requireCaseProjectMember, async (req, res) => {
  try {
    const caseId = Number(req.params.caseId);
    const description = String(req.body?.description || "").trim();
    if (!description) return res.status(400).json({ message: "Description required" });
    // Append at end: step_number = max + 1
    const [last] = await pool.query(
      "SELECT MAX(step_number) AS mx FROM tb_test_case_steps WHERE test_case_id = ?",
      [caseId]
    );
    const stepNumber = Number(last[0].mx || 0) + 1;
    const [r] = await pool.query(
      "INSERT INTO tb_test_case_steps (test_case_id, step_number, description, expected_result) VALUES (?, ?, ?, ?)",
      [caseId, stepNumber, description, req.body?.expected_result ? String(req.body.expected_result) : null]
    );
    // Touch the case so updated_at refreshes
    await pool.query("UPDATE tb_test_cases SET updated_at = NOW() WHERE id = ?", [caseId]);
    const [rows] = await pool.query(
      "SELECT id, test_case_id, step_number, description, expected_result FROM tb_test_case_steps WHERE id = ?",
      [r.insertId]
    );
    return res.json({ step: rows[0] });
  } catch (e) {
    console.error("[test-case-steps POST]", e);
    return res.status(500).json({ message: "Server error", error: e.message });
  }
});

router.put("/projects/:projectId/test-cases/:caseId/steps/:stepId", auth, requireCaseProjectMember, async (req, res) => {
  try {
    const caseId = Number(req.params.caseId);
    const stepId = Number(req.params.stepId);
    const [check] = await pool.query(
      "SELECT id FROM tb_test_case_steps WHERE id = ? AND test_case_id = ?",
      [stepId, caseId]
    );
    if (check.length === 0) return res.status(404).json({ message: "Step not found" });

    const fields = [];
    const params = [];
    if (typeof req.body?.description === "string") {
      const v = req.body.description.trim();
      if (!v) return res.status(400).json({ message: "Description required" });
      fields.push("description = ?"); params.push(v);
    }
    if (req.body?.expected_result !== undefined) {
      fields.push("expected_result = ?"); params.push(req.body.expected_result ? String(req.body.expected_result) : null);
    }
    if (Number.isFinite(Number(req.body?.step_number))) {
      fields.push("step_number = ?"); params.push(Number(req.body.step_number));
    }
    if (!fields.length) return res.status(400).json({ message: "Nothing to update" });
    params.push(stepId);
    await pool.query(`UPDATE tb_test_case_steps SET ${fields.join(", ")} WHERE id = ?`, params);
    await pool.query("UPDATE tb_test_cases SET updated_at = NOW() WHERE id = ?", [caseId]);
    const [rows] = await pool.query(
      "SELECT id, test_case_id, step_number, description, expected_result FROM tb_test_case_steps WHERE id = ?",
      [stepId]
    );
    return res.json({ step: rows[0] });
  } catch (e) {
    console.error("[test-case-steps PUT]", e);
    return res.status(500).json({ message: "Server error", error: e.message });
  }
});

router.delete("/projects/:projectId/test-cases/:caseId/steps/:stepId", auth, requireCaseProjectMember, async (req, res) => {
  try {
    const caseId = Number(req.params.caseId);
    const stepId = Number(req.params.stepId);
    const [check] = await pool.query(
      "SELECT id FROM tb_test_case_steps WHERE id = ? AND test_case_id = ?",
      [stepId, caseId]
    );
    if (check.length === 0) return res.status(404).json({ message: "Step not found" });
    await pool.query("DELETE FROM tb_test_case_steps WHERE id = ?", [stepId]);
    // Renumber remaining steps
    const [remaining] = await pool.query(
      "SELECT id FROM tb_test_case_steps WHERE test_case_id = ? ORDER BY step_number ASC",
      [caseId]
    );
    for (let i = 0; i < remaining.length; i++) {
      await pool.query(
        "UPDATE tb_test_case_steps SET step_number = ? WHERE id = ?",
        [i + 1, remaining[i].id]
      );
    }
    await pool.query("UPDATE tb_test_cases SET updated_at = NOW() WHERE id = ?", [caseId]);
    return res.json({ ok: true });
  } catch (e) {
    console.error("[test-case-steps DELETE]", e);
    return res.status(500).json({ message: "Server error", error: e.message });
  }
});

/* ──────────────────────────────────────────────────────────────────
 * 7. Comments
 * ────────────────────────────────────────────────────────────────── */
router.get("/projects/:projectId/test-cases/:caseId/comments", auth, requireCaseProjectMember, async (req, res) => {
  try {
    const caseId = Number(req.params.caseId);
    const [rows] = await pool.query(
      `SELECT c.*, u.first_name, u.last_name, u.email, u.avatar_url
         FROM tb_test_case_comments c JOIN users u ON u.id = c.author_id
        WHERE c.test_case_id = ? ORDER BY c.created_at ASC`,
      [caseId]
    );
    const comments = await hydrateTestCaseCommentReactions(rows, req.user.id);
    return res.json({ comments });
  } catch (e) {
    console.error("[test-case-comments GET]", e);
    return res.status(500).json({ message: "Server error", error: e.message });
  }
});

router.post("/projects/:projectId/test-cases/:caseId/comments", auth, requireCaseProjectMember, async (req, res) => {
  try {
    const caseId = Number(req.params.caseId);
    const projectId = req._caseProjectId;
    const body = String(req.body?.body || "").trim();
    if (!body) return res.status(400).json({ message: "Body required" });
    const [r] = await pool.query(
      "INSERT INTO tb_test_case_comments (test_case_id, author_id, body) VALUES (?, ?, ?)",
      [caseId, req.user.id, body]
    );
    const commentId = r.insertId;

    // Process @mentions — store records and send in-app notifications.
    await processAndNotifyMentions({
      projectId,
      sourceType: SOURCE_TYPES.TESTCASE_COMMENT,
      sourceId: commentId,
      content: body,
      mentionedByUserId: req.user.id,
      lang: req.lang,
      link: `/projects/${projectId}/test-cases?case=${caseId}`,
    });

    await pool.query("UPDATE tb_test_cases SET updated_at = NOW() WHERE id = ?", [caseId]);
    const [rows] = await pool.query(
      `SELECT c.*, u.first_name, u.last_name, u.email, u.avatar_url
         FROM tb_test_case_comments c JOIN users u ON u.id = c.author_id WHERE c.id = ?`,
      [commentId]
    );
    return res.json({
      comment: {
        id: rows[0].id,
        test_case_id: rows[0].test_case_id,
        body: rows[0].body,
        created_at: rows[0].created_at,
        updated_at: rows[0].updated_at,
        author: fmtUser(rows[0]),
        reactions: [],
      },
    });
  } catch (e) {
    console.error("[test-case-comments POST]", e);
    return res.status(500).json({ message: "Server error", error: e.message });
  }
});

router.put("/projects/:projectId/test-cases/:caseId/comments/:commentId", auth, requireCaseProjectMember, async (req, res) => {
  try {
    const caseId = Number(req.params.caseId);
    const commentId = Number(req.params.commentId);
    const body = String(req.body?.body || "").trim();
    if (!body) return res.status(400).json({ message: "Body required" });
    const [c] = await pool.query(
      "SELECT author_id FROM tb_test_case_comments WHERE id = ? AND test_case_id = ?",
      [commentId, caseId]
    );
    if (c.length === 0) return res.status(404).json({ message: "Comment not found" });
    if (c[0].author_id !== req.user.id) {
      // Project owner can also edit
      const [own] = await pool.query(
        "SELECT manager_id FROM projects WHERE id = ?",
        [req._caseProjectId]
      );
      if (!own.length || own[0].manager_id !== req.user.id) {
        return res.status(403).json({ message: "Not allowed" });
      }
    }
    await pool.query("UPDATE tb_test_case_comments SET body = ? WHERE id = ?", [body, commentId]);
    await pool.query("UPDATE tb_test_cases SET updated_at = NOW() WHERE id = ?", [caseId]);
    const [rows] = await pool.query(
      `SELECT c.*, u.first_name, u.last_name, u.email, u.avatar_url
         FROM tb_test_case_comments c JOIN users u ON u.id = c.author_id WHERE c.id = ?`,
      [commentId]
    );
    return res.json({
      comment: {
        id: rows[0].id,
        test_case_id: rows[0].test_case_id,
        body: rows[0].body,
        created_at: rows[0].created_at,
        updated_at: rows[0].updated_at,
        author: fmtUser(rows[0]),
      },
    });
  } catch (e) {
    console.error("[test-case-comments PUT]", e);
    return res.status(500).json({ message: "Server error", error: e.message });
  }
});

router.delete("/projects/:projectId/test-cases/:caseId/comments/:commentId", auth, requireCaseProjectMember, async (req, res) => {
  try {
    const caseId = Number(req.params.caseId);
    const commentId = Number(req.params.commentId);
    const [c] = await pool.query(
      "SELECT author_id FROM tb_test_case_comments WHERE id = ? AND test_case_id = ?",
      [commentId, caseId]
    );
    if (c.length === 0) return res.status(404).json({ message: "Comment not found" });
    if (c[0].author_id !== req.user.id) {
      const [own] = await pool.query(
        "SELECT manager_id FROM projects WHERE id = ?",
        [req._caseProjectId]
      );
      if (!own.length || own[0].manager_id !== req.user.id) {
        return res.status(403).json({ message: "Not allowed" });
      }
    }
    await pool.query("DELETE FROM tb_test_case_comments WHERE id = ?", [commentId]);
    await pool.query("UPDATE tb_test_cases SET updated_at = NOW() WHERE id = ?", [caseId]);
    return res.json({ ok: true });
  } catch (e) {
    console.error("[test-case-comments DELETE]", e);
    return res.status(500).json({ message: "Server error", error: e.message });
  }
});

/* ──────────────────────────────────────────────────────────────────
 * 8. Comment Reactions
 * ────────────────────────────────────────────────────────────────── */
// POST /api/projects/:projectId/test-cases/:caseId/comments/:commentId/reactions
// Body: { emoji, old_emoji? }
// Replace semantics: one emoji per user per comment.
router.post("/projects/:projectId/test-cases/:caseId/comments/:commentId/reactions", auth, requireCaseProjectMember, async (req, res) => {
  try {
    const caseId = Number(req.params.caseId);
    const commentId = Number(req.params.commentId);
    const { emoji, old_emoji } = req.body || {};
    if (!emoji || typeof emoji !== "string" || emoji.length > 16) {
      return res.status(400).json({ error: "Invalid emoji" });
    }

    // Verify comment belongs to this test case
    const [c] = await pool.query(
      "SELECT id FROM tb_test_case_comments WHERE id = ? AND test_case_id = ?",
      [commentId, caseId]
    );
    if (c.length === 0) return res.status(404).json({ error: "Comment not found" });

    // If old_emoji provided, delete it first (replace flow).
    if (old_emoji && old_emoji !== emoji) {
      await pool.query(
        "DELETE FROM tb_test_case_comment_reactions WHERE comment_id = ? AND user_id = ? AND emoji = ?",
        [commentId, req.user.id, old_emoji]
      );
    }

    // Check if user already has this emoji (from another user's same emoji or re-add)
    const [alreadyHas] = await pool.query(
      "SELECT id FROM tb_test_case_comment_reactions WHERE comment_id = ? AND user_id = ? AND emoji = ?",
      [commentId, req.user.id, emoji]
    );

    if (alreadyHas.length > 0) {
      // Toggle off
      await pool.query(
        "DELETE FROM tb_test_case_comment_reactions WHERE id = ?",
        [alreadyHas[0].id]
      );
    } else {
      // Insert new reaction
      await pool.query(
        "INSERT INTO tb_test_case_comment_reactions (comment_id, user_id, emoji) VALUES (?, ?, ?)",
        [commentId, req.user.id, emoji]
      );
    }

    // Return updated reactions
    const [aggregateRows] = await pool.query(
      `SELECT emoji, COUNT(*) AS count, MAX(user_id = ?) AS mine
       FROM tb_test_case_comment_reactions
       WHERE comment_id = ?
       GROUP BY emoji`,
      [req.user.id, commentId]
    );
    const [userRows] = await pool.query(
      `SELECT r.emoji, u.first_name, u.last_name, u.email
       FROM tb_test_case_comment_reactions r
       JOIN users u ON r.user_id = u.id
       WHERE r.comment_id = ?
       ORDER BY r.created_at ASC`,
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
  } catch (e) {
    console.error("[test-case-comment-reactions POST]", e);
    return res.status(500).json({ message: "Server error", error: e.message });
  }
});

/* ──────────────────────────────────────────────────────────────────
 * 8. Update assignee Execution Status
 * Body: { execution_status: 'pending' | 'passed' | 'failed' }
 * PATCH /api/projects/:projectId/test-cases/:caseId/assignees/:userId/status
 * ────────────────────────────────────────────────────────────────── */
router.patch("/projects/:projectId/test-cases/:caseId/assignees/:userId/status", auth, requireCaseProjectMember, async (req, res) => {
  try {
    const caseId = Number(req.params.caseId);
    const userId = Number(req.params.userId);
    const executionStatus = req.body?.execution_status;
    const VALID_EXECUTION_STATUSES = ['pending', 'passed', 'failed'];
    if (!executionStatus || !VALID_EXECUTION_STATUSES.includes(executionStatus)) {
      return res.status(400).json({ error: "execution_status must be 'pending', 'passed', or 'failed'" });
    }

    // Verify assignee belongs to this test case
    const [a] = await pool.query(
      "SELECT id FROM tb_test_case_assignees WHERE test_case_id = ? AND user_id = ?",
      [caseId, userId]
    );
    if (a.length === 0) return res.status(404).json({ error: "Assignee not found" });

    await pool.query(
      "UPDATE tb_test_case_assignees SET execution_status = ? WHERE test_case_id = ? AND user_id = ?",
      [executionStatus, caseId, userId]
    );

    // Clear computed_status so maybeRecomputeStatus can auto-update
    await pool.query("UPDATE tb_test_cases SET computed_status = NULL WHERE id = ?", [caseId]);
    // Recompute auto-status
    await maybeRecomputeStatus(pool, caseId);

    // Return updated assignee list with execution status
    const assignees = await hydrateAssigneesWithStatus(caseId);
    const [tcRows] = await pool.query(
      `SELECT tc.status, tc.computed_status,
              (SELECT COUNT(*) FROM tb_test_case_assignees WHERE test_case_id = tc.id) AS total_assignees,
              (SELECT SUM(a.execution_status = 'passed') FROM tb_test_case_assignees a WHERE a.test_case_id = tc.id) AS passed_count,
              (SELECT SUM(a.execution_status = 'failed') FROM tb_test_case_assignees a WHERE a.test_case_id = tc.id) AS failed_count,
              (SELECT SUM(a.execution_status = 'pending') FROM tb_test_case_assignees a WHERE a.test_case_id = tc.id) AS pending_count
       FROM tb_test_cases tc WHERE tc.id = ?`,
      [caseId]
    );
    const tc = tcRows[0];
    return res.json({
      assignees,
      status: tc.computed_status || tc.status,
      computed_status: tc.computed_status || null,
      passed_count: Number(tc.passed_count || 0),
      failed_count: Number(tc.failed_count || 0),
      pending_count: Number(tc.pending_count || 0),
      total_assignees: Number(tc.total_assignees || 0),
    });
  } catch (e) {
    console.error("[test-case-assignee-patch]", e);
    return res.status(500).json({ message: "Server error", error: e.message });
  }
});

/* ──────────────────────────────────────────────────────────────────
 * 8. Attachments
 * ────────────────────────────────────────────────────────────────── */
router.get("/projects/:projectId/test-cases/:caseId/attachments", auth, requireCaseProjectMember, async (req, res) => {
  try {
    const caseId = Number(req.params.caseId);
    const [rows] = await pool.query(
      `SELECT a.*, u.first_name, u.last_name, u.email
         FROM tb_test_case_attachments a JOIN users u ON u.id = a.uploaded_by
        WHERE a.test_case_id = ? ORDER BY a.created_at ASC`,
      [caseId]
    );
    return res.json({
      attachments: rows.map((a) => ({
        ...a,
        name: path.basename(a.file_url),
      })),
    });
  } catch (e) {
    console.error("[test-case-attachments GET]", e);
    return res.status(500).json({ message: "Server error", error: e.message });
  }
});

router.post(
  "/projects/:projectId/test-cases/:caseId/attachments",
  auth,
  requireCaseProjectMember,
  upload.single("file"),
  async (req, res) => {
    try {
      const caseId = Number(req.params.caseId);
      if (!req.file) return res.status(400).json({ message: "File required" });
      const fileUrl = `/uploads/test-attachments/${req.file.filename}`;
      const [r] = await pool.query(
        "INSERT INTO tb_test_case_attachments (test_case_id, file_url, file_type, file_size, uploaded_by) VALUES (?, ?, ?, ?, ?)",
        [caseId, fileUrl, req.file.mimetype, req.file.size, req.user.id]
      );
      await pool.query("UPDATE tb_test_cases SET updated_at = NOW() WHERE id = ?", [caseId]);
      return res.json({
        attachment: {
          id: r.insertId,
          test_case_id: caseId,
          file_url: fileUrl,
          file_type: req.file.mimetype,
          file_size: req.file.size,
          uploaded_by: req.user.id,
          created_at: new Date(),
          name: req.file.originalname,
        },
      });
    } catch (e) {
      console.error("[test-case-attachments POST]", e);
      return res.status(500).json({ message: "Server error", error: e.message });
    }
  }
);

router.delete("/projects/:projectId/test-cases/:caseId/attachments/:attachmentId", auth, requireCaseProjectMember, async (req, res) => {
  try {
    const caseId = Number(req.params.caseId);
    const attachmentId = Number(req.params.attachmentId);
    const [a] = await pool.query(
      "SELECT file_url, uploaded_by FROM tb_test_case_attachments WHERE id = ? AND test_case_id = ?",
      [attachmentId, caseId]
    );
    if (a.length === 0) return res.status(404).json({ message: "Attachment not found" });
    if (a[0].uploaded_by !== req.user.id) {
      const [own] = await pool.query(
        "SELECT manager_id FROM projects WHERE id = ?",
        [req._caseProjectId]
      );
      if (!own.length || own[0].manager_id !== req.user.id) {
        return res.status(403).json({ message: "Not allowed" });
      }
    }
    await pool.query("DELETE FROM tb_test_case_attachments WHERE id = ?", [attachmentId]);
    // Try to delete file from disk
    try {
      const fp = path.join(UPLOAD_DIR, path.basename(a[0].file_url));
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    } catch (e) { /* ignore */ }
    await pool.query("UPDATE tb_test_cases SET updated_at = NOW() WHERE id = ?", [caseId]);
    return res.json({ ok: true });
  } catch (e) {
    console.error("[test-case-attachments DELETE]", e);
    return res.status(500).json({ message: "Server error", error: e.message });
  }
});

module.exports = router;
