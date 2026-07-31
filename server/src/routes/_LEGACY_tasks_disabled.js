const express = require('express');
const pool = require('../config/database');
const { auth } = require('../middleware/auth');
const { t } = require('../i18n');
const { sendEmail } = require('../utils/mailer');
const { taskAssignedEmail } = require('../utils/emailTemplates');

const SITE_URL = process.env.SITE_URL || 'https://serveravatar-hub.95.217.8.52.nip.io';

const router = express.Router();

// GET /api/tasks
router.get('/', auth, async (req, res, next) => {
  try {
    const { projectId, todoListId, assignee, status, priority } = req.query;
    let query = `SELECT t.*, u.first_name, u.last_name, u.email, tl.name as list_name, tl.project_id as project_id, p.name as project_name
                 FROM tasks t
                 JOIN todo_lists tl ON t.todo_list_id = tl.id
                 JOIN projects p ON tl.project_id = p.id
                 LEFT JOIN users u ON t.assigned_to_user_id = u.id
                 WHERE 1=1`;
    const params = [];

    if (projectId) { query += ' AND tl.project_id = ?'; params.push(projectId); }
    if (todoListId) { query += ' AND t.todo_list_id = ?'; params.push(todoListId); }
    if (assignee) { query += ' AND t.assigned_to_user_id = ?'; params.push(assignee); }
    if (status) { query += ' AND t.status = ?'; params.push(status); }
    if (priority) { query += ' AND t.priority = ?'; params.push(priority); }

    // Admins / HR see all tasks; regular users see tasks in projects they belong to OR assigned to them
    const roleName = req.user.role_name;
    if (roleName !== 'System Admin' && roleName !== 'HR Admin') {
      query += ` AND (tl.project_id IN (SELECT project_id FROM project_members WHERE user_id = ?) OR t.assigned_to_user_id = ?)`;
      params.push(req.user.id, req.user.id);
    }

    query += ' ORDER BY t.due_date ASC, FIELD(t.priority, "urgent", "high", "medium", "low")';
    const [tasks] = await pool.query(query, params);
    res.json({ tasks });
  } catch (err) { next(err); }
});

// GET /api/tasks/:id
router.get('/:id', auth, async (req, res, next) => {
  try {
    const [tasks] = await pool.query(
      `SELECT t.*, u.first_name, u.last_name, u.email, tl.name as list_name, tl.project_id as project_id, p.name as project_name
       FROM tasks t JOIN todo_lists tl ON t.todo_list_id = tl.id
       JOIN projects p ON tl.project_id = p.id
       LEFT JOIN users u ON t.assigned_to_user_id = u.id WHERE t.id = ?`,
      [req.params.id]
    );
    if (tasks.length === 0) return res.status(404).json({ error: t(req.lang, 'errors.taskNotFound') });
    res.json({ task: tasks[0] });
  } catch (err) { next(err); }
});

