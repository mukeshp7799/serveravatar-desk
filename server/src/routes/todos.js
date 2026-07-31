/**
 * To-do Lists — Basecamp-style checklists (separate from Task Board)
 *
 * Hierarchy: Project → List → Item
 *
 * Authorisation: any project member (manager_id OR a row in project_members)
 * can read/write. Non-members get 403.
 *
 * Endpoints:
 *   GET    /api/projects/:projectId/todos               — list all lists + items
 *   POST   /api/projects/:projectId/todos/lists         — create list
 *   PATCH  /api/projects/:projectId/todos/lists/:id     — rename / recolor / reorder list
 *   DELETE /api/projects/:projectId/todos/lists/:id     — delete list (cascade items)
 *   POST   /api/projects/:projectId/todos/lists/:id/items           — add item
 *   PATCH  /api/projects/:projectId/todos/items/:id                 — edit item (incl. complete toggle)
 *   PATCH  /api/projects/:projectId/todos/lists/:id/items/reorder   — reorder items (bulk positions)
 *   DELETE /api/projects/:projectId/todos/items/:id                 — delete item
 */

const express = require('express');
const pool = require('../config/database');
const { auth } = require('../middleware/auth');
const { requireProjectMember } = require('../middleware/projectMember');
const { recordActivity } = require('../utils/activity');

const router = express.Router();
router.use(auth);
router.use('/projects/:projectId', requireProjectMember('projectId'));

// ─── helpers ────────────────────────────────────────────────────────────────

const COLORS = new Set(['indigo', 'emerald', 'amber', 'sky', 'pink', 'violet']);

async function loadFull(projectId) {
  const [lists] = await pool.query(
    `SELECT l.*,
            u.first_name AS creator_first_name, u.last_name AS creator_last_name
       FROM todo_lists l
       LEFT JOIN users u ON u.id = l.created_by
      WHERE l.project_id = ? AND l.archived_at IS NULL
      ORDER BY l.position ASC, l.id ASC`,
    [projectId]
  );
  if (!lists.length) return { lists: [] };

  const listIds = lists.map((l) => l.id);
  const [items] = await pool.query(
    `SELECT i.*,
            a.first_name AS assignee_first_name, a.last_name AS assignee_last_name,
            c.first_name AS completer_first_name, c.last_name AS completer_last_name,
            cr.first_name AS creator_first_name_item, cr.last_name AS creator_last_name_item
       FROM todo_items i
       LEFT JOIN users a  ON a.id  = i.assignee_id
       LEFT JOIN users c  ON c.id  = i.completed_by
       LEFT JOIN users cr ON cr.id = i.created_by
      WHERE i.list_id IN (?)
      ORDER BY i.completed ASC, i.position ASC, i.id ASC`,
    [listIds]
  );

  const byList = new Map(lists.map((l) => [l.id, []]));
  for (const it of items) byList.get(it.list_id).push(it);

  return {
    lists: lists.map((l) => ({
      id: l.id,
      name: l.name,
      color: l.color,
      position: l.position,
      created_at: l.created_at,
      updated_at: l.updated_at,
      created_by: l.created_by ? {
        id: l.created_by,
        first_name: l.creator_first_name,
        last_name: l.creator_last_name,
      } : null,
      items: byList.get(l.id).map((it) => ({
        id: it.id,
        list_id: it.list_id,
        title: it.title,
        notes: it.notes,
        completed: !!it.completed,
        completed_at: it.completed_at,
        due_date: it.due_date,
        assignee_id: it.assignee_id,
        assignee: it.assignee_id ? {
          id: it.assignee_id,
          first_name: it.assignee_first_name,
          last_name: it.assignee_last_name,
        } : null,
        completed_by: it.completed_by ? {
          id: it.completed_by,
          first_name: it.completer_first_name,
          last_name: it.completer_last_name,
        } : null,
        position: it.position,
        created_at: it.created_at,
        updated_at: it.updated_at,
        created_by: it.created_by ? {
          id: it.created_by,
          first_name: it.creator_first_name_item,
          last_name: it.creator_last_name_item,
        } : null,
      })),
    })),
  };
}

// ─── routes ─────────────────────────────────────────────────────────────────

// GET — list all lists + items for a project
router.get('/projects/:projectId/todos', async (req, res, next) => {
  try {
    const data = await loadFull(req.params.projectId);
    res.json(data);
  } catch (e) { next(e); }
});

