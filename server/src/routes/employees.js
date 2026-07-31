const express = require('express');
const pool = require('../config/database');
const { auth } = require('../middleware/auth');
const { t } = require('../i18n');

const router = express.Router();

// GET /api/employees — List all employees with search, filters, pagination, sorting
router.get('/', auth, async (req, res, next) => {
  try {
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

    // Validate sortBy
    const allowedSorts = ['first_name', 'last_name', 'email', 'employee_id', 'hire_date', 'created_at', 'department_name', 'role_name'];
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
      ORDER BY ${safeSort === 'department_name' ? 'd.name' : safeSort === 'role_name' ? 'r.name' : `u.${safeSort}`} ${safeOrder}
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

// GET /api/employees/:id/profile — Full employee profile with projects, tasks, activity
router.get('/:id/profile', auth, async (req, res, next) => {
  try {
    const targetId = parseInt(req.params.id, 10);
    const isSelf = targetId === req.user.id;
    const perms = req.user.permissions || [];

    if (!isSelf && !perms.includes('users.view_all')) {
      return res.status(403).json({ error: t(req.lang, 'errors.permissionDenied') });
    }

    // Get employee details
    const [users] = await pool.query(`
      SELECT u.*, r.name as role_name, d.name as department_name,
        m.first_name as manager_first_name, m.last_name as manager_last_name, m.email as manager_email,
        des.name as designation_name
      FROM users u
      JOIN roles r ON u.role_id = r.id
      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN users m ON u.reporting_manager_id = m.id
      LEFT JOIN designations des ON u.designation_id = des.id
      WHERE u.id = ?
    `, [targetId]);

    if (users.length === 0) return res.status(404).json({ error: t(req.lang, 'errors.userNotFound') });

    const user = users[0];

    // Get current projects (as member or manager)
    const [projects] = await pool.query(`
      SELECT p.id, p.name, p.status, p.color,
        CASE WHEN pm.user_id IS NOT NULL THEN 'member' ELSE 'manager' END as role
      FROM projects p
      LEFT JOIN project_members pm ON p.id = pm.project_id AND pm.user_id = ?
      WHERE p.id IN (
        SELECT project_id FROM project_members WHERE user_id = ?
        UNION
        SELECT id FROM projects WHERE manager_id = ?
      )
      LIMIT 10
    `, [targetId, targetId, targetId]);

    // Get recent assigned tasks from task board
    const [tasks] = await pool.query(`
      SELECT t.id, t.title, t.status, tc.name as column_name, tc.color as column_color,
        p.name as project_name, p.id as project_id
      FROM tb_tasks t
      JOIN tb_columns tc ON t.column_id = tc.id
      JOIN projects p ON tc.project_id = p.id
      JOIN tb_assignees ta ON t.id = ta.task_id
      WHERE ta.user_id = ?
      ORDER BY t.updated_at DESC
      LIMIT 10
    `, [targetId]);

    // Get recent activity
    const [activity] = await pool.query(`
      SELECT ah.id, ah.action, ah.entity_type, ah.entity_id, ah.created_at,
        u.first_name, u.last_name, u.avatar_url,
        p.name as project_name
      FROM tb_activity ah
      JOIN users u ON ah.user_id = u.id
      LEFT JOIN projects p ON ah.project_id = p.id
      WHERE ah.user_id = ?
      ORDER BY ah.created_at DESC
      LIMIT 20
    `, [targetId]);

    // Build response (hide sensitive fields)
    const { password_hash, email_verification_token, email_verification_expires_at, ...profile } = user;

    res.json({
      employee: profile,
      projects,
      tasks,
      activity,
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

    for (const field of allFields) {
      if (req.body[field] !== undefined) {
        // Map camelCase to snake_case
        const dbField = field.replace(/([A-Z])/g, '_$1').toLowerCase();
        updates.push(`${dbField} = ?`);
        params.push(req.body[field]);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: t(req.lang, 'errors.noFieldsToUpdate') });
    }

    params.push(targetId);
    await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
    res.json({ message: t(req.lang, 'errors.userUpdated') });
  } catch (err) { next(err); }
});

module.exports = router;
