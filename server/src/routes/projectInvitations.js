/**
 * Project-scoped invitation routes.
 * Mounted at /api/projects/:id/invitations
 *
 * POST   /api/projects/:id/invitations  — create invitation + send email
 * GET    /api/projects/:id/invitations   — list invitations for project
 */

const express = require('express');
const crypto = require('crypto');
const pool = require('../config/database');
const { auth } = require('../middleware/auth');
const { isProjectMember } = require('../middleware/projectMember');
const { t } = require('../i18n');
const { sendEmail } = require('../utils/mailer');
const { projectInvitationEmail } = require('../utils/emailTemplates');
const { recordActivity } = require('../utils/activity');

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

// POST /api/projects/:id/invitations
router.post('/:id/invitations', auth, async (req, res, next) => {
  try {
    const { email, roleInProject } = req.body;

    if (!email) return res.status(400).json({ error: t(req.lang, 'errors.emailRequired') });
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!emailOk) return res.status(400).json({ error: t(req.lang, 'errors.invalidEmail') });

    // Only project members (or owner) can invite
    const isMember = await isProjectMember(req.params.id, req.user.id);
    if (!isMember) return res.status(403).json({ error: t(req.lang, 'errors.permissionDenied') });

    // Check project exists
    const [[proj]] = await pool.query('SELECT id, name, manager_id FROM projects WHERE id = ?', [req.params.id]);
    if (!proj) return res.status(404).json({ error: t(req.lang, 'errors.projectNotFound') });

    // Check if already a member
    const [[existingMember]] = await pool.query(
      `SELECT pm.id FROM project_members pm JOIN users u ON pm.user_id = u.id
       WHERE pm.project_id = ? AND u.email = ?`,
      [req.params.id, email]
    );
    if (existingMember) {
      return res.status(409).json({ error: t(req.lang, 'errors.memberAlreadyExists') });
    }

    // Check if this email belongs to an existing active user — if so, add directly.
    const [[existingUser]] = await pool.query(
      `SELECT id FROM users WHERE email = ? AND status = 'active'`,
      [email]
    );
    if (existingUser) {
      // Add as a project member directly (no invitation needed)
      await pool.query(
        `INSERT INTO project_members (project_id, user_id, role_in_project) VALUES (?, ?, ?)`,
        [req.params.id, existingUser.id, roleInProject || 'member']
      );
      // Record activity
      const [[newMember]] = await pool.query(
        'SELECT first_name, last_name, email FROM users WHERE id = ?',
        [existingUser.id]
      );
      const memberLabel = newMember
        ? `${newMember.first_name || ''} ${newMember.last_name || ''}`.trim() || newMember.email
        : `user #${existingUser.id}`;
      await recordActivity(pool, {
        projectId: Number(req.params.id),
        actorId: req.user.id,
        feature: 'team',
        action: 'member_added',
        targetType: 'member',
        targetId: existingUser.id,
        targetLabel: memberLabel,
      });
      return res.status(201).json({
        id: null,
        email,
        roleInProject: roleInProject || 'member',
        status: 'added_directly',
        message: t(req.lang, 'errors.memberAdded'),
      });
    }

    // Cancel any existing pending invitation for this (project, email)
    await pool.query(
      `UPDATE project_invitations SET status = 'cancelled', updated_at = NOW()
       WHERE project_id = ? AND email = ? AND status = 'pending'`,
      [req.params.id, email]
    );

    const token = generateToken();
    const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_MS);

    const [result] = await pool.query(
      `INSERT INTO project_invitations (project_id, email, token, invited_by, role_in_project, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.params.id, email, token, req.user.id, roleInProject || 'member', expiresAt]
    );

    // Get inviter name
    const inviterName = [req.user.first_name, req.user.last_name].filter(Boolean).join(' ').trim() || req.user.email;

    // Send invitation email
    const { subject, text, html } = projectInvitationEmail({
      inviteeEmail: email,
      inviterName,
      projectName: proj.name,
      roleInProject: roleInProject || 'Member',
      invitationUrl: invitationUrl(token),
      expiresDays: INVITATION_EXPIRY_DAYS,
    });

    const emailResult = await sendEmail({
      to: email,
      subject,
      html,
      text,
      type: 'project_invitation',
      relatedId: result.insertId,
      relatedType: 'project_invitation',
      triggeredByUserId: req.user.id,
    });

    res.status(201).json({
      id: result.insertId,
      token,
      email,
      roleInProject: roleInProject || 'member',
      status: 'pending',
      expiresAt,
      previewUrl: emailResult.previewUrl,
      message: t(req.lang, 'errors.invitationSent'),
    });
  } catch (err) { next(err); }
});

// GET /api/projects/:id/invitations
router.get('/:id/invitations', auth, async (req, res, next) => {
  try {
    const isMember = await isProjectMember(req.params.id, req.user.id);
    if (!isMember) return res.status(403).json({ error: t(req.lang, 'errors.permissionDenied') });

    const [rows] = await pool.query(
      `SELECT pi.id, pi.email, pi.role_in_project, pi.status,
              pi.accepted_user_id, pi.expires_at, pi.created_at, pi.updated_at,
              u.first_name AS inviter_first_name, u.last_name AS inviter_last_name,
              u.email AS inviter_email,
              au.first_name AS accepted_first_name, au.last_name AS accepted_last_name
       FROM project_invitations pi
       JOIN users u ON pi.invited_by = u.id
       LEFT JOIN users au ON pi.accepted_user_id = au.id
       WHERE pi.project_id = ?
       ORDER BY pi.created_at DESC`,
      [req.params.id]
    );

    const invitations = rows.map((r) => {
      const inviterName = [r.inviter_first_name, r.inviter_last_name].filter(Boolean).join(' ').trim() || r.inviter_email;
      const acceptedName = r.accepted_user_id
        ? [r.accepted_first_name, r.accepted_last_name].filter(Boolean).join(' ').trim() || null
        : null;
      return {
        id: r.id,
        email: r.email,
        roleInProject: r.role_in_project,
        status: r.status,
        inviterName,
        inviterEmail: r.inviter_email,
        acceptedUserId: r.accepted_user_id,
        acceptedName,
        expiresAt: r.expires_at,
        isExpired: new Date(r.expires_at) < new Date(),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      };
    });

    res.json({ invitations });
  } catch (err) { next(err); }
});

module.exports = router;