// POST /api/tasks
router.post('/', auth, async (req, res, next) => {
  try {
    const { todoListId, description, assignedToUserId, dueDate, priority } = req.body;
    if (!todoListId || !description) return res.status(400).json({ error: t(req.lang, 'errors.todoListDescriptionRequired') });

    // Verify the todo list exists
    const [tl] = await pool.query('SELECT id, project_id FROM todo_lists WHERE id = ?', [todoListId]);
    if (tl.length === 0) return res.status(404).json({ error: t(req.lang, 'errors.todoListNotFound') });

    const [result] = await pool.query(
      'INSERT INTO tasks (todo_list_id, description, assigned_to_user_id, due_date, priority, status) VALUES (?, ?, ?, ?, ?, ?)',
      [todoListId, description, assignedToUserId || null, dueDate || null, priority || 'medium', 'todo']
    );

    // Notify assignee — use i18n key + params so it can be translated on read
    let emailResult = null;
    if (assignedToUserId) {
      const [project] = await pool.query(
        `SELECT p.name FROM projects p JOIN todo_lists tl ON tl.project_id = p.id WHERE tl.id = ?`,
        [todoListId]
      );
      const projectName = project[0]?.name || 'a project';
      await pool.query(
        `INSERT INTO notifications (user_id, type, title_key, params, title, message, link)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          assignedToUserId,
          'task_assigned',
          'notifications.taskAssigned',
          JSON.stringify({ projectName }),
          // Legacy fallback fields (used only for old rows that don't have title_key)
          'Task Assigned',
          `You have been assigned to a task in "${projectName}"`,
          `/tasks?id=${result.insertId}`,
        ]
      );

      // Look up assignee's email + name, then send the Ethereal email
      const [assignee] = await pool.query(
        'SELECT email, first_name, last_name FROM users WHERE id = ?',
        [assignedToUserId]
      );
      if (assignee.length > 0) {
        const assignedBy = `${req.user.first_name} ${req.user.last_name}`;
        const taskUrl = `${SITE_URL}/tasks?id=${result.insertId}`;
        const tpl = taskAssignedEmail({
          assigneeName: `${assignee[0].first_name} ${assignee[0].last_name}`,
          taskDescription: description,
          projectName,
          dueDate,
          priority: priority || 'medium',
          assignedBy,
          taskUrl,
        });
        emailResult = await sendEmail({
          to: assignee[0].email,
          toName: `${assignee[0].first_name} ${assignee[0].last_name}`,
          subject: tpl.subject,
          html: tpl.html,
          text: tpl.text,
          type: 'task_assigned',
          relatedId: result.insertId,
          relatedType: 'task',
          triggeredByUserId: req.user.id,
        });
      }
    }

    // Return the full task with joins so the frontend can render the card immediately
    const [created] = await pool.query(
      `SELECT t.*, u.first_name, u.last_name, u.email, tl.name as list_name, tl.project_id as project_id, p.name as project_name
       FROM tasks t
       JOIN todo_lists tl ON t.todo_list_id = tl.id
       JOIN projects p ON tl.project_id = p.id
       LEFT JOIN users u ON t.assigned_to_user_id = u.id
       WHERE t.id = ?`,
      [result.insertId]
    );
    res.status(201).json({
      task: created[0],
      message: t(req.lang, 'errors.taskCreated'),
      emailLog: emailResult
        ? { ok: emailResult.ok, previewUrl: emailResult.previewUrl, messageId: emailResult.messageId, error: emailResult.error }
        : null,
    });
  } catch (err) { next(err); }
});

// PUT /api/tasks/:id
router.put('/:id', auth, async (req, res, next) => {
  try {
    const toValue = (v) => (v === '' || v === null || v === undefined) ? null : v;
    const { description, assignedToUserId, dueDate, priority, status, todoListId } = req.body;

    // Allowed enum values (kept in sync with the MySQL column definitions)
    const ALLOWED_STATUSES = ['todo', 'in_progress', 'review', 'done'];
    const ALLOWED_PRIORITIES = ['low', 'medium', 'high', 'urgent'];

    // Regular users can only update status
    const roleName = req.user.role_name;
    const isAdmin = roleName === 'System Admin' || roleName === 'HR Admin';

    if (!isAdmin) {
      // Non-admins: only allow status change
      if (description !== undefined || assignedToUserId !== undefined || dueDate !== undefined || priority !== undefined || todoListId !== undefined) {
        return res.status(403).json({ error: t(req.lang, 'errors.onlyStatusUpdatable') });
      }
      if (status === undefined) {
        return res.status(400).json({ error: t(req.lang, 'errors.noFieldsToUpdate') });
      }
      if (!ALLOWED_STATUSES.includes(status)) {
        return res.status(400).json({ error: `Invalid status. Must be one of: ${ALLOWED_STATUSES.join(', ')}` });
      }
      await pool.query('UPDATE tasks SET status = ?, completed_at = ? WHERE id = ?',
        [status, status === 'done' ? new Date() : null, req.params.id]);
      return res.json({ message: t(req.lang, 'errors.taskStatusUpdated') });
    }

    // Admins: full update with validation
    const updates = [];
    const params = [];

    if (description !== undefined) { updates.push('description = ?'); params.push(description); }
    if (assignedToUserId !== undefined) {
      const aid = toValue(assignedToUserId);
      if (aid !== null) {
        const [u] = await pool.query('SELECT id FROM users WHERE id = ?', [aid]);
        if (u.length === 0) {
          return res.status(400).json({ error: `Assigned user with id ${aid} does not exist` });
        }
      }
      updates.push('assigned_to_user_id = ?'); params.push(aid);
    }
    if (dueDate !== undefined) { updates.push('due_date = ?'); params.push(toValue(dueDate)); }
    if (priority !== undefined) {
      if (!ALLOWED_PRIORITIES.includes(priority)) {
        return res.status(400).json({ error: `Invalid priority. Must be one of: ${ALLOWED_PRIORITIES.join(', ')}` });
      }
      updates.push('priority = ?'); params.push(priority);
    }
    if (status !== undefined) {
      if (!ALLOWED_STATUSES.includes(status)) {
        return res.status(400).json({ error: `Invalid status. Must be one of: ${ALLOWED_STATUSES.join(', ')}` });
      }
      updates.push('status = ?');
      params.push(status);
      if (status === 'done') updates.push('completed_at = NOW()');
      else updates.push('completed_at = NULL');
    }
    if (todoListId !== undefined && todoListId !== null) {
      const tlid = toValue(todoListId);
      if (tlid !== null) {
        const [tl] = await pool.query('SELECT id FROM todo_lists WHERE id = ?', [tlid]);
        if (tl.length === 0) {
          return res.status(400).json({ error: `Todo list with id ${tlid} does not exist` });
        }
        updates.push('todo_list_id = ?'); params.push(tlid);
      }
      // If the client explicitly sends null, skip the update (the column doesn't allow NULL)
    }

    if (updates.length === 0) return res.status(400).json({ error: t(req.lang, 'errors.noFieldsToUpdate') });

    params.push(req.params.id);
    await pool.query(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`, params);

    // If the task was just (re)assigned, send an email to the new assignee.
    let emailResult = null;
    if (assignedToUserId !== undefined) {
      const [taskRow] = await pool.query(
        `SELECT t.description, t.due_date, t.priority, t.todo_list_id, tl.project_id, p.name as project_name
         FROM tasks t JOIN todo_lists tl ON t.todo_list_id = tl.id
         JOIN projects p ON tl.project_id = p.id WHERE t.id = ?`,
        [req.params.id]
      );
      if (taskRow.length > 0 && assignedToUserId) {
        const tr = taskRow[0];
        const [assignee] = await pool.query(
          'SELECT email, first_name, last_name FROM users WHERE id = ?',
          [assignedToUserId]
        );
        if (assignee.length > 0) {
          const assignedBy = `${req.user.first_name} ${req.user.last_name}`;
          const taskUrl = `${SITE_URL}/tasks?id=${req.params.id}`;
          const tpl = taskAssignedEmail({
            assigneeName: `${assignee[0].first_name} ${assignee[0].last_name}`,
            taskDescription: tr.description,
            projectName: tr.project_name,
            dueDate: tr.due_date,
            priority: tr.priority,
            assignedBy,
            taskUrl,
          });
          emailResult = await sendEmail({
            to: assignee[0].email,
            toName: `${assignee[0].first_name} ${assignee[0].last_name}`,
            subject: tpl.subject,
            html: tpl.html,
            text: tpl.text,
            type: 'task_assigned',
            relatedId: parseInt(req.params.id, 10),
            relatedType: 'task',
            triggeredByUserId: req.user.id,
          });
        }
      }
    }

    res.json({
      message: t(req.lang, 'errors.taskUpdated'),
      emailLog: emailResult
        ? { ok: emailResult.ok, previewUrl: emailResult.previewUrl, messageId: emailResult.messageId, error: emailResult.error }
        : null,
    });
  } catch (err) { next(err); }
});

// DELETE /api/tasks/:id
router.delete('/:id', auth, async (req, res, next) => {
  try {
    const roleName = req.user.role_name;
    if (roleName !== 'System Admin' && roleName !== 'HR Admin') {
      return res.status(403).json({ error: t(req.lang, 'errors.onlyAdminsCanDeleteTasks') });
    }
    await pool.query('DELETE FROM tasks WHERE id = ?', [req.params.id]);
    res.json({ message: t(req.lang, 'errors.taskDeleted') });
  } catch (err) { next(err); }
});

module.exports = router;