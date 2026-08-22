const express = require('express');
const pool = require('../config/database');
const { auth, requirePermission } = require('../middleware/auth');
const { t } = require('../i18n');
const { logActivity } = require('../services/activityService');

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
    // Return ALL system permissions, each with an `assigned` flag
    const [allPerms] = await pool.query(
      `SELECT p.id, p.name, p.description,
              IF(rp.permission_id IS NULL, 0, 1) AS assigned
       FROM permissions p
       LEFT JOIN role_permissions rp ON p.id = rp.permission_id AND rp.role_id = ?
       ORDER BY p.name`,
      [req.params.id]
    );
    res.json({ permissions: allPerms });
  } catch (err) { next(err); }
});

// PUT /api/roles/:id
router.put('/:id', auth, async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: t(req.lang, 'errors.roleNameRequired') });
    const [[oldRole]] = await pool.query('SELECT name FROM roles WHERE id = ?', [req.params.id]);
    await pool.query('UPDATE roles SET name = ? WHERE id = ?', [name, req.params.id]);
    logActivity({ req, module: 'Role', action: 'Updated',
      description: `Role "${oldRole?.name || req.params.id}" renamed to "${name}"` });
    res.json({ message: t(req.lang, 'errors.roleUpdated') });
  } catch (err) { next(err); }
});

// POST /api/roles
router.post('/', auth, async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: t(req.lang, 'errors.roleNameRequired') });
    const [result] = await pool.query('INSERT INTO roles (name) VALUES (?)', [name]);
    logActivity({ req, module: 'Role', action: 'Created',
      description: `Role "${name}" created` });
    res.status(201).json({ id: result.insertId, name });
  } catch (err) { next(err); }
});

// DELETE /api/roles/:id
router.delete('/:id', auth, async (req, res, next) => {
  try {
    const [[delRole]] = await pool.query('SELECT name FROM roles WHERE id = ?', [req.params.id]);
    await pool.query('DELETE FROM roles WHERE id = ?', [req.params.id]);
    logActivity({ req, module: 'Role', action: 'Deleted',
      description: `Role "${delRole?.name || req.params.id}" deleted` });
    res.json({ message: t(req.lang, 'errors.roleDeleted') });
  } catch (err) { next(err); }
});

router.put('/:id/permissions', auth, async (req, res, next) => {
  try {
    const { permissionIds } = req.body;
    // ── Fetch role name for description ────────────────────────────────────
    const [[roleRow]] = await pool.query('SELECT name FROM roles WHERE id = ?', [req.params.id]);
    const roleName = roleRow?.name || `ID ${req.params.id}`;

    // ── Fetch existing permissions for comparison ──────────────────────────
    const [existingPerms] = await pool.query(
      `SELECT p.name FROM role_permissions rp JOIN permissions p ON rp.permission_id = p.id WHERE rp.role_id = ?`,
      [req.params.id]
    );
    const prevPerms = existingPerms.map(p => p.name);

    await pool.query('DELETE FROM role_permissions WHERE role_id = ?', [req.params.id]);
    if (permissionIds && permissionIds.length > 0) {
      const values = permissionIds.map(pid => [req.params.id, pid]);
      await pool.query('INSERT INTO role_permissions (role_id, permission_id) VALUES ?', [values]);
    }

    // ── Fetch new permissions for logging ─────────────────────────────────
    const [newPerms] = await pool.query(
      `SELECT p.name FROM role_permissions rp JOIN permissions p ON rp.permission_id = p.id WHERE rp.role_id = ?`,
      [req.params.id]
    );
    const newPermNames = newPerms.map(p => p.name);

    // ── Activity log: Role Permissions Updated ─────────────────────────────
    logActivity({ req, module: 'Role', action: 'Permissions Updated',
      description: `Permissions updated for role "${roleName}"`,
      previousValue: { permissions: prevPerms },
      newValue: { permissions: newPermNames } });

    res.json({ message: t(req.lang, 'errors.permissionsUpdated') });
  } catch (err) { next(err); }
});

module.exports = router;