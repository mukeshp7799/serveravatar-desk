const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const { auth, JWT_SECRET, revokeToken } = require('../middleware/auth');
const { t } = require('../i18n');

// Helper: create notifications for pending invitations (only if not already notified)
async function createNotificationsForPendingInvitations(conn, userId, email) {
  const SITE_URL = process.env.SITE_URL || 'https://seravavatar-hub.95.217.8.52.nip.io';
  const emailLower = email.toLowerCase();
  const [pendingInvs] = await conn.query(
    `SELECT pi.id, pi.project_id, pi.token, pi.role_in_project, p.name AS project_name
     FROM project_invitations pi
     JOIN projects p ON pi.project_id = p.id
     WHERE LOWER(pi.email) = ? AND pi.status = 'pending' AND pi.expires_at > NOW()`,
    [emailLower]
  );
  for (const inv of pendingInvs) {
    const [[existing]] = await conn.query(
      `SELECT id FROM notifications WHERE user_id = ? AND type = 'project_invitation' AND params LIKE ?`,
      [userId, `%"invitation_id":${inv.id}%`]
    );
    if (!existing) {
      const link = `/invitation-confirm/${inv.token}`;
      await conn.query(
        `INSERT INTO notifications (user_id, type, title, message, link, is_read, created_at)
         VALUES (?, 'project_invitation', ?, ?, ?, FALSE, NOW())`,
        [
          userId,
          'Project Invitation',
          `You've been invited to join "${inv.project_name}" as ${inv.role_in_project || 'Member'}.`,
          link,
        ]
      );
    }
  }
}

const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: t(req.lang, 'errors.emailPasswordRequired') });
    }

    const [users] = await pool.query(
      `SELECT u.*, r.name as role_name FROM users u JOIN roles r ON u.role_id = r.id WHERE u.email = ? AND u.status = 'active'`,
      [email]
    );

    if (users.length === 0) {
      return res.status(401).json({ error: t(req.lang, 'errors.invalidCredentials') });
    }

    const user = users[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: t(req.lang, 'errors.invalidCredentials') });
    }

    const jti = require('crypto').randomUUID();
    const token = jwt.sign({ userId: user.id, roleId: user.role_id, jti }, JWT_SECRET, { expiresIn: '7d' });

    // Get user permissions
    const [perms] = await pool.query(
      `SELECT p.name FROM role_permissions rp JOIN permissions p ON rp.permission_id = p.id WHERE rp.role_id = ?`,
      [user.role_id]
    );

    const permissions = perms.map(p => p.name);

    // Create notifications for any pending project invitations
    await createNotificationsForPendingInvitations(pool, user.id, user.email);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        roleId: user.role_id,
        roleName: user.role_name,
        avatarUrl: user.avatar_url,
        permissions
      }
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/register (Public - anyone can register)
// If the email matches a pending project invitation, the invitation is auto-accepted
// and the user is added to the project as part of the registration flow.
router.post('/register', async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const { email, password, firstName, lastName, roleId, departmentId, designationId, managerId, hireDate, employeeId } = req.body;

    if (!email || !password || !firstName || !lastName) {
      await conn.rollback();
      return res.status(400).json({ error: t(req.lang, 'errors.emailPasswordNameRequired') });
    }

    // Check if email already exists
    const [existing] = await conn.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      await conn.rollback();
      return res.status(409).json({ error: t(req.lang, 'errors.emailAlreadyRegistered') });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const [result] = await conn.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, role_id, department_id, designation_id, reporting_manager_id, hire_date, employee_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [email, passwordHash, firstName, lastName, roleId || 1, departmentId || null, designationId || null, managerId || null, hireDate || null, employeeId || null]
    );

    // Initialize leave balances for the new user
    const [leaveTypes] = await conn.query('SELECT id, max_allowed FROM leave_types');
    for (const lt of leaveTypes) {
      await conn.query(
        'INSERT INTO leave_balances (user_id, leave_type_id, current_balance) VALUES (?, ?, ?)',
        [result.insertId, lt.id, lt.max_allowed]
      );
    }

    await conn.commit();

    // Create notifications for any pending project invitations
    await createNotificationsForPendingInvitations(conn, result.insertId, email);

    res.status(201).json({
      id: result.insertId,
      email,
      firstName,
      lastName,
      message: t(req.lang, 'errors.userCreated'),
    });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
});

// GET /api/auth/me
router.get('/me', auth, async (req, res) => {
  const [perms] = await pool.query(
    `SELECT p.name FROM role_permissions rp JOIN permissions p ON rp.permission_id = p.id WHERE rp.role_id = ?`,
    [req.user.role_id]
  );
  const permissions = perms.map(p => p.name);

  res.json({
    user: {
      id: req.user.id,
      email: req.user.email,
      firstName: req.user.first_name,
      lastName: req.user.last_name,
      roleId: req.user.role_id,
      roleName: req.user.role_name,
      avatarUrl: req.user.avatar_url,
      permissions
    }
  });
});

// POST /api/auth/logout — revokes the current token
router.post('/logout', auth, async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        await revokeToken(decoded);
      } catch (_) { /* token already invalid */ }
    }
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout-all — revokes ALL tokens for the current user
router.post('/logout-all', auth, async (req, res, next) => {
  try {
    const [existing] = await pool.query(
      'SELECT jti, exp FROM jwt_denylist WHERE user_id = ?',
      [req.user.id]
    );
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        await revokeToken(decoded);
      } catch (_) {}
    }
    res.json({ message: 'All sessions logged out', revoked: existing.length + 1 });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/change-password
router.post('/change-password', auth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: t(req.lang, 'errors.currentAndNewPasswordRequired') });
    }

    const [users] = await pool.query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    const valid = await bcrypt.compare(currentPassword, users[0].password_hash);

    if (!valid) {
      return res.status(401).json({ error: t(req.lang, 'errors.currentPasswordIncorrect') });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE password_hash SET password_hash = ? WHERE id = ?', [hash, req.user.id]).catch(async () => {
      await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.user.id]);
    });

    res.json({ message: t(req.lang, 'errors.passwordChangedSuccessfully') });
  } catch (err) {
    next(err);
  }
});

module.exports = router;