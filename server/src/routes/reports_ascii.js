/**
 * Reports & Analytics Routes
 * Centralized reporting module that reuses data from existing HR and Project Management modules.
 * Supports: Employees, Attendance, Leave, Projects, Tasks, Departments.
 * Features: KPI cards, filtered tables, charts data, and export (CSV/Excel/PDF).
 */
const express = require('express');
const pool = require('../config/database');
const { auth, requirePermission } = require('../middleware/auth');
const { t } = require('../i18n');

const router = express.Router();

// 
// HELPERS
// 

/** Build date filter SQL from date_from / date_to query params */
function dateFilter(field, dateFrom, dateTo, params) {
  let sql = '';
  if (dateFrom) { sql += ` AND ${field} >= ?`; params.push(dateFrom); }
  if (dateTo) { sql += ` AND ${field} <= ?`; params.push(dateTo + ' 23:59:59'); }
  return sql;
}

/** Build employee/department/role/project filter helpers */
function buildFilters(query) {
  const { employee_id, department_id, role_id, project_id, status, search, date_from, date_to } = query;
  const params = [];
  let joins = '';
  let where = 'WHERE 1=1';

  if (employee_id) { where += ' AND u.id = ?'; params.push(employee_id); }
  if (department_id) { where += ' AND u.department_id = ?'; params.push(department_id); }
  if (role_id) { where += ' AND u.role_id = ?'; params.push(role_id); }
  if (status) { where += ' AND u.status = ?'; params.push(status); }
  if (search) {
    where += ' AND (u.first_name LIKE ? OR u.last_name LIKE ? OR u.email LIKE ? OR u.employee_id LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s, s);
  }

  return { joins, where, params, date_from, date_to };
}

// 
// MIDDLEWARE
// 

// All routes require reports.view permission
router.use(auth, requirePermission('reports.view'));

