const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/database');
const { auth } = require('../middleware/auth');
const { t } = require('../i18n');

const router = express.Router();

// GET /api/users
router.get('/', auth, async (req, res, next) => {
  try {
    const { search, departmentId, designationId, status, roleId } = req.query;
    let query = `SELECT u.*, r.name as role_name, d.name as department_name, des.name as designation_name,
                 m.first_name as manager_first_name, m.last_name as manager_last_name
                 FROM users u
                 JOIN roles r ON u.role_id = r.id
                 LEFT JOIN departments d ON u.department_id = d.id
                 LEFT JOIN designations des ON u.designation_id = des.id
                 LEFT JOIN users m ON u.reporting_manager_id = m.id
                 WHERE 1=1`;
    const params = [];
    if (search) { query += ' AND (u.first_name LIKE ? OR u.last_name LIKE ? OR u.email LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    if (departmentId) { query += ' AND u.department_id = ?'; params.push(departmentId); }
    if (designationId) { query += ' AND u.designation_id = ?'; params.push(designationId); }
    if (status) { query += ' AND u.status = ?'; params.push(status); }
    if (roleId) { query += ' AND u.role_id = ?'; params.push(roleId); }
    query += ' ORDER BY u.first_name ASC';

    const [users] = await pool.query(query, params);

    // Hide password_hash from output
    const safe = users.map(({ password_hash, ...rest }) => rest);
    res.json({ users: safe });
  } catch (err) { next(err); }
});

// GET /api/users/:id
router.get('/:id', auth, async (req, res, next) => {
  try {
    const [users] = await pool.query(
      `SELECT u.*, r.name as role_name, d.name as department_name, des.name as designation_name,
       m.first_name as manager_first_name, m.last_name as manager_last_name
       FROM users u
       JOIN roles r ON u.role_id = r.id
       LEFT JOIN departments d ON u.department_id = d.id
       LEFT JOIN designations des ON u.designation_id = des.id
       LEFT JOIN users m ON u.reporting_manager_id = m.id
       WHERE u.id = ?`,
      [req.params.id]
    );
    if (users.length === 0) return res.status(404).json({ error: t(req.lang, 'errors.userNotFound') });
    const { password_hash, ...safe } = users[0];
    res.json({ user: safe });
  } catch (err) { next(err); }
});

// POST /api/users (admin only — create user without registration)
router.post('/', auth, async (req, res, next) => {
  try {
    const { email, password, firstName, lastName, roleId, departmentId, designationId, managerId, hireDate, employeeId, status } = req.body;

    if (req.user.role_name !== 'System Admin' && req.user.role_name !== 'HR Admin') {
      return res.status(403).json({ error: t(req.lang, 'errors.permissionDenied') });
    }
    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({ error: t(req.lang, 'errors.emailPasswordNameRequired') });
    }

    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) return res.status(409).json({ error: t(req.lang, 'errors.emailAlreadyRegistered') });

    const hash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, role_id, department_id, designation_id, reporting_manager_id, hire_date, employee_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [email, hash, firstName, lastName, roleId || 1, departmentId || null, designationId || null, managerId || null, hireDate || null, employeeId || null, status || 'active']
    );

    // Initialize leave balances
    const [leaveTypes] = await pool.query('SELECT id, max_allowed FROM leave_types');
    for (const lt of leaveTypes) {
      await pool.query(
        'INSERT INTO leave_balances (user_id, leave_type_id, current_balance) VALUES (?, ?, ?)',
        [result.insertId, lt.id, lt.max_allowed]
      );
    }

    res.status(201).json({ id: result.insertId, message: t(req.lang, 'errors.userCreated') });
  } catch (err) { next(err); }
});

// PUT /api/users/:id
router.put('/:id', auth, async (req, res, next) => {
  try {
    const updates = [];
    const params = [];
    const { firstName, lastName, roleId, departmentId, designationId, managerId, status, phone, address } = req.body;

    if (firstName !== undefined) { updates.push('first_name = ?'); params.push(firstName); }
    if (lastName !== undefined) { updates.push('last_name = ?'); params.push(lastName); }
    if (roleId !== undefined) { updates.push('role_id = ?'); params.push(roleId); }
    if (departmentId !== undefined) { updates.push('department_id = ?'); params.push(departmentId); }
    if (designationId !== undefined) { updates.push('designation_id = ?'); params.push(designationId); }
    if (managerId !== undefined) { updates.push('reporting_manager_id = ?'); params.push(managerId); }
    if (status !== undefined) { updates.push('status = ?'); params.push(status); }
    if (phone !== undefined) { updates.push('phone = ?'); params.push(phone); }
    if (address !== undefined) { updates.push('address = ?'); params.push(address); }

    if (updates.length === 0) return res.status(400).json({ error: t(req.lang, 'errors.noFieldsToUpdate') });

    params.push(req.params.id);
    await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
    res.json({ message: t(req.lang, 'errors.userUpdated') });
  } catch (err) { next(err); }
});

// DELETE /api/users/:id
router.delete('/:id', auth, async (req, res, next) => {
  try {
    const [target] = await pool.query('SELECT role_id FROM users WHERE id = ?', [req.params.id]);
    if (target.length === 0) return res.status(404).json({ error: t(req.lang, 'errors.userNotFound') });
    if (target[0].role_id === 1) return res.status(403).json({ error: t(req.lang, 'errors.cannotDeleteAdmin') });

    await pool.query('DELETE FROM users WHERE id = ?', [req.params.id]);
    res.json({ message: t(req.lang, 'errors.userDeleted') });
  } catch (err) { next(err); }
});

module.exports = router;