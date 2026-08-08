const express = require('express');
const pool = require('../config/database');
const { auth } = require('../middleware/auth');
const { requireProjectMember, isProjectMember } = require('../middleware/projectMember');
const { t } = require('../i18n');
const { processAndNotifyMentions, SOURCE_TYPES } = require('../utils/mentions');
const { isNotificationAllowed } = require('../utils/notificationPreferences');

const router = express.Router();

/** Hydrate an array of message rows (from the messages table, is_direct=0)
 *  with reactions summary + the current user's own reaction flag.
 *
 *  Shape returned per message:
 *    { id, discussion_id, sender_id, first_name, last_name, avatar_url,
 *      content, created_at, updated_at,
 *      reactions: [{ emoji, count, mine, users: [name, ...] }] }
 */
const hydrateMessages = async (messageRows, currentUserId) => {
  if (!messageRows || messageRows.length === 0) return [];

  const ids = messageRows.map((r) => r.id);

  // Per-user details (names) for each (message_id, emoji) group, chronological.
  const [reactionRows] = await pool.query(
    `SELECT mr.message_id, mr.emoji, mr.user_id,
            u.first_name, u.last_name, u.email
     FROM message_reactions mr
     JOIN users u ON mr.user_id = u.id
     WHERE mr.message_id IN (?)
     ORDER BY mr.created_at ASC`,
    [ids]
  );

  // Aggregate: count + mine flag per (message_id, emoji).
  const [aggregateRows] = await pool.query(
    `SELECT message_id, emoji,
            COUNT(*) AS count,
            MAX(user_id = ?) AS mine
     FROM message_reactions
     WHERE message_id IN (?)
     GROUP BY message_id, emoji`,
    [currentUserId, ids]
  );

  // Build reaction map:  reactMap[message_id][emoji] = { emoji, count, mine, users[] }
  const reactMap = {};
  aggregateRows.forEach((r) => {
    if (!reactMap[r.message_id]) reactMap[r.message_id] = {};
    reactMap[r.message_id][r.emoji] = {
      emoji: r.emoji,
      count: r.count,
      mine: !!r.mine,
      users: [],
    };
  });
  reactionRows.forEach((r) => {
    const grp = reactMap[r.message_id] && reactMap[r.message_id][r.emoji];
    if (!grp) return;
    const name =
      [r.first_name, r.last_name].filter(Boolean).join(' ').trim() ||
      r.email ||
      'Unknown';
    grp.users.push(name);
  });

  return messageRows.map((r) => ({
    ...r,
    reactions: Object.values(reactMap[r.id] || {}),
  }));
};

// GET /api/discussions?projectId=...   (projectId is optional)
// Any authenticated user with 'discussions.view' can see all discussions.
// No project membership restriction.
router.get('/', auth, async (req, res, next) => {
  try {
    if (!req.user.permissions.includes('discussions.view')) {
      return res.status(403).json({ error: 'You do not have permission to view discussions.' });
    }
    const { projectId } = req.query;
    let query = `SELECT d.*, u.first_name, u.last_name, u.avatar_url,
                        (SELECT COUNT(*) FROM messages WHERE discussion_id = d.id AND is_direct = 0) as message_count
                 FROM discussions d
                 JOIN users u ON d.created_by_user_id = u.id
                 WHERE 1=1`;
    const params = [];

    if (projectId) {
      query += ' AND d.project_id = ?';
      params.push(projectId);
    }

    query += ' ORDER BY d.created_at DESC';
    const [discussions] = await pool.query(query, params);
    res.json({ discussions });
  } catch (err) { next(err); }
});

// GET /api/discussions/:id
router.get('/:id', auth, async (req, res, next) => {
  try {
    if (!req.user.permissions.includes('discussions.view')) {
      return res.status(403).json({ error: 'You do not have permission to view discussions.' });
    }
    const [discussions] = await pool.query(
      `SELECT d.*, u.first_name, u.last_name, u.avatar_url, p.name as project_name
       FROM discussions d JOIN users u ON d.created_by_user_id = u.id
       LEFT JOIN projects p ON d.project_id = p.id WHERE d.id = ?`,
      [req.params.id]
    );
    if (discussions.length === 0) return res.status(404).json({ error: t(req.lang, 'errors.discussionNotFound') });

    // Only non-direct messages (discussion threads, not DMs)
    const [messageRows] = await pool.query(
      `SELECT m.*, u.first_name, u.last_name, u.avatar_url
       FROM messages m JOIN users u ON m.sender_id = u.id
       WHERE m.discussion_id = ? AND m.is_direct = 0
       ORDER BY m.created_at ASC`,
      [req.params.id]
    );

    const messages = await hydrateMessages(messageRows, req.user.id);

    res.json({ discussion: discussions[0], messages });
  } catch (err) { next(err); }
});

// POST /api/discussions
// projectId is optional (can be null). Requires 'discussions.create' permission.
router.post('/', auth, async (req, res, next) => {
  try {
    if (!req.user.permissions.includes('discussions.create')) {
      return res.status(403).json({ error: 'You do not have permission to create discussions.' });
    }
    const { projectId, title } = req.body;
    if (!title || String(title).trim() === '') {
      return res.status(400).json({ error: 'Title is required.' });
    }

    const [result] = await pool.query(
      'INSERT INTO discussions (project_id, title, created_by_user_id) VALUES (?, ?, ?)',
      [projectId && Number(projectId) > 0 ? Number(projectId) : null, String(title).trim(), req.user.id]
    );

    res.status(201).json({ id: result.insertId, title: String(title).trim() });
  } catch (err) { next(err); }
});

