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
const { processAndNotifyMentions, SOURCE_TYPES } = require('../utils/mentions');

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
            c.first_name AS completer_first_name, c.last_name AS completer_last_name,
            cr.first_name AS creator_first_name_item, cr.last_name AS creator_last_name_item
       FROM todo_items i
       LEFT JOIN users c  ON c.id  = i.completed_by
       LEFT JOIN users cr ON cr.id = i.created_by
      WHERE i.list_id IN (?)
      ORDER BY i.completed ASC, i.position ASC, i.id ASC`,
    [listIds]
  );

  // Load all assignee rows for these items.
  const itemIds = items.map((it) => it.id);
  const [assigneeRows] = itemIds.length
    ? await pool.query(
        `SELECT ta.todo_item_id, ta.user_id, u.first_name, u.last_name
           FROM todo_item_assignees ta
           JOIN users u ON u.id = ta.user_id
          WHERE ta.todo_item_id IN (?)`,
        [itemIds]
      )
    : [[]];

  // Group assignees by item id.
  const assigneesByItem = new Map();
  for (const row of assigneeRows) {
    if (!assigneesByItem.has(row.todo_item_id)) {
      assigneesByItem.set(row.todo_item_id, []);
    }
    assigneesByItem.get(row.todo_item_id).push({
      id: row.user_id,
      first_name: row.first_name,
      last_name: row.last_name,
    });
  }

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
      items: byList.get(l.id).map((it) => {
        const assignees = assigneesByItem.get(it.id) || [];
        return {
          id: it.id,
          list_id: it.list_id,
          title: it.title,
          notes: it.notes,
          completed: !!it.completed,
          completed_at: it.completed_at,
          due_date: it.due_date,
          assignee_ids: assignees.map((a) => a.id),
          assignees,
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
        };
      }),
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
      action: 'created',
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
    // Fetch list name before deleting so we can record it in the activity log.
    const [existing] = await pool.query(
      'SELECT name FROM todo_lists WHERE id = ? AND project_id = ?',
      [req.params.id, req.params.projectId]
    );
    if (!existing.length) return res.status(404).json({ message: 'List not found' });
    const listName = existing[0].name;

    const [r] = await pool.query(
      'DELETE FROM todo_lists WHERE id = ? AND project_id = ?',
      [req.params.id, req.params.projectId]
    );
    if (!r.affectedRows) return res.status(404).json({ message: 'List not found' });
    await recordActivity(pool, {
      projectId: Number(req.params.projectId),
      actorId: req.user.id,
      feature: 'todos',
      action: 'deleted',
      targetType: 'todolist',
      targetId: req.params.id,
      targetLabel: listName,
    });
    const data = await loadFull(req.params.projectId);
    res.json({ ok: true, lists: data.lists });
  } catch (e) { next(e); }
});

// POST — add item
router.post('/projects/:projectId/todos/lists/:id/items', async (req, res, next) => {
  try {
    const { title, notes, assignee_ids, due_date } = req.body || {};
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
      `INSERT INTO todo_items (list_id, project_id, title, notes, due_date, position, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        req.params.id,
        req.params.projectId,
        title.trim(),
        notes ? String(notes).trim() : null,
        due_date || null,
        nextPos,
        req.user.id,
      ]
    );
    const itemId = r.insertId;
    const projectId = Number(req.params.projectId);

    // Insert assignees into junction table.
    if (Array.isArray(assignee_ids) && assignee_ids.length > 0) {
      const assigneeValues = assignee_ids.map((id) => [itemId, Number(id)]);
      await pool.query(
        'INSERT INTO todo_item_assignees (todo_item_id, user_id) VALUES ?',
        [assigneeValues]
      );
    }

    // Process @mentions from notes — store records and send in-app notifications.
    if (notes) {
      await processAndNotifyMentions({
        projectId,
        sourceType: SOURCE_TYPES.TODO_NOTE,
        sourceId: itemId,
        content: String(notes).trim(),
        mentionedByUserId: req.user.id,
        lang: req.lang,
        link: `/projects/${projectId}/todos`,
      });
    }

    await recordActivity(pool, {
      projectId,
      actorId: req.user.id,
      feature: 'todos',
      action: 'created',
      targetType: 'todoitem',
      targetId: itemId,
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
    const { title, notes, assignee_ids, due_date, completed, position } = req.body || {};
    const updates = [];
    const params = [];

    if (title !== undefined) {
      if (!String(title).trim()) return res.status(400).json({ message: 'Item title cannot be empty' });
      updates.push('title = ?'); params.push(String(title).trim());
    }
    if (notes !== undefined) {
      updates.push('notes = ?'); params.push(notes ? String(notes).trim() : null);
    }
    if (assignee_ids !== undefined) {
      // Replace all assignees: delete existing rows then insert new ones.
      await pool.query(
        'DELETE FROM todo_item_assignees WHERE todo_item_id = ?',
        [req.params.id]
      );
      if (Array.isArray(assignee_ids) && assignee_ids.length > 0) {
        const assigneeValues = assignee_ids.map((id) => [Number(req.params.id), Number(id)]);
        await pool.query(
          'INSERT INTO todo_item_assignees (todo_item_id, user_id) VALUES ?',
          [assigneeValues]
        );
      }
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

    // Process @mentions when notes are updated.
    if (notes !== undefined) {
      const newNotes = notes ? String(notes).trim() : null;
      if (newNotes) {
        await processAndNotifyMentions({
          projectId: Number(req.params.projectId),
          sourceType: SOURCE_TYPES.TODO_NOTE,
          sourceId: Number(req.params.id),
          content: newNotes,
          mentionedByUserId: req.user.id,
          lang: req.lang,
          link: `/projects/${req.params.projectId}/todos`,
        });
      }
    }

    // Track all changed fields for the activity log.
    const changedFields = []
    if (title !== undefined) changedFields.push('title')
    if (notes !== undefined) changedFields.push('notes')
    if (assignee_ids !== undefined) changedFields.push('assignees')
    if (due_date !== undefined) changedFields.push('due_date')
    if (completed !== undefined) changedFields.push('completed')
    if (position !== undefined) changedFields.push('position')

    if (changedFields.length > 0) {
      if (completed !== undefined && oldItem && !!oldItem.completed !== !!completed) {
        // Dedicated action for completion flip
        await recordActivity(pool, {
          projectId: Number(req.params.projectId),
          actorId: req.user.id,
          feature: 'todos',
          action: completed ? 'completed' : 'reopened',
          targetType: 'todoitem',
          targetId: req.params.id,
          targetLabel: oldItem.title,
        });
      } else {
        await recordActivity(pool, {
          projectId: Number(req.params.projectId),
          actorId: req.user.id,
          feature: 'todos',
          action: 'updated',
          targetType: 'todoitem',
          targetId: req.params.id,
          targetLabel: oldItem?.title,
          meta: { changed: changedFields },
        });
      }
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
      action: 'deleted',
      targetType: 'todoitem',
      targetId: req.params.id,
      targetLabel: oldItem?.title || null,
    });
    const data = await loadFull(req.params.projectId);
    res.json({ ok: true, lists: data.lists });
  } catch (e) { next(e); }
});

module.exports = router;