// POST — create list
router.post('/projects/:projectId/todos/lists', async (req, res, next) => {
  try {
    const { name, color } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ message: 'List name is required' });
    const safeColor = COLORS.has(color) ? color : 'indigo';

    const [[{ nextPos }]] = await pool.query(
      'SELECT COALESCE(MAX(position), -1) + 1 AS nextPos FROM todo_lists WHERE project_id = ?',
      [req.params.projectId]
    );
    const [r] = await pool.query(
      'INSERT INTO todo_lists (project_id, name, color, position, created_by) VALUES (?, ?, ?, ?, ?)',
      [req.params.projectId, name.trim(), safeColor, nextPos, req.user.id]
    );
    await recordActivity(pool, {
      projectId: Number(req.params.projectId),
      actorId: req.user.id,
      feature: 'todos',
      action: 'list_created',
      targetType: 'todolist',
      targetId: r.insertId,
      targetLabel: name.trim(),
      meta: { color: safeColor },
    });
    const data = await loadFull(req.params.projectId);
    res.status(201).json({ list: data.lists.find((l) => l.id === r.insertId), lists: data.lists });
  } catch (e) { next(e); }
});

// PATCH — rename / recolor / reorder list
router.patch('/projects/:projectId/todos/lists/:id', async (req, res, next) => {
  try {
    const updates = [];
    const params = [];
    const { name, color, position } = req.body || {};
    if (name !== undefined) {
      if (!String(name).trim()) return res.status(400).json({ message: 'List name cannot be empty' });
      updates.push('name = ?'); params.push(String(name).trim());
    }
    if (color !== undefined) {
      if (!COLORS.has(color)) return res.status(400).json({ message: 'Invalid color' });
      updates.push('color = ?'); params.push(color);
    }
    if (position !== undefined) {
      updates.push('position = ?'); params.push(Number(position) | 0);
    }
    if (!updates.length) return res.status(400).json({ message: 'Nothing to update' });

    params.push(req.params.id, req.params.projectId);
    const [r] = await pool.query(
      `UPDATE todo_lists SET ${updates.join(', ')} WHERE id = ? AND project_id = ?`,
      params
    );
    if (!r.affectedRows) return res.status(404).json({ message: 'List not found' });

    const data = await loadFull(req.params.projectId);
    res.json({ list: data.lists.find((l) => l.id === Number(req.params.id)), lists: data.lists });
  } catch (e) { next(e); }
});

// DELETE — delete list (cascade items)
router.delete('/projects/:projectId/todos/lists/:id', async (req, res, next) => {
  try {
    const [r] = await pool.query(
      'DELETE FROM todo_lists WHERE id = ? AND project_id = ?',
      [req.params.id, req.params.projectId]
    );
    if (!r.affectedRows) return res.status(404).json({ message: 'List not found' });
    await recordActivity(pool, {
      projectId: Number(req.params.projectId),
      actorId: req.user.id,
      feature: 'todos',
      action: 'list_deleted',
      targetType: 'todolist',
      targetId: req.params.id,
      targetLabel: null,
    });
    const data = await loadFull(req.params.projectId);
    res.json({ ok: true, lists: data.lists });
  } catch (e) { next(e); }
});

