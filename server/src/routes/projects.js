const express = require('express');
const pool = require('../config/database');
const { auth } = require('../middleware/auth');
const { requireProjectMember } = require('../middleware/projectMember');
const { t } = require('../i18n');
const { recordActivity, hydrateActivity, FEATURE_META, FEATURE_KEYS } = require('../utils/activity');

const router = express.Router();

const PER_PAGE_OPTIONS = [10, 20, 30, 50];
const PER_PAGE_DEFAULT = 10;
const ACTIVITY_MAX_PAGE = 500; // safety cap (500 * 50 = 25k rows per request)

// GET /api/projects
router.get('/', auth, async (req, res, next) => {
  try {
    const { status, managerId } = req.query;
    let query = `SELECT p.*, u.first_name, u.last_name, u.email,
                        (SELECT COUNT(*) FROM tb_tasks tk WHERE tk.project_id = p.id AND tk.archived_at IS NULL) as total_tasks,
                        (SELECT COUNT(*) FROM tb_tasks tk JOIN tb_columns c ON tk.column_id = c.id WHERE tk.project_id = p.id AND LOWER(c.name) IN ('done', 'completed', 'complete') AND tk.archived_at IS NULL) as completed_tasks
                 FROM projects p
                 LEFT JOIN users u ON p.manager_id = u.id
                 WHERE 1=1`;
    const params = [];

    if (status) { query += ' AND p.status = ?'; params.push(status); }
    if (managerId) { query += ' AND p.manager_id = ?'; params.push(managerId); }

    // Project managers (owner) see ALL their projects including archived.
    // Members only see non-archived projects.
    query += ` AND (p.manager_id = ? OR p.id IN (SELECT project_id FROM project_members WHERE user_id = ? AND status = 'active'))`;
    params.push(req.user.id, req.user.id);

    // Non-owner members cannot see archived projects
    query += ` AND (p.manager_id = ? OR p.archived_at IS NULL)`;
    params.push(req.user.id);

    query += ' ORDER BY p.created_at DESC';
    const [projects] = await pool.query(query, params);
    res.json({ projects });
  } catch (err) { next(err); }
});

