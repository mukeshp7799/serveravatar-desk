const express = require('express');
const pool = require('../config/database');
const { auth } = require('../middleware/auth');
const { t } = require('../i18n');

const router = express.Router();

// Helper: check if a column exists on a table in the current DB
async function hasColumn(table, column) {
  const [rows] = await pool.query(
    "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
    [table, column]
  );
  return rows.length > 0;
}

// GET /api/designations
router.get('/', auth, async (req, res, next) => {
  try {
    const [designations] = await pool.query('SELECT * FROM designations ORDER BY name ASC');
    res.json({ designations });
  } catch (err) { next(err); }
});

// POST /api/designations
router.post('/', auth, async (req, res, next) => {
  try {
    const { name, departmentId } = req.body;
    if (!name) return res.status(400).json({ error: t(req.lang, 'errors.designationNameRequired') });

    const hasDeptId = await hasColumn('designations', 'department_id');
    let result;
    if (hasDeptId) {
      [result] = await pool.query(
        'INSERT INTO designations (name, department_id) VALUES (?, ?)',
        [name, departmentId || null]
      );
    } else {
      [result] = await pool.query(
        'INSERT INTO designations (name) VALUES (?)',
        [name]
      );
    }
    res.status(201).json({ id: result.insertId, name });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: t(req.lang, 'errors.designationExists') });
    next(err);
  }
});

// PUT /api/designations/:id
router.put('/:id', auth, async (req, res, next) => {
  try {
    const { name, departmentId } = req.body;
    const fields = [];
    const params = [];
    if (name !== undefined && name !== '') { fields.push('name = ?'); params.push(name); }
    if (departmentId !== undefined) {
      const hasDeptId = await hasColumn('designations', 'department_id');
      if (hasDeptId) { fields.push('department_id = ?'); params.push(departmentId || null); }
    }
    if (fields.length === 0) {
      return res.status(400).json({ error: t(req.lang, 'errors.noFieldsToUpdate') });
    }
    params.push(req.params.id);
    await pool.query(`UPDATE designations SET ${fields.join(', ')} WHERE id = ?`, params);
    res.json({ message: t(req.lang, 'errors.designationUpdated') });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: t(req.lang, 'errors.designationExists') });
    next(err);
  }
});

// DELETE /api/designations/:id
router.delete('/:id', auth, async (req, res, next) => {
  try {
    await pool.query('DELETE FROM designations WHERE id = ?', [req.params.id]);
    res.json({ message: t(req.lang, 'errors.designationDeleted') });
  } catch (err) { next(err); }
});

module.exports = router;