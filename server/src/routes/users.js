const express = require('express');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const pool = require('../config/database');
const { auth } = require('../middleware/auth');
const { t } = require('../i18n');
const { logActivity } = require('../services/activityService');

// Helper: validate password strength (8+ chars, 1 uppercase, 1 lowercase, 1 number, 1 special char)
function validatePasswordStrength(password) {
  if (!password || typeof password !== 'string') return 'Password is required';
  if (password.length < 8) return 'Password must be at least 8 characters';
  if (!/[A-Z]/.test(password)) return 'Password must contain at least 1 uppercase letter';
  if (!/[a-z]/.test(password)) return 'Password must contain at least 1 lowercase letter';
  if (!/\d/.test(password)) return 'Password must contain at least 1 number';
  if (!/[@#$&!*^~]/.test(password)) return 'Password must contain at least 1 special character (@#$&!*^~)';
  return null; // null = valid
}

const router = express.Router();

// GET /api/users — requires `users.view_all` (admin / HR)
router.get('/', auth, async (req, res, next) => {
  try {
    if (!(req.user.permissions || []).includes('users.view_all')) {
      return res.status(403).json({ error: t(req.lang, 'errors.permissionDenied') });
    }
    const { search, designation, departmentId, status, roleId } = req.query;
    // NOTE: `designation` is now a free-text string on `users.designation`,
    //       not a FK to a `designations` table. The legacy `designation_id`
    //       column is preserved on the table but no longer written by the app.
    let query = `SELECT u.*, r.name as role_name, d.name as department_name,
                 m.first_name as manager_first_name, m.last_name as manager_last_name
                 FROM users u
                 JOIN roles r ON u.role_id = r.id
                 LEFT JOIN departments d ON u.department_id = d.id
                 LEFT JOIN users m ON u.reporting_manager_id = m.id
                 WHERE 1=1`;
    const params = [];
    if (search) { query += ' AND (u.first_name LIKE ? OR u.last_name LIKE ? OR u.email LIKE ? OR u.designation LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`); }
    if (departmentId) { query += ' AND u.department_id = ?'; params.push(departmentId); }
    if (designation) { query += ' AND u.designation LIKE ?'; params.push(`%${designation}%`); }
    if (status) { query += ' AND u.status = ?'; params.push(status); }
    if (roleId) { query += ' AND u.role_id = ?'; params.push(roleId); }
    query += ' ORDER BY u.first_name ASC';

    const [users] = await pool.query(query, params);

    // Hide password_hash from output
    const safe = users.map(({ password_hash, designation_id, ...rest }) => rest);
    res.json({ users: safe });
  } catch (err) { next(err); }
});

// GET /api/users/active — all active system users for @mention autocomplete.
// Any authenticated user can access this endpoint.
router.get('/active', auth, async (req, res, next) => {
  try {
    const { search } = req.query;
    let query = `SELECT id, first_name, last_name, email, avatar_url, status FROM users WHERE status = 'active'`;
    const params = [];
    if (search) {
      query += ' AND (first_name LIKE ? OR last_name LIKE ? OR email LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    query += ' ORDER BY first_name ASC LIMIT 100';
    const [users] = await pool.query(query, params);
    res.json({ users });
  } catch (err) { next(err); }
});

// GET /api/users/:id — requires `users.view_all` (users can always view themselves)
router.get('/:id', auth, async (req, res, next) => {
  try {
    const targetId = parseInt(req.params.id, 10);
    const isSelf = targetId === req.user.id;
    if (!isSelf && !(req.user.permissions || []).includes('users.view_all')) {
      return res.status(403).json({ error: t(req.lang, 'errors.permissionDenied') });
    }
    const [users] = await pool.query(
      `SELECT u.*, r.name as role_name, d.name as department_name,
       m.first_name as manager_first_name, m.last_name as manager_last_name
       FROM users u
       JOIN roles r ON u.role_id = r.id
       LEFT JOIN departments d ON u.department_id = d.id
       LEFT JOIN users m ON u.reporting_manager_id = m.id
       WHERE u.id = ?`,
      [req.params.id]
    );
    if (users.length === 0) return res.status(404).json({ error: t(req.lang, 'errors.userNotFound') });
    const { password_hash, designation_id, ...safe } = users[0];
    res.json({ user: safe });
  } catch (err) { next(err); }
});

// POST /api/users (admin only — create user without registration)
router.post('/', auth, async (req, res, next) => {
  try {
    const { email, password, firstName, lastName, roleId, departmentId, designation, managerId, hireDate, employeeId, status } = req.body;

    if (!(req.user.permissions || []).includes('users.create')) {
      return res.status(403).json({ error: t(req.lang, 'errors.permissionDenied') });
    }
    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({ error: t(req.lang, 'errors.emailPasswordNameRequired') });
    }

    const passwordError = validatePasswordStrength(password);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) return res.status(409).json({ error: t(req.lang, 'errors.emailAlreadyRegistered') });

    const hash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, role_id, department_id, designation, reporting_manager_id, hire_date, employee_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [email, hash, firstName, lastName, roleId || 1, departmentId || null, designation || null, managerId || null, hireDate || null, employeeId || null, status || 'active']
    );

    // Initialize leave allocations for new employee
    const [leaveTypes] = await pool.query(
      'SELECT id, default_days FROM leave_types WHERE status = \'active\' AND default_days > 0'
    );
    for (const lt of leaveTypes) {
      await pool.query(
        'INSERT INTO leave_allocations (user_id, leave_type_id, allocated_days, description) VALUES (?, ?, ?, ?)',
        [result.insertId, lt.id, lt.default_days, 'Auto-allocated on registration']
      );
    }

    res.status(201).json({ id: result.insertId, message: t(req.lang, 'errors.userCreated') });

    // ── Activity log: Employee Created ────────────────────────────────────
    logActivity({ req, module: 'Employee', action: 'Created',
      description: `Employee (${email}) created` });
  } catch (err) { next(err); }
});

// PUT /api/users/:id — users can edit self (users.edit_own) or any user if users.edit_all
router.put('/:id', auth, async (req, res, next) => {
  try {
    const targetId = parseInt(req.params.id, 10);
    const isSelf = targetId === req.user.id;
    const perms = req.user.permissions || [];
    if (!isSelf && !perms.includes('users.edit_all')) {
      return res.status(403).json({ error: t(req.lang, 'errors.permissionDenied') });
    }
    const updates = [];
    const params = [];
    const { firstName, lastName, roleId, departmentId, designation, managerId, status, phone, address, personalEmail, bio, socialLinks } = req.body;

    if (firstName !== undefined) { updates.push('first_name = ?'); params.push(firstName); }
    if (lastName !== undefined) { updates.push('last_name = ?'); params.push(lastName); }
    if (roleId !== undefined) { updates.push('role_id = ?'); params.push(roleId); }
    if (departmentId !== undefined) { updates.push('department_id = ?'); params.push(departmentId); }
    if (designation !== undefined) { updates.push('designation = ?'); params.push(designation || null); }
    if (managerId !== undefined) { updates.push('reporting_manager_id = ?'); params.push(managerId); }
    if (status !== undefined) { updates.push('status = ?'); params.push(status); }
    if (phone !== undefined) { updates.push('phone = ?'); params.push(phone); }
    if (address !== undefined) { updates.push('address = ?'); params.push(address); }
    if (personalEmail !== undefined) { updates.push('personal_email = ?'); params.push(personalEmail); }
    if (bio !== undefined) { updates.push('bio = ?'); params.push(bio); }
    if (socialLinks !== undefined) {
      updates.push('social_links = ?');
      params.push(typeof socialLinks === 'object' ? JSON.stringify(socialLinks) : socialLinks);
    }

    if (updates.length === 0) return res.status(400).json({ error: t(req.lang, 'errors.noFieldsToUpdate') });

    // Capture old values before update for activity logging
    const [[oldUser]] = await pool.query('SELECT status, email FROM users WHERE id = ?', [req.params.id]);

    params.push(req.params.id);
    await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);

    // ── Activity log ──────────────────────────────────────────────────────
    // Only show target email when admin acts on someone else's account
    const targetLabel = isSelf ? null : (oldUser?.email || targetId);
    const statusChanged = status !== undefined && oldUser && oldUser.status !== status;
    if (statusChanged) {
      logActivity({ req, module: 'Employee', action: 'Updated',
        description: targetLabel
          ? `Employee (${targetLabel}) ${status === 'active' ? 'activated' : 'deactivated'}`
          : `${status === 'active' ? 'Activated' : 'Deactivated'} account` });
    } else {
      logActivity({ req, module: 'Employee', action: 'Updated',
        description: targetLabel
          ? `Employee (${targetLabel}) updated`
          : `Profile updated` });
    }

    res.json({ message: t(req.lang, 'errors.userUpdated') });
  } catch (err) { next(err); }
});