// GET /api/projects/:id/active-members — returns only active members for @mention autocomplete
// Excludes: pending invitations, removed members, archived/inactive users.
router.get('/:id/active-members', auth, requireProjectMember('id'), async (req, res, next) => {
  try {
    const projectId = Number(req.params.id);
    if (!projectId) return res.status(400).json({ error: t(req.lang, 'errors.invalidRequest') });

    const [rows] = await pool.query(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.avatar_url
       FROM project_members pm
       JOIN users u ON u.id = pm.user_id
       WHERE pm.project_id = ? AND pm.status = 'active' AND u.status = 'active'
       UNION
       SELECT u.id, u.first_name, u.last_name, u.email, u.avatar_url
       FROM projects p
       JOIN users u ON u.id = p.manager_id
       WHERE p.id = ? AND u.status = 'active'
      `,
      [projectId, projectId]
    );

    // Deduplicate in case the owner is also in project_members.
    const seen = new Set();
    const members = rows.filter((r) => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });

    res.json({ members });
  } catch (err) { next(err); }
});

// GET /api/projects/:id
router.get('/:id', auth, requireProjectMember('id'), async (req, res, next) => {
  try {
    const [projects] = await pool.query(
      `SELECT p.*, u.first_name, u.last_name, u.email
       FROM projects p LEFT JOIN users u ON p.manager_id = u.id WHERE p.id = ?`,
      [req.params.id]
    );
    if (projects.length === 0) return res.status(404).json({ error: t(req.lang, 'errors.projectNotFound') });

    // Archived projects are only accessible by the owner (manager_id).
    // Non-owners get 403 even if they're project members — archived projects
    // must not be accessible via direct URL for non-owners.
    const proj = projects[0];
    if (proj.archived_at && Number(proj.manager_id) !== Number(req.user.id)) {
      return res.status(403).json({
        error: "This project is archived and only accessible to the project owner.",
        code: "PROJECT_ARCHIVED",
      });
    }

    // Fetch members with extra flags: is_external (invited via email only),
    // and is_owner so the client can highlight the owner without an extra
    // request. External members have status='inactive'.
    const [members] = await pool.query(
      `SELECT pm.*, u.first_name, u.last_name, u.email, u.avatar_url, u.status as user_status,
              (u.status = 'inactive') AS is_external,
              d.name as department
       FROM project_members pm JOIN users u ON pm.user_id = u.id
       LEFT JOIN departments d ON u.department_id = d.id WHERE pm.project_id = ?
       ORDER BY is_external ASC, u.first_name ASC`,
      [req.params.id]
    );

    const [todoLists] = await pool.query(
      `SELECT tl.*, (SELECT COUNT(*) FROM tb_tasks WHERE project_id = tl.project_id AND archived_at IS NULL) as task_count,
              (SELECT COUNT(*) FROM tb_tasks tk JOIN tb_columns c ON tk.column_id = c.id WHERE tk.project_id = tl.project_id AND LOWER(c.name) IN ('done', 'completed', 'complete') AND tk.archived_at IS NULL) as done_count
       FROM todo_lists tl WHERE tl.project_id = ? ORDER BY tl.created_at`,
      [req.params.id]
    );

    // Mark owner on each member row (the manager_id field on the project).
    const ownerId = projects[0].manager_id;
    const enrichedMembers = members.map(m => ({ ...m, is_owner: m.user_id === ownerId }));

    // canManageTeam: owner OR any active project member can manage team members.
    // The API routes themselves enforce further authorization (requireProjectMember).
    const isMember = enrichedMembers.some(m => String(m.user_id) === String(req.user.id))
    const canManageTeam = Number(proj.manager_id) === Number(req.user.id) || isMember

    res.json({ project: { ...projects[0], canManageTeam }, members: enrichedMembers, todoLists, owner_id: ownerId });
  } catch (err) { next(err); }
});

// POST /api/projects
router.post('/', auth, async (req, res, next) => {
  try {
    // SECURITY: owner (manager_id) is always the authenticated user. Any
    // managerId / owner_id sent from the client is intentionally ignored to
    // prevent privilege escalation or impersonation.
    const ownerId = req.user.id;
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: t(req.lang, 'errors.projectNameRequired') });

    const [result] = await pool.query(
      'INSERT INTO projects (name, description, start_date, end_date, manager_id) VALUES (?, ?, NULL, NULL, ?)',
      [name, description || '', ownerId]
    );

    // Add the creator as a project member with Project Manager role.
    await pool.query(
      'INSERT INTO project_members (project_id, user_id, role_in_project) VALUES (?, ?, ?)',
      [result.insertId, ownerId, 'Project Manager']
    );

    await recordActivity(pool, {
      projectId: result.insertId,
      actorId: ownerId,
      feature: 'project',
      action: 'created',
      targetType: 'project',
      targetId: result.insertId,
      targetLabel: name,
    });

    res.status(201).json({ id: result.insertId, message: t(req.lang, 'errors.projectCreated') });
  } catch (err) { next(err); }
});

// PUT /api/projects/:id/archive
// Only the project owner can archive the project.
router.put('/:id/archive', auth, async (req, res, next) => {
  try {
    const [[proj]] = await pool.query('SELECT name, manager_id FROM projects WHERE id = ?', [req.params.id]);
    if (!proj) return res.status(404).json({ error: t(req.lang, 'errors.projectNotFound') });
    if (Number(proj.manager_id) !== Number(req.user.id)) {
      return res.status(403).json({ error: t(req.lang, 'errors.permissionDenied') });
    }
    await pool.query('UPDATE projects SET archived_at = NOW() WHERE id = ?', [req.params.id]);
    await recordActivity(pool, {
      projectId: Number(req.params.id),
      actorId: req.user.id,
      feature: 'project',
      action: 'archived',
      targetType: 'project',
      targetId: req.params.id,
      targetLabel: proj.name,
    });
    res.json({ message: t(req.lang, 'errors.projectArchived') });
  } catch (err) { next(err); }
});

// PUT /api/projects/:id
router.put('/:id', auth, async (req, res, next) => {
  try {
    const toValue = (v) => (v === '' || v === null || v === undefined) ? null : v;
    // SECURITY: never let the client reassign the project owner (manager_id)
    // via update. We only allow editing the name/description here so non-admin
    // editors cannot escalate privileges by transferring ownership.
    const { name, description } = req.body;
    const fields = [];
    const params = [];
    if (name !== undefined && name !== '') { fields.push('name = ?'); params.push(name); }
    if (description !== undefined) { fields.push('description = ?'); params.push(toValue(description)); }
    if (fields.length === 0) {
      return res.status(400).json({ error: t(req.lang, 'errors.noFieldsToUpdate') });
    }
    params.push(req.params.id);
    await pool.query(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`, params);

    await recordActivity(pool, {
      projectId: Number(req.params.id),
      actorId: req.user.id,
      feature: 'project',
      action: 'updated',
      targetType: 'project',
      targetId: req.params.id,
      targetLabel: name || undefined,
    });

    res.json({ message: t(req.lang, 'errors.projectUpdated') });
  } catch (err) { next(err); }
});