// POST — add item
router.post('/projects/:projectId/todos/lists/:id/items', async (req, res, next) => {
  try {
    const { title, notes, assignee_id, due_date } = req.body || {};
    if (!title || !title.trim()) return res.status(400).json({ message: 'Item title is required' });

    // Verify the list belongs to this project
    const [[list]] = await pool.query(
      'SELECT id FROM todo_lists WHERE id = ? AND project_id = ? AND archived_at IS NULL',
      [req.params.id, req.params.projectId]
    );
    if (!list) return res.status(404).json({ message: 'List not found' });

    const [[{ nextPos }]] = await pool.query(
      'SELECT COALESCE(MAX(position), -1) + 1 AS nextPos FROM todo_items WHERE list_id = ?',
      [req.params.id]
    );
    const [r] = await pool.query(
      `INSERT INTO todo_items (list_id, project_id, title, notes, assignee_id, due_date, position, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.params.id,
        req.params.projectId,
        title.trim(),
        notes ? String(notes).trim() : null,
        assignee_id ? Number(assignee_id) : null,
        due_date || null,
        nextPos,
        req.user.id,
      ]
    );
    await recordActivity(pool, {
      projectId: Number(req.params.projectId),
      actorId: req.user.id,
      feature: 'todos',
      action: 'item_created',
      targetType: 'todoitem',
      targetId: r.insertId,
      targetLabel: title.trim(),
      meta: { list_id: Number(req.params.id) },
    });
    const data = await loadFull(req.params.projectId);
    res.status(201).json({ item: data.lists.flatMap((l) => l.items).find((i) => i.id === r.insertId), lists: data.lists });
  } catch (e) { next(e); }
});

// PATCH — edit item (including complete toggle)
router.patch('/projects/:projectId/todos/items/:id', async (req, res, next) => {
  try {
    const { title, notes, assignee_id, due_date, completed, position } = req.body || {};
    const updates = [];
    const params = [];

    if (title !== undefined) {
      if (!String(title).trim()) return res.status(400).json({ message: 'Item title cannot be empty' });
      updates.push('title = ?'); params.push(String(title).trim());
    }
    if (notes !== undefined) {
      updates.push('notes = ?'); params.push(notes ? String(notes).trim() : null);
    }
    if (assignee_id !== undefined) {
      updates.push('assignee_id = ?');
      params.push(assignee_id === null || assignee_id === '' ? null : Number(assignee_id));
    }
    if (due_date !== undefined) {
      updates.push('due_date = ?'); params.push(due_date || null);
    }
    if (position !== undefined) {
      updates.push('position = ?'); params.push(Number(position) | 0);
    }
    if (completed !== undefined) {
      updates.push('completed = ?'); params.push(completed ? 1 : 0);
      if (completed) {
        updates.push('completed_at = CURRENT_TIMESTAMP');
        updates.push('completed_by = ?'); params.push(req.user.id);
      } else {
        updates.push('completed_at = NULL');
        updates.push('completed_by = NULL');
      }
    }
    if (!updates.length) return res.status(400).json({ message: 'Nothing to update' });

    // Pull the item's title + old `completed` flag BEFORE the update so we can
    // build a meaningful activity entry (and detect completion transitions).
    const [[oldItem]] = await pool.query(
      'SELECT title, completed FROM todo_items WHERE id = ? AND project_id = ?',
      [req.params.id, req.params.projectId]
    );

    params.push(req.params.id, req.params.projectId);
    const [r] = await pool.query(
      `UPDATE todo_items SET ${updates.join(', ')} WHERE id = ? AND project_id = ?`,
      params
    );
    if (!r.affectedRows) return res.status(404).json({ message: 'Item not found' });

    // Activity: emit a generic 'updated' if anything else changed, OR a
    // dedicated 'completed' / 'reopened' if the completion flag flipped.
    if (completed !== undefined && oldItem && !!oldItem.completed !== !!completed) {
      await recordActivity(pool, {
        projectId: Number(req.params.projectId),
        actorId: req.user.id,
        feature: 'todos',
        action: completed ? 'item_completed' : 'item_reopened',
        targetType: 'todoitem',
        targetId: req.params.id,
        targetLabel: oldItem.title,
      });
    } else if (oldItem) {
      await recordActivity(pool, {
        projectId: Number(req.params.projectId),
        actorId: req.user.id,
        feature: 'todos',
        action: 'item_updated',
        targetType: 'todoitem',
        targetId: req.params.id,
        targetLabel: oldItem.title,
        meta: { changed: Object.keys(req.body || {}).filter((k) => k !== 'completed') },
      });
    }

    const data = await loadFull(req.params.projectId);
    res.json({
      item: data.lists.flatMap((l) => l.items).find((i) => i.id === Number(req.params.id)),
      lists: data.lists,
    });
  } catch (e) { next(e); }
});

// PATCH — bulk reorder items in a list
router.patch('/projects/:projectId/todos/lists/:id/items/reorder', async (req, res, next) => {
  try {
    const { order } = req.body || {}; // [{id, position}, ...]
    if (!Array.isArray(order) || !order.length) {
      return res.status(400).json({ message: 'order must be a non-empty array of {id, position}' });
    }

    // Validate the list belongs to the project
    const [[list]] = await pool.query(
      'SELECT id FROM todo_lists WHERE id = ? AND project_id = ?',
      [req.params.id, req.params.projectId]
    );
    if (!list) return res.status(404).json({ message: 'List not found' });

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      for (const row of order) {
        await conn.query(
          'UPDATE todo_items SET position = ? WHERE id = ? AND list_id = ?',
          [Number(row.position) | 0, Number(row.id), req.params.id]
        );
      }
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    const data = await loadFull(req.params.projectId);
    res.json({ lists: data.lists });
  } catch (e) { next(e); }
});

// DELETE — delete item
router.delete('/projects/:projectId/todos/items/:id', async (req, res, next) => {
  try {
    const [[oldItem]] = await pool.query(
      'SELECT title FROM todo_items WHERE id = ? AND project_id = ?',
      [req.params.id, req.params.projectId]
    );
    const [r] = await pool.query(
      'DELETE FROM todo_items WHERE id = ? AND project_id = ?',
      [req.params.id, req.params.projectId]
    );
    if (!r.affectedRows) return res.status(404).json({ message: 'Item not found' });
    await recordActivity(pool, {
      projectId: Number(req.params.projectId),
      actorId: req.user.id,
      feature: 'todos',
      action: 'item_deleted',
      targetType: 'todoitem',
      targetId: req.params.id,
      targetLabel: oldItem?.title || null,
    });
    const data = await loadFull(req.params.projectId);
    res.json({ ok: true, lists: data.lists });
  } catch (e) { next(e); }
});

module.exports = router;