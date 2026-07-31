const express = require('express');
const pool = require('../config/database');
const { auth } = require('../middleware/auth');
const { t } = require('../i18n');
const { sendEmail } = require('../utils/mailer');
const { leaveRequestSubmittedEmail, leaveRequestDecidedEmail } = require('../utils/emailTemplates');

const SITE_URL = process.env.SITE_URL || 'https://serveravatar-hub.95.217.8.52.nip.io';

const router = express.Router();

// GET /api/leaves/balance - Get current user's leave balance
router.get('/balance', auth, async (req, res, next) => {
  try {
    const [balances] = await pool.query(
      `SELECT lb.*, lt.name as leave_type_name, lt.max_allowed, lt.is_paid FROM leave_balances lb
       JOIN leave_types lt ON lb.leave_type_id = lt.id WHERE lb.user_id = ?`,
      [req.user.id]
    );
    res.json({ balances });
  } catch (err) { next(err); }
});

// GET /api/leaves/balance/:userId
router.get('/balance/:userId', auth, async (req, res, next) => {
  try {
    const [balances] = await pool.query(
      `SELECT lb.*, lt.name as leave_type_name, lt.max_allowed, lt.is_paid FROM leave_balances lb
       JOIN leave_types lt ON lb.leave_type_id = lt.id WHERE lb.user_id = ?`,
      [req.params.userId]
    );
    res.json({ balances });
  } catch (err) { next(err); }
});

// GET /api/leaves/types
router.get('/types', auth, async (req, res, next) => {
  try {
    const [types] = await pool.query('SELECT * FROM leave_types ORDER BY name');
    res.json({ leaveTypes: types });
  } catch (err) { next(err); }
});

// POST /api/leaves/types - Create leave type (HR/System Admin)
router.post('/types', auth, async (req, res, next) => {
  try {
    const { name, accrualRate, maxAllowed, isPaid, carryOverLimit, description } = req.body;
    const [result] = await pool.query(
      'INSERT INTO leave_types (name, accrual_rate, max_allowed, is_paid, carry_over_limit, description) VALUES (?, ?, ?, ?, ?, ?)',
      [name, accrualRate || 0, maxAllowed || 0, isPaid || false, carryOverLimit || 0, description || '']
    );
    res.status(201).json({ id: result.insertId, message: t(req.lang, 'errors.leaveTypeCreated') });
  } catch (err) { next(err); }
});

// GET /api/leaves - List leave requests
router.get('/', auth, async (req, res, next) => {
  try {
    const { status, userId, startDate, endDate } = req.query;
    let query = `SELECT lr.*, lt.name as leave_type_name, u.first_name, u.last_name, u.email,
                        a.first_name as approver_first_name, a.last_name as approver_last_name
                 FROM leave_requests lr
                 JOIN leave_types lt ON lr.leave_type_id = lt.id
                 JOIN users u ON lr.user_id = u.id
                 LEFT JOIN users a ON lr.approver_id = a.id
                 WHERE 1=1`;
    const params = [];

    if (status) { query += ' AND lr.status = ?'; params.push(status); }
    if (userId) { query += ' AND lr.user_id = ?'; params.push(userId); }
    if (startDate) { query += ' AND lr.start_date >= ?'; params.push(startDate); }
    if (endDate) { query += ' AND lr.end_date <= ?'; params.push(endDate); }

    // Permission-based scoping:
    //   leave.view_own        → only their own requests
    //   leave.view_team       → own + direct reports (managers)
    //   leave.manage_all      → all requests (HR / Admin)
    // Default fallback (no matching permission) is "own only" — safest.
    const perms = req.user.permissions || [];
    if (perms.includes('leave.manage_all')) {
      // no extra filter — sees everything
    } else if (perms.includes('leave.view_team')) {
      query += ' AND (lr.user_id = ? OR lr.user_id IN (SELECT id FROM users WHERE reporting_manager_id = ?))';
      params.push(req.user.id, req.user.id);
    } else {
      query += ' AND lr.user_id = ?'; params.push(req.user.id);
    }

    query += ' ORDER BY lr.created_at DESC';
    const [requests] = await pool.query(query, params);
    res.json({ leaveRequests: requests });
  } catch (err) { next(err); }
});