// DELETE /api/projects/:id
router.delete('/:id', auth, async (req, res, next) => {
  try {
    // SECURITY: only the project owner can delete the project.
    const [[proj]] = await pool.query('SELECT name, manager_id FROM projects WHERE id = ?', [req.params.id]);
    if (!proj) return res.status(404).json({ error: t(req.lang, 'errors.projectNotFound') });
    if (Number(proj.manager_id) !== Number(req.user.id)) {
      return res.status(403).json({ error: t(req.lang, 'errors.permissionDenied') });
    }
    await pool.query('DELETE FROM projects WHERE id = ?', [req.params.id]);
    await recordActivity(pool, {
      projectId: Number(req.params.id),
      actorId: req.user.id,
      feature: 'project',
      action: 'deleted',
      targetType: 'project',
      targetId: req.params.id,
      targetLabel: proj.name,
    });
    res.json({ message: t(req.lang, 'errors.projectDeleted') });
  } catch (err) { next(err); }
});

// POST /api/projects/:id/members
// Accepts { userId } for existing registered users ONLY.
// External email invites go through POST /api/projects/:id/invitations instead.
router.post('/:id/members', auth, async (req, res, next) => {
  try {
    const { userId, roleInProject } = req.body;

    if (!userId) return res.status(400).json({ error: t(req.lang, 'errors.userIdRequired') });

    // Caller must be a member of this project (or the owner).
    const [memberCheck] = await pool.query(
      'SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    const [ownerCheck] = await pool.query(
      'SELECT 1 FROM projects WHERE id = ? AND manager_id = ?',
      [req.params.id, req.user.id]
    );
    if (memberCheck.length === 0 && ownerCheck.length === 0) {
      return res.status(403).json({ error: t(req.lang, 'errors.permissionDenied') });
    }

    const targetUserId = userId;

    // Pre-check duplicate so we return a friendly error.
    const [dup] = await pool.query(
      'SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?',
      [req.params.id, targetUserId]
    );
    if (dup.length > 0) {
      return res.status(409).json({ error: t(req.lang, 'errors.memberAlreadyExists') });
    }

    const [result] = await pool.query(
      'INSERT INTO project_members (project_id, user_id, role_in_project) VALUES (?, ?, ?)',
      [req.params.id, targetUserId, roleInProject || 'member']
    );

    // Pull the new member's display name for the activity label.
    const [[member]] = await pool.query(
      'SELECT first_name, last_name, email FROM users WHERE id = ?',
      [targetUserId]
    );
    const memberLabel = member
      ? `${member.first_name || ''} ${member.last_name || ''}`.trim() || member.email
      : `user #${targetUserId}`;
    await recordActivity(pool, {
      projectId: Number(req.params.id),
      actorId: req.user.id,
      feature: 'team',
      action: 'member_added',
      targetType: 'member',
      targetId: targetUserId,
      targetLabel: memberLabel,
    });

    res.status(201).json({ id: result.insertId, userId: targetUserId, message: t(req.lang, 'errors.memberAdded') });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: t(req.lang, 'errors.memberAlreadyExists') });
    next(err);
  }
});

