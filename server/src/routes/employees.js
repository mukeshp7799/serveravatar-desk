const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/database');
const { auth } = require('../middleware/auth');
const { t } = require('../i18n');
const { logActivity } = require('../services/activityService');

const router = express.Router();

// GET /api/employees — List all employees with search, filters, pagination, sorting
router.get('/', auth, async (req, res, next) => {
  try {
    const perms = req.user.permissions || [];
    if (!perms.includes('users.view_all')) {
      return res.status(403).json({ error: t(req.lang, 'errors.permissionDenied') });
    }

    const {
      search,
      departmentId,
      designationId,
      status,
      roleId,
      employmentType,
      sortBy = 'first_name',
      sortOrder = 'ASC',
      page = 1,
      limit = 20,
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    let where = 'WHERE 1=1';
    const params = [];

    if (search) {
      where += ' AND (u.first_name LIKE ? OR u.last_name LIKE ? OR u.email LIKE ? OR u.designation LIKE ? OR u.employee_id LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s, s, s);
    }
    if (departmentId) { where += ' AND u.department_id = ?'; params.push(departmentId); }
    if (designationId) { where += ' AND u.designation_id = ?'; params.push(designationId); }
    if (status) { where += ' AND u.status = ?'; params.push(status); }
    if (roleId) { where += ' AND u.role_id = ?'; params.push(roleId); }
    if (employmentType) { where += ' AND u.employment_type = ?'; params.push(employmentType); }

    // Validate sortBy — include status and employment_type for directory sorting
    const allowedSorts = ['first_name', 'last_name', 'email', 'employee_id', 'hire_date', 'created_at', 'department_name', 'role_name', 'status', 'employment_type'];
    const safeSort = allowedSorts.includes(sortBy) ? sortBy : 'first_name';
    const safeOrder = sortOrder.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    // Count total
    const countQuery = `
      SELECT COUNT(*) as total
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN roles r ON u.role_id = r.id
      ${where}
    `;
    const [[{ total }]] = await pool.query(countQuery, params);

    // Main query
    const orderCol = (() => {
      if (safeSort === 'department_name') return 'd.name';
      if (safeSort === 'role_name') return 'r.name';
      return `u.${safeSort}`;
    })();

    const dataQuery = `
      SELECT
        u.id, u.email, u.first_name, u.last_name,
        u.employee_id, u.designation, u.status, u.hire_date,
        u.employment_type, u.avatar_url, u.phone, u.created_at,
        r.name as role_name, r.id as role_id,
        d.name as department_name, d.id as department_id,
        m.first_name as manager_first_name, m.last_name as manager_last_name,
        m.id as manager_id
      FROM users u
      JOIN roles r ON u.role_id = r.id
      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN users m ON u.reporting_manager_id = m.id
      ${where}
      ORDER BY ${orderCol} ${safeOrder}
      LIMIT ? OFFSET ?
    `;

    const [employees] = await pool.query(dataQuery, [...params, parseInt(limit), offset]);

    res.json({
      employees,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) { next(err); }
});

// GET /api/employees/managers — All active employees for reporting-manager dropdown
router.get('/managers', auth, async (req, res, next) => {
  try {
    const [managers] = await pool.query(`
      SELECT u.id, u.first_name, u.last_name, u.email, u.avatar_url,
        u.designation, d.name as department_name, r.name as role_name
      FROM users u
      JOIN roles r ON u.role_id = r.id
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE u.status = 'active'
      ORDER BY u.first_name ASC, u.last_name ASC
    `);
    res.json({ managers });
  } catch (err) { next(err); }
});

// GET /api/employees/:id/profile — Full employee profile with projects, tasks, activity
router.get('/:id/profile', auth, async (req, res, next) => {
  try {
    const targetId = parseInt(req.params.id, 10);
    const isSelf = targetId === req.user.id;
    const perms = req.user.permissions || [];

    // Activity pagination params
    const actPage = Math.max(1, parseInt(req.query.activity_page, 10) || 1);
    const actLimit = Math.min(50, Math.max(5, parseInt(req.query.activity_limit, 10) || 10));
    const actOffset = (actPage - 1) * actLimit;

    if (!isSelf && !perms.includes('users.view_all')) {
      return res.status(403).json({ error: t(req.lang, 'errors.permissionDenied') });
    }

    // Get employee details
    const [users] = await pool.query(`
      SELECT u.*, r.name as role_name, d.name as department_name,
        m.first_name as manager_first_name, m.last_name as manager_last_name,
        m.id as manager_id, m.email as manager_email,
        des.name as designation_name
      FROM users u
      JOIN roles r ON u.role_id = r.id
      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN users m ON u.reporting_manager_id = m.id
      LEFT JOIN designations des ON u.designation_id = des.id
      WHERE u.id = ?
    `, [targetId]);

    if (users.length === 0) return res.status(404).json({ error: t(req.lang, 'errors.userNotFound') });

    const emp = users[0];

    // Get current projects (as member or manager)
    const [projects] = await pool.query(`
      SELECT p.id, p.name, p.status, p.color,
        CASE WHEN p.manager_id = ? THEN 'manager' ELSE 'member' END as project_role,
        pm.role_in_project
      FROM projects p
      LEFT JOIN project_members pm ON p.id = pm.project_id AND pm.user_id = ?
      WHERE p.manager_id = ? OR pm.user_id = ?
      ORDER BY p.name ASC
    `, [targetId, targetId, targetId, targetId]);

    // Enrich projects with member/manager label
    const enrichedProjects = projects.map(p => ({
      ...p,
      role: p.project_role,
    }));

    // Get recent assigned tasks from task board
    const [tasks] = await pool.query(`
      SELECT t.id, t.title,
        IF(t.archived_at IS NOT NULL, 'completed', 'active') AS status,
        tc.name as column_name, tc.color as column_color,
        p.name as project_name, p.id as project_id
      FROM tb_tasks t
      JOIN tb_columns tc ON t.column_id = tc.id
      JOIN projects p ON tc.project_id = p.id
      JOIN tb_assignees ta ON t.id = ta.task_id
      WHERE ta.user_id = ?
      ORDER BY t.updated_at DESC
      LIMIT 10
    `, [targetId]);

    // Build rich activity timeline from tb_activity AND project_activities
    // Fetch up to 200 from each to cover deep paginated history
    const [ownActivity] = await pool.query(`
      SELECT 'own' as source, ah.id, ah.action, ah.task_id,
        u.first_name, u.last_name, u.avatar_url,
        p.name as project_name, p.id as project_id,
        t.title as task_title,
        ah.details_json, ah.created_at
      FROM tb_activity ah
      JOIN users u ON ah.user_id = u.id
      LEFT JOIN tb_tasks t ON ah.task_id = t.id
      LEFT JOIN projects p ON t.project_id = p.id
      WHERE ah.user_id = ?
      ORDER BY ah.created_at DESC
      LIMIT 200
    `, [targetId]);

    const [projActivity] = await pool.query(`
      SELECT 'project' as source, pa.id, pa.action, pa.feature, pa.target_type,
        pa.target_id, pa.target_label, pa.created_at, pa.meta,
        u.first_name, u.last_name, u.avatar_url,
        p.name as project_name, p.id as project_id
      FROM project_activities pa
      JOIN users u ON pa.actor_id = u.id
      LEFT JOIN projects p ON pa.project_id = p.id
      WHERE pa.actor_id = ?
      ORDER BY pa.created_at DESC
      LIMIT 200
    `, [targetId]);

    // Fetch profile update activity from activity_logs
    const [profileActivity] = await pool.query(`
      SELECT 'profile' as source, al.id, al.action, al.description,
        u.first_name, u.last_name, u.avatar_url,
        al.created_at
      FROM activity_logs al
      JOIN users u ON al.user_id = u.id
      WHERE al.user_id = ? AND al.module = 'Employee'
      ORDER BY al.created_at DESC
      LIMIT 200
    `, [targetId]);

    // Merge and sort by timestamp descending
    const allActivity = [
      ...ownActivity.map(row => ({
        id: row.id,
        action: row.action,
        entity_type: 'task',
        task_id: row.task_id,
        task_title: row.task_title,
        created_at: row.created_at,
        first_name: row.first_name,
        last_name: row.last_name,
        avatar_url: row.avatar_url,
        project_name: row.project_name,
        project_id: row.project_id,
        details_json: row.details_json,
        source: 'tb',
      })),
      ...projActivity.map(row => ({
        id: row.id,
        action: row.action,
        entity_type: row.target_type,
        entity_id: row.target_id,
        target_label: row.target_label,
        feature: row.feature,
        created_at: row.created_at,
        first_name: row.first_name,
        last_name: row.last_name,
        avatar_url: row.avatar_url,
        project_name: row.project_name,
        project_id: row.project_id,
        meta: row.meta,
        source: 'project',
      })),
      ...profileActivity.map(row => ({
        id: row.id,
        action: row.action,
        entity_type: 'profile',
        target_label: row.description,
        created_at: row.created_at,
        first_name: row.first_name,
        last_name: row.last_name,
        avatar_url: row.avatar_url,
        source: 'profile',
      })),
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    const totalActivity = allActivity.length;
    const paginatedActivity = allActivity.slice(actOffset, actOffset + actLimit);

    // Get direct reports (people who report to this employee)
    const [directReports] = await pool.query(`
      SELECT u.id, u.first_name, u.last_name, u.email, u.avatar_url,
        u.designation, d.name as department_name, r.name as role_name
      FROM users u
      JOIN roles r ON u.role_id = r.id
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE u.reporting_manager_id = ?
      ORDER BY u.first_name ASC
    `, [targetId]);

    // Build response (hide sensitive fields)
    const { password_hash, email_verification_token, email_verification_expires_at, ...profile } = emp;

    res.json({
      employee: profile,
      projects: enrichedProjects,
      tasks,
      activity: paginatedActivity,
      activity_pagination: {
        page: actPage,
        limit: actLimit,
        total: totalActivity,
        totalPages: Math.ceil(totalActivity / actLimit),
      },
      directReports,
    });
  } catch (err) { next(err); }
});

// PUT /api/employees/:id — Update employee (admin: all fields, employee: limited fields)
router.put('/:id', auth, async (req, res, next) => {
  try {
    const targetId = parseInt(req.params.id, 10);
    const isSelf = targetId === req.user.id;
    const perms = req.user.permissions || [];
    const isAdmin = perms.includes('users.edit_all');

    if (!isSelf && !isAdmin) {
      return res.status(403).json({ error: t(req.lang, 'errors.permissionDenied') });
    }

    const updates = [];
    const params = [];

    // Fields admin can update
    const adminFields = [
      'employee_id', 'department_id', 'designation', 'designation_id',
      'reporting_manager_id', 'role_id', 'status', 'employment_type',
      'hire_date', 'first_name', 'last_name',
    ];

    // Fields employee can update for themselves
    const selfFields = [
      'phone', 'address', 'date_of_birth',
      'emergency_contact_name', 'emergency_contact_phone',
      'skills', 'certifications', 'avatar_url',
    ];

    const allFields = isAdmin ? [...adminFields, ...selfFields] : isSelf ? selfFields : [];

    if (allFields.length === 0) {
      return res.status(403).json({ error: t(req.lang, 'errors.permissionDenied') });
    }

    const dateFields = ['hire_date', 'date_of_birth'];

    // Special handling: password must be hashed before storing
    if (isAdmin && req.body.password) {
      const hashed = await bcrypt.hash(req.body.password, 10);
      updates.push('password_hash = ?');
      params.push(hashed);
    }

    // Special handling: email_verified_at (boolean from frontend → NOW() or NULL)
    // When admin marks email as verified, also set status to 'active'
    if (isAdmin && req.body.email_verified_at !== undefined) {
      updates.push('email_verified_at = ?');
      params.push(req.body.email_verified_at ? new Date() : null);
      if (req.body.email_verified_at) {
        updates.push('status = ?');
        params.push('active');
      }
    }

    for (const field of allFields) {
      if (req.body[field] === undefined) continue;
      let value = req.body[field];
      // Skip null values for non-date fields (avoids NOT NULL constraint errors)
      if (value === null) continue;
      // Convert date values to YYYY-MM-DD for MySQL
      if (dateFields.includes(field)) {
        if (value === '' || value === null) continue;
        // Strip time portion from ISO string like "2026-07-31T00:00:00.000Z"
        if (typeof value === 'string' && value.includes('T')) {
          value = value.split('T')[0];
        }
        // If still not a valid YYYY-MM-DD, skip
        if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) continue;
      }
      // Map camelCase to snake_case
      const dbField = field.replace(/([A-Z])/g, '_$1').toLowerCase();
      updates.push(`${dbField} = ?`);
      params.push(value);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: t(req.lang, 'errors.noFieldsToUpdate') });
    }

    // Capture old values BEFORE update for activity logging
    const [[oldUser]] = await pool.query('SELECT status, email FROM users WHERE id = ?', [targetId]);

    params.push(targetId);
    await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);


    // ── Activity log: Employee Updated or Status Changed ─────────────────────
    // Only show target email when admin acts on someone else's account
    const targetLabel = isSelf ? null : (oldUser?.email || targetId);
    const newStatus = req.body.status;
    const oldStatus = oldUser ? oldUser.status : null;
    const statusChanged = newStatus !== undefined && oldStatus !== newStatus;

    if (statusChanged) {
      logActivity({ req, module: 'Employee', action: 'Updated',
        description: targetLabel
          ? `Employee (${targetLabel}) ${newStatus === 'active' ? 'activated' : 'deactivated'}`
          : `${newStatus === 'active' ? 'Activated' : 'Deactivated'} account` });
    } else {
      logActivity({ req, module: 'Employee', action: 'Updated',
        description: targetLabel
          ? `Employee (${targetLabel}) updated`
          : `Profile updated` });
    }

    res.json({ message: t(req.lang, 'errors.userUpdated') });
  } catch (err) { next(err); }
});

