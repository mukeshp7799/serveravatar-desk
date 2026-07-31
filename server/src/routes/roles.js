const express = require('express');
const pool = require('../config/database');
const { auth, requirePermission } = require('../middleware/auth');
const { t } = require('../i18n');

const router = express.Router();

router.get('/', auth, async (req, res, next) => {
  try {
    const [roles] = await pool.query('SELECT * FROM roles ORDER BY id');
    const [permissions] = await pool.query('SELECT * FROM permissions ORDER BY name');
    res.json({ roles, permissions });
  } catch (err) { next(err); }
});

router.get('/:id/permissions', auth, async (req, res, next) => {
  try {
    const [perms] = await pool.query(
      `SELECT p.* FROM role_permissions rp JOIN permissions p ON rp.permission_id = p.id WHERE rp.role_id = ?`,
      [req.params.id]
    );
    res.json({ permissions: perms });
  } catch (err) { next(err); }
});

// PUT /api/roles/:id
router.put('/:id', auth, async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: t(req.lang, 'errors.roleNameRequired') });
    await pool.query('UPDATE roles SET name = ? WHERE id = ?', [name, req.params.id]);
    res.json({ message: t(req.lang, 'errors.roleUpdated') });
  } catch (err) { next(err); }
});

// POST /api/roles
router.post('/', auth, async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: t(req.lang, 'errors.roleNameRequired') });
    const [result] = await pool.query('INSERT INTO roles (name) VALUES (?)', [name]);
    res.status(201).json({ id: result.insertId, name });
  } catch (err) { next(err); }
});

// DELETE /api/roles/:id
router.delete('/:id', auth, async (req, res, next) => {
  try {
    await pool.query('DELETE FROM roles WHERE id = ?', [req.params.id]);
    res.json({ message: t(req.lang, 'errors.roleDeleted') });
  } catch (err) { next(err); }
});

router.put('/:id/permissions', auth, async (req, res, next) => {
  try {
    const { permissionIds } = req.body;
    await pool.query('DELETE FROM role_permissions WHERE role_id = ?', [req.params.id]);
    if (permissionIds && permissionIds.length > 0) {
      const values = permissionIds.map(pid => [req.params.id, pid]);
      await pool.query('INSERT INTO role_permissions (role_id, permission_id) VALUES ?', [values]);
    }
    res.json({ message: t(req.lang, 'errors.permissionsUpdated') });
  } catch (err) { next(err); }
});

module.exports = router;