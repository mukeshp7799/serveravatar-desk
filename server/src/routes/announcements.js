const express = require('express');
const pool = require('../config/database');
const { auth } = require('../middleware/auth');
const { t } = require('../i18n');

const router = express.Router();

// GET /api/announcements
router.get('/', auth, async (req, res, next) => {
  try {
    const [announcements] = await pool.query(
      `SELECT a.*, u.first_name, u.last_name FROM announcements a
       JOIN users u ON a.posted_by = u.id WHERE a.is_active = TRUE ORDER BY a.created_at DESC`
    );
    res.json({ announcements });
  } catch (err) { next(err); }
});

// POST /api/announcements
router.post('/', auth, async (req, res, next) => {
  try {
    const { title, content } = req.body;
    if (!title || !content) return res.status(400).json({ error: t(req.lang, 'errors.titleContentRequired') });

    const [result] = await pool.query(
      'INSERT INTO announcements (title, content, posted_by) VALUES (?, ?, ?)',
      [title, content, req.user.id]
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) { next(err); }
});

// PUT /api/announcements/:id
router.put('/:id', auth, async (req, res, next) => {
  try {
    const { title, content, isActive } = req.body;
    await pool.query('UPDATE announcements SET title = ?, content = ?, is_active = ? WHERE id = ?',
      [title, content, isActive, req.params.id]);
    res.json({ message: t(req.lang, 'errors.announcementUpdated') });
  } catch (err) { next(err); }
});

// DELETE /api/announcements/:id
router.delete('/:id', auth, async (req, res, next) => {
  try {
    await pool.query('UPDATE announcements SET is_active = FALSE WHERE id = ?', [req.params.id]);
    res.json({ message: t(req.lang, 'errors.announcementRemoved') });
  } catch (err) { next(err); }
});

module.exports = router;