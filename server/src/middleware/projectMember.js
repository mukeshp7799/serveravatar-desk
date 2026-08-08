/**
 * Centralised project-membership middleware.
 *
 * Exports:
 *   isProjectMember(projectId, userId)  — async boolean; checks owner OR project_members row
 *   requireProjectMember(paramName)      — middleware factory; reads projectId from params or query
 *   requireProjectMemberOrOwner(paramName) — same but also allows project owner even if not a member
 *
 * All project-specific API routes should use one of these middlewares instead of
 * duplicating the membership query inline.
 */

const pool = require("../config/database");
const { t } = require("../i18n");
const { revokeToken } = require("./auth");

/**
 * Returns true if `userId` is the owner (manager_id) of the project OR
 * has an active row in project_members.
 */
const isProjectMember = async (projectId, userId) => {
  if (!projectId || !userId) return false;
  try {
    const [p] = await pool.query(
      "SELECT manager_id FROM projects WHERE id = ?",
      [projectId]
    );
    if (p.length === 0) return false;
    if (Number(p[0].manager_id) === Number(userId)) return true;
    const [m] = await pool.query(
      "SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ? LIMIT 1",
      [projectId, userId]
    );
    return m.length > 0;
  } catch {
    return false;
  }
};

/**
 * Reads the project ID from `req.params[paramName]` or `req.query[paramName]`
 * and verifies the authenticated user is a project member.
 *
 * If the user is NOT a member, responds with HTTP 403 and a JSON error body.
 * Also calls revokeToken so the token is denylisted immediately.
 *
 * @param {string} paramName - route / query param that carries the project ID
 */
const requireProjectMember = (paramName = "projectId") => {
  return async (req, res, next) => {
    const userId = req.user?.id;
    // Check params → query → body (body is needed for POST/PUT routes)
    const raw = req.params[paramName] ?? req.query[paramName] ?? req.body?.[paramName];
    const projectId = Number(raw);

    if (!projectId || !userId) {
      return res.status(400).json({ error: t(req.lang, "errors.invalidRequest") });
    }

    const member = await isProjectMember(projectId, userId);
    if (!member) {
      // Attempt to revoke the token so it cannot be reused
      try {
        const authHeader = req.headers.authorization;
        if (authHeader?.startsWith("Bearer ")) {
          const jwt = require("jsonwebtoken");
          const { JWT_SECRET } = require("./auth");
          const token = authHeader.split(" ")[1];
          const decoded = jwt.verify(token, JWT_SECRET);
          await revokeToken(decoded);
        }
      } catch (_) { /* best-effort revocation */ }

      return res.status(403).json({
        error: "You are not authorized to access this project.",
        code: "PROJECT_ACCESS_DENIED"
      });
    }

    next();
  };
};

/**
 * Same as requireProjectMember but also allows the project owner even if
 * they somehow aren't in project_members (edge case: invited as member but
 * also is manager). In practice this is identical to requireProjectMember
 * but kept for semantic clarity at call sites.
 */
const requireProjectMemberOrOwner = (paramName = "projectId") => {
  return requireProjectMember(paramName);
};

module.exports = { isProjectMember, requireProjectMember, requireProjectMemberOrOwner };