// POST /api/leaves - Apply for leave
router.post('/', auth, async (req, res, next) => {
  try {
    const { leaveTypeId, startDate, endDate, reason, attachmentUrl } = req.body;
    if (!leaveTypeId || !startDate || !endDate) {
      return res.status(400).json({ error: t(req.lang, 'errors.leaveFieldsRequired') });
    }

    // Calculate days
    const start = new Date(startDate);
    const end = new Date(endDate);
    const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;

    // Check balance
    const [balances] = await pool.query(
      'SELECT current_balance FROM leave_balances WHERE user_id = ? AND leave_type_id = ?',
      [req.user.id, leaveTypeId]
    );

    if (balances.length === 0 || parseFloat(balances[0].current_balance) < days) {
      return res.status(400).json({ error: t(req.lang, 'errors.insufficientLeaveBalance') });
    }

    const [result] = await pool.query(
      'INSERT INTO leave_requests (user_id, leave_type_id, start_date, end_date, reason, attachment_url, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [req.user.id, leaveTypeId, startDate, endDate, reason || '', attachmentUrl || null, 'pending']
    );

    // Look up the leave type name + manager info for the email + notification
    const [lt] = await pool.query('SELECT name FROM leave_types WHERE id = ?', [leaveTypeId]);
    const leaveTypeName = lt[0]?.name || 'leave';

    // Create notification for manager (legacy format: title/message — not a key-based notif)
    const [user] = await pool.query('SELECT reporting_manager_id FROM users WHERE id = ?', [req.user.id]);
    let emailResult = null;
    if (user[0]?.reporting_manager_id) {
      await pool.query(
        'INSERT INTO notifications (user_id, type, title, message, link) VALUES (?, ?, ?, ?, ?)',
        [user[0].reporting_manager_id, 'leave_request', 'New Leave Request',
         `${req.user.first_name} ${req.user.last_name} has applied for leave`, `/leaves?id=${result.insertId}`]
      );

      // Look up the manager's email + name, then send the Ethereal email
      const [manager] = await pool.query(
        'SELECT email, first_name, last_name FROM users WHERE id = ?',
        [user[0].reporting_manager_id]
      );
      if (manager.length > 0) {
        const leaveUrl = `${SITE_URL}/leaves?id=${result.insertId}`;
        const tpl = leaveRequestSubmittedEmail({
          managerName: `${manager[0].first_name} ${manager[0].last_name}`,
          employeeName: `${req.user.first_name} ${req.user.last_name}`,
          leaveType: leaveTypeName,
          startDate,
          endDate,
          days,
          reason: reason || '',
          leaveUrl,
        });
        emailResult = await sendEmail({
          to: manager[0].email,
          toName: `${manager[0].first_name} ${manager[0].last_name}`,
          subject: tpl.subject,
          html: tpl.html,
          text: tpl.text,
          type: 'leave_request',
          relatedId: result.insertId,
          relatedType: 'leave',
          triggeredByUserId: req.user.id,
        });
      }
    }

    res.status(201).json({
      id: result.insertId,
      message: t(req.lang, 'errors.leaveRequestSubmitted'),
      emailLog: emailResult
        ? { ok: emailResult.ok, previewUrl: emailResult.previewUrl, messageId: emailResult.messageId, error: emailResult.error }
        : null,
    });
  } catch (err) { next(err); }
});

