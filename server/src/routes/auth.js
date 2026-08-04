const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');
const pool = require('../config/database');
const { auth, JWT_SECRET, revokeToken } = require('../middleware/auth');
const { t } = require('../i18n');
const { sendEmail } = require('../utils/mailer');
const { emailVerificationEmail, passwordResetEmail } = require('../utils/emailTemplates');

const SITE_URL = process.env.SITE_URL || 'https://seravavatar-hub.95.217.8.52.nip.io';
const VERIFICATION_TTL_HOURS = 24;
const RESET_TTL_HOURS = 1;

// Helper: create notifications for pending invitations (only if not already notified)
async function createNotificationsForPendingInvitations(conn, userId, email) {
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

// Helper: figure out which role to assign on registration.
// First user → Administrator (auto-create if missing).
// Subsequent users → User (auto-create if missing).
async function resolveRegistrationRole(conn) {
  const [[{ count }]] = await conn.query('SELECT COUNT(*) AS count FROM users');

  // Ensure both system roles exist (defensive — migration already creates them).
  await conn.query(
    `INSERT IGNORE INTO roles (id, name, description) VALUES
       (1, 'Administrator', 'Full system access — all permissions'),
       (2, 'User',          'Basic employee access')`
  );
  // Ensure Administrator has all permissions if it was just created or empty.
  if (count === 0) {
    await conn.query(
      `INSERT IGNORE INTO role_permissions (role_id, permission_id)
         SELECT 1, id FROM permissions`
    );
  }

  const roleName = count === 0 ? 'Administrator' : 'User';
  const [[role]] = await conn.query('SELECT id FROM roles WHERE name = ? LIMIT 1', [roleName]);
  if (!role) {
    throw new Error(`System role "${roleName}" is missing`);
  }
  return role.id;
}

// Helper: send the verification email. Logs to email_logs even on failure.
async function sendVerificationEmail(user, token) {
  const verificationUrl = `${SITE_URL}/verify-email/${token}`;
  const { subject, text, html } = emailVerificationEmail({
    userName: user.first_name,
    verificationUrl,
    expiresHours: VERIFICATION_TTL_HOURS,
  });
  return sendEmail({
    to: user.email,
    toName: `${user.first_name} ${user.last_name}`.trim(),
    subject,
    text,
    html,
    type: 'email_verification',
    relatedId: user.id,
    relatedType: 'user',
  });
}

// Helper: shape the user object the API returns to the client.
function shapeUser(user, permissions, emailVerified) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    roleId: user.role_id,
    roleName: user.role_name,
    avatarUrl: user.avatar_url,
    emailVerified: !!emailVerified,
    permissions,
  };
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

    const jti = randomUUID();
    const token = jwt.sign({ userId: user.id, roleId: user.role_id, jti }, JWT_SECRET, { expiresIn: '7d' });

    const [perms] = await pool.query(
      `SELECT p.name FROM role_permissions rp JOIN permissions p ON rp.permission_id = p.id WHERE rp.role_id = ?`,
      [user.role_id]
    );
    const permissions = perms.map(p => p.name);

    // Notify about any pending project invitations
    await createNotificationsForPendingInvitations(pool, user.id, user.email);

    res.json({
      token,
      user: shapeUser(user, permissions, user.email_verified_at),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/register (Public - anyone can register)
// First user → Administrator role + all permissions.
// Subsequent users → User role + curated 14-permission subset.
// Every registration marks the email unverified and sends a verification link.
router.post('/register', async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const {
      email, password, firstName, lastName,
      departmentId, designation, managerId, hireDate, employeeId,
    } = req.body;

    if (!email || !password || !firstName || !lastName) {
      await conn.rollback();
      return res.status(400).json({ error: t(req.lang, 'errors.emailPasswordNameRequired') });
    }

    const [existing] = await conn.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      await conn.rollback();
      return res.status(409).json({ error: t(req.lang, 'errors.emailAlreadyRegistered') });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const roleId = await resolveRegistrationRole(conn);
    const verificationToken = randomUUID();
    const expiresAt = new Date(Date.now() + VERIFICATION_TTL_HOURS * 60 * 60 * 1000)
      .toISOString().slice(0, 19).replace('T', ' ');

    const [result] = await conn.query(
      `INSERT INTO users
         (email, password_hash, first_name, last_name,
          role_id, department_id, designation, reporting_manager_id,
          hire_date, employee_id,
          email_verified_at, email_verification_token, email_verification_expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
      [
        email, passwordHash, firstName, lastName,
        roleId,
        departmentId || null, designation || null, managerId || null,
        hireDate || null, employeeId || null,
        verificationToken, expiresAt,
      ]
    );
    const newUserId = result.insertId;

    await conn.commit();

    // Send the verification email after commit (so a mailer failure
    // doesn't roll back the registration).
    const emailResult = await sendVerificationEmail(
      { id: newUserId, email, first_name: firstName, last_name: lastName },
      verificationToken
    );

    // Notify about pending project invitations
    await createNotificationsForPendingInvitations(pool, newUserId, email);

    res.status(201).json({
      id: newUserId,
      email,
      firstName,
      lastName,
      message: t(req.lang, 'errors.userCreated'),
      verification: {
        sent: emailResult.ok,
        previewUrl: emailResult.previewUrl || null,
        expiresInHours: VERIFICATION_TTL_HOURS,
      },
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
    user: shapeUser(req.user, permissions, req.user.email_verified_at),
  });
});

// POST /api/auth/verify-email  (Public — token in body)
router.post('/verify-email', async (req, res, next) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ error: t(req.lang, 'errors.verificationTokenRequired') });
    }

    const [rows] = await pool.query(
      `SELECT id, email, first_name, last_name, email_verified_at, email_verification_expires_at
         FROM users
         WHERE email_verification_token = ?
         LIMIT 1`,
      [token]
    );
    if (rows.length === 0) {
      return res.status(400).json({ error: t(req.lang, 'errors.invalidVerificationToken') });
    }
    const user = rows[0];

    if (user.email_verified_at) {
      return res.status(200).json({
        alreadyVerified: true,
        message: t(req.lang, 'errors.emailAlreadyVerified'),
      });
    }

    if (user.email_verification_expires_at && new Date(user.email_verification_expires_at) < new Date()) {
      return res.status(400).json({ error: t(req.lang, 'errors.verificationTokenExpired') });
    }

    await pool.query(
      `UPDATE users
         SET email_verified_at = NOW(),
             email_verification_token = NULL,
             email_verification_expires_at = NULL
         WHERE id = ?`,
      [user.id]
    );

    res.json({
      verified: true,
      message: t(req.lang, 'errors.emailVerifiedSuccessfully'),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/resend-verification  (Auth — current user)
router.post('/resend-verification', auth, async (req, res, next) => {
  try {
    const user = req.user;
    if (user.email_verified_at) {
      return res.status(400).json({ error: t(req.lang, 'errors.emailAlreadyVerified') });
    }

    const verificationToken = randomUUID();
    const expiresAt = new Date(Date.now() + VERIFICATION_TTL_HOURS * 60 * 60 * 1000)
      .toISOString().slice(0, 19).replace('T', ' ');

    await pool.query(
      `UPDATE users
         SET email_verification_token = ?,
             email_verification_expires_at = ?
         WHERE id = ?`,
      [verificationToken, expiresAt, user.id]
    );

    const emailResult = await sendVerificationEmail(
      { id: user.id, email: user.email, first_name: user.first_name, last_name: user.last_name },
      verificationToken
    );

    res.json({
      sent: emailResult.ok,
      previewUrl: emailResult.previewUrl || null,
      expiresInHours: VERIFICATION_TTL_HOURS,
      message: t(req.lang, 'errors.verificationEmailResent'),
    });
  } catch (err) {
    next(err);
  }
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

// POST /api/auth/forgot-password — send password reset email
router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: t(req.lang, 'errors.emailRequired') });
    }

    const [users] = await pool.query(
      'SELECT id, email, first_name, last_name FROM users WHERE email = ? LIMIT 1',
      [email]
    );

    // Always return 200 to prevent email enumeration attacks
    if (users.length === 0) {
      return res.json({ message: t(req.lang, 'errors.passwordResetEmailSent') });
    }

    const user = users[0];
    const resetToken = randomUUID();
    const expiresAt = new Date(Date.now() + RESET_TTL_HOURS * 60 * 60 * 1000)
      .toISOString().slice(0, 19).replace('T', ' ');

    await pool.query(
      'UPDATE users SET password_reset_token = ?, password_reset_expires_at = ? WHERE id = ?',
      [resetToken, expiresAt, user.id]
    );

    const resetUrl = `${SITE_URL}/reset-password/${resetToken}`;
    const { subject, text, html } = passwordResetEmail({
      userName: `${user.first_name} ${user.last_name}`.trim(),
      resetUrl,
      expiresHours: RESET_TTL_HOURS,
    });

    const emailResult = await sendEmail({
      to: user.email,
      toName: `${user.first_name} ${user.last_name}`.trim(),
      subject,
      text,
      html,
      type: 'password_reset',
      relatedId: user.id,
      relatedType: 'user',
    });

    res.json({
      message: t(req.lang, 'errors.passwordResetEmailSent'),
      previewUrl: emailResult.previewUrl || null,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/reset-password — reset password with token
router.post('/reset-password', async (req, res, next) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ error: t(req.lang, 'errors.tokenAndPasswordRequired') });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: t(req.lang, 'errors.passwordTooShort') });
    }

    const [users] = await pool.query(
      `SELECT id, email, first_name, last_name, password_reset_expires_at
       FROM users
       WHERE password_reset_token = ?
       LIMIT 1`,
      [token]
    );

    if (users.length === 0) {
      return res.status(400).json({ error: t(req.lang, 'errors.invalidResetToken') });
    }

    const user = users[0];

    if (!user.password_reset_expires_at || new Date(user.password_reset_expires_at) < new Date()) {
      return res.status(400).json({ error: t(req.lang, 'errors.resetTokenExpired') });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query(
      `UPDATE users
         SET password_hash = ?,
             password_reset_token = NULL,
             password_reset_expires_at = NULL
         WHERE id = ?`,
      [hash, user.id]
    );

    res.json({ message: t(req.lang, 'errors.passwordResetSuccess') });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