// DELETE /api/projects/:id/members/:userId
// Only the project owner can remove members. Members must use POST /leave to
// remove themselves from a project.
router.delete('/:id/members/:userId', auth, async (req, res, next) => {
  try {
    const [ownerCheck] = await pool.query(
      'SELECT manager_id FROM projects WHERE id = ?',
      [req.params.id]
    );
    if (ownerCheck.length === 0) return res.status(404).json({ error: t(req.lang, 'errors.projectNotFound') });
    const ownerId = ownerCheck[0].manager_id;

    // SECURITY: only the project owner can remove members.
    if (Number(ownerId) !== Number(req.user.id)) {
      return res.status(403).json({ error: t(req.lang, 'errors.permissionDenied') });
    }

    // Prevent removing the owner from their own project.
    if (parseInt(req.params.userId) === ownerId) {
      return res.status(400).json({ error: t(req.lang, 'errors.cannotRemoveOwner') });
    }

    // Pull the removed member's label BEFORE the row is gone.
    const [[leaver]] = await pool.query(
      'SELECT first_name, last_name, email FROM users WHERE id = ?',
      [req.params.userId]
    );
    const leaverLabel = leaver
      ? `${leaver.first_name || ''} ${leaver.last_name || ''}`.trim() || leaver.email
      : `user #${req.params.userId}`;

    await pool.query('DELETE FROM project_members WHERE project_id = ? AND user_id = ?', [req.params.id, req.params.userId]);

    await recordActivity(pool, {
      projectId: Number(req.params.id),
      actorId: req.user.id,
      feature: 'team',
      action: 'member_removed',
      targetType: 'member',
      targetId: req.params.userId,
      targetLabel: leaverLabel,
    });

    res.json({ message: t(req.lang, 'errors.memberRemoved') });
  } catch (err) { next(err); }
});

// POST /api/projects/:id/leave
// Allows a project member to remove themselves from the project.
// The owner cannot leave — they must transfer ownership first.
router.post('/:id/leave', auth, async (req, res, next) => {
  try {
    const [ownerCheck] = await pool.query(
      'SELECT manager_id FROM projects WHERE id = ?',
      [req.params.id]
    );
    if (ownerCheck.length === 0) return res.status(404).json({ error: t(req.lang, 'errors.projectNotFound') });
    const ownerId = ownerCheck[0].manager_id;

    if (Number(ownerId) === Number(req.user.id)) {
      return res.status(400).json({ error: t(req.lang, 'errors.cannotLeaveAsOwner') });
    }

    const [memberCheck] = await pool.query(
      'SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    if (memberCheck.length === 0) {
      return res.status(404).json({ error: t(req.lang, 'errors.memberNotFound') });
    }

    await pool.query('DELETE FROM project_members WHERE project_id = ? AND user_id = ?', [req.params.id, req.user.id]);

    await recordActivity(pool, {
      projectId: Number(req.params.id),
      actorId: req.user.id,
      feature: 'team',
      action: 'member_left',
      targetType: 'member',
      targetId: req.user.id,
      targetLabel: req.user.email,
    });

    res.json({ message: t(req.lang, 'errors.leftProject') });
  } catch (err) { next(err); }
});

