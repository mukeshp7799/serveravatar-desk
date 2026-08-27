/**
 * routes/activityLogs.js
 * ─────────────────────────────────────────────────────────────────────────────
 * GET /api/activity-logs
 *   Lists activity logs, filtered by the caller's RBAC permissions.
 *
 *   view_own  → only the caller's own logs
 *   view_all  → all users' logs, with optional filters:
 *                 user_id, module, action, date_from, date_to, page, limit
 *
 * GET /api/activity-logs/recent
 *   Returns the 5 most-recent activities (own or org-wide, same RBAC rules).
 *   Used by the Dashboard widget.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const express = require('express');
const pool = require('../config/database');
const { auth } = require('../middleware/auth');
const { t } = require('../i18n');

const router = express.Router();

// ─── GET /api/activity-logs ────────────────────────────────────────────────
router.get('/', auth, async (req, res, next) => {
  try {
    const perms    = req.user.permissions || [];
    const userId   = req.user.id;
    const hasViewAll  = perms.includes('activity_logs.view_all');
    const hasViewOwn  = perms.includes('activity_logs.view_own');

    // Reject if caller has neither permission
    if (!hasViewAll && !hasViewOwn) {
      return res.status(403).json({ error: t(req.lang, 'errors.permissionDenied') });
    }

    const {
      filter_user_id,   // Intended for view_all callers; silently ignored for view_own
      user_search,      // Search by user name or email
      module,
      action,
      date_from,
      date_to,
      page   = '1',
      limit  = '20',
      sortBy = 'created_at',
      sortOrder = 'DESC',
    } = req.query;

    const actualPage  = Math.max(1, parseInt(page, 10) || 1);
    const actualLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset      = (actualPage - 1) * actualLimit;

    // Allowed sort columns
    const allowedSorts = ['created_at', 'module', 'action', 'user_id'];
    const safeSort = allowedSorts.includes(sortBy) ? sortBy : 'created_at';
    const safeOrder = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // Build WHERE clause
    let where  = 'WHERE 1=1';
    const params = [];

    // view_all callers may filter by user_id; view_own callers always see only their own
    if (hasViewAll) {
      // User filter: if filter_user_id is passed, use it; otherwise show all
      if (filter_user_id) {
        where += ' AND al.user_id = ?';
        params.push(parseInt(filter_user_id, 10));
      }
      // User search: by name or email
      if (user_search && user_search.trim()) {
        const search = `%${user_search.trim()}%`;
        where += ' AND (u.first_name LIKE ? OR u.last_name LIKE ? OR u.email LIKE ?)';
        params.push(search, search, search);
      }
    } else {
      // view_own only → always scope to the current user
      where += ' AND al.user_id = ?';
      params.push(userId);
    }

    // Module, action, and date filters apply to ALL users (already scoped by user_id above)
    if (module) {
      where += ' AND al.module = ?';
      params.push(module);
    }
    if (action) {
      where += ' AND al.action = ?';
      params.push(action);
    }
    if (date_from) {
      where += ' AND al.created_at >= ?';
      params.push(date_from);
    }
    if (date_to) {
      // Add one day to make the bound inclusive at end of day
      where += ' AND al.created_at < DATE_ADD(?, INTERVAL 1 DAY)';
      params.push(date_to);
    }

    // Count total matching rows (JOIN users for user_search filter)
    const countQuery = `SELECT COUNT(*) AS total FROM activity_logs al JOIN users u ON al.user_id = u.id ${where}`;
    const [[{ total }]] = await pool.query(countQuery, params);

    // Data query
    const dataQuery = `
      SELECT
        al.id,
        al.user_id,
        al.module,
        al.action,
        al.description,
        al.ip_address,
        al.previous_value,
        al.new_value,
        al.created_at,
        u.first_name,
        u.last_name,
        u.email,
        r.name AS role_name
      FROM activity_logs al
      JOIN users u  ON al.user_id = u.id
      JOIN roles r  ON u.role_id = r.id
      ${where}
      ORDER BY al.${safeSort} ${safeOrder}
      LIMIT ? OFFSET ?
    `;

    const [rows] = await pool.query(dataQuery, [...params, actualLimit, offset]);

    // Parse JSON columns that were serialised as strings (MySQL JSON columns come back as strings)
    const data = rows.map(row => ({
      ...row,
      previous_value: row.previous_value ? JSON.parse(row.previous_value) : null,
      new_value:      row.new_value      ? JSON.parse(row.new_value)      : null,
    }));

    res.json({
      data,
      pagination: {
        total,
        page:       actualPage,
        limit:      actualLimit,
        totalPages: Math.ceil(total / actualLimit),
      },
      filters: {
        hasViewAll: Boolean(hasViewAll),
        hasViewOwn: Boolean(hasViewOwn),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/activity-logs/recent ────────────────────────────────────────
router.get('/recent', auth, async (req, res, next) => {
  try {
    const perms    = req.user.permissions || [];
    const userId   = req.user.id;
    const hasViewAll = perms.includes('activity_logs.view_all');
    const hasViewOwn = perms.includes('activity_logs.view_own');

    if (!hasViewAll && !hasViewOwn) {
      return res.status(403).json({ error: t(req.lang, 'errors.permissionDenied') });
    }

    const limit = Math.min(10, parseInt(req.query.limit, 10) || 5);

    let where = '';
    const params = [];

    if (hasViewAll) {
      // nothing to add — org-wide
    } else {
      where = 'WHERE al.user_id = ?';
      params.push(userId);
    }

    const [rows] = await pool.query(
      `SELECT
        al.id,
        al.user_id,
        al.module,
        al.action,
        al.description,
        al.created_at,
        u.first_name,
        u.last_name
      FROM activity_logs al
      JOIN users u ON al.user_id = u.id
      ${where}
      ORDER BY al.created_at DESC
      LIMIT ?`,
      [...params, limit]
    );

    res.json({
      data:       rows,
      hasViewAll: Boolean(hasViewAll),
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/activity-logs/modules (helper — list distinct modules) ───────
router.get('/modules', auth, async (req, res, next) => {
  try {
    const perms = req.user.permissions || [];
    const hasViewAll = perms.includes('activity_logs.view_all');
    const hasViewOwn = perms.includes('activity_logs.view_own');
    if (!hasViewAll && !hasViewOwn) {
      return res.status(403).json({ error: t(req.lang, 'errors.permissionDenied') });
    }
    let query = 'SELECT DISTINCT module FROM activity_logs';
    const params = [];
    if (!hasViewAll) {
      // view_own: only modules from the current user's own logs
      query += ' WHERE user_id = ?';
      params.push(req.user.id);
    }
    query += ' ORDER BY module';
    const [rows] = await pool.query(query, params);
    res.json({ modules: rows.map(r => r.module) });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/activity-logs/actions (helper — list distinct actions) ───────
router.get('/actions', auth, async (req, res, next) => {
  try {
    const perms = req.user.permissions || [];
    const hasViewAll = perms.includes('activity_logs.view_all');
    const hasViewOwn = perms.includes('activity_logs.view_own');
    if (!hasViewAll && !hasViewOwn) {
      return res.status(403).json({ error: t(req.lang, 'errors.permissionDenied') });
    }
    let query = 'SELECT DISTINCT action FROM activity_logs';
    const params = [];
    if (!hasViewAll) {
      // view_own: only actions from the current user's own logs
      query += ' WHERE user_id = ?';
      params.push(req.user.id);
    }
    query += ' ORDER BY action';
    const [rows] = await pool.query(query, params);
    res.json({ actions: rows.map(r => r.action) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