// PUT /api/leaves/:id/approve
router.put('/:id/approve', auth, async (req, res, next) => {
  try {
    const { action, rejectionReason } = req.body; // action: 'approved' or 'rejected'
    if (!['approved', 'rejected'].includes(action)) {
      return res.status(400).json({ error: t(req.lang, 'errors.actionMustBeApprovedOrRejected') });
    }

    const [request] = await pool.query('SELECT * FROM leave_requests WHERE id = ?', [req.params.id]);
    if (request.length === 0) return res.status(404).json({ error: t(req.lang, 'errors.leaveRequestNotFound') });

    const lr = request[0];
    const days = Math.ceil((new Date(lr.end_date) - new Date(lr.start_date)) / (1000 * 60 * 60 * 24)) + 1;

    if (action === 'approved') {
      // Deduct from balance
      await pool.query(
        'UPDATE leave_balances SET current_balance = current_balance - ? WHERE user_id = ? AND leave_type_id = ?',
        [days, lr.user_id, lr.leave_type_id]
      );
    }

    await pool.query(
      'UPDATE leave_requests SET status = ?, approver_id = ?, approved_date = NOW(), rejection_reason = ? WHERE id = ?',
      [action, req.user.id, rejectionReason || null, req.params.id]
    );

    // Notify employee — use i18n key + params so it translates on read
    const titleKey = action === 'approved'
      ? 'notifications.leaveRequestApproved'
      : 'notifications.leaveRequestRejected';
    const fallbackTitle = `Leave Request ${action}`;
    const fallbackMessage = `Your leave request has been ${action}${rejectionReason ? ': ' + rejectionReason : ''}`;
    await pool.query(
      `INSERT INTO notifications (user_id, type, title_key, params, title, message, link)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        lr.user_id,
        `leave_${action}`,
        titleKey,
        JSON.stringify({}),
        fallbackTitle,
        fallbackMessage,
        `/leaves?id=${req.params.id}`,
      ]
    );

    // Send the email to the employee about the decision
    let emailResult = null;
    const [employee] = await pool.query(
      'SELECT email, first_name, last_name FROM users WHERE id = ?',
      [lr.user_id]
    );
    if (employee.length > 0) {
      // Look up the leave type name
      const [lt2] = await pool.query('SELECT name FROM leave_types WHERE id = ?', [lr.leave_type_id]);
      const leaveTypeName = lt2[0]?.name || 'leave';
      const leaveUrl = `${SITE_URL}/leaves?id=${req.params.id}`;
      const approverName = `${req.user.first_name} ${req.user.last_name}`;
      const tpl = leaveRequestDecidedEmail({
        employeeName: `${employee[0].first_name} ${employee[0].last_name}`,
        action,
        leaveType: leaveTypeName,
        startDate: lr.start_date,
        endDate: lr.end_date,
        approverName,
        reason: rejectionReason || '',
        leaveUrl,
      });
      emailResult = await sendEmail({
        to: employee[0].email,
        toName: `${employee[0].first_name} ${employee[0].last_name}`,
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
        type: `leave_${action}`,
        relatedId: parseInt(req.params.id, 10),
        relatedType: 'leave',
        triggeredByUserId: req.user.id,
      });
    }

    // The frontend displays status badge via t('leaves.approved'/'rejected') client-side,
    // so the success message just needs to be in the user's language.
    const successKey = action === 'approved'
      ? 'success.leaveRequestApproved'
      : 'success.leaveRequestRejected';
    res.json({
      message: t(req.lang, successKey),
      emailLog: emailResult
        ? { ok: emailResult.ok, previewUrl: emailResult.previewUrl, messageId: emailResult.messageId, error: emailResult.error }
        : null,
    });
  } catch (err) { next(err); }
});

// PUT /api/leaves/:id/cancel - Cancel a pending or approved leave request
// Employees can cancel their own; HR Admin / System Admin can cancel any.
// If the leave was already approved, the used days are refunded to the balance.
router.put('/:id/cancel', auth, async (req, res, next) => {
  try {
    const isHRAdmin = (req.user.permissions || []).includes('leave.manage_all');

    const [rows] = await pool.query('SELECT * FROM leave_requests WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: t(req.lang, 'errors.leaveRequestNotFound') });

    const lr = rows[0];

    // Employees may only cancel their own requests
    if (!isHRAdmin && lr.user_id !== req.user.id) {
      return res.status(403).json({ error: t(req.lang, 'errors.permissionDenied') });
    }

    // Already cancelled — no-op
    if (lr.status === 'cancelled') {
      return res.json({ message: t(req.lang, 'success.leaveRequestCancelled') });
    }

    // If it was approved, refund the balance
    if (lr.status === 'approved') {
      const days = Math.ceil((new Date(lr.end_date) - new Date(lr.start_date)) / (1000 * 60 * 60 * 24)) + 1;
      await pool.query(
        'UPDATE leave_balances SET current_balance = current_balance + ? WHERE user_id = ? AND leave_type_id = ?',
        [days, lr.user_id, lr.leave_type_id]
      );
    }

    await pool.query(
      'UPDATE leave_requests SET status = ?, approver_id = ?, approved_date = NOW() WHERE id = ?',
      ['cancelled', req.user.id, req.params.id]
    );

    // Notify the employee (skip self-cancel)
    if (lr.user_id !== req.user.id) {
      await pool.query(
        `INSERT INTO notifications (user_id, type, title_key, params, title, message, link)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          lr.user_id,
          'leave_cancelled',
          'notifications.leaveRequestCancelled',
          JSON.stringify({}),
          'Leave Request Cancelled',
          `Your leave request has been cancelled by ${req.user.first_name} ${req.user.last_name}`,
          `/leaves`,
        ]
      );
    }

    res.json({ message: t(req.lang, 'success.leaveRequestCancelled') });
  } catch (err) { next(err); }
});