// 
// SUMMARY / KPI
// GET /api/reports/summary
// 
router.get('/summary', async (req, res, next) => {
  try {
    const { date_from, date_to } = req.query;

    // Employee counts
    const [empRows] = await pool.query(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN u.status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN u.status = 'inactive' THEN 1 ELSE 0 END) as inactive,
        SUM(CASE WHEN u.employment_type = 'full-time' THEN 1 ELSE 0 END) as full_time,
        SUM(CASE WHEN u.employment_type = 'part-time' THEN 1 ELSE 0 END) as part_time,
        SUM(CASE WHEN u.employment_type = 'contract' THEN 1 ELSE 0 END) as contract,
        SUM(CASE WHEN u.employment_type = 'intern' THEN 1 ELSE 0 END) as intern
      FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE r.name != 'Administrator'
    `;

    // Attendance summary (last 30 days by default)
    const dateCondition = date_from ? `AND a.date >= '${date_from}'` : "AND a.date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)";
    const dateConditionEnd = date_to ? `AND a.date <= '${date_to}'` : '';
    const [attRows] = await pool.query(`
      SELECT
        COUNT(DISTINCT a.user_id) as employees_checked_in,
        SUM(CASE WHEN a.status IN ('clocked_in','working') THEN 1 ELSE 0 END) as present,
        SUM(CASE WHEN a.status = 'absent' THEN 1 ELSE 0 END) as absent,
        SUM(CASE WHEN a.is_late = 1 THEN 1 ELSE 0 END) as late_checkins,
        AVG(a.working_hours) as avg_working_hours,
        AVG(a.total_break_minutes) as avg_break_minutes
      FROM attendance a
      WHERE 1=1 ${dateCondition} ${dateConditionEnd}
    `);

    // Leave summary
    const [leaveRows] = await pool.query(`
      SELECT
        COUNT(*) as total_requests,
        SUM(CASE WHEN lr.status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN lr.status = 'approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN lr.status = 'rejected' THEN 1 ELSE 0 END) as rejected
      FROM leave_requests lr
      JOIN users u ON lr.user_id = u.id
      JOIN roles r ON u.role_id = r.id
      WHERE r.name != 'Administrator'
      ${date_from ? `AND lr.created_at >= '${date_from}'` : ''}
      ${date_to ? `AND lr.created_at <= '${date_to} 23:59:59'` : ''}
    `);

    // Project summary
    const [projRows] = await pool.query(`
      SELECT
        COUNT(*) as total_projects,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'on_hold' THEN 1 ELSE 0 END) as on_hold,
        SUM(CASE WHEN archived_at IS NOT NULL THEN 1 ELSE 0 END) as archived
    `);

    // Task summary
    const [taskRows] = await pool.query(`
      SELECT
        COUNT(*) as total_tasks,
        SUM(CASE WHEN t.priority = 'urgent' AND t.archived_at IS NULL THEN 1 ELSE 0 END) as urgent,
        SUM(CASE WHEN t.priority = 'high' AND t.archived_at IS NULL THEN 1 ELSE 0 END) as high,
        SUM(CASE WHEN t.priority = 'medium' AND t.archived_at IS NULL THEN 1 ELSE 0 END) as medium,
        SUM(CASE WHEN t.priority = 'low' AND t.archived_at IS NULL THEN 1 ELSE 0 END) as low,
        SUM(CASE WHEN t.archived_at IS NOT NULL THEN 1 ELSE 0 END) as archived
      FROM tb_tasks t
    `);

    // Department summary
    const [deptRows] = await pool.query(`
      SELECT COUNT(*) as total_departments FROM departments
    `);

    res.json({
      employees: empRows[0],
      attendance: attRows[0],
      leaves: leaveRows[0],
      projects: projRows[0],
      tasks: taskRows[0],
      departments: deptRows[0],
    });
  } catch (err) { next(err); }
});

// 
// EMPLOYEES REPORT
// GET /api/reports/employees
// 
router.get('/employees', async (req, res, next) => {
  try {
    const {
      search, department_id, role_id, status, employment_type,
      date_from, date_to, hire_date_from, hire_date_to,
      sort_by = 'first_name', sort_order = 'ASC',
      page = 1, limit = 20,
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [];
    let where = `WHERE r.name != 'Administrator'`;

    if (search) {
      where += ` AND (u.first_name LIKE ? OR u.last_name LIKE ? OR u.email LIKE ? OR u.employee_id LIKE ? OR u.designation LIKE ?)`;
      const s = `%${search}%`;
      params.push(s, s, s, s, s);
    }
    if (department_id) { where += ' AND u.department_id = ?'; params.push(department_id); }
    if (role_id) { where += ' AND u.role_id = ?'; params.push(role_id); }
    if (status) { where += ' AND u.status = ?'; params.push(status); }
    if (employment_type) { where += ' AND u.employment_type = ?'; params.push(employment_type); }
    if (hire_date_from) { where += ' AND u.hire_date >= ?'; params.push(hire_date_from); }
    if (hire_date_to) { where += ' AND u.hire_date <= ?'; params.push(hire_date_to); }

    // Count
    const [[{ total }]] = await pool.query(`
      SELECT COUNT(*) as total FROM users u
      JOIN roles r ON u.role_id = r.id
      LEFT JOIN departments d ON u.department_id = d.id
      ${where}
    `, params);

    // Data
    const allowedSorts = ['first_name', 'last_name', 'email', 'employee_id', 'hire_date', 'status', 'employment_type', 'department_name', 'role_name'];
    const safeSort = allowedSorts.includes(sort_by) ? sort_by : 'first_name';
    const safeOrder = sort_order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    const orderCol = safeSort === 'department_name' ? 'd.name' : safeSort === 'role_name' ? 'r.name' : `u.${safeSort}`;

    const [rows] = await pool.query(`
      SELECT
        u.id, u.employee_id, u.email, u.first_name, u.last_name,
        u.designation, u.status, u.employment_type, u.hire_date, u.phone,
        u.avatar_url, u.created_at,
        r.name as role_name, r.id as role_id,
        d.name as department_name, d.id as department_id,
        m.first_name as manager_first_name, m.last_name as manager_last_name
      FROM users u
      JOIN roles r ON u.role_id = r.id
      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN users m ON u.reporting_manager_id = m.id
      ${where}
      ORDER BY ${orderCol} ${safeOrder}
      LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), offset]);

    // Attendance stats per employee (last 30 days or date range)
    const dateFrom = date_from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const dateTo = date_to || new Date().toISOString().slice(0, 10);
    const [attStats] = await pool.query(`
      SELECT a.user_id,
        COUNT(*) as days_present,
        SUM(CASE WHEN a.is_late = 1 THEN 1 ELSE 0 END) as late_days,
        AVG(a.working_hours) as avg_working_hours
      FROM attendance a
      WHERE a.date BETWEEN ? AND ?
      GROUP BY a.user_id
    `, [dateFrom, dateTo]);

    // Leave stats per employee
    const [leaveStats] = await pool.query(`
      SELECT lr.user_id,
        COUNT(*) as total_requests,
        SUM(CASE WHEN lr.status = 'approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN lr.status = 'pending' THEN 1 ELSE 0 END) as pending
      FROM leave_requests lr
      GROUP BY lr.user_id
    `);

    const attMap = Object.fromEntries(attStats.map(r => [r.user_id, r]));
    const leaveMap = Object.fromEntries(leaveStats.map(r => [r.user_id, r]));

    const employees = rows.map(e => ({
      ...e,
      attendance: attMap[e.id] || { days_present: 0, late_days: 0, avg_working_hours: 0 },
      leaves: leaveMap[e.id] || { total_requests: 0, approved: 0, pending: 0 },
    }));

    res.json({
      employees,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (err) { next(err); }
});

