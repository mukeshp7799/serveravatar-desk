const express = require('express');
const pool = require('../config/database');
const { auth } = require('../middleware/auth');
const { t } = require('../i18n');

const router = express.Router();

const SITE_URL = process.env.SITE_URL || 'https://serveravatar-hub.95.217.8.52.nip.io';

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

/** Calculate calendar days between two dates (inclusive) */
function calcDays(startDate, endDate) {
  const s = new Date(startDate);
  const e = new Date(endDate);
  return Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1;
}

/**
 * Get the used days (approved leave) for a specific user + leave_type.
 * Returns a map: `${userId}_${leaveTypeId}` → days_used
 */
async function getUsedDaysMap(userId, leaveTypeId) {
  let query = `
    SELECT user_id, leave_type_id,
           SUM(GREATEST(0, DATEDIFF(end_date, start_date)) + 1) as days_used
    FROM leave_requests
    WHERE status = 'approved'
  `;
  const params = [];
  if (userId) { query += ' AND user_id = ?'; params.push(userId); }
  if (leaveTypeId) { query += ' AND leave_type_id = ?'; params.push(leaveTypeId); }
  query += ' GROUP BY user_id, leave_type_id';

  const [rows] = await pool.query(query, params);
  const map = {};
  for (const row of rows) {
    map[`${row.user_id}_${row.leave_type_id}`] = parseFloat(row.days_used) || 0;
  }
  return map;
}

/**
 * Get the pending days for a specific user + leave_type.
 * Returns a map: `${userId}_${leaveTypeId}` → days_pending
 */
async function getPendingDaysMap(userId, leaveTypeId) {
  let query = `
    SELECT user_id, leave_type_id,
           SUM(GREATEST(0, DATEDIFF(end_date, start_date)) + 1) as days_pending
    FROM leave_requests
    WHERE status = 'pending'
  `;
  const params = [];
  if (userId) { query += ' AND user_id = ?'; params.push(userId); }
  if (leaveTypeId) { query += ' AND leave_type_id = ?'; params.push(leaveTypeId); }
  query += ' GROUP BY user_id, leave_type_id';

  const [rows] = await pool.query(query, params);
  const map = {};
  for (const row of rows) {
    map[`${row.user_id}_${row.leave_type_id}`] = parseFloat(row.days_pending) || 0;
  }
  return map;
}

/**
 * Get all allocations for users, enriched with used/pending/available.
 * Pass userId to scope to one user.
 */
async function getEnrichedAllocations(userId) {
  const [allocs] = await pool.query(`
    SELECT la.id, la.user_id, la.leave_type_id, la.allocated_days,
           la.description as remark, la.created_at, la.updated_at,
           lt.name as leave_type_name, lt.code as leave_type_code,
           lt.is_paid, lt.max_allowed,
           u.first_name, u.last_name, u.email,
           d.name as department_name
    FROM leave_allocations la
    JOIN leave_types lt ON la.leave_type_id = lt.id
    JOIN users u ON la.user_id = u.id
    LEFT JOIN departments d ON u.department_id = d.id
    ${userId ? 'WHERE la.user_id = ?' : ''}
    ORDER BY u.first_name, lt.name
  `, userId ? [userId] : []);

  const usedMap = await getUsedDaysMap(userId, null);
  const pendingMap = await getPendingDaysMap(userId, null);

  return allocs.map(a => {
    const key = `${a.user_id}_${a.leave_type_id}`;
    const used = usedMap[key] || 0;
    const pending = pendingMap[key] || 0;
    const available = Math.max(0, parseFloat(a.allocated_days) - used);
    return { ...a, used, pending, available };
  });
}

// ─────────────────────────────────────────────────────────────
// LEAVE TYPES (HR / Admin)
// ─────────────────────────────────────────────────────────────