// DELETE /api/employees/:id — requires `users.delete`
router.delete('/:id', auth, async (req, res, next) => {
  try {
    if (!(req.user.permissions || []).includes('users.delete')) {
      return res.status(403).json({ error: t(req.lang, 'errors.permissionDenied') });
    }
    const [target] = await pool.query('SELECT role_id FROM users WHERE id = ?', [req.params.id]);
    if (target.length === 0) return res.status(404).json({ error: t(req.lang, 'errors.userNotFound') });
    if (target[0].role_id === 1) return res.status(403).json({ error: t(req.lang, 'errors.cannotDeleteAdmin') });

    const [[deletedUser]] = await pool.query('SELECT email, first_name, last_name FROM users WHERE id = ?', [req.params.id]);
    await pool.query('DELETE FROM users WHERE id = ?', [req.params.id]);

    // ── Activity log: Employee Deleted ──────────────────────────────────────
    const empLabel = deletedUser?.email
      || `${deletedUser?.first_name || ''} ${deletedUser?.last_name || ''}`.trim()
      || `user #${req.params.id}`;
    logActivity({ req, module: 'Employee', action: 'Deleted',
      description: `Employee (${empLabel}) deleted` });

    res.json({ message: t(req.lang, 'errors.userDeleted') });
  } catch (err) { next(err); }
});

module.exports = router;