// 
// ATTENDANCE REPORT
// GET /api/reports/attendance
// 
router.get('/attendance', async (req, res, next) => {
  try {
    const {
      search, department_id, status,
      date_from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      date_to = new Date().toISOString().slice(0, 10),
      sort_by = 'date', sort_order = 'DESC',
      page = 1, limit = 50,
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [date_from, date_to + ' 23:59:59'];
    let where = `WHERE a.date BETWEEN ? AND ?`;

    if (search) {
      where += ` AND (u.first_name LIKE ? OR u.last_name LIKE ? OR u.email LIKE ?)`;
      const s = `%${search}%`;
      params.push(s, s, s);
    }
    if (department_id) { where += ' AND u.department_id = ?'; params.push(department_id); }
    if (status) { where += ' AND a.status = ?'; params.push(status); }

    const [[{ total }]] = await pool.query(`
      SELECT COUNT(*) as total FROM attendance a
      JOIN users u ON a.user_id = u.id
      ${where}
    `, params);

    const allowedSorts = ['date', 'first_name', 'department_name', 'status', 'working_hours'];
    const safeSort = allowedSorts.includes(sort_by) ? sort_by : 'date';
    const safeOrder = sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const orderCol = safeSort === 'first_name' ? 'u.first_name' : safeSort === 'department_name' ? 'd.name' : safeSort === 'status' ? 'a.status' : safeSort === 'working_hours' ? 'a.working_hours' : 'a.date';

    const [rows] = await pool.query(`
      SELECT
        a.id, a.user_id, a.date, a.status,
        a.clock_in_time, a.clock_out_time,
        a.total_break_minutes, a.working_hours,
        a.is_late, a.late_minutes, a.remarks,
        u.first_name, u.last_name, u.email,
        d.name as department_name
      FROM attendance a
      JOIN users u ON a.user_id = u.id
      LEFT JOIN departments d ON u.department_id = d.id
      ${where}
      ORDER BY ${orderCol} ${safeOrder}
      LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), offset]);

    // Daily aggregates for charts
    const [daily] = await pool.query(`
      SELECT
        a.date,
        COUNT(DISTINCT a.user_id) as total_employees,
        SUM(CASE WHEN a.status IN ('clocked_in','working','completed') THEN 1 ELSE 0 END) as present,
        SUM(CASE WHEN a.status = 'absent' THEN 1 ELSE 0 END) as absent,
        SUM(CASE WHEN a.is_late = 1 THEN 1 ELSE 0 END) as late,
        AVG(a.working_hours) as avg_hours
      FROM attendance a
      WHERE a.date BETWEEN ? AND ?
      GROUP BY a.date
      ORDER BY a.date ASC
    `, [date_from, date_to]);

    res.json({
      records: rows,
      daily,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (err) { next(err); }
});

// 
// LEAVE REPORT
// GET /api/reports/leaves
// 
router.get('/leaves', async (req, res, next) => {
  try {
    const {
      search, department_id, leave_type_id, status,
      date_from, date_to,
      sort_by = 'lr.created_at', sort_order = 'DESC',
      page = 1, limit = 20,
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [];
    let where = `WHERE r.name != 'Administrator'`;

    if (search) {
      where += ` AND (u.first_name LIKE ? OR u.last_name LIKE ? OR u.email LIKE ?)`;
      const s = `%${search}%`;
      params.push(s, s, s);
    }
    if (department_id) { where += ' AND u.department_id = ?'; params.push(department_id); }
    if (leave_type_id) { where += ' AND lr.leave_type_id = ?'; params.push(leave_type_id); }
    if (status) { where += ' AND lr.status = ?'; params.push(status); }
    if (date_from) { where += ' AND lr.start_date >= ?'; params.push(date_from); }
    if (date_to) { where += ' AND lr.end_date <= ?'; params.push(date_to); }

    const [[{ total }]] = await pool.query(`
      SELECT COUNT(*) as total FROM leave_requests lr
      JOIN users u ON lr.user_id = u.id
      JOIN roles r ON u.role_id = r.id
      LEFT JOIN departments d ON u.department_id = d.id
      ${where}
    `, params);

    const allowedSorts = ['lr.created_at', 'u.first_name', 'd.name', 'lt.name', 'lr.status', 'lr.start_date'];
    const safeSort = allowedSorts.includes(sort_by) ? sort_by : 'lr.created_at';
    const safeOrder = sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const orderCol = safeSort === 'u.first_name' ? 'u.first_name' : safeSort === 'd.name' ? 'd.name' : safeSort === 'lt.name' ? 'lt.name' : safeSort === 'lr.status' ? 'lr.status' : safeSort === 'lr.start_date' ? 'lr.start_date' : 'lr.created_at';

    const [rows] = await pool.query(`
      SELECT
        lr.id, lr.start_date, lr.end_date, lr.status, lr.reason, lr.approved_by,
        lr.approved_at, lr.created_at,
        u.first_name, u.last_name, u.email,
        d.name as department_name,
        lt.name as leave_type_name, lt.is_paid
      FROM leave_requests lr
      JOIN users u ON lr.user_id = u.id
      JOIN roles r ON u.role_id = r.id
      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN leave_types lt ON lr.leave_type_id = lt.id
      ${where}
      ORDER BY ${orderCol} ${safeOrder}
      LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), offset]);

    // Monthly aggregates
    const [monthly] = await pool.query(`
      SELECT
        DATE_FORMAT(lr.start_date, '%Y-%m') as month,
        lt.name as leave_type_name,
        COUNT(*) as total_requests,
        SUM(CASE WHEN lr.status = 'approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN lr.status = 'rejected' THEN 1 ELSE 0 END) as rejected,
        SUM(CASE WHEN lr.status = 'pending' THEN 1 ELSE 0 END) as pending
      FROM leave_requests lr
      JOIN users u ON lr.user_id = u.id
      JOIN roles r ON u.role_id = r.id
      LEFT JOIN leave_types lt ON lr.leave_type_id = lt.id
      WHERE r.name != 'Administrator'
      GROUP BY DATE_FORMAT(lr.start_date, '%Y-%m'), lt.name
      ORDER BY month DESC
      LIMIT 24
    `);

    res.json({
      records: rows,
      monthly,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (err) { next(err); }
});

// 
// PROJECT REPORT
// GET /api/reports/projects
// 
router.get('/projects', async (req, res, next) => {
  try {
    const {
      search, status, manager_id,
      date_from, date_to,
      sort_by = 'p.created_at', sort_order = 'DESC',
      page = 1, limit = 20,
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [];
    let where = 'WHERE 1=1';

    if (search) {
      where += ` AND (p.name LIKE ? OR p.description LIKE ?)`;
      const s = `%${search}%`;
      params.push(s, s);
    }
    if (status) { where += ' AND p.status = ?'; params.push(status); }
    if (manager_id) { where += ' AND p.manager_id = ?'; params.push(manager_id); }
    if (date_from) { where += ' AND p.created_at >= ?'; params.push(date_from); }
    if (date_to) { where += ' AND p.created_at <= ?'; params.push(date_to + ' 23:59:59'); }

    const [[{ total }]] = await pool.query(`
      SELECT COUNT(*) as total FROM projects p
      LEFT JOIN users u ON p.manager_id = u.id
      ${where}
    `, params);

    const allowedSorts = ['p.name', 'p.status', 'p.created_at', 'u.first_name', 'p.end_date'];
    const safeSort = allowedSorts.includes(sort_by) ? sort_by : 'p.created_at';
    const safeOrder = sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const orderCol = safeSort === 'u.first_name' ? 'u.first_name' : safeSort === 'p.end_date' ? 'p.end_date' : safeSort;

    const [rows] = await pool.query(`
      SELECT
        p.id, p.name, p.description, p.status, p.priority,
        p.start_date, p.end_date, p.archived_at, p.created_at, p.updated_at,
        u.first_name as manager_first_name, u.last_name as manager_last_name, u.email as manager_email,
        (SELECT COUNT(*) FROM tb_tasks tk WHERE tk.project_id = p.id AND tk.archived_at IS NULL) as total_tasks,
        (SELECT COUNT(*) FROM tb_tasks tk JOIN tb_columns c ON tk.column_id = c.id WHERE tk.project_id = p.id AND LOWER(c.name) IN ('done','completed','complete') AND tk.archived_at IS NULL) as completed_tasks,
        (SELECT COUNT(DISTINCT pm.user_id) FROM project_members pm WHERE pm.project_id = p.id AND pm.status = 'active') as team_size
      FROM projects p
      LEFT JOIN users u ON p.manager_id = u.id
      ${where}
      ORDER BY ${orderCol} ${safeOrder}
      LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), offset]);

    // Status breakdown for charts
    const [statusBreakdown] = await pool.query(`
      SELECT status, COUNT(*) as count FROM projects GROUP BY status
    `);

    // Priority breakdown
    const [priorityBreakdown] = await pool.query(`
      SELECT priority, COUNT(*) as count FROM projects WHERE archived_at IS NULL GROUP BY priority
    `);

    res.json({
      records: rows,
      statusBreakdown,
      priorityBreakdown,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (err) { next(err); }
});

// 
// TASK REPORT
// GET /api/reports/tasks
// 
router.get('/tasks', async (req, res, next) => {
  try {
    const {
      search, project_id, priority, status,
      date_from, date_to,
      sort_by = 't.created_at', sort_order = 'DESC',
      page = 1, limit = 50,
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [];
    let where = 'WHERE 1=1';

    if (search) {
      where += ` AND t.title LIKE ?`;
      params.push(`%${search}%`);
    }
    if (project_id) { where += ' AND t.project_id = ?'; params.push(project_id); }
    if (priority) { where += ' AND t.priority = ?'; params.push(priority); }
    if (status) {
      if (status === 'archived') { where += ' AND t.archived_at IS NOT NULL'; }
      else if (status === 'active') { where += ' AND t.archived_at IS NULL'; }
    }
    if (date_from) { where += ' AND t.created_at >= ?'; params.push(date_from); }
    if (date_to) { where += ' AND t.created_at <= ?'; params.push(date_to + ' 23:59:59'); }

    const [[{ total }]] = await pool.query(`
      SELECT COUNT(*) as total FROM tb_tasks t
      LEFT JOIN projects p ON t.project_id = p.id
      ${where}
    `, params);

    const allowedSorts = ['t.title', 't.priority', 't.created_at', 't.due_date', 'p.name', 't.position'];
    const safeSort = allowedSorts.includes(sort_by) ? sort_by : 't.created_at';
    const safeOrder = sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const orderCol = safeSort === 'p.name' ? 'p.name' : safeSort;

    const [rows] = await pool.query(`
      SELECT
        t.id, t.title, t.description_html, t.priority, t.due_date, t.start_date,
        t.estimated_hours, t.position, t.archived_at, t.created_at, t.updated_at,
        p.name as project_name, p.id as project_id,
        c.name as column_name,
        (SELECT COUNT(*) FROM tb_subtasks ts WHERE ts.task_id = t.id) as subtask_count,
        (SELECT COUNT(*) FROM tb_comments tc WHERE tc.task_id = t.id) as comment_count
      FROM tb_tasks t
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN tb_columns c ON t.column_id = c.id
      ${where}
      ORDER BY ${orderCol} ${safeOrder}
      LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), offset]);

    // Priority breakdown
    const [priorityBreakdown] = await pool.query(`
      SELECT priority, COUNT(*) as count FROM tb_tasks WHERE archived_at IS NULL GROUP BY priority
    `);

    // Column (status) breakdown
    const [columnBreakdown] = await pool.query(`
      SELECT c.name as column_name, COUNT(t.id) as count
      FROM tb_columns c
      LEFT JOIN tb_tasks t ON t.column_id = c.id AND t.archived_at IS NULL
      GROUP BY c.id, c.name
      ORDER BY c.position ASC
    `);

    // Overdue tasks
    const [overdue] = await pool.query(`
      SELECT COUNT(*) as count FROM tb_tasks t
      WHERE t.archived_at IS NULL
        AND t.due_date < CURDATE()
        AND t.column_id NOT IN (
          SELECT id FROM tb_columns WHERE LOWER(name) IN ('done','completed','complete')
        )
    `);

    res.json({
      records: rows,
      priorityBreakdown,
      columnBreakdown,
      overdueCount: overdue[0]?.count || 0,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (err) { next(err); }
});

// 
// DEPARTMENT REPORT
// GET /api/reports/departments
// 
router.get('/departments', async (req, res, next) => {
  try {
    const { search, sort_by = 'd.name', sort_order = 'ASC', page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [];
    let where = 'WHERE 1=1';

    if (search) { where += ' AND d.name LIKE ?'; params.push(`%${search}%`); }

    const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM departments d ${where}`, params);

    const [rows] = await pool.query(`
      SELECT
        d.id, d.name, d.description, d.created_at,
        COUNT(DISTINCT u.id) as employee_count,
        SUM(CASE WHEN u.status = 'active' THEN 1 ELSE 0 END) as active_employees,
        COUNT(DISTINCT p.id) as project_count,
        SUM(CASE WHEN p.status = 'active' THEN 1 ELSE 0 END) as active_projects
      FROM departments d
      LEFT JOIN users u ON u.department_id = d.id
      LEFT JOIN projects p ON p.manager_id = u.id OR p.id IN (SELECT project_id FROM project_members pm WHERE pm.user_id = u.id)
      ${where}
      GROUP BY d.id, d.name, d.description, d.created_at
      ORDER BY d.name ASC
      LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), offset]);

    res.json({
      records: rows,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (err) { next(err); }
});

// 
// EXPORT ENDPOINTS (require reports.export permission)
// 

// Helper: check export permission
const checkExport = (req, res, next) => {
  if (!req.user.permissions.includes('reports.export')) {
    return res.status(403).json({ error: t(req.lang, 'errors.permissionDenied') });
  }
  next();
};

// GET /api/reports/export/employees
router.get('/export/employees', checkExport, async (req, res, next) => {
  try {
    const { department_id, role_id, status, employment_type, date_from, date_to } = req.query;
    const params = [];
    let where = `WHERE r.name != 'Administrator'`;

    if (department_id) { where += ' AND u.department_id = ?'; params.push(department_id); }
    if (role_id) { where += ' AND u.role_id = ?'; params.push(role_id); }
    if (status) { where += ' AND u.status = ?'; params.push(status); }
    if (employment_type) { where += ' AND u.employment_type = ?'; params.push(employment_type); }
    if (date_from) { where += ' AND u.hire_date >= ?'; params.push(date_from); }
    if (date_to) { where += ' AND u.hire_date <= ?'; params.push(date_to); }

    const [rows] = await pool.query(`
      SELECT
        u.employee_id, u.first_name, u.last_name, u.email, u.phone,
        u.designation, u.status, u.employment_type, u.hire_date,
        r.name as role_name, d.name as department_name,
        m.first_name as manager_first_name, m.last_name as manager_last_name,
        u.created_at
      FROM users u
      JOIN roles r ON u.role_id = r.id
      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN users m ON u.reporting_manager_id = m.id
      ${where}
      ORDER BY u.first_name ASC
    `, params);

    const format = req.query.format || 'csv';
    if (format === 'csv') {
      const csv = toCSV(rows, [
        'employee_id', 'first_name', 'last_name', 'email', 'phone', 'designation',
        'status', 'employment_type', 'hire_date', 'role_name', 'department_name',
        'manager_first_name', 'manager_last_name', 'created_at'
      ]);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="employees-report.csv"');
      return res.send(csv);
    } else if (format === 'json') {
      return res.json({ data: rows });
    }
    return res.status(400).json({ error: 'Unsupported format. Use csv or json.' });
  } catch (err) { next(err); }
});

// GET /api/reports/export/attendance
router.get('/export/attendance', checkExport, async (req, res, next) => {
  try {
    const { department_id, status, date_from, date_to } = req.query;
    const params = [];
    let where = `WHERE a.date BETWEEN ? AND ?`;

    params.push(date_from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
    params.push(date_to || new Date().toISOString().slice(0, 10));

    if (department_id) { where += ' AND u.department_id = ?'; params.push(department_id); }
    if (status) { where += ' AND a.status = ?'; params.push(status); }

    const [rows] = await pool.query(`
      SELECT
        a.date, u.employee_id, u.first_name, u.last_name, u.email,
        d.name as department_name, a.status, a.clock_in_time, a.clock_out_time,
        a.total_break_minutes, a.working_hours, a.is_late, a.late_minutes, a.remarks
      FROM attendance a
      JOIN users u ON a.user_id = u.id
      LEFT JOIN departments d ON u.department_id = d.id
      ${where}
      ORDER BY a.date DESC, u.first_name ASC
    `, params);

    const format = req.query.format || 'csv';
    if (format === 'csv') {
      const csv = toCSV(rows, [
        'date', 'employee_id', 'first_name', 'last_name', 'email', 'department_name',
        'status', 'clock_in_time', 'clock_out_time', 'total_break_minutes', 'working_hours',
        'is_late', 'late_minutes', 'remarks'
      ]);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="attendance-report.csv"');
      return res.send(csv);
    } else if (format === 'json') {
      return res.json({ data: rows });
    }
    return res.status(400).json({ error: 'Unsupported format. Use csv or json.' });
  } catch (err) { next(err); }
});

// GET /api/reports/export/leaves
router.get('/export/leaves', checkExport, async (req, res, next) => {
  try {
    const { department_id, leave_type_id, status, date_from, date_to } = req.query;
    const params = [];
    let where = `WHERE r.name != 'Administrator'`;

    if (department_id) { where += ' AND u.department_id = ?'; params.push(department_id); }
    if (leave_type_id) { where += ' AND lr.leave_type_id = ?'; params.push(leave_type_id); }
    if (status) { where += ' AND lr.status = ?'; params.push(status); }
    if (date_from) { where += ' AND lr.start_date >= ?'; params.push(date_from); }
    if (date_to) { where += ' AND lr.end_date <= ?'; params.push(date_to); }

    const [rows] = await pool.query(`
      SELECT
        u.employee_id, u.first_name, u.last_name, u.email, d.name as department_name,
        lt.name as leave_type_name, lr.start_date, lr.end_date, lr.status,
        lr.reason, lr.approved_by, lr.approved_at, lr.created_at
      FROM leave_requests lr
      JOIN users u ON lr.user_id = u.id
      JOIN roles r ON u.role_id = r.id
      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN leave_types lt ON lr.leave_type_id = lt.id
      ${where}
      ORDER BY lr.created_at DESC
    `, params);

    const format = req.query.format || 'csv';
    if (format === 'csv') {
      const csv = toCSV(rows, [
        'employee_id', 'first_name', 'last_name', 'email', 'department_name',
        'leave_type_name', 'start_date', 'end_date', 'status', 'reason', 'approved_by', 'approved_at', 'created_at'
      ]);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="leave-report.csv"');
      return res.send(csv);
    } else if (format === 'json') {
      return res.json({ data: rows });
    }
    return res.status(400).json({ error: 'Unsupported format. Use csv or json.' });
  } catch (err) { next(err); }
});

// GET /api/reports/export/projects
router.get('/export/projects', checkExport, async (req, res, next) => {
  try {
    const { status, date_from, date_to } = req.query;
    const params = [];
    let where = 'WHERE 1=1';

    if (status) { where += ' AND p.status = ?'; params.push(status); }
    if (date_from) { where += ' AND p.created_at >= ?'; params.push(date_from); }
    if (date_to) { where += ' AND p.created_at <= ?'; params.push(date_to + ' 23:59:59'); }

    const [rows] = await pool.query(`
      SELECT
        p.id, p.name, p.description, p.status, p.priority,
        p.start_date, p.end_date, p.archived_at, p.created_at,
        u.first_name as manager_first_name, u.last_name as manager_last_name,
        (SELECT COUNT(*) FROM tb_tasks tk WHERE tk.project_id = p.id AND tk.archived_at IS NULL) as total_tasks,
        (SELECT COUNT(*) FROM tb_tasks tk JOIN tb_columns c ON tk.column_id = c.id WHERE tk.project_id = p.id AND LOWER(c.name) IN ('done','completed','complete') AND tk.archived_at IS NULL) as completed_tasks
      FROM projects p
      LEFT JOIN users u ON p.manager_id = u.id
      ${where}
      ORDER BY p.created_at DESC
    `, params);

    const format = req.query.format || 'csv';
    if (format === 'csv') {
      const csv = toCSV(rows, [
        'id', 'name', 'description', 'status', 'priority', 'start_date', 'end_date',
        'archived_at', 'created_at', 'manager_first_name', 'manager_last_name',
        'total_tasks', 'completed_tasks'
      ]);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="projects-report.csv"');
      return res.send(csv);
    } else if (format === 'json') {
      return res.json({ data: rows });
    }
    return res.status(400).json({ error: 'Unsupported format. Use csv or json.' });
  } catch (err) { next(err); }
});

// GET /api/reports/export/tasks
router.get('/export/tasks', checkExport, async (req, res, next) => {
  try {
    const { project_id, priority, status, date_from, date_to } = req.query;
    const params = [];
    let where = 'WHERE 1=1';

    if (project_id) { where += ' AND t.project_id = ?'; params.push(project_id); }
    if (priority) { where += ' AND t.priority = ?'; params.push(priority); }
    if (status === 'archived') { where += ' AND t.archived_at IS NOT NULL'; }
    else if (status === 'active') { where += ' AND t.archived_at IS NULL'; }
    if (date_from) { where += ' AND t.created_at >= ?'; params.push(date_from); }
    if (date_to) { where += ' AND t.created_at <= ?'; params.push(date_to + ' 23:59:59'); }

    const [rows] = await pool.query(`
      SELECT
        t.id, t.title, t.priority, t.due_date, t.start_date,
        t.estimated_hours, t.archived_at, t.created_at, t.updated_at,
        p.name as project_name, c.name as column_name,
        (SELECT GROUP_CONCAT(CONCAT(uu.first_name,' ',uu.last_name)) FROM tb_assignees ta JOIN users uu ON ta.user_id = uu.id WHERE ta.task_id = t.id) as assignees
      FROM tb_tasks t
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN tb_columns c ON t.column_id = c.id
      ${where}
      ORDER BY t.created_at DESC
    `, params);

    const format = req.query.format || 'csv';
    if (format === 'csv') {
      const csv = toCSV(rows, [
        'id', 'title', 'priority', 'due_date', 'start_date', 'estimated_hours',
        'archived_at', 'created_at', 'updated_at', 'project_name', 'column_name', 'assignees'
      ]);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="tasks-report.csv"');
      return res.send(csv);
    } else if (format === 'json') {
      return res.json({ data: rows });
    }
    return res.status(400).json({ error: 'Unsupported format. Use csv or json.' });
  } catch (err) { next(err); }
});

// GET /api/reports/export/departments
router.get('/export/departments', checkExport, async (req, res, next) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        d.id, d.name, d.description, d.created_at,
        COUNT(DISTINCT u.id) as employee_count,
        SUM(CASE WHEN u.status = 'active' THEN 1 ELSE 0 END) as active_employees,
        COUNT(DISTINCT p.id) as project_count
      FROM departments d
      LEFT JOIN users u ON u.department_id = d.id
      LEFT JOIN projects p ON p.manager_id = u.id OR p.id IN (SELECT project_id FROM project_members pm WHERE pm.user_id = u.id)
      GROUP BY d.id, d.name, d.description, d.created_at
      ORDER BY d.name ASC
    `);

    const format = req.query.format || 'csv';
    if (format === 'csv') {
      const csv = toCSV(rows, ['id', 'name', 'description', 'created_at', 'employee_count', 'active_employees', 'project_count']);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="departments-report.csv"');
      return res.send(csv);
    } else if (format === 'json') {
      return res.json({ data: rows });
    }
    return res.status(400).json({ error: 'Unsupported format. Use csv or json.' });
  } catch (err) { next(err); }
});

// 
// LOOKUPS (for filter dropdowns)
// GET /api/reports/lookups
// 
router.get('/lookups', async (req, res, next) => {
  try {
    const [departments] = await pool.query('SELECT id, name FROM departments ORDER BY name ASC');
    const [roles] = await pool.query("SELECT id, name FROM roles WHERE name != 'Administrator' ORDER BY name ASC");
    const [leaveTypes] = await pool.query('SELECT id, name FROM leave_types ORDER BY name ASC');
    const [projects] = await pool.query('SELECT id, name, status FROM projects ORDER BY name ASC');
    const [employees] = await pool.query(`
      SELECT u.id, u.first_name, u.last_name, u.email, d.name as department_name
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE u.status = 'active'
      ORDER BY u.first_name ASC
    `);

    res.json({ departments, roles, leaveTypes, projects, employees });
  } catch (err) { next(err); }
});

// 
// CSV HELPER
// 
function toCSV(rows, columns) {
  if (!rows || rows.length === 0) return columns.join(',') + '\n';
  const header = columns.join(',');
  const lines = rows.map(row =>
    columns.map(col => {
      const val = row[col] ?? '';
      const str = String(val);
      // Escape quotes and wrap in quotes if contains comma/quote/newline
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }).join(',')
  );
  return [header, ...lines].join('\n');
}

module.exports = router;