// GET /api/leaves/types
router.get('/types', auth, async (req, res, next) => {
  try {
    const { status } = req.query;
    let query = 'SELECT * FROM leave_types WHERE 1=1';
    const params = [];
    if (status) { query += ' AND status = ?'; params.push(status); }
    query += ' ORDER BY name ASC';
    const [types] = await pool.query(query, params);
    res.json({ leaveTypes: types });
  } catch (err) { next(err); }
});

// POST /api/leaves/types
router.post('/types', auth, async (req, res, next) => {
  try {
    const perms = req.user.permissions || [];
    if (!perms.includes('leave.manage_all') && !perms.includes('users.edit_all')) {
      return res.status(403).json({ error: t(req.lang, 'errors.permissionDenied') });
    }
    const { name, code, description, is_paid, default_days, max_allowed } = req.body;
    if (!name) return res.status(400).json({ error: 'Leave type name is required' });

    const [result] = await pool.query(
      `INSERT INTO leave_types (name, code, description, is_paid, default_days, max_allowed, status)
       VALUES (?, ?, ?, ?, ?, ?, 'active')`,
      [
        name,
        code || null,
        description || null,
        is_paid ? 1 : 0,
        parseInt(default_days) || 0,
        parseInt(max_allowed) || 0,
      ]
    );
    res.status(201).json({ id: result.insertId, message: t(req.lang, 'errors.leaveTypeCreated') });
  } catch (err) { next(err); }
});

// PUT /api/leaves/types/:id
router.put('/types/:id', auth, async (req, res, next) => {
  try {
    const perms = req.user.permissions || [];
    if (!perms.includes('leave.manage_all') && !perms.includes('users.edit_all')) {
      return res.status(403).json({ error: t(req.lang, 'errors.permissionDenied') });
    }
    const { name, code, description, is_paid, default_days, max_allowed, status } = req.body;
    const fields = [];
    const params = [];
    if (name !== undefined) { fields.push('name = ?'); params.push(name); }
    if (code !== undefined) { fields.push('code = ?'); params.push(code || null); }
    if (description !== undefined) { fields.push('description = ?'); params.push(description || null); }
    if (is_paid !== undefined) { fields.push('is_paid = ?'); params.push(is_paid ? 1 : 0); }
    if (default_days !== undefined) { fields.push('default_days = ?'); params.push(parseInt(default_days) || 0); }
    if (max_allowed !== undefined) { fields.push('max_allowed = ?'); params.push(parseInt(max_allowed) || 0); }
    if (status !== undefined) { fields.push('status = ?'); params.push(status); }
    if (fields.length === 0) return res.status(400).json({ error: t(req.lang, 'errors.noFieldsToUpdate') });
    params.push(req.params.id);
    await pool.query(`UPDATE leave_types SET ${fields.join(', ')} WHERE id = ?`, params);
    res.json({ message: t(req.lang, 'errors.leaveTypeUpdated') });
  } catch (err) { next(err); }
});

