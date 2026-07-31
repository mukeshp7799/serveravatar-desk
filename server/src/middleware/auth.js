const jwt = require("jsonwebtoken");
const pool = require("../config/database");
const { t } = require("../i18n");

const JWT_SECRET = process.env.JWT_SECRET || "Serveravatar_jwt_secret_key_2026";

const auth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: t(req.lang, "errors.noTokenProvided") });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    // ── Denylist check: reject revoked tokens ──────────────────────────────
    if (decoded.jti) {
      const [revoked] = await pool.query(
        "SELECT 1 FROM jwt_denylist WHERE jti = ? LIMIT 1",
        [decoded.jti]
      );
      if (revoked.length > 0) {
        return res.status(401).json({ error: t(req.lang, "errors.tokenRevoked") });
      }
    }

    const [users] = await pool.query(
      "SELECT u.id, u.email, u.first_name, u.last_name, u.role_id, u.status, r.name as role_name FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = ?",
      [decoded.userId],
    );

    if (users.length === 0 || users[0].status !== "active") {
      return res.status(401).json({ error: t(req.lang, "errors.invalidOrInactiveUser") });
    }

    req.user = users[0];

    // Check permission if specified
    if (req.permission) {
      const [perms] = await pool.query(
        "SELECT 1 FROM role_permissions rp JOIN permissions p ON rp.permission_id = p.id WHERE rp.role_id = ? AND p.name = ?",
        [req.user.role_id, req.permission],
      );
      if (perms.length === 0) {
        return res.status(403).json({ error: t(req.lang, "errors.permissionDenied") });
      }
    }

    next();
  } catch (err) {
    if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
      return res.status(401).json({ error: t(req.lang, "errors.invalidToken") });
    }
    next(err);
  }
};

// Middleware factory for specific permissions
const requirePermission = (permissionName) => {
  return async (req, res, next) => {
    try {
      const [perms] = await pool.query(
        "SELECT 1 FROM role_permissions rp JOIN permissions p ON rp.permission_id = p.id WHERE rp.role_id = ? AND p.name = ?",
        [req.user.role_id, permissionName],
      );
      if (perms.length === 0) {
        return res
          .status(403)
          .json({ error: t(req.lang, "errors.permissionDeniedSpecific", { permission: permissionName }) });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
};

// Revoke a JWT by inserting its JTI into the denylist.
// Called by the logout route handler.
const revokeToken = async (decoded) => {
  if (!decoded.jti || !decoded.exp) return;
  const expiresAt = new Date(decoded.exp * 1000).toISOString().slice(0, 19).replace("T", " ");
  try {
    await pool.query(
      "INSERT IGNORE INTO jwt_denylist (jti, user_id, expires_at) VALUES (?, ?, ?)",
      [decoded.jti, decoded.userId, expiresAt]
    );
  } catch (err) {
    console.error("[auth] revokeToken error:", err.message);
  }
};

// Clean up expired entries from the denylist (call occasionally, e.g. once a day)
const cleanupDenylist = async () => {
  try {
    const [result] = await pool.query("DELETE FROM jwt_denylist WHERE expires_at < NOW()");
    if (result.affectedRows > 0) console.log(`[auth] Cleaned ${result.affectedRows} expired denylist entries`);
  } catch (err) {
    console.error("[auth] cleanupDenylist error:", err.message);
  }
};

// Schedule cleanup on load
setInterval(cleanupDenylist, 24 * 60 * 60 * 1000);

module.exports = { auth, requirePermission, JWT_SECRET, revokeToken };
