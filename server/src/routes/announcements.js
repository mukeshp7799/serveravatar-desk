/**
 * Announcements Routes — Phase 8 Refactor
 * Features: audience targeting, reactions, notifications, auto-archiving, rich status management.
 */
const express = require('express');
const pool = require('../config/database');
const { auth, requirePermission } = require('../middleware/auth');
const { t } = require('../i18n');
const { getCompanySetting, nowInTimezone, formatDateTime } = require('../utils/timezone');
const { isNotificationAllowed } = require('../utils/notificationPreferences');

const router = express.Router();

// ============================================================
// HELPERS
// ============================================================

/** Auto-archive expired announcements (called on read endpoints) */
async function autoArchiveExpired() {
  try {
    const [result] = await pool.query(
      "UPDATE announcements SET status = 'archived' WHERE status = 'published' AND expiry_date IS NOT NULL AND expiry_date < NOW()"
    );
    if (result.affectedRows > 0) {
      console.log('[announcements] Auto-archived', result.affectedRows, 'expired announcements');
    }
  } catch (err) {
    console.error('[announcements] Auto-archive error:', err.message);
  }
}

/** Determine if a user can view a given announcement */
async function canUserViewAnnouncement(announcement, userId, userPerms) {
  // Admins/HR with manage permission can see all
  if (userPerms.includes('announcements.manage')) return true;
  // Draft — only creator or manager can see
  if (announcement.status === 'draft') {
    return announcement.posted_by === userId;
  }
  // Archived — no public visibility
  if (announcement.status === 'archived') {
    return userPerms.includes('announcements.manage');
  }
  // Published announcements
  if (announcement.audience_target === 'everyone') return true;
  if (announcement.audience_target === 'departments' && announcement.target_ids) {
    const [userRows] = await pool.query('SELECT department_id FROM users WHERE id = ?', [userId]);
    if (userRows.length > 0 && announcement.target_ids.includes(String(userRows[0].department_id))) return true;
  }
  if (announcement.audience_target === 'roles' && announcement.target_ids) {
    const [userRows] = await pool.query('SELECT role_id FROM users WHERE id = ?', [userId]);
    if (userRows.length > 0 && announcement.target_ids.includes(String(userRows[0].role_id))) return true;
  }
  if (announcement.audience_target === 'employees' && announcement.target_ids) {
    if (announcement.target_ids.includes(String(userId))) return true;
  }
  return false;
}

/** Create notifications for announcement audience */
async function createAnnouncementNotifications(announcementId, audienceTarget, targetIds, title, notifierId) {
  try {
    let userIds = [];

    if (audienceTarget === 'everyone') {
      const [rows] = await pool.query(
        "SELECT id FROM users WHERE status = 'active' AND id != ?",
        [notifierId]
      );
      userIds = rows.map(r => r.id);
    } else if (audienceTarget === 'departments' && targetIds && targetIds.length > 0) {
      const [rows] = await pool.query(
        "SELECT id FROM users WHERE department_id IN (?) AND status = 'active' AND id != ?",
        [targetIds, notifierId]
      );
      userIds = rows.map(r => r.id);
    } else if (audienceTarget === 'roles' && targetIds && targetIds.length > 0) {
      const [rows] = await pool.query(
        "SELECT id FROM users WHERE role_id IN (?) AND status = 'active' AND id != ?",
        [targetIds, notifierId]
      );
      userIds = rows.map(r => r.id);
    } else if (audienceTarget === 'employees' && targetIds && targetIds.length > 0) {
      userIds = targetIds.filter(id => String(id) !== String(notifierId));
    }

    if (userIds.length === 0) return;

    // Filter to only users who have company_announcements enabled (or no preference record)
    const [prefRows] = await pool.query(
      `SELECT user_id FROM notification_preferences
       WHERE user_id IN (?) AND company_announcements = FALSE`,
      [userIds]
    );
    const optedOut = new Set(prefRows.map(r => r.user_id));
    const eligibleUserIds = userIds.filter(id => !optedOut.has(id));

    if (eligibleUserIds.length === 0) return;

    const values = eligibleUserIds.map(uid => [
      uid, 'announcement_published', null, null,
      'New Announcement', title, '/announcements?id=' + announcementId, 0
    ]);

    await pool.query(
      'INSERT INTO notifications (user_id, type, title_key, params, title, message, link, is_read) VALUES ?',
      [values]
    );
  } catch (err) {
    console.error('[announcements] Notification creation error:', err.message);
  }
}

