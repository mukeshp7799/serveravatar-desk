const express = require('express');
const pool = require('../config/database');
const { auth } = require('../middleware/auth');
const { t, translateNotifications } = require('../i18n');

const router = express.Router();

// GET /api/notifications — translates title/message via stored i18n keys
// Also returns pending project invitations as notification items
router.get('/', auth, async (req, res, next) => {
  try {
    const [notifications] = await pool.query(
      'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
      [req.user.id]
    );

    // Also fetch pending project invitations for this user's email that don't have a notification yet
    const [pendingInvs] = await pool.query(
      `SELECT pi.id, pi.project_id, pi.token, pi.role_in_project, pi.expires_at, pi.created_at,
              p.name AS project_name, p.description AS project_description,
              u.first_name AS inviter_first_name, u.last_name AS inviter_last_name
       FROM project_invitations pi
       JOIN projects p ON pi.project_id = p.id
       JOIN users u ON pi.invited_by = u.id
       WHERE LOWER(pi.email) = ? AND pi.status = 'pending' AND pi.expires_at > NOW()
       ORDER BY pi.created_at DESC`,
      [req.user.email.toLowerCase()]
    );

    // Filter out invitations that already have a notification
    const notifiedIds = new Set(
      notifications
        .filter(n => n.type === 'project_invitation')
        .map(n => {
          try { return JSON.parse(n.params || '{}').invitation_id } catch { return null }
        })
        .filter(Boolean)
    );
    const unnotifiedInvs = pendingInvs.filter(inv => !notifiedIds.has(inv.id));

    // Build invitation-as-notification items
    const invitationItems = unnotifiedInvs.map(inv => {
      const inviterName = [inv.inviter_first_name, inv.inviter_last_name].filter(Boolean).join(' ') || req.user.email;
      return {
        id: `inv_${inv.id}`,
        type: 'project_invitation',
        title: 'Project Invitation',
        message: `You've been invited to join "${inv.project_name}" as ${inv.role_in_project || 'Member'} by ${inviterName}.`,
        link: `/invitation-confirm/${inv.token}`,
        is_read: false,
        created_at: inv.created_at,
        is_invitation: true,
        invitation_id: inv.id,
        invitation_token: inv.token,
        project_name: inv.project_name,
        project_id: inv.project_id,
        role_in_project: inv.role_in_project,
        inviter_name: inviterName,
        expires_at: inv.expires_at,
      };
    });

    const [unreadCount] = await pool.query(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = FALSE',
      [req.user.id]
    );
    // Unread count also includes unnotified pending invitations
    const totalUnread = unreadCount[0].count + unnotifiedInvs.length;

    res.json({
      notifications: translateNotifications(notifications, req.lang),
      pendingInvitations: invitationItems,
      unreadCount: totalUnread,
    });
  } catch (err) { next(err); }
});

// PUT /api/notifications/:id/read
router.put('/:id/read', auth, async (req, res, next) => {
  try {
    const id = req.params.id;
    if (id.startsWith('inv_')) {
      // Pending invitation clicked — create a read notification entry for it
      const invitationId = parseInt(id.replace('inv_', ''), 10);
      const [[inv]] = await pool.query(
        'SELECT id, token FROM project_invitations WHERE id = ? AND LOWER(email) = ?',
        [invitationId, req.user.email.toLowerCase()]
      );
      if (inv) {
        await pool.query(
          `INSERT INTO notifications (user_id, type, title, message, link, is_read, created_at)
           VALUES (?, 'project_invitation', 'Project Invitation', 'Invitation seen.', CONCAT('/invitation-confirm/', ?), TRUE, NOW())`,
          [req.user.id, inv.token]
        );
      }
      return res.json({ message: t(req.lang, 'errors.notificationMarkedRead') });
    }
    await pool.query('UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    res.json({ message: t(req.lang, 'errors.notificationMarkedRead') });
  } catch (err) { next(err); }
});

// PUT /api/notifications/read-all
router.put('/read-all', auth, async (req, res, next) => {
  try {
    await pool.query('UPDATE notifications SET is_read = TRUE WHERE user_id = ?', [req.user.id]);
    // Mark all pending invitations as seen (create read notification for each)
    const [pendingInvs] = await pool.query(
      `SELECT pi.id, pi.token FROM project_invitations pi
       WHERE LOWER(pi.email) = ? AND pi.status = 'pending' AND pi.expires_at > NOW()
       AND pi.id NOT IN (
         SELECT COALESCE(JSON_EXTRACT(params, '$.invitation_id'), 0) FROM notifications
         WHERE user_id = ? AND type = 'project_invitation'
       )`,
      [req.user.email.toLowerCase(), req.user.id]
    );
    for (const inv of pendingInvs) {
      await pool.query(
        `INSERT INTO notifications (user_id, type, title, message, link, is_read, created_at)
         VALUES (?, 'project_invitation', 'Project Invitation', 'Invitation seen.', CONCAT('/invitation-confirm/', ?), TRUE, NOW())`,
        [req.user.id, inv.token]
      );
    }
    res.json({ message: t(req.lang, 'errors.allNotificationsMarkedRead') });
  } catch (err) { next(err); }
});

module.exports = router;
