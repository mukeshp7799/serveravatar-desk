const express = require('express');
const pool = require('../config/database');
const { auth } = require('../middleware/auth');
const { t } = require('../i18n');

const router = express.Router();

// GET /api/timelogs
router.get('/', auth, async (req, res, next) => {
  try {
    const { projectId, taskId, userId } = req.query;
    let query = `SELECT tl.*, u.first_name, u.last_name, t.description as task_description, p.name as project_name
                 FROM time_logs tl
                 JOIN users u ON tl.user_id = u.id
                 LEFT JOIN tasks t ON tl.task_id = t.id
                 LEFT JOIN projects p ON tl.project_id = p.id
                 WHERE 1=1`;
    const params = [];

    if (projectId) { query += ' AND tl.project_id = ?'; params.push(projectId); }
    if (taskId) { query += ' AND tl.task_id = ?'; params.push(taskId); }

    // Users see their own; managers see team
    const roleName = req.user.role_name;
    if (roleName === 'Employee') {
      query += ' AND tl.user_id = ?'; params.push(req.user.id);
    } else if (roleName === 'Project Manager') {
      query += ' AND (tl.user_id = ? OR tl.user_id IN (SELECT id FROM users WHERE reporting_manager_id = ?))';
      params.push(req.user.id, req.user.id);
    }

    query += ' ORDER BY tl.log_date DESC, tl.created_at DESC';
    const [timelogs] = await pool.query(query, params);
    res.json({ timelogs });
  } catch (err) { next(err); }
});

// POST /api/timelogs
router.post('/', auth, async (req, res, next) => {
  try {
    const { taskId, projectId, hoursSpent, logDate, notes } = req.body;
    if (!hoursSpent || !logDate) return res.status(400).json({ error: t(req.lang, 'errors.hoursAndDateRequired') });

    const [result] = await pool.query(
      'INSERT INTO time_logs (user_id, task_id, project_id, hours_spent, log_date, notes) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.id, taskId || null, projectId || null, hoursSpent, logDate, notes || '']
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) { next(err); }
});

// DELETE /api/timelogs/:id
router.delete('/:id', auth, async (req, res, next) => {
  try {
    await pool.query('DELETE FROM time_logs WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    res.json({ message: t(req.lang, 'errors.timeLogDeleted') });
  } catch (err) { next(err); }
});

module.exports = router;