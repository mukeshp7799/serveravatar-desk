/**
 * Test Suites routes.
 *
 * Mounted at /api — page routes are `/api/projects/:projectId/test-suites`.
 *
 * Lenient membership model (same as task board / message board):
 *   - Anyone authenticated who is a project member (or the project owner)
 *     can READ + WRITE suites.
 *
 * Endpoints (all JSON, all behind `auth`):
 *   GET    /api/projects/:projectId/test-suites           — list suites with test case counts
 *   POST   /api/projects/:projectId/test-suites           — create suite
 *   PUT    /api/projects/:projectId/test-suites/:suiteId  — rename suite
 *   DELETE /api/projects/:projectId/test-suites/:suiteId  — delete suite (cascades to test cases)
 */

const express = require("express");
const pool = require("../config/database");
const { auth } = require("../middleware/auth");
const { isProjectMember: sharedIsProjectMember, requireProjectMember } = require("../middleware/projectMember");
const { recordActivity } = require("../utils/activity");

const router = express.Router();

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

const fmtUser = (u) => ({
  id: u.id,
  name: [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || u.email,
  initials: ((u.first_name?.[0] || u.email?.[0] || "?") + "" + (u.last_name?.[0] || "")).toUpperCase(),
  email: u.email,
  avatar: u.avatar_url || null,
});

/* ──────────────────────────────────────────────────────────────────
 * 1. List suites (with test case counts)
 * ────────────────────────────────────────────────────────────────── */
router.get("/projects/:projectId/test-suites", auth, requireProjectMember("projectId"), async (req, res) => {
  try {
    const projectId = Number(req.params.projectId);
    if (!projectId) return res.status(400).json({ message: "Invalid request" });

    const [rows] = await pool.query(
      `SELECT s.*, u.first_name, u.last_name, u.email, u.avatar_url,
              (SELECT COUNT(*) FROM tb_test_cases c WHERE c.suite_id = s.id) AS test_case_count
         FROM tb_test_suites s
         JOIN users u ON u.id = s.created_by
        WHERE s.project_id = ?
        ORDER BY s.created_at ASC`,
      [projectId]
    );

    const suites = rows.map((s) => ({
      id: s.id,
      project_id: s.project_id,
      name: s.name,
      description: s.description,
      created_by: s.created_by,
      created_at: s.created_at,
      updated_at: s.updated_at,
      test_case_count: Number(s.test_case_count || 0),
      creator: fmtUser({
        id: s.created_by,
        first_name: s.first_name,
        last_name: s.last_name,
        email: s.email,
        avatar_url: s.avatar_url,
      }),
    }));

    return res.json({ suites });
  } catch (e) {
    console.error("[test-suites GET]", e);
    return res.status(500).json({ message: "Server error", error: e.message });
  }
});

/* ──────────────────────────────────────────────────────────────────
 * 2. Create suite
 * ────────────────────────────────────────────────────────────────── */
router.post("/projects/:projectId/test-suites", auth, requireMemberOrOwner, async (req, res) => {
  try {
    const projectId = Number(req.params.projectId);
    const name = String(req.body?.name || "").trim();
    const description = req.body?.description ? String(req.body.description).trim() : null;
    if (!name) return res.status(400).json({ message: "Name required" });
    if (name.length > 255) return res.status(400).json({ message: "Name too long (max 255 chars)" });

    const [r] = await pool.query(
      "INSERT INTO tb_test_suites (project_id, name, description, created_by) VALUES (?, ?, ?, ?)",
      [projectId, name, description || null, req.user.id]
    );

    const [rows] = await pool.query(
      `SELECT s.*, u.first_name, u.last_name, u.email, u.avatar_url
         FROM tb_test_suites s
         JOIN users u ON u.id = s.created_by
        WHERE s.id = ?`,
      [r.insertId]
    );

    await recordActivity(pool, {
      projectId,
      actorId: req.user.id,
      feature: "test-cases",
      action: "created",
      targetType: "test_suite",
      targetId: r.insertId,
      targetLabel: name,
    });

    const suite = rows[0];
    return res.json({
      suite: {
        id: suite.id,
        project_id: suite.project_id,
        name: suite.name,
        description: suite.description,
        created_by: suite.created_by,
        created_at: suite.created_at,
        updated_at: suite.updated_at,
        test_case_count: 0,
        creator: fmtUser({
          id: suite.created_by,
          first_name: suite.first_name,
          last_name: suite.last_name,
          email: suite.email,
          avatar_url: suite.avatar_url,
        }),
      },
    });
  } catch (e) {
    console.error("[test-suites POST]", e);
    return res.status(500).json({ message: "Server error", error: e.message });
  }
});

/* ──────────────────────────────────────────────────────────────────
 * 3. Rename / update suite
 * ────────────────────────────────────────────────────────────────── */
router.put("/projects/:projectId/test-suites/:suiteId", auth, requireProjectMember("projectId"), async (req, res) => {
  try {
    const projectId = Number(req.params.projectId);
    const suiteId = Number(req.params.suiteId);
    if (!projectId || !suiteId) return res.status(400).json({ message: "Invalid request" });

    const [existing] = await pool.query(
      "SELECT * FROM tb_test_suites WHERE id = ? AND project_id = ?",
      [suiteId, projectId]
    );
    if (existing.length === 0) return res.status(404).json({ message: "Suite not found" });

    const fields = [];
    const params = [];
    if (typeof req.body?.name === "string") {
      const v = req.body.name.trim();
      if (!v) return res.status(400).json({ message: "Name required" });
      if (v.length > 255) return res.status(400).json({ message: "Name too long" });
      fields.push("name = ?"); params.push(v);
    }
    if (typeof req.body?.description === "string" || req.body?.description === null) {
      fields.push("description = ?"); params.push(req.body.description ? req.body.description.trim() : null);
    }
    if (fields.length === 0) return res.status(400).json({ message: "Nothing to update" });
    params.push(suiteId);
    await pool.query(`UPDATE tb_test_suites SET ${fields.join(", ")} WHERE id = ?`, params);

    const [rows] = await pool.query(
      `SELECT s.*, u.first_name, u.last_name, u.email, u.avatar_url,
              (SELECT COUNT(*) FROM tb_test_cases c WHERE c.suite_id = s.id) AS test_case_count
         FROM tb_test_suites s
         JOIN users u ON u.id = s.created_by
        WHERE s.id = ?`,
      [suiteId]
    );
    const suite = rows[0];
    await recordActivity(pool, {
      projectId,
      actorId: req.user.id,
      feature: "test-cases",
      action: "updated",
      targetType: "test_suite",
      targetId: suiteId,
      targetLabel: suite.name,
    });
    return res.json({
      suite: {
        id: suite.id,
        project_id: suite.project_id,
        name: suite.name,
        description: suite.description,
        created_by: suite.created_by,
        created_at: suite.created_at,
        updated_at: suite.updated_at,
        test_case_count: Number(suite.test_case_count || 0),
        creator: fmtUser({
          id: suite.created_by,
          first_name: suite.first_name,
          last_name: suite.last_name,
          email: suite.email,
          avatar_url: suite.avatar_url,
        }),
      },
    });
  } catch (e) {
    console.error("[test-suites PUT]", e);
    return res.status(500).json({ message: "Server error", error: e.message });
  }
});

/* ──────────────────────────────────────────────────────────────────
 * 4. Delete suite (cascades to test cases, comments, attachments, steps)
 * ────────────────────────────────────────────────────────────────── */
router.delete("/projects/:projectId/test-suites/:suiteId", auth, requireProjectMember("projectId"), async (req, res) => {
  try {
    const projectId = Number(req.params.projectId);
    const suiteId = Number(req.params.suiteId);
    if (!projectId || !suiteId) return res.status(400).json({ message: "Invalid request" });
    const [existing] = await pool.query(
      "SELECT name FROM tb_test_suites WHERE id = ? AND project_id = ?",
      [suiteId, projectId]
    );
    if (existing.length === 0) return res.status(404).json({ message: "Suite not found" });
    await pool.query("DELETE FROM tb_test_suites WHERE id = ?", [suiteId]);
    await recordActivity(pool, {
      projectId,
      actorId: req.user.id,
      feature: "test-cases",
      action: "deleted",
      targetType: "test_suite",
      targetId: suiteId,
      targetLabel: existing[0].name,
    });
    return res.json({ ok: true });
  } catch (e) {
    console.error("[test-suites DELETE]", e);
    return res.status(500).json({ message: "Server error", error: e.message });
  }
});

module.exports = router;