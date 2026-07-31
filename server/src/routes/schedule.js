/**
 * Project Schedule — Basecamp-style calendar events.
 *
 * Endpoints:
 *   GET    /api/projects/:projectId/schedule[?from=&to=]   — list (range filter)
 *   POST   /api/projects/:projectId/schedule               — create
 *   PATCH  /api/projects/:projectId/schedule/:id           — update
 *   DELETE /api/projects/:projectId/schedule/:id           — delete
 *
 * Member-only access (project owner OR row in project_members).
 */

const express = require('express');
const pool = require('../config/database');
const { auth } = require('../middleware/auth');
const { requireProjectMember } = require('../middleware/projectMember');
const { recordActivity } = require('../utils/activity');

const router = express.Router();
router.use(auth);
router.use('/projects/:projectId', requireProjectMember('projectId'));

const COLORS = new Set(['sky', 'emerald', 'amber', 'rose', 'violet', 'indigo']);
const CATEGORIES = new Set(['meeting', 'milestone', 'reminder', 'release', 'event']);

function toMysqlDateTime(iso) {
  if (!iso) return null;
  // accept ISO string or Date
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (isNaN(d.getTime())) return null;
  // MySQL DATETIME: YYYY-MM-DD HH:MM:SS (UTC)
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

function toIso(mysqlStr) {
  if (!mysqlStr) return null;
  // Treat the MySQL DATETIME as UTC and emit ISO with Z
  return new Date(mysqlStr + 'Z').toISOString();
}

async function loadEvent(eventId) {
  const [[ev]] = await pool.query(
    `SELECT e.*, u.first_name AS creator_first_name, u.last_name AS creator_last_name
       FROM schedule_events e
       LEFT JOIN users u ON u.id = e.created_by
      WHERE e.id = ?`,
    [eventId]
  );
  if (!ev) return null;
  const [attendees] = await pool.query(
    `SELECT a.user_id, a.response, u.first_name, u.last_name, u.email
       FROM schedule_event_attendees a
       JOIN users u ON u.id = a.user_id
      WHERE a.event_id = ?
      ORDER BY u.first_name ASC`,
    [eventId]
  );
  return {
    id: ev.id,
    project_id: ev.project_id,
    title: ev.title,
    description: ev.description,
    start_at: toIso(ev.start_at),
    end_at: toIso(ev.end_at),
    all_day: !!ev.all_day,
    location: ev.location,
    color: ev.color,
    category: ev.category,
    created_at: ev.created_at,
    updated_at: ev.updated_at,
    created_by: ev.created_by ? {
      id: ev.created_by,
      first_name: ev.creator_first_name,
      last_name: ev.creator_last_name,
    } : null,
    attendees: attendees.map((a) => ({
      user_id: a.user_id,
      response: a.response,
      first_name: a.first_name,
      last_name: a.last_name,
      email: a.email,
    })),
  };
}

// ─── routes ─────────────────────────────────────────────────────────────────

// GET — list (optionally filtered by [from, to])
router.get('/projects/:projectId/schedule', async (req, res, next) => {
  try {
    const { from, to } = req.query;
    let q = 'SELECT id FROM schedule_events WHERE project_id = ?';
    const params = [req.params.projectId];
    if (from) {
      q += ' AND end_at >= ?';
      params.push(toMysqlDateTime(from));
    }
    if (to) {
      q += ' AND start_at <= ?';
      params.push(toMysqlDateTime(to));
    }
    q += ' ORDER BY start_at ASC, id ASC';

    const [rows] = await pool.query(q, params);
    const events = [];
    for (const r of rows) {
      const ev = await loadEvent(r.id);
      if (ev) events.push(ev);
    }
    res.json({ events });
  } catch (e) { next(e); }
});

// POST — create
router.post('/projects/:projectId/schedule', async (req, res, next) => {
  try {
    const {
      title, description, start_at, end_at, all_day, location, color, category, attendee_ids,
    } = req.body || {};

    if (!title || !String(title).trim()) return res.status(400).json({ message: 'Event title is required' });
    if (!start_at || !end_at) return res.status(400).json({ message: 'start_at and end_at are required' });

    const start = toMysqlDateTime(start_at);
    const end = toMysqlDateTime(end_at);
    if (!start || !end) return res.status(400).json({ message: 'Invalid start_at or end_at' });
    if (new Date(end) < new Date(start)) return res.status(400).json({ message: 'end_at must be on or after start_at' });

    const safeColor = COLORS.has(color) ? color : 'sky';
    const safeCategory = CATEGORIES.has(category) ? category : 'event';

    const [r] = await pool.query(
      `INSERT INTO schedule_events
        (project_id, title, description, start_at, end_at, all_day, location, color, category, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.params.projectId,
        String(title).trim(),
        description ? String(description).trim() : null,
        start,
        end,
        all_day ? 1 : 0,
        location ? String(location).trim() : null,
        safeColor,
        safeCategory,
        req.user.id,
      ]
    );

    if (Array.isArray(attendee_ids) && attendee_ids.length) {
      const values = attendee_ids.map((u) => [r.insertId, Number(u)]);
      await pool.query(
        'INSERT INTO schedule_event_attendees (event_id, user_id) VALUES ?',
        [values]
      );
    }

    await recordActivity(pool, {
      projectId: Number(req.params.projectId),
      actorId: req.user.id,
      feature: 'schedule',
      action: 'event_created',
      targetType: 'schedule_event',
      targetId: r.insertId,
      targetLabel: String(title).trim(),
      meta: { category: safeCategory, start_at: start },
    });

    const ev = await loadEvent(r.insertId);
    res.status(201).json({ event: ev });
  } catch (e) { next(e); }
});

// PATCH — update
router.patch('/projects/:projectId/schedule/:id', async (req, res, next) => {
  try {
    // Verify event belongs to project
    const [[ev]] = await pool.query(
      'SELECT id FROM schedule_events WHERE id = ? AND project_id = ?',
      [req.params.id, req.params.projectId]
    );
    if (!ev) return res.status(404).json({ message: 'Event not found' });

    const updates = [];
    const params = [];
    const {
      title, description, start_at, end_at, all_day, location, color, category, attendee_ids,
    } = req.body || {};

    if (title !== undefined) {
      if (!String(title).trim()) return res.status(400).json({ message: 'Event title cannot be empty' });
      updates.push('title = ?'); params.push(String(title).trim());
    }
    if (description !== undefined) {
      updates.push('description = ?'); params.push(description ? String(description).trim() : null);
    }
    if (start_at !== undefined) {
      const s = toMysqlDateTime(start_at);
      if (!s) return res.status(400).json({ message: 'Invalid start_at' });
      updates.push('start_at = ?'); params.push(s);
    }
    if (end_at !== undefined) {
      const e = toMysqlDateTime(end_at);
      if (!e) return res.status(400).json({ message: 'Invalid end_at' });
      updates.push('end_at = ?'); params.push(e);
    }
    if (all_day !== undefined) {
      updates.push('all_day = ?'); params.push(all_day ? 1 : 0);
    }
    if (location !== undefined) {
      updates.push('location = ?'); params.push(location ? String(location).trim() : null);
    }
    if (color !== undefined) {
      if (!COLORS.has(color)) return res.status(400).json({ message: 'Invalid color' });
      updates.push('color = ?'); params.push(color);
    }
    if (category !== undefined) {
      updates.push('category = ?');
      params.push(CATEGORIES.has(category) ? category : 'event');
    }

    if (updates.length) {
      params.push(req.params.id);
      await pool.query(
        `UPDATE schedule_events SET ${updates.join(', ')} WHERE id = ?`,
        params
      );
    }

    // Replace attendees if provided
    if (Array.isArray(attendee_ids)) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await conn.query('DELETE FROM schedule_event_attendees WHERE event_id = ?', [req.params.id]);
        if (attendee_ids.length) {
          const values = attendee_ids.map((u) => [req.params.id, Number(u)]);
          await conn.query(
            'INSERT INTO schedule_event_attendees (event_id, user_id) VALUES ?',
            [values]
          );
        }
        await conn.commit();
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
    }

    const updated = await loadEvent(req.params.id);
    if (updates.length) {
      const [[titleRow]] = await pool.query(
        'SELECT title FROM schedule_events WHERE id = ?',
        [req.params.id]
      );
      await recordActivity(pool, {
        projectId: Number(req.params.projectId),
        actorId: req.user.id,
        feature: 'schedule',
        action: 'event_updated',
        targetType: 'schedule_event',
        targetId: req.params.id,
        targetLabel: titleRow?.title || `event #${req.params.id}`,
        meta: { changed: updates.map((u) => u.split(' = ')[0]) },
      });
    }
    res.json({ event: updated });
  } catch (e) { next(e); }
});

// DELETE
router.delete('/projects/:projectId/schedule/:id', async (req, res, next) => {
  try {
    const [[oldEv]] = await pool.query(
      'SELECT title FROM schedule_events WHERE id = ? AND project_id = ?',
      [req.params.id, req.params.projectId]
    );
    const [r] = await pool.query(
      'DELETE FROM schedule_events WHERE id = ? AND project_id = ?',
      [req.params.id, req.params.projectId]
    );
    if (!r.affectedRows) return res.status(404).json({ message: 'Event not found' });
    await recordActivity(pool, {
      projectId: Number(req.params.projectId),
      actorId: req.user.id,
      feature: 'schedule',
      action: 'event_deleted',
      targetType: 'schedule_event',
      targetId: req.params.id,
      targetLabel: oldEv?.title || null,
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;