// GET /api/leaves/calendar
router.get('/calendar', auth, async (req, res, next) => {
  try {
    const { startDate, endDate, departmentId } = req.query;
    let query = `SELECT lr.start_date, lr.end_date, u.first_name, u.last_name, lt.name as leave_type, d.name as department
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

// PUT /api/leaves/types/:id
router.put('/types/:id', auth, async (req, res, next) => {
  try {
    const toValue = (v) => (v === '' || v === null || v === undefined) ? null : v;
    const { name, accrual_rate, max_allowed, is_paid, carry_over_limit, description } = req.body;
    const fields = [];
    const params = [];
    if (name !== undefined && name !== '') { fields.push('name = ?'); params.push(name); }
    if (accrual_rate !== undefined && accrual_rate !== '') { fields.push('accrual_rate = ?'); params.push(toValue(accrual_rate)); }
    if (max_allowed !== undefined && max_allowed !== '') { fields.push('max_allowed = ?'); params.push(toValue(max_allowed)); }
    if (is_paid !== undefined) { fields.push('is_paid = ?'); params.push(is_paid ? 1 : 0); }
    if (carry_over_limit !== undefined && carry_over_limit !== '') { fields.push('carry_over_limit = ?'); params.push(toValue(carry_over_limit)); }
    if (description !== undefined && description !== '') { fields.push('description = ?'); params.push(toValue(description)); }
    if (fields.length === 0) {
      return res.status(400).json({ error: t(req.lang, 'errors.noFieldsToUpdate') });
    }
    params.push(req.params.id);
    await pool.query(`UPDATE leave_types SET ${fields.join(', ')} WHERE id = ?`, params);
    res.json({ message: t(req.lang, 'errors.leaveTypeUpdated') });
  } catch (err) { next(err); }
});

// DELETE /api/leaves/types/:id
router.delete('/types/:id', auth, async (req, res, next) => {
  try {
    await pool.query('DELETE FROM leave_types WHERE id = ?', [req.params.id]);
    res.json({ message: t(req.lang, 'errors.leaveTypeDeleted') });
  } catch (err) { next(err); }
});

module.exports = router;