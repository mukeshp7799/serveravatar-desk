/**
 * Token-based invitation routes (public + admin actions).
 * Mounted at /api/invitations/*
 *
 * Public:
 *   GET  /api/invitations/:token          — get invitation details (no auth needed)
 *   POST /api/invitations/:token/accept   — accept invitation (auth required)
 *   POST /api/invitations/:token/decline  — decline invitation (auth required)
 *
 * Authenticated (project-level):
 *   PUT  /api/invitations/:id/resend       — resend invitation email
 *   DELETE /api/invitations/:id           — cancel invitation
 */

const express = require('express');
const crypto = require('crypto');
const pool = require('../config/database');
const { auth } = require('../middleware/auth');
const { isProjectMember } = require('../middleware/projectMember');
const { t } = require('../i18n');
const { recordActivity } = require('../utils/activity');
const { sendEmail } = require('../utils/mailer');
const { projectInvitationEmail } = require('../utils/emailTemplates');

const router = express.Router();
const SITE_URL = process.env.SITE_URL || 'https://seravavatar-hub.95.217.8.52.nip.io';
const INVITATION_EXPIRY_DAYS = 7;
const INVITATION_EXPIRY_MS = INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function invitationUrl(token) {
  return `${SITE_URL}/invitation/${token}`;
}

// ─── Public: token lookup ─────────────────────────────────────────────────────