// POST /api/projects/:id/restore
// Only the project owner can restore an archived project.
router.post('/:id/restore', auth, async (req, res, next) => {
  try {
    const [[proj]] = await pool.query('SELECT name, manager_id FROM projects WHERE id = ?', [req.params.id]);
    if (!proj) return res.status(404).json({ error: t(req.lang, 'errors.projectNotFound') });
    if (Number(proj.manager_id) !== Number(req.user.id)) {
      return res.status(403).json({ error: t(req.lang, 'errors.permissionDenied') });
    }
    await pool.query('UPDATE projects SET archived_at = NULL WHERE id = ?', [req.params.id]);
    await recordActivity(pool, {
      projectId: Number(req.params.id),
      actorId: req.user.id,
      feature: 'project',
      action: 'restored',
      targetType: 'project',
      targetId: req.params.id,
      targetLabel: proj.name,
    });
    res.json({ message: t(req.lang, 'errors.projectRestored') });
  } catch (err) { next(err); }
});

// POST /api/projects/:id/todolists
router.post('/:id/todolists', auth, async (req, res, next) => {
  try {
    const { name } = req.body;
    const [result] = await pool.query('INSERT INTO todo_lists (project_id, name) VALUES (?, ?)', [req.params.id, name]);

    await recordActivity(pool, {
      projectId: Number(req.params.id),
      actorId: req.user.id,
      feature: 'todos',
      action: 'list_created',
      targetType: 'todolist',
      targetId: result.insertId,
      targetLabel: name,
    });

    res.status(201).json({ id: result.insertId, name });
  } catch (err) { next(err); }
});

// DELETE /api/projects/:id/todolists/:listId
router.delete('/:id/todolists/:listId', auth, async (req, res, next) => {
  try {
    await pool.query('DELETE FROM todo_lists WHERE id = ? AND project_id = ?', [req.params.listId, req.params.id]);

    await recordActivity(pool, {
      projectId: Number(req.params.id),
      actorId: req.user.id,
      feature: 'todos',
      action: 'list_deleted',
      targetType: 'todolist',
      targetId: Number(req.params.listId),
    });

    res.json({ message: t(req.lang, 'errors.todoListDeleted') });
  } catch (err) { next(err); }
});