// POST /api/discussions/:id/messages
router.post('/:id/messages', auth, async (req, res, next) => {
  try {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: t(req.lang, 'errors.messageContentRequired') });

    const [discussion] = await pool.query('SELECT project_id, title FROM discussions WHERE id = ?', [req.params.id]);
    if (!discussion.length) return res.status(404).json({ error: t(req.lang, 'errors.discussionNotFound') });

    const discussionTitle = discussion[0].title || 'Untitled';

    // Permission check — any user with 'discussions.post' can post to any discussion
    if (!req.user.permissions.includes('discussions.post')) {
      return res.status(403).json({ error: 'You do not have permission to post in this discussion.' });
    }

    const [result] = await pool.query(
      'INSERT INTO messages (discussion_id, sender_id, content) VALUES (?, ?, ?)',
      [req.params.id, req.user.id, content]
    );
    const messageId = result.insertId;

    // Process @mentions (store + send in-app notifications).
    const senderName = `${req.user.first_name} ${req.user.last_name}`;
    await processAndNotifyMentions({
      projectId: discussion[0].project_id,
      sourceType: SOURCE_TYPES.DISCUSSION_MESSAGE,
      sourceId: messageId,
      content,
      mentionedByUserId: req.user.id,
      lang: req.lang,
      link: `/discussions?id=${req.params.id}&msg=${messageId}`,
    });

    // Notify other project members about the new message (existing notification logic).
    const [members] = await pool.query(
      'SELECT user_id FROM project_members WHERE project_id = ? AND user_id != ?',
      [discussion[0].project_id, req.user.id]
    );
    const contentSnippet = content.substring(0, 100);
    for (const m of members) {
      if (await isNotificationAllowed(m.user_id, 'new_message')) {
        await pool.query(
          `INSERT INTO notifications (user_id, type, title_key, params, title, message, link)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            m.user_id,
            'new_message',
            null,
            JSON.stringify({ senderName, contentSnippet }),
            `New message in "${discussionTitle}"`,
            `${senderName}: ${contentSnippet}`,
            `/discussions?id=${req.params.id}`,
          ]
        );
      }
    }

    res.status(201).json({ id: messageId });
  } catch (err) { next(err); }
});

// POST /api/discussions/:id/messages/:messageId/reactions  — toggle (or replace) emoji reaction
//
// Body options:
//   { emoji }                     — toggle: remove if exists, add if not
//   { emoji, old_emoji }          — replace: remove old_emoji, add emoji
//
// One user can have only one reaction per message. Passing old_emoji enables
// the "select different emoji to replace" flow without a race condition.
router.post('/:id/messages/:messageId/reactions', auth, async (req, res, next) => {
  try {
    const { emoji, old_emoji } = req.body;
    if (!emoji || typeof emoji !== 'string' || emoji.length > 16) {
      return res.status(400).json({ error: 'Invalid emoji' });
    }

    const [discussion] = await pool.query('SELECT project_id FROM discussions WHERE id = ?', [req.params.id]);
    if (!discussion.length) return res.status(404).json({ error: t(req.lang, 'errors.discussionNotFound') });

    if (!req.user.permissions.includes('discussions.post')) {
      return res.status(403).json({ error: 'You do not have permission to react to messages in this discussion.' });
    }

    const [messageRows] = await pool.query(
      'SELECT id FROM messages WHERE id = ? AND discussion_id = ? AND is_direct = 0',
      [req.params.messageId, req.params.id]
    );
    if (!messageRows.length) return res.status(404).json({ error: 'Message not found' });

    // Replace flow: user had old_emoji, is switching to a different emoji.
    // Atomically removes old_emoji then adds (or keeps) the new emoji.
    if (old_emoji && typeof old_emoji === 'string' && old_emoji !== emoji) {
      await pool.query(
        'DELETE FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?',
        [req.params.messageId, req.user.id, old_emoji]
      );
      const [alreadyHas] = await pool.query(
        'SELECT id FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?',
        [req.params.messageId, req.user.id, emoji]
      );
      if (alreadyHas.length === 0) {
        await pool.query(
          'INSERT INTO message_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)',
          [req.params.messageId, req.user.id, emoji]
        );
      }
    } else {
      // Toggle: delete if exists, insert if not.
      const [existing] = await pool.query(
        'SELECT id FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?',
        [req.params.messageId, req.user.id, emoji]
      );
      if (existing.length > 0) {
        await pool.query(
          'DELETE FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?',
          [req.params.messageId, req.user.id, emoji]
        );
      } else {
        await pool.query(
          'INSERT INTO message_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)',
          [req.params.messageId, req.user.id, emoji]
        );
      }
    }

    // Re-hydrate just this message to return updated reactions.
    const hydrated = await hydrateMessages(messageRows, req.user.id);
    res.json({ reactions: hydrated[0]?.reactions || [] });
  } catch (err) { next(err); }
});

// DELETE /api/discussions/:id
// Only the discussion creator OR a user with 'discussions.delete' permission can delete.
router.delete('/:id', auth, async (req, res, next) => {
  try {
    const [discussion] = await pool.query('SELECT id, created_by_user_id FROM discussions WHERE id = ?', [req.params.id]);
    if (!discussion.length) return res.status(404).json({ error: t(req.lang, 'errors.discussionNotFound') });

    const isCreator = discussion[0].created_by_user_id === req.user.id;
    const canDelete = req.user.permissions.includes('discussions.delete');

    if (!isCreator && !canDelete) {
      return res.status(403).json({ error: 'You do not have permission to delete this discussion.' });
    }

    await pool.query('DELETE FROM discussions WHERE id = ?', [req.params.id]);
    res.json({ message: t(req.lang, 'errors.discussionDeleted') });
  } catch (err) { next(err); }
});

module.exports = router;