// ============================================================
// MIDDLEWARE
// ============================================================

router.use(auth);

// ============================================================
// GET /api/announcements
// List announcements (respects audience targeting + auto-archives expired)
// Query params: status, page, limit, audience
// ============================================================
router.get('/', async (req, res, next) => {
  try {
    await autoArchiveExpired();

    var page = parseInt(req.query.page) || 1;
    var limit = parseInt(req.query.limit) || 20;
    var offset = (page - 1) * limit;
    var statusFilter = req.query.status; // draft, published, archived
    var adminView = req.query.admin === '1'; // show all (for admins)

    var userId = req.user.id;
    var userPerms = req.user.permissions || [];
    var isAdmin = userPerms.includes('announcements.manage');

    // Base query — join to get poster name
    var selectCols = [
      'a.id', 'a.title', 'a.content', 'a.priority', 'a.status',
      'a.publish_date', 'a.expiry_date', 'a.audience_target', 'a.target_ids',
      'a.posted_by', 'a.created_at', 'a.updated_at', 'a.is_pinned',
      'u.first_name', 'u.last_name'
    ].join(', ');

    var fromJoin = 'FROM announcements a JOIN users u ON a.posted_by = u.id';
    var whereConditions = [];
    var params = [];

    if (!isAdmin) {
      // Non-admins: only published announcements they can see + their own drafts
      var audienceConditions = [];
      if (userPerms.includes('announcements.view')) {
        // Everyone-visible
        audienceConditions.push("(a.audience_target = 'everyone' AND a.status = 'published')");
        // Department-targeted
        var [deptRows] = await pool.query('SELECT department_id FROM users WHERE id = ?', [userId]);
        var userDept = deptRows[0]?.department_id;
        if (userDept) audienceConditions.push("(a.audience_target = 'departments' AND JSON_CONTAINS(a.target_ids, '" + userDept + "'))");
        // Role-targeted
        var [roleRows] = await pool.query('SELECT role_id FROM users WHERE id = ?', [userId]);
        var userRole = roleRows[0]?.role_id;
        if (userRole) audienceConditions.push("(a.audience_target = 'roles' AND JSON_CONTAINS(a.target_ids, '" + userRole + "'))");
        // Employee-targeted
        audienceConditions.push("(a.audience_target = 'employees' AND JSON_CONTAINS(a.target_ids, '" + userId + "'))");
      }
      // Own drafts
      audienceConditions.push('(a.posted_by = ' + userId + ' AND a.status = \'draft\')');

      if (audienceConditions.length > 0) {
        whereConditions.push('(' + audienceConditions.join(' OR ') + ')');
      } else {
        // No permissions at all — return empty
        res.json({ announcements: [], total: 0, page: page, limit: limit });
        return;
      }
    } else if (adminView) {
      // Admin viewing all — no audience filter
    } else {
      // Admin without adminView flag — same as regular user
    }

    if (statusFilter) {
      whereConditions.push('a.status = ?');
      params.push(statusFilter);
    }

    var whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';

    var countSql = 'SELECT COUNT(*) as total ' + fromJoin + ' ' + whereClause;
    var [countRows] = await pool.query(countSql, params);
    var total = countRows[0].total;

    var dataSql = 'SELECT ' + selectCols + ' ' + fromJoin + ' ' + whereClause + ' ORDER BY a.is_pinned DESC, a.status ASC, a.created_at DESC LIMIT ? OFFSET ?';
    var [rows] = await pool.query(dataSql, [...params, limit, offset]);

    // Fetch reaction counts + per-emoji user names for returned announcements
    var annIds = rows.map(r => r.id);
    var reactionsMap = {};
    if (annIds.length > 0) {
      // Per-emoji user details for tooltip (chronological)
      var [reactionRows] = await pool.query(
        `SELECT ar.announcement_id, ar.emoji, ar.user_id,
                u.first_name, u.last_name, u.email
         FROM announcement_reactions ar
         JOIN users u ON ar.user_id = u.id
         WHERE ar.announcement_id IN (?)
         ORDER BY ar.created_at ASC`,
        [annIds]
      );
      var [reactionCounts] = await pool.query(
        `SELECT announcement_id, emoji, COUNT(*) as count,
                MAX(user_id = ?) AS mine
         FROM announcement_reactions
         WHERE announcement_id IN (?)
         GROUP BY announcement_id, emoji`,
        [userId, annIds]
      );

      // Seed map with count + mine per (announcement_id, emoji)
      reactionCounts.forEach(rc => {
        if (!reactionsMap[rc.announcement_id]) reactionsMap[rc.announcement_id] = {};
        reactionsMap[rc.announcement_id][rc.emoji] = {
          emoji: rc.emoji,
          count: rc.count,
          mine: !!rc.mine,
          users: [],
          userEmojis: [],
        };
      });

      // Fill in user names for each emoji
      reactionRows.forEach(rr => {
        const grp = reactionsMap[rr.announcement_id] && reactionsMap[rr.announcement_id][rr.emoji];
        if (!grp) return;
        const name = [rr.first_name, rr.last_name].filter(Boolean).join(' ').trim() || rr.email || 'Unknown';
        grp.users.push(name);
      });
    }

    var announcements = rows.map(r => ({
      id: r.id,
      title: r.title,
      content: r.content,
      priority: r.priority,
      status: r.status,
      publish_date: r.publish_date,
      expiry_date: r.expiry_date,
      audience_target: r.audience_target,
      target_ids: typeof r.target_ids === 'string' ? JSON.parse(r.target_ids) : (r.target_ids || []),
      posted_by: r.posted_by,
      poster_name: r.first_name + ' ' + r.last_name,
      created_at: r.created_at,
      updated_at: r.updated_at,
      is_pinned: Boolean(r.is_pinned),
      reactions: (() => {
        var map = reactionsMap[r.id] || {};
        var emojis = Object.values(map).map(item => ({
          emoji: item.emoji,
          count: item.count,
          mine: item.mine,
          users: item.users || [],
        }));
        var userEmojis = Object.values(map).filter(item => item.mine).map(item => item.emoji);
        var total = emojis.reduce((s, e) => s + e.count, 0);
        return { emojis, total, userEmojis };
      })(),
      is_owner: r.posted_by === userId
    }));

    res.json({ announcements, total, page, limit });
  } catch (err) {
    next(err);
  }
});