// GET /api/projects/:id/cards — unified list of all cards (docs, files, tasks) for a project.
router.get('/:id/cards', auth, async (req, res, next) => {
  try {
    const projectId = req.params.id;

    // Documents (rich text)
    const [docs] = await pool.query(
      `SELECT d.id, d.project_id, d.title, d.content_html, d.file_url, d.file_type, d.file_size,
              d.uploaded_by, d.created_at, d.updated_at,
              u.first_name AS author_first, u.last_name AS author_last, u.email AS author_email
         FROM documents d
         LEFT JOIN users u ON u.id = d.uploaded_by
        WHERE d.project_id = ?
        ORDER BY COALESCE(d.updated_at, d.created_at) DESC`,
      [projectId]
    );

    // Tasks (from tb_tasks)
    const [tasks] = await pool.query(
      `SELECT tk.id, tk.title, tk.description_html AS description, tk.priority, tk.due_date,
              tk.created_at, tk.updated_at, tk.column_id,
              c.name AS column_name,
              tl.name AS todolist_name, tl.project_id,
              u.first_name AS assignee_first, u.last_name AS assignee_last
         FROM tb_tasks tk
         LEFT JOIN tb_columns c ON c.id = tk.column_id
         LEFT JOIN todo_lists tl ON tl.project_id = tk.project_id
         LEFT JOIN tb_assignees ta ON ta.task_id = tk.id
         LEFT JOIN users u ON u.id = ta.user_id
        WHERE tk.project_id = ? AND tk.archived_at IS NULL
        GROUP BY tk.id
        ORDER BY COALESCE(tk.updated_at, tk.created_at) DESC`,
      [projectId]
    );

    // Build unified cards array
    const cards = [];

    for (const d of docs) {
      if (d.content_html) {
        // Rich text document
        const text = String(d.content_html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        cards.push({
          id: `doc-${d.id}`,
          type: 'document',
          refId: d.id,
          title: d.title || 'Untitled document',
          preview: text.slice(0, 140),
          author: { id: d.uploaded_by, first_name: d.author_first, last_name: d.author_last, email: d.author_email },
          created_at: d.created_at,
          updated_at: d.updated_at,
        });
      } else {
        // Plain file upload
        cards.push({
          id: `file-${d.id}`,
          type: 'file',
          refId: d.id,
          title: d.title || d.file_url?.split('/').pop() || 'Untitled file',
          preview: d.file_type ? `${d.file_type}${d.file_size ? ` · ${formatSize(d.file_size)}` : ''}` : '',
          file_url: d.file_url,
          file_type: d.file_type,
          file_size: d.file_size,
          author: { id: d.uploaded_by, first_name: d.author_first, last_name: d.author_last, email: d.author_email },
          created_at: d.created_at,
          updated_at: d.updated_at,
        });
      }
    }

    for (const task of tasks) {
      const assignee = task.assignee_first ? `${task.assignee_first} ${task.assignee_last}` : null;
      const statusLabel = ({ todo: 'To do', in_progress: 'In progress', review: 'Review', done: 'Done' })[task.status] || task.status;
      cards.push({
        id: `task-${task.id}`,
        type: 'task',
        refId: task.id,
        title: task.title || 'Untitled task',
        preview: task.todolist_name ? `in ${task.todolist_name}` : '',
        priority: task.priority,
        status: task.status,
        statusLabel,
        due_date: task.due_date,
        assignee: assignee ? { id: task.assignee_id, name: assignee } : null,
        todolist_id: task.todo_list_id,
        author: { first_name: null, last_name: null },
        created_at: task.created_at,
        updated_at: task.updated_at,
        completed_at: task.completed_at,
      });
    }

    // Sort by updated_at desc
    cards.sort((a, b) => {
      const da = new Date(a.updated_at || a.created_at).getTime();
      const db = new Date(b.updated_at || b.created_at).getTime();
      return db - da;
    });

    // Counts
    const counts = {
      total: cards.length,
      documents: cards.filter((c) => c.type === 'document').length,
      tasks: cards.filter((c) => c.type === 'task').length,
      files: cards.filter((c) => c.type === 'file').length,
    };

    res.json({ cards, counts });
  } catch (err) { next(err); }
});

function formatSize(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

// ───────────────────────────────────────────────────────────────────
// GET /api/projects/:id/activities
// Paginated activity feed for a project, newest first.
//   ?page=1         1-indexed page number (default 1, capped at 500)
//   ?perPage=10     10 | 15 | 20 | 50 (default 10)
//   ?feature=…      optional filter — any key from FEATURE_META
//   ?action=…       optional filter — 'created' | 'updated' | 'deleted' | ...
//   ?actorId=…      optional filter — restrict to a single user's events
//
// Returns: { items, total, page, perPage, totalPages, perPageOptions,
//           features, actors }
//   `actors` is a list of distinct humans who have ever produced an event
//   in this project, with their event counts — so the UI can render a
//   "Performed by" filter without a second round-trip.
// ───────────────────────────────────────────────────────────────────
router.get('/:id/activities', auth, async (req, res, next) => {
  try {
    const projectId = Number(req.params.id);
    if (!projectId) return res.status(400).json({ error: t(req.lang, 'errors.invalidRequest') });

    // Confirm the project exists + the caller has access (member or owner).
    const [[proj]] = await pool.query(
      `SELECT p.id, p.manager_id,
              EXISTS(SELECT 1 FROM project_members pm
                     WHERE pm.project_id = p.id AND pm.user_id = ?) AS is_member
         FROM projects p WHERE p.id = ?`,
      [req.user.id, projectId]
    );
    if (!proj) return res.status(404).json({ error: t(req.lang, 'errors.projectNotFound') });
    if (proj.manager_id !== req.user.id && !proj.is_member) {
      return res.status(403).json({ error: t(req.lang, 'errors.permissionDenied') });
    }

    // Pagination params
    const page = Math.max(1, Math.min(ACTIVITY_MAX_PAGE, Number(req.query.page) || 1));
    let perPage = Number(req.query.perPage) || PER_PAGE_DEFAULT;
    if (!PER_PAGE_OPTIONS.includes(perPage)) perPage = PER_PAGE_DEFAULT;

    // Optional filters
    const filters = [];
    const filterParams = [];
    if (req.query.feature && FEATURE_META[req.query.feature]) {
      filters.push('pa.feature = ?');
      filterParams.push(req.query.feature);
    }
    if (req.query.action && typeof req.query.action === 'string' && req.query.action.length <= 60) {
      filters.push('pa.action = ?');
      filterParams.push(req.query.action);
    }
    // Restrict to a single user. Cap defensively; non-numeric ids fall through
    // to a no-match result (empty list).
    const actorIdRaw = req.query.actorId;
    if (actorIdRaw !== undefined && actorIdRaw !== null && actorIdRaw !== '') {
      const actorId = Number(actorIdRaw);
      if (Number.isInteger(actorId) && actorId > 0) {
        filters.push('pa.actor_id = ?');
        filterParams.push(actorId);
      }
    }

    const whereClause = ['pa.project_id = ?', ...filters].join(' AND ');
    const baseParams = [projectId, ...filterParams];

    // Total count (drives pagination)
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM project_activities pa WHERE ${whereClause}`,
      baseParams
    );
    const totalPages = total === 0 ? 0 : Math.ceil(total / perPage);
    const offset = (page - 1) * perPage;

    // Page rows + actor info in one query
    const [rows] = await pool.query(
      `SELECT pa.id, pa.project_id, pa.actor_id, pa.feature, pa.action,
              pa.target_type, pa.target_id, pa.target_label, pa.meta, pa.created_at,
              u.first_name, u.last_name, u.email, u.avatar_url
         FROM project_activities pa
         JOIN users u ON u.id = pa.actor_id
        WHERE ${whereClause}
        ORDER BY pa.created_at DESC, pa.id DESC
        LIMIT ? OFFSET ?`,
      [...baseParams, perPage, offset]
    );

    const items = rows.map((r) =>
      hydrateActivity(r, { first_name: r.first_name, last_name: r.last_name, email: r.email, avatar_url: r.avatar_url })
    );

    // Distinct actors in this project. Always pulled WITHOUT the actorId
    // filter so the dropdown list stays stable while the user toggles
    // "Performed by" — otherwise flipping the filter would empty the list.
    const [actorRows] = await pool.query(
      `SELECT pa.actor_id AS id,
              u.first_name AS first_name,
              u.last_name AS last_name,
              u.email AS email,
              COUNT(*) AS event_count
         FROM project_activities pa
         JOIN users u ON u.id = pa.actor_id
        WHERE pa.project_id = ?
        GROUP BY pa.actor_id, u.first_name, u.last_name, u.email
        ORDER BY event_count DESC, u.first_name ASC, u.last_name ASC`,
      [projectId]
    );
    const actors = actorRows.map((r) => ({
      id: r.id,
      name: [r.first_name, r.last_name].filter(Boolean).join(' ').trim() || r.email,
      email: r.email,
      eventCount: r.event_count,
    }));

    res.json({
      items,
      total,
      page,
      perPage,
      totalPages,
      perPageOptions: PER_PAGE_OPTIONS,
      features: FEATURE_KEYS,
      actors,
    });
  } catch (err) { next(err); }
});

module.exports = router;