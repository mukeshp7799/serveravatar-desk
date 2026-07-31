const express = require('express');
const pool = require('../config/database');
const { auth } = require('../middleware/auth');
const { t } = require('../i18n');

const router = express.Router();

// GET /api/departments
router.get('/', auth, async (req, res, next) => {
  try {
    const [departments] = await pool.query('SELECT * FROM departments ORDER BY name ASC');
    res.json({ departments });
  } catch (err) { next(err); }
});

// POST /api/departments — admin only (admin.departments permission)
router.post('/', auth, async (req, res, next) => {
  try {
    if (!(req.user.permissions || []).includes('admin.departments')) {
      return res.status(403).json({ error: t(req.lang, 'errors.permissionDenied') });
    }
    const { name, headId } = req.body;
    if (!name) return res.status(400).json({ error: t(req.lang, 'errors.departmentNameRequired') });

    const [result] = await pool.query(
      'INSERT INTO departments (name, head_id) VALUES (?, ?)',
      [name, headId || null]
    );
    res.status(201).json({ id: result.insertId, name });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: t(req.lang, 'errors.departmentExists') });
    next(err);
  }
});

// PUT /api/departments/:id — admin only
router.put('/:id', auth, async (req, res, next) => {
  try {
    if (!(req.user.permissions || []).includes('admin.departments')) {
      return res.status(403).json({ error: t(req.lang, 'errors.permissionDenied') });
    }
    const { name, headId } = req.body;
    const fields = [];
    const params = [];
    if (name !== undefined && name !== '') { fields.push('name = ?'); params.push(name); }
    if (headId !== undefined) { fields.push('head_id = ?'); params.push(headId || null); }
    if (fields.length === 0) {
      return res.status(400).json({ error: t(req.lang, 'errors.noFieldsToUpdate') });
    }
    params.push(req.params.id);
    await pool.query(`UPDATE departments SET ${fields.join(', ')} WHERE id = ?`, params);
    res.json({ message: t(req.lang, 'errors.departmentUpdated') });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: t(req.lang, 'errors.departmentExists') });
    next(err);
  }
});

// DELETE /api/departments/:id — admin only
router.delete('/:id', auth, async (req, res, next) => {
  try {
    if (!(req.user.permissions || []).includes('admin.departments')) {
      return res.status(403).json({ error: t(req.lang, 'errors.permissionDenied') });
    }
    await pool.query('DELETE FROM departments WHERE id = ?', [req.params.id]);
    res.json({ message: t(req.lang, 'errors.departmentDeleted') });
  } catch (err) { next(err); }
});

module.exports = router;