// POST /api/users/avatar — upload avatar for current user
const UPLOAD_DIR = path.join(__dirname, '../../../uploads/avatars');
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      cb(null, UPLOAD_DIR);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '.jpg';
      const filename = `avatar_${req.user.id}_${Date.now()}${ext}`;
      cb(null, filename);
    },
  }),
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    cb(null, allowed.includes(file.mimetype));
  },
  limits: { fileSize: 5 * 1024 * 1024 },
});

router.post('/avatar', auth, upload.single('avatar'), async (req, res, next) => {
  try {
    if (req.file) {
      const avatarUrl = `/uploads/avatars/${req.file.filename}`;
      await pool.query('UPDATE users SET avatar_url = ? WHERE id = ?', [avatarUrl, req.user.id]);
      return res.json({ avatar_url: avatarUrl });
    }
    return res.status(400).json({ error: 'No avatar file provided' });
  } catch (err) { next(err); }
});

// DELETE /api/users/:id — requires `users.delete`
router.delete('/:id', auth, async (req, res, next) => {
  try {
    if (!(req.user.permissions || []).includes('users.delete')) {
      return res.status(403).json({ error: t(req.lang, 'errors.permissionDenied') });
    }
    const [target] = await pool.query('SELECT role_id FROM users WHERE id = ?', [req.params.id]);
    if (target.length === 0) return res.status(404).json({ error: t(req.lang, 'errors.userNotFound') });
    if (target[0].role_id === 1) return res.status(403).json({ error: t(req.lang, 'errors.cannotDeleteAdmin') });

    const [[deletedUser]] = await pool.query('SELECT email, first_name, last_name FROM users WHERE id = ?', [req.params.id]);
    await pool.query('DELETE FROM users WHERE id = ?', [req.params.id]);

    // ── Activity log: Employee Deleted ─────────────────────────────────────
    const empLabel = deletedUser?.email
      || `${deletedUser?.first_name || ''} ${deletedUser?.last_name || ''}`.trim()
      || `user #${req.params.id}`;
    logActivity({ req, module: 'Employee', action: 'Deleted',
      description: `Employee (${empLabel}) deleted` });

    res.json({ message: t(req.lang, 'errors.userDeleted') });
  } catch (err) { next(err); }
});

module.exports = router;
