const express = require("express");
const pool = require("../config/database");
const { auth } = require("../middleware/auth");
const { t } = require("../i18n");

const router = express.Router();

// GET /api/email-logs - list recently sent emails (Admin only, via `admin.settings`)
router.get("/", auth, async (req, res, next) => {
  try {
    const perms = req.user.permissions || [];
    if (!perms.includes("admin.settings")) {
      return res.status(403).json({ error: t(req.lang, "errors.permissionDenied") });
    }

    const { type, status, recipient, limit = 50, offset = 0 } = req.query;
    let query = `SELECT id, recipient_email, recipient_name, subject, type, related_id, related_type,
                        triggered_by_user_id, message_id, preview_url, status, error, sent_at
                 FROM email_logs WHERE 1=1`;
    const params = [];
    if (type) { query += " AND type = ?"; params.push(type); }
    if (status) { query += " AND status = ?"; params.push(status); }
    if (recipient) { query += " AND recipient_email LIKE ?"; params.push(`%${recipient}%`); }
    query += " ORDER BY sent_at DESC LIMIT ? OFFSET ?";
    const lim = Math.min(parseInt(limit, 10) || 50, 200);
    const off = parseInt(offset, 10) || 0;
    params.push(lim, off);

    const [rows] = await pool.query(query, params);
    const [countRows] = await pool.query(
      `SELECT COUNT(*) as total FROM email_logs ${type || status || recipient ? "WHERE 1=1" + (type ? " AND type = ?" : "") + (status ? " AND status = ?" : "") + (recipient ? " AND recipient_email LIKE ?" : "") : ""}`,
      type || status || recipient
        ? [
            ...(type ? [type] : []),
            ...(status ? [status] : []),
            ...(recipient ? [`%${recipient}%`] : []),
          ]
        : []
    );

    res.json({
      logs: rows,
      total: countRows[0].total,
      limit: lim,
      offset: off,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/email-logs/:id - fetch the full HTML body for a single email (Admin only)
router.get("/:id", auth, async (req, res, next) => {
  try {
    const perms = req.user.permissions || [];
    if (!perms.includes("admin.settings")) {
      return res.status(403).json({ error: t(req.lang, "errors.permissionDenied") });
    }
    const [rows] = await pool.query("SELECT * FROM email_logs WHERE id = ?", [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: "Email log not found" });
    res.json({ log: rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