// GET /api/announcements/lookups
// Get departments, roles for audience targeting
// ============================================================
router.get('/lookups', requirePermission('announcements.create'), async (req, res, next) => {
  try {
    var [departments] = await pool.query('SELECT id, name FROM departments ORDER BY name');
    var [roles] = await pool.query('SELECT id, name FROM roles WHERE name != ? ORDER BY name', ['Administrator']);
    var [employees] = await pool.query(
      "SELECT u.id, u.first_name, u.last_name, u.email, d.name as department_name FROM users u LEFT JOIN departments d ON u.department_id = d.id WHERE u.status = 'active' ORDER BY u.first_name"
    );
    res.json({ departments, roles, employees });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// GET /api/announcements/:id
// ============================================================
router.get('/:id', async (req, res, next) => {
  try {
    await autoArchiveExpired();
    var [rows] = await pool.query(
      'SELECT a.*, u.first_name, u.last_name FROM announcements a JOIN users u ON a.posted_by = u.id WHERE a.id = ?',
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Announcement not found' });

    var ann = rows[0];
    var canView = await canUserViewAnnouncement(ann, req.user.id, req.user.permissions || []);
    if (!canView) return res.status(403).json({ error: 'Permission denied' });

    // Get reactions
    var [reactions] = await pool.query(
      'SELECT ar.emoji, ar.user_id, u.first_name, u.last_name FROM announcement_reactions ar JOIN users u ON ar.user_id = u.id WHERE ar.announcement_id = ?',
      [req.params.id]
    );
    var [userReact] = await pool.query(
      'SELECT emoji FROM announcement_reactions WHERE announcement_id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );

    var reactionSummary = {};
    var userEmojis = [];
    reactions.forEach(r => {
      if (!reactionSummary[r.emoji]) reactionSummary[r.emoji] = { emoji: r.emoji, count: 0, users: [] };
      reactionSummary[r.emoji].count++;
      reactionSummary[r.emoji].users.push(r.first_name + ' ' + r.last_name);
    });
    userReact.forEach(r => userEmojis.push(r.emoji));

    res.json({
      ...ann,
      is_pinned: Boolean(ann.is_pinned),
      poster_name: ann.first_name + ' ' + ann.last_name,
      reactions: { emojis: Object.values(reactionSummary), total: reactions.length, userEmojis: userEmojis },
      is_owner: ann.posted_by === req.user.id,
      can_edit: req.user.permissions.includes('announcements.manage') || ann.posted_by === req.user.id
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// POST /api/announcements
// Create new announcement
// ============================================================
router.post('/', requirePermission('announcements.create'), async (req, res, next) => {
  try {
    const tz = await getCompanySetting('general', 'timezone', 'UTC');
    var {
      title, content, priority, status,
      publish_date, expiry_date,
      audience_target, target_ids
    } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: t(req.lang, 'errors.titleContentRequired') });
    }

    priority = priority || 'normal';
    status = status || 'draft';
    audience_target = audience_target || 'everyone';

    var targetIdsJson = null;
    if (audience_target !== 'everyone' && target_ids && target_ids.length > 0) {
      targetIdsJson = JSON.stringify(target_ids);
    }

    var publishDateVal = null;
    if (publish_date) publishDateVal = publish_date;
    else if (status === 'published') publishDateVal = nowInTimezone(tz).toISOString().slice(0, 19).replace('T', ' ');

    var [result] = await pool.query(
      'INSERT INTO announcements (title, content, priority, status, publish_date, expiry_date, audience_target, target_ids, posted_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [title, content, priority, status, publishDateVal, expiry_date || null, audience_target, targetIdsJson, req.user.id]
    );

    var annId = result.insertId;

    // If publishing, send notifications
    if (status === 'published') {
      await createAnnouncementNotifications(annId, audience_target, target_ids, title, req.user.id);
    }

    res.status(201).json({ id: annId, message: t(req.lang, 'errors.announcementsPosted') });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// PUT /api/announcements/:id
// ============================================================
router.put('/:id', requirePermission('announcements.create'), async (req, res, next) => {
  try {
    const tz = await getCompanySetting('general', 'timezone', 'UTC');
    var [existing] = await pool.query('SELECT * FROM announcements WHERE id = ?', [req.params.id]);
    if (existing.length === 0) return res.status(404).json({ error: 'Announcement not found' });

    var ann = existing[0];
    var userPerms = req.user.permissions || [];
    var isManager = userPerms.includes('announcements.manage');
    if (!isManager && ann.posted_by !== req.user.id) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    var {
      title, content, priority, status,
      publish_date, expiry_date,
      audience_target, target_ids,
      is_pinned
    } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: t(req.lang, 'errors.titleContentRequired') });
    }

    var wasPublished = ann.status === 'published';
    var nowPublishing = status === 'published' && !wasPublished;

    priority = priority || ann.priority || 'normal';
    status = status || ann.status || 'draft';
    audience_target = audience_target || ann.audience_target || 'everyone';

    var targetIdsJson = ann.target_ids;
    if (audience_target !== 'everyone' && target_ids) {
      targetIdsJson = JSON.stringify(target_ids);
    }

    var publishDateVal = ann.publish_date;
    if (publish_date !== undefined) publishDateVal = publish_date;
    else if (status === 'published' && !ann.publish_date) publishDateVal = nowInTimezone(tz).toISOString().slice(0, 19).replace('T', ' ');

    var isPinnedVal = (is_pinned !== undefined) ? (is_pinned ? 1 : 0) : ann.is_pinned;

    await pool.query(
      'UPDATE announcements SET title=?, content=?, priority=?, status=?, publish_date=?, expiry_date=?, audience_target=?, target_ids=?, is_pinned=? WHERE id=?',
      [title, content, priority, status, publishDateVal, expiry_date || null, audience_target, targetIdsJson, isPinnedVal, req.params.id]
    );

    // Notify if newly published
    if (nowPublishing) {
      await createAnnouncementNotifications(req.params.id, audience_target, target_ids, title, req.user.id);
    }

    res.json({ message: t(req.lang, 'errors.announcementUpdated') });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// DELETE /api/announcements/:id
// ============================================================
router.delete('/:id', requirePermission('announcements.manage'), async (req, res, next) => {
  try {
    var [existing] = await pool.query('SELECT id FROM announcements WHERE id = ?', [req.params.id]);
    if (existing.length === 0) return res.status(404).json({ error: 'Announcement not found' });

    await pool.query('UPDATE announcements SET status = \'archived\' WHERE id = ?', [req.params.id]);
    res.json({ message: t(req.lang, 'errors.announcementRemoved') });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// POST /api/announcements/:id/reactions
// Add/toggle reaction
// ============================================================
router.post('/:id/reactions', auth, async (req, res, next) => {
  try {
    var { emoji, old_emoji } = req.body;
    if (!emoji) return res.status(400).json({ error: 'Emoji required' });

    var [annRows] = await pool.query('SELECT id, status FROM announcements WHERE id = ?', [req.params.id]);
    if (annRows.length === 0) return res.status(404).json({ error: 'Announcement not found' });
    if (annRows[0].status !== 'published' && annRows[0].status !== 'archived') {
      return res.status(400).json({ error: 'Cannot react to non-published announcements' });
    }

    // Replace flow (old_emoji provided): delete old_emoji first, then insert new emoji if not already present.
    // Toggle flow (no old_emoji): toggle emoji on/off.
    if (old_emoji && typeof old_emoji === 'string' && old_emoji !== emoji) {
      await pool.query(
        'DELETE FROM announcement_reactions WHERE announcement_id = ? AND user_id = ? AND emoji = ?',
        [req.params.id, req.user.id, old_emoji]
      );
      var [alreadyHas] = await pool.query(
        'SELECT id FROM announcement_reactions WHERE announcement_id = ? AND user_id = ? AND emoji = ?',
        [req.params.id, req.user.id, emoji]
      );
      if (alreadyHas.length === 0) {
        await pool.query(
          'INSERT INTO announcement_reactions (announcement_id, user_id, emoji) VALUES (?, ?, ?)',
          [req.params.id, req.user.id, emoji]
        );
      }
    } else {
      var [existing] = await pool.query(
        'SELECT id FROM announcement_reactions WHERE announcement_id = ? AND user_id = ? AND emoji = ?',
        [req.params.id, req.user.id, emoji]
      );
      if (existing.length > 0) {
        await pool.query(
          'DELETE FROM announcement_reactions WHERE announcement_id = ? AND user_id = ? AND emoji = ?',
          [req.params.id, req.user.id, emoji]
        );
      } else {
        await pool.query(
          'INSERT INTO announcement_reactions (announcement_id, user_id, emoji) VALUES (?, ?, ?)',
          [req.params.id, req.user.id, emoji]
        );
      }
    }

    // Return updated reactions so the frontend can patch state without refetching
    var [aggregateRows] = await pool.query(
      `SELECT emoji, COUNT(*) AS count, MAX(user_id = ?) AS mine
       FROM announcement_reactions WHERE announcement_id = ? GROUP BY emoji`,
      [req.user.id, req.params.id]
    );
    var [userRows] = await pool.query(
      `SELECT ar.emoji, u.first_name, u.last_name, u.email
       FROM announcement_reactions ar JOIN users u ON ar.user_id = u.id
       WHERE ar.announcement_id = ? ORDER BY ar.created_at ASC`,
      [req.params.id]
    );
    var usersByEmoji = {};
    userRows.forEach(r => {
      if (!usersByEmoji[r.emoji]) usersByEmoji[r.emoji] = [];
      var name = [r.first_name, r.last_name].filter(Boolean).join(' ').trim() || r.email || 'Unknown';
      usersByEmoji[r.emoji].push(name);
    });
    var reactions = aggregateRows.map(r => ({
      emoji: r.emoji,
      count: r.count,
      mine: !!r.mine,
      users: usersByEmoji[r.emoji] || [],
    }));
    res.json({ reactions });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// GET /api/announcements/reactions/:id
// Get reactions for a single announcement (used by dashboard widget)
// ============================================================
router.get('/reactions/:id', async (req, res, next) => {
  try {
    var [reactions] = await pool.query(
      'SELECT ar.emoji, COUNT(*) as count FROM announcement_reactions ar WHERE ar.announcement_id = ? GROUP BY ar.emoji',
      [req.params.id]
    );
    var [userReact] = await pool.query(
      'SELECT emoji FROM announcement_reactions WHERE announcement_id = ? AND user_id = ?',
      [req.params.id, req.user?.id || 0]
    );
    res.json({
      emojis: reactions.map(r => ({ emoji: r.emoji, count: r.count })),
      total: reactions.reduce((sum, r) => sum + r.count, 0),
      userEmojis: userReact.map(r => r.emoji)
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// PATCH /api/announcements/:id/pin
// Pin or unpin an announcement (managers only)
// ============================================================
router.patch('/:id/pin', requirePermission('announcements.manage'), async (req, res, next) => {
  try {
    var [existing] = await pool.query('SELECT id, is_pinned FROM announcements WHERE id = ?', [req.params.id]);
    if (existing.length === 0) return res.status(404).json({ error: 'Announcement not found' });

    var newPinState = existing[0].is_pinned ? 0 : 1;
    await pool.query('UPDATE announcements SET is_pinned = ? WHERE id = ?', [newPinState, req.params.id]);

    res.json({ message: newPinState ? 'Announcement pinned' : 'Announcement unpinned', is_pinned: Boolean(newPinState) });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// POST /api/announcements/:id/restore
// Restore an archived announcement back to published (managers only)
// ============================================================
router.post('/:id/restore', requirePermission('announcements.manage'), async (req, res, next) => {
  try {
    const tz = await getCompanySetting('general', 'timezone', 'UTC');
    var [existing] = await pool.query('SELECT id, status, audience_target, target_ids, title, posted_by FROM announcements WHERE id = ?', [req.params.id]);
    if (existing.length === 0) return res.status(404).json({ error: 'Announcement not found' });

    var ann = existing[0];
    if (ann.status !== 'archived') {
      return res.status(400).json({ error: 'Only archived announcements can be restored' });
    }

    var publishDateVal = ann.posted_by !== req.user.id
      ? nowInTimezone(tz).toISOString().slice(0, 19).replace('T', ' ')
      : null;

    await pool.query(
      'UPDATE announcements SET status = ?, publish_date = COALESCE(?, publish_date), is_pinned = 0 WHERE id = ?',
      ['published', publishDateVal, req.params.id]
    );

    // Re-send notifications to audience
    var targetIds = ann.target_ids ? (typeof ann.target_ids === 'string' ? JSON.parse(ann.target_ids) : ann.target_ids) : [];
    await createAnnouncementNotifications(ann.id, ann.audience_target, targetIds, ann.title, req.user.id);

    res.json({ message: t(req.lang, 'errors.announcementRestored') || 'Announcement restored to published' });
  } catch (err) {
    next(err);
  }
});

// ============================================================

module.exports = router;