// DELETE /api/leaves/types/:id
router.delete('/types/:id', auth, async (req, res, next) => {
  try {
    const perms = req.user.permissions || [];
    if (!perms.includes('leave.manage_all') && !perms.includes('users.edit_all')) {
      return res.status(403).json({ error: t(req.lang, 'errors.permissionDenied') });
    }
    // Check for existing approved/pending requests
    const [reqs] = await pool.query(
      'SELECT COUNT(*) as c FROM leave_requests WHERE leave_type_id = ? AND status IN (\'approved\',\'pending\')',
      [req.params.id]
    );
    if (reqs[0].c > 0) {
      return res.status(409).json({ error: 'Cannot delete leave type with existing requests. Archive it instead.' });
    }
    await pool.query('DELETE FROM leave_types WHERE id = ?', [req.params.id]);
    res.json({ message: t(req.lang, 'errors.leaveTypeDeleted') });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────
// LEAVE ALLOCATIONS
// ─────────────────────────────────────────────────────────────

// GET /api/leaves/balance — current user's allocations with live used/available
router.get('/balance', auth, async (req, res, next) => {
  try {
    const allocs = await getEnrichedAllocations(req.user.id);
    res.json({ allocations: allocs });
  } catch (err) { next(err); }
});

// GET /api/leaves/balance/:userId — specific user's allocations (admin/manager)
router.get('/balance/:userId', auth, async (req, res, next) => {
  try {
    const targetId = parseInt(req.params.userId, 10);
    const perms = req.user.permissions || [];
    const isSelf = targetId === req.user.id;
    const canViewAll = perms.includes('leave.manage_all') || perms.includes('users.edit_all');
    const canViewTeam = perms.includes('leave.view_team');
    const canView = isSelf || canViewAll || canViewTeam;
    if (!canView) return res.status(403).json({ error: t(req.lang, 'errors.permissionDenied') });

    const allocs = await getEnrichedAllocations(targetId);
    res.json({ allocations: allocs });
  } catch (err) { next(err); }
});

// GET /api/leaves/allocations — all allocations (admin view with pagination + search)
router.get('/allocations', auth, async (req, res, next) => {
  try {
    const perms = req.user.permissions || [];
    if (!perms.includes('leave.manage_all') && !perms.includes('users.edit_all')) {
      return res.status(403).json({ error: t(req.lang, 'errors.permissionDenied') });
    }
    const { search, departmentId, leaveTypeId, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let where = 'WHERE 1=1';
    const params = [];
    if (search) {
      where += ' AND (u.first_name LIKE ? OR u.last_name LIKE ? OR u.email LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s);
    }
    if (departmentId) { where += ' AND u.department_id = ?'; params.push(departmentId); }
    if (leaveTypeId) { where += ' AND la.leave_type_id = ?'; params.push(parseInt(leaveTypeId)); }

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) as total FROM leave_allocations la
       JOIN users u ON la.user_id = u.id
       JOIN leave_types lt ON la.leave_type_id = lt.id
       ${where}`,
      params
    );

    const [rows] = await pool.query(`
      SELECT la.id, la.user_id, la.leave_type_id, la.allocated_days,
             la.description as remark, la.updated_at,
             lt.name as leave_type_name, lt.code as leave_type_code,
             lt.is_paid, lt.max_allowed,
             u.first_name, u.last_name, u.email,
             d.name as department_name
      FROM leave_allocations la
      JOIN users u ON la.user_id = u.id
      JOIN leave_types lt ON la.leave_type_id = lt.id
      LEFT JOIN departments d ON u.department_id = d.id
      ${where}
      ORDER BY u.first_name, lt.name
      LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), offset]);

    const usedMap = await getUsedDaysMap(null, null);
    const pendingMap = await getPendingDaysMap(null, null);

    const enriched = rows.map(a => {
      const key = `${a.user_id}_${a.leave_type_id}`;
      const used = usedMap[key] || 0;
      const pending = pendingMap[key] || 0;
      const available = Math.max(0, parseFloat(a.allocated_days) - used);
      return { ...a, used, pending, available };
    });

    res.json({
      allocations: enriched,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (err) { next(err); }
});

// PUT /api/leaves/allocations/:id — update a single allocation (admin: set allocated_days + remark)
router.put('/allocations/:id', auth, async (req, res, next) => {
  try {
    const perms = req.user.permissions || [];
    if (!perms.includes('leave.manage_all') && !perms.includes('users.edit_all')) {
      return res.status(403).json({ error: t(req.lang, 'errors.permissionDenied') });
    }
    const { allocated_days, remark } = req.body;
    const fields = [];
    const params = [];
    if (allocated_days !== undefined) { fields.push('allocated_days = ?'); params.push(parseFloat(allocated_days)); }
    if (remark !== undefined) { fields.push('description = ?'); params.push(remark || null); }
    if (fields.length === 0) return res.status(400).json({ error: t(req.lang, 'errors.noFieldsToUpdate') });
    fields.push('updated_at = NOW()');
    params.push(req.params.id);
    await pool.query(`UPDATE leave_allocations SET ${fields.join(', ')} WHERE id = ?`, params);
    res.json({ message: t(req.lang, 'errors.leaveAllocationUpdated') });
  } catch (err) { next(err); }
});

// POST /api/leaves/allocations/seed — re-seed allocations for a user or all users (admin)
router.post('/allocations/seed', auth, async (req, res, next) => {
  try {
    const perms = req.user.permissions || [];
    if (!perms.includes('leave.manage_all') && !perms.includes('users.edit_all')) {
      return res.status(403).json({ error: t(req.lang, 'errors.permissionDenied') });
    }
    const { userId } = req.body; // if omitted, seed for ALL active users

    const [types] = await pool.query(
      'SELECT id, default_days FROM leave_types WHERE status = \'active\' AND default_days > 0'
    );

    if (userId) {
      // Seed for specific user
      await pool.query('DELETE FROM leave_allocations WHERE user_id = ?', [userId]);
      for (const lt of types) {
        await pool.query(
          'INSERT INTO leave_allocations (user_id, leave_type_id, allocated_days, description) VALUES (?, ?, ?, ?)',
          [userId, lt.id, lt.default_days, 'Re-seeded from company policy']
        );
      }
      res.json({ message: `Allocations seeded for user ${userId}`, count: types.length });
    } else {
      // Seed for ALL active users
      const [users] = await pool.query('SELECT id FROM users WHERE status = \'active\'');
      await pool.query('DELETE FROM leave_allocations');
      let count = 0;
      for (const u of users) {
        for (const lt of types) {
          await pool.query(
            'INSERT INTO leave_allocations (user_id, leave_type_id, allocated_days, description) VALUES (?, ?, ?, ?)',
            [u.id, lt.id, lt.default_days, 'Auto-allocated from company policy']
          );
          count++;
        }
      }
      res.json({ message: `Allocations seeded for all ${users.length} users`, count });
    }
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────
// LEAVE REQUESTS
// ─────────────────────────────────────────────────────────────

// GET /api/leaves — list leave requests (scoped by permission)
router.get('/', auth, async (req, res, next) => {
  try {
    const { status, userId, leaveTypeId, startDate, endDate, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let where = 'WHERE 1=1';
    const params = [];

    if (status) { where += ' AND lr.status = ?'; params.push(status); }
    if (userId) { where += ' AND lr.user_id = ?'; params.push(parseInt(userId)); }
    if (leaveTypeId) { where += ' AND lr.leave_type_id = ?'; params.push(parseInt(leaveTypeId)); }
    if (startDate) { where += ' AND lr.end_date >= ?'; params.push(startDate); }
    if (endDate) { where += ' AND lr.start_date <= ?'; params.push(endDate); }

    const perms = req.user.permissions || [];
    if (perms.includes('leave.manage_all') || perms.includes('users.edit_all')) {
      // sees everything
    } else if (perms.includes('leave.view_team')) {
      where += ' AND (lr.user_id = ? OR lr.user_id IN (SELECT id FROM users WHERE reporting_manager_id = ?))';
      params.push(req.user.id, req.user.id);
    } else {
      where += ' AND lr.user_id = ?'; params.push(req.user.id);
    }

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) as total FROM leave_requests lr ${where}`, params
    );

    const [requests] = await pool.query(`
      SELECT lr.*,
             lt.name as leave_type_name, lt.code as leave_type_code,
             lt.is_paid,
             u.first_name, u.last_name, u.email,
             a.first_name as approver_first_name, a.last_name as approver_last_name
      FROM leave_requests lr
      JOIN leave_types lt ON lr.leave_type_id = lt.id
      JOIN users u ON lr.user_id = u.id
      LEFT JOIN users a ON lr.approver_id = a.id
      ${where}
      ORDER BY lr.created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), offset]);

    res.json({
      leaveRequests: requests,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (err) { next(err); }
});

// POST /api/leaves — apply for leave
router.post('/', auth, async (req, res, next) => {
  try {
    const { leave_type_id, start_date, end_date, reason } = req.body;
    if (!leave_type_id || !start_date || !end_date) {
      return res.status(400).json({ error: t(req.lang, 'errors.leaveFieldsRequired') });
    }

    const days = calcDays(start_date, end_date);
    if (days <= 0) return res.status(400).json({ error: 'End date must be after start date' });

    // Check this leave type is active
    const [ltype] = await pool.query('SELECT * FROM leave_types WHERE id = ? AND status = \'active\'', [leave_type_id]);
    if (ltype.length === 0) return res.status(400).json({ error: 'Leave type not found or inactive' });

    // Check allocation exists for this user
    const [allocs] = await pool.query(
      'SELECT * FROM leave_allocations WHERE user_id = ? AND leave_type_id = ?',
      [req.user.id, leave_type_id]
    );
    if (allocs.length === 0) {
      return res.status(400).json({ error: 'No allocation found for this leave type. Contact HR.' });
    }
    const alloc = allocs[0];

    // Compute available: allocated - used (approved)
    const usedMap = await getUsedDaysMap(req.user.id, leave_type_id);
    const used = usedMap[`${req.user.id}_${leave_type_id}`] || 0;
    const available = parseFloat(alloc.allocated_days) - used;

    if (days > available) {
      return res.status(400).json({
        error: `Insufficient leave balance. You have ${available} day(s) available but requesting ${days} day(s).`,
      });
    }

    // Check no overlapping pending/approved requests
    const [overlap] = await pool.query(
      `SELECT COUNT(*) as c FROM leave_requests
       WHERE user_id = ? AND leave_type_id = ? AND status IN ('pending','approved')
       AND start_date <= ? AND end_date >= ?`,
      [req.user.id, leave_type_id, end_date, start_date]
    );
    if (overlap[0].c > 0) {
      return res.status(409).json({ error: 'You already have an overlapping leave request for this leave type.' });
    }

    const [result] = await pool.query(
      `INSERT INTO leave_requests (user_id, leave_type_id, start_date, end_date, reason, status)
       VALUES (?, ?, ?, ?, ?, 'pending')`,
      [req.user.id, leave_type_id, start_date, end_date, reason || null]
    );

    // Notify manager
    const [user] = await pool.query('SELECT reporting_manager_id FROM users WHERE id = ?', [req.user.id]);
    if (user[0]?.reporting_manager_id) {
      await pool.query(
        'INSERT INTO notifications (user_id, type, title, message, link) VALUES (?, ?, ?, ?, ?)',
        [
          user[0].reporting_manager_id,
          'leave_request',
          'New Leave Request',
          `${req.user.first_name} ${req.user.last_name} applied for ${ltype[0].name} (${days} day${days !== 1 ? 's' : ''})`,
          `/leaves?id=${result.insertId}`,
        ]
      );
    }

    res.status(201).json({
      id: result.insertId,
      message: t(req.lang, 'errors.leaveRequestSubmitted'),
      days,
    });
  } catch (err) { next(err); }
});

// PUT /api/leaves/:id/approve
router.put('/:id/approve', auth, async (req, res, next) => {
  try {
    const { action, rejection_reason } = req.body;
    if (!['approved', 'rejected'].includes(action)) {
      return res.status(400).json({ error: t(req.lang, 'errors.actionMustBeApprovedOrRejected') });
    }

    const [request] = await pool.query('SELECT * FROM leave_requests WHERE id = ?', [req.params.id]);
    if (request.length === 0) return res.status(404).json({ error: t(req.lang, 'errors.leaveRequestNotFound') });
    const lr = request[0];

    if (lr.status !== 'pending') {
      return res.status(409).json({ error: `Cannot ${action} a ${lr.status} request.` });
    }

    const days = calcDays(lr.start_date, lr.end_date);

    if (action === 'approved') {
      // Deduct from allocation
      await pool.query(
        'UPDATE leave_allocations SET allocated_days = GREATEST(0, allocated_days - ?) WHERE user_id = ? AND leave_type_id = ?',
        [days, lr.user_id, lr.leave_type_id]
      );
    }

    await pool.query(
      `UPDATE leave_requests SET status = ?, approver_id = ?, approved_date = NOW(),
       rejection_reason = ? WHERE id = ?`,
      [action, req.user.id, action === 'rejected' ? (rejection_reason || null) : null, req.params.id]
    );

    // Notify employee
    const statusLabel = action === 'approved' ? 'approved' : 'rejected';
    await pool.query(
      `INSERT INTO notifications (user_id, type, title, message, link) VALUES (?, ?, ?, ?, ?)`,
      [
        lr.user_id,
        `leave_${action}`,
        `Leave Request ${action === 'approved' ? 'Approved' : 'Rejected'}`,
        `Your leave request has been ${statusLabel}${rejection_reason && action === 'rejected' ? ': ' + rejection_reason : ''}`,
        `/leaves`,
      ]
    );

    res.json({ message: t(req.lang, `success.leaveRequest${action === 'approved' ? 'Approved' : 'Rejected'}`) });
  } catch (err) { next(err); }
});

// PUT /api/leaves/:id/cancel
router.put('/:id/cancel', auth, async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM leave_requests WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: t(req.lang, 'errors.leaveRequestNotFound') });
    const lr = rows[0];

    const perms = req.user.permissions || [];
    const isHRAdmin = perms.includes('leave.manage_all') || perms.includes('users.edit_all');
    if (!isHRAdmin && lr.user_id !== req.user.id) {
      return res.status(403).json({ error: t(req.lang, 'errors.permissionDenied') });
    }
    if (lr.status === 'cancelled') {
      return res.json({ message: t(req.lang, 'success.leaveRequestCancelled') });
    }

    if (lr.status === 'approved') {
      const days = calcDays(lr.start_date, lr.end_date);
      await pool.query(
        'UPDATE leave_allocations SET allocated_days = allocated_days + ? WHERE user_id = ? AND leave_type_id = ?',
        [days, lr.user_id, lr.leave_type_id]
      );
    }

    await pool.query(
      'UPDATE leave_requests SET status = \'cancelled\', approver_id = ?, approved_date = NOW() WHERE id = ?',
      [req.user.id, req.params.id]
    );

    if (lr.user_id !== req.user.id) {
      await pool.query(
        `INSERT INTO notifications (user_id, type, title, message, link) VALUES (?, ?, ?, ?, ?)`,
        [lr.user_id, 'leave_cancelled', 'Leave Request Cancelled',
         `Your leave request was cancelled by ${req.user.first_name} ${req.user.last_name}`,
         `/leaves`]
      );
    }

    res.json({ message: t(req.lang, 'success.leaveRequestCancelled') });
  } catch (err) { next(err); }
});

// GET /api/leaves/calendar
router.get('/calendar', auth, async (req, res, next) => {
  try {
    const { startDate, endDate, departmentId } = req.query;
    let query = `
      SELECT lr.start_date, lr.end_date,
             u.first_name, u.last_name, lt.name as leave_type, d.name as department
      FROM leave_requests lr
      JOIN users u ON lr.user_id = u.id
      JOIN leave_types lt ON lr.leave_type_id = lt.id
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE lr.status = 'approved'`;
    const params = [];
    if (startDate) { query += ' AND lr.end_date >= ?'; params.push(startDate); }
    if (endDate) { query += ' AND lr.start_date <= ?'; params.push(endDate); }
    if (departmentId) { query += ' AND u.department_id = ?'; params.push(departmentId); }
    const [events] = await pool.query(query, params);
    res.json({ calendar: events });
  } catch (err) { next(err); }
});

module.exports = router;