// GET /api/invitations/:token
router.get('/:token', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT pi.id, pi.project_id, pi.email, pi.role_in_project, pi.status,
              pi.expires_at, pi.created_at,
              p.name AS project_name, p.description AS project_description,
              u.first_name AS inviter_first_name, u.last_name AS inviter_last_name,
              u.email AS inviter_email
       FROM project_invitations pi
       JOIN projects p ON pi.project_id = p.id
       JOIN users u ON pi.invited_by = u.id
       WHERE pi.token = ?`,
      [req.params.token]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: t(req.lang, 'errors.invitationNotFound') });
    }

    const inv = rows[0];

    if (inv.status === 'cancelled') {
      return res.status(410).json({ error: t(req.lang, 'errors.invitationCancelled') });
    }
    if (inv.status === 'declined') {
      return res.status(410).json({ error: t(req.lang, 'errors.invitationDeclined') });
    }
    if (inv.status === 'accepted') {
      return res.status(410).json({ error: t(req.lang, 'errors.invitationAlreadyAccepted') });
    }
    if (new Date(inv.expires_at) < new Date()) {
      return res.status(410).json({ error: t(req.lang, 'errors.invitationExpired') });
    }

    const inviterName = [inv.inviter_first_name, inv.inviter_last_name].filter(Boolean).join(' ').trim() || inv.inviter_email;

    res.json({
      invitation: {
        id: inv.id,
        token: inv.token,  // the token itself (URL param)
        projectId: inv.project_id,
        projectName: inv.project_name,
        projectDescription: inv.project_description,
        email: inv.email,
        roleInProject: inv.role_in_project,
        inviterName,
        inviterEmail: inv.inviter_email,
        status: inv.status,
        expiresAt: inv.expires_at,
        createdAt: inv.created_at,
      },
    });
  } catch (err) { next(err); }
});

// ─── Authenticated: accept / decline ──────────────────────────────────────────

// POST /api/invitations/:token/accept
router.post('/:token/accept', auth, async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[inv]] = await conn.query(
      `SELECT pi.*, p.name AS project_name
       FROM project_invitations pi
       JOIN projects p ON pi.project_id = p.id
       WHERE pi.token = ?`,
      [req.params.token]
    );

    if (!inv) {
      await conn.rollback();
      return res.status(404).json({ error: t(req.lang, 'errors.invitationNotFound') });
    }

    if (inv.status === 'cancelled') {
      await conn.rollback();
      return res.status(410).json({ error: t(req.lang, 'errors.invitationCancelled') });
    }
    if (inv.status === 'declined') {
      await conn.rollback();
      return res.status(410).json({ error: t(req.lang, 'errors.invitationDeclined') });
    }
    if (inv.status === 'accepted') {
      await conn.rollback();
      return res.status(410).json({ error: t(req.lang, 'errors.invitationAlreadyAccepted') });
    }
    if (new Date(inv.expires_at) < new Date()) {
      await conn.rollback();
      return res.status(410).json({ error: t(req.lang, 'errors.invitationExpired') });
    }

    const userEmail = req.user.email.toLowerCase();
    const invEmail = inv.email.toLowerCase();
    if (userEmail !== invEmail) {
      await conn.rollback();
      return res.status(403).json({ error: t(req.lang, 'errors.invitationEmailMismatch') });
    }

    // Mark invitation accepted
    await conn.query(
      `UPDATE project_invitations SET status = 'accepted', accepted_user_id = ?, updated_at = NOW() WHERE id = ?`,
      [req.user.id, inv.id]
    );

    // Ensure user is active
    await conn.query(`UPDATE users SET status = 'active' WHERE id = ?`, [req.user.id]);

    // Upsert project_members entry
    const [[existing]] = await conn.query(
      `SELECT id FROM project_members WHERE project_id = ? AND user_id = ?`,
      [inv.project_id, req.user.id]
    );
    if (existing) {
      await conn.query(
        `UPDATE project_members SET role_in_project = ?, status = 'active' WHERE project_id = ? AND user_id = ?`,
        [inv.role_in_project, inv.project_id, req.user.id]
      );
    } else {
      await conn.query(
        `INSERT INTO project_members (project_id, user_id, role_in_project, status) VALUES (?, ?, ?, 'active')`,
        [inv.project_id, req.user.id, inv.role_in_project]
      );
    }

    // Remove any notification for this invitation (accepted → no longer pending)
    await conn.query(
      `DELETE FROM notifications WHERE user_id = ? AND type = 'project_invitation' AND JSON_EXTRACT(params, '$.invitation_id') = ?`,
      [req.user.id, inv.id]
    );

    await conn.commit();

    // Record activity
    await recordActivity(pool, {
      projectId: inv.project_id,
      actorId: req.user.id,
      feature: 'team',
      action: 'joined',
      targetType: 'member',
      targetId: req.user.id,
      targetLabel: `${req.user.first_name} ${req.user.last_name}`.trim() || req.user.email,
    });

    res.json({
      message: t(req.lang, 'errors.invitationAccepted'),
      projectId: inv.project_id,
      projectName: inv.project_name,
    });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
});

// POST /api/invitations/:token/decline
router.post('/:token/decline', auth, async (req, res, next) => {
  try {
    const [[inv]] = await pool.query(
      `SELECT * FROM project_invitations WHERE token = ?`,
      [req.params.token]
    );

    if (!inv) return res.status(404).json({ error: t(req.lang, 'errors.invitationNotFound') });
    if (inv.status !== 'pending') {
      return res.status(400).json({ error: t(req.lang, 'errors.invitationNotPending') });
    }
    if (new Date(inv.expires_at) < new Date()) {
      return res.status(410).json({ error: t(req.lang, 'errors.invitationExpired') });
    }

    const userEmail = req.user.email.toLowerCase();
    const invEmail = inv.email.toLowerCase();
    if (userEmail !== invEmail) {
      return res.status(403).json({ error: t(req.lang, 'errors.invitationEmailMismatch') });
    }

    await pool.query(
      `UPDATE project_invitations SET status = 'declined', updated_at = NOW() WHERE id = ?`,
      [inv.id]
    );

    // Remove any notification for this invitation (declined → no longer pending)
    await pool.query(
      `DELETE FROM notifications WHERE user_id = ? AND type = 'project_invitation' AND JSON_EXTRACT(params, '$.invitation_id') = ?`,
      [req.user.id, inv.id]
    );

    // Record activity
    await recordActivity(pool, {
      projectId: inv.project_id,
      actorId: req.user.id,
      feature: 'team',
      action: 'declined_invitation',
      targetType: 'member',
      targetId: inv.project_id,
      targetLabel: inv.email,
    });

    res.json({ message: t(req.lang, 'errors.invitationDeclined') });
  } catch (err) { next(err); }
});

// ─── Authenticated: admin actions on invitations ───────────────────────────────

// PUT /api/invitations/:id/resend
router.put('/:id/resend', auth, async (req, res, next) => {
  try {
    const [[inv]] = await pool.query(
      `SELECT pi.*, p.name AS project_name, u.first_name AS inviter_first_name,
              u.last_name AS inviter_last_name, u.email AS inviter_email
       FROM project_invitations pi
       JOIN projects p ON pi.project_id = p.id
       JOIN users u ON pi.invited_by = u.id
       WHERE pi.id = ?`,
      [req.params.id]
    );

    if (!inv) return res.status(404).json({ error: t(req.lang, 'errors.invitationNotFound') });
    if (inv.status !== 'pending') {
      return res.status(400).json({ error: t(req.lang, 'errors.invitationNotPending') });
    }

    // Only project members can resend
    const isMember = await isProjectMember(inv.project_id, req.user.id);
    if (!isMember) return res.status(403).json({ error: t(req.lang, 'errors.permissionDenied') });

    // Generate fresh token + extend expiry
    const token = generateToken();
    const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_MS);

    await pool.query(
      `UPDATE project_invitations SET token = ?, expires_at = ?, updated_at = NOW() WHERE id = ?`,
      [token, expiresAt, req.params.id]
    );

    const inviterName = [inv.inviter_first_name, inv.inviter_last_name].filter(Boolean).join(' ').trim() || inv.inviter_email;

    const { subject, text, html } = projectInvitationEmail({
      inviteeEmail: inv.email,
      inviterName,
      projectName: inv.project_name,
      roleInProject: inv.role_in_project,
      invitationUrl: invitationUrl(token),
      expiresDays: INVITATION_EXPIRY_DAYS,
    });

    const emailResult = await sendEmail({
      to: inv.email,
      subject,
      html,
      text,
      type: 'project_invitation',
      relatedId: inv.id,
      relatedType: 'project_invitation',
      triggeredByUserId: req.user.id,
    });

    res.json({
      message: t(req.lang, 'errors.invitationResent'),
      previewUrl: emailResult.previewUrl,
    });
  } catch (err) { next(err); }
});

// DELETE /api/invitations/:id  (cancel)
router.delete('/:id', auth, async (req, res, next) => {
  try {
    const [[inv]] = await pool.query(
      `SELECT id, project_id, status, email FROM project_invitations WHERE id = ?`,
      [req.params.id]
    );

    if (!inv) return res.status(404).json({ error: t(req.lang, 'errors.invitationNotFound') });
    if (inv.status !== 'pending') {
      return res.status(400).json({ error: t(req.lang, 'errors.invitationNotPending') });
    }

    // Only project members can cancel
    const isMember = await isProjectMember(inv.project_id, req.user.id);
    if (!isMember) return res.status(403).json({ error: t(req.lang, 'errors.permissionDenied') });

    await pool.query(
      `UPDATE project_invitations SET status = 'cancelled', updated_at = NOW() WHERE id = ?`,
      [req.params.id]
    );

    // Record activity
    await recordActivity(pool, {
      projectId: inv.project_id,
      actorId: req.user.id,
      feature: 'team',
      action: 'cancelled_invitation',
      targetType: 'member',
      targetId: inv.project_id,
      targetLabel: inv.email,
    });

    res.json({ message: t(req.lang, 'errors.invitationCancelled') });
  } catch (err) { next(err); }
});


// GET /api/invitations/by-email/:email  — get pending invitations for an email (auth required)
router.get('/by-email/:email', auth, async (req, res, next) => {
  try {
    const emailLower = (req.params.email || '').toLowerCase();
    // Only allow users to look up their own email
    if (emailLower !== req.user.email.toLowerCase()) {
      return res.status(403).json({ error: t(req.lang, 'errors.permissionDenied') });
    }

    const [rows] = await pool.query(
      `SELECT pi.id, pi.project_id, pi.email, pi.role_in_project, pi.status,
              pi.expires_at, pi.created_at,
              p.name AS project_name, p.description AS project_description,
              u.first_name AS inviter_first_name, u.last_name AS inviter_last_name,
              u.email AS inviter_email
       FROM project_invitations pi
       JOIN projects p ON pi.project_id = p.id
       JOIN users u ON pi.invited_by = u.id
       WHERE LOWER(pi.email) = ?
         AND pi.status = 'pending'
         AND pi.expires_at > NOW()
       ORDER BY pi.created_at DESC`,
      [emailLower]
    );

    const invitations = rows.map((r) => {
      const inviterName = [r.inviter_first_name, r.inviter_last_name].filter(Boolean).join(' ').trim() || r.inviter_email;
      return {
        id: r.id,
        token: r.token,  // needed for accept/decline from banner
        projectId: r.project_id,
        projectName: r.project_name,
        projectDescription: r.project_description,
        email: r.email,
        roleInProject: r.role_in_project,
        status: r.status,
        inviterName,
        inviterEmail: r.inviter_email,
        expiresAt: r.expires_at,
        isExpired: new Date(r.expires_at) < new Date(),
        createdAt: r.created_at,
      };
    });

    res.json({ invitations });
  } catch (err) { next(err); }
});

module.exports = router;
