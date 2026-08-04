/**
 * Reports & Analytics Routes
 * Centralized reporting module that reuses data from existing HR and Project Management modules.
 * Supports: Employees, Attendance, Leave, Projects, Tasks, Departments.
 * Features: KPI cards, filtered tables, charts data, and export (CSV/Excel/PDF).
 */
const express = require('express');
const pool = require('../config/database');
const { auth, requirePermission } = require('../middleware/auth');

const router = express.Router();

// ============================================================
// HELPERS
// ============================================================

function buildEmployeeFilters(query) {
  var params = [];
  var where = 'WHERE r.name != ?';
  params.push('Administrator');
  if (query.employee_id) { where += ' AND u.id = ?'; params.push(query.employee_id); }
  if (query.department_id) { where += ' AND u.department_id = ?'; params.push(query.department_id); }
  if (query.role_id) { where += ' AND u.role_id = ?'; params.push(query.role_id); }
  if (query.status) { where += ' AND u.status = ?'; params.push(query.status); }
  if (query.search) {
    where += ' AND (u.first_name LIKE ? OR u.last_name LIKE ? OR u.email LIKE ? OR u.employee_id LIKE ?)';
    var s = '%' + query.search + '%';
    params.push(s, s, s, s);
  }
  return { where: where, params: params };
}

// ============================================================
// MIDDLEWARE
// ============================================================

router.use(auth, requirePermission('reports.view'));

// ============================================================
// LOOKUPS
// GET /api/reports/lookups
// ============================================================
router.get('/lookups', async (req, res, next) => {
  try {
    var [departments] = await pool.query('SELECT id, name FROM departments ORDER BY name');
    var [roles] = await pool.query('SELECT id, name FROM roles WHERE name != ? ORDER BY name', ['Administrator']);
    var [leaveTypes] = await pool.query('SELECT id, name FROM leave_types ORDER BY name');
    var [projects] = await pool.query('SELECT id, name FROM projects WHERE archived_at IS NULL ORDER BY name');
    var [employees] = await pool.query('SELECT id, first_name, last_name FROM users WHERE status = ? ORDER BY first_name', ['active']);
    res.json({ departments, roles, leaveTypes, projects, employees });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// SUMMARY / KPI
// GET /api/reports/summary
// Frontend expects: employees{total,active,full_time,...}, attendance{present,late_checkins,avg_working_hours,avg_break_minutes},
//                  leaves{total_requests,pending,approved}, projects{total_projects,active,completed}, tasks{total_tasks,urgent,high}, departments{total_departments}
// ============================================================
router.get('/summary', async (req, res, next) => {
  try {
    var date_from = req.query.date_from;
    var date_to = req.query.date_to;

    // Employee counts
    var empWhere = 'WHERE r.name != ?';
    var empParams = ['Administrator'];
    if (date_from) { empWhere += ' AND u.created_at >= ?'; empParams.push(date_from); }
    if (date_to) { empWhere += ' AND u.created_at <= ?'; empParams.push(date_to + ' 23:59:59'); }
    var [empRows] = await pool.query(
      'SELECT COUNT(*) as total, SUM(CASE WHEN u.status = \'active\' THEN 1 ELSE 0 END) as active, SUM(CASE WHEN u.employment_type = \'full-time\' THEN 1 ELSE 0 END) as full_time, SUM(CASE WHEN u.employment_type = \'part-time\' THEN 1 ELSE 0 END) as part_time, SUM(CASE WHEN u.employment_type = \'contract\' THEN 1 ELSE 0 END) as contract, SUM(CASE WHEN u.employment_type = \'intern\' THEN 1 ELSE 0 END) as intern FROM users u JOIN roles r ON u.role_id = r.id ' + empWhere,
      empParams
    );

    // Attendance counts
    var attWhere = 'WHERE 1=1';
    var attParams = [];
    if (date_from) { attWhere += ' AND a.date >= ?'; attParams.push(date_from); }
    if (date_to) { attWhere += ' AND a.date <= ?'; attParams.push(date_to + ' 23:59:59'); }
    var [attRows] = await pool.query(
      'SELECT COUNT(*) as total, SUM(CASE WHEN a.status IN (\'clocked_in\',\'working\') THEN 1 ELSE 0 END) as present, SUM(CASE WHEN a.is_late = 1 THEN 1 ELSE 0 END) as late_checkins, AVG(a.working_hours) as avg_working_hours, AVG(a.total_break_minutes) as avg_break_minutes FROM attendance a ' + attWhere,
      attParams
    );

    // Leave counts
    var leaveWhere = 'WHERE 1=1';
    var leaveParams = [];
    if (date_from) { leaveWhere += ' AND lr.created_at >= ?'; leaveParams.push(date_from); }
    if (date_to) { leaveWhere += ' AND lr.created_at <= ?'; leaveParams.push(date_to + ' 23:59:59'); }
    var [leaveRows] = await pool.query(
      'SELECT COUNT(*) as total_requests, SUM(CASE WHEN lr.status = \'approved\' THEN 1 ELSE 0 END) as approved, SUM(CASE WHEN lr.status = \'pending\' THEN 1 ELSE 0 END) as pending, SUM(CASE WHEN lr.status = \'rejected\' THEN 1 ELSE 0 END) as rejected FROM leave_requests lr ' + leaveWhere,
      leaveParams
    );

    // Project counts
    var [projRows] = await pool.query(
      'SELECT COUNT(*) as total_projects, SUM(CASE WHEN p.status = \'active\' THEN 1 ELSE 0 END) as active, SUM(CASE WHEN p.status = \'completed\' THEN 1 ELSE 0 END) as completed, SUM(CASE WHEN p.status = \'on_hold\' THEN 1 ELSE 0 END) as on_hold FROM projects p WHERE p.archived_at IS NULL',
      []
    );

    // Task counts
    var [taskRows] = await pool.query(
      'SELECT COUNT(*) as total_tasks, SUM(CASE WHEN tk.priority = \'urgent\' THEN 1 ELSE 0 END) as urgent, SUM(CASE WHEN tk.priority = \'high\' THEN 1 ELSE 0 END) as high FROM tb_tasks tk WHERE tk.archived_at IS NULL',
      []
    );

    // Department count
    var [[deptRow]] = await pool.query('SELECT COUNT(*) as total_departments FROM departments d', []);

    res.json({
      employees: empRows[0] || { total: 0, active: 0, full_time: 0, part_time: 0, contract: 0, intern: 0 },
      attendance: attRows[0] || { total: 0, present: 0, late_checkins: 0, avg_working_hours: null, avg_break_minutes: null },
      leaves: leaveRows[0] || { total_requests: 0, approved: 0, pending: 0, rejected: 0 },
      projects: projRows[0] || { total_projects: 0, active: 0, completed: 0, on_hold: 0 },
      tasks: taskRows[0] || { total_tasks: 0, urgent: 0, high: 0 },
      departments: deptRow || { total_departments: 0 }
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// EMPLOYEES
// GET /api/reports/employees
// Frontend expects: employees (array), pagination{total,page,limit}
// ============================================================
router.get('/employees', async (req, res, next) => {
  try {
    var page = parseInt(req.query.page) || 1;
    var limit = parseInt(req.query.limit) || 20;
    var offset = (page - 1) * limit;
    var sort = req.query.sort || 'id';
    var order = req.query.order === 'asc' ? 'ASC' : 'DESC';
    var safeSortMap = { id: 'u.id', first_name: 'u.first_name', last_name: 'u.last_name', email: 'u.email', status: 'u.status', employment_type: 'u.employment_type', department_name: 'd.name', role_name: 'r.name', created_at: 'u.created_at' };
    var safeSort = safeSortMap[sort] || 'u.id';

    var filters = buildEmployeeFilters(req.query);
    var [countRows] = await pool.query(
      'SELECT COUNT(*) as total FROM users u JOIN roles r ON u.role_id = r.id LEFT JOIN departments d ON u.department_id = d.id ' + filters.where,
      filters.params
    );
    var total = countRows[0].total;
    var [rows] = await pool.query(
      'SELECT u.id, u.employee_id, u.first_name, u.last_name, u.email, u.phone, u.status, u.employment_type, COALESCE(d.name, \'Unassigned\') as department_name, r.name as role_name, u.created_at, u.hire_date, ' +
      '(SELECT COUNT(*) FROM attendance a WHERE a.user_id = u.id AND a.status IN (\'clocked_in\',\'working\')) as days_present, ' +
      '(SELECT COUNT(*) FROM attendance a WHERE a.user_id = u.id AND a.is_late = 1) as late_days, ' +
      '(SELECT AVG(a.working_hours) FROM attendance a WHERE a.user_id = u.id AND a.working_hours IS NOT NULL) as avg_working_hours, ' +
      '(SELECT COUNT(*) FROM leave_requests lr WHERE lr.user_id = u.id AND lr.status = \'approved\') as leaves_approved, ' +
      '(SELECT COUNT(*) FROM leave_requests lr WHERE lr.user_id = u.id AND lr.status = \'pending\') as leaves_pending ' +
      'FROM users u JOIN roles r ON u.role_id = r.id LEFT JOIN departments d ON u.department_id = d.id ' + filters.where + ' ORDER BY ' + safeSort + ' ' + order + ' LIMIT ? OFFSET ?',
      [...filters.params, limit, offset]
    );

    // Transform rows to add nested attendance and leaves objects
    var enrichedRows = rows.map(function(row) {
      return {
        id: row.id,
        employee_id: row.employee_id,
        first_name: row.first_name,
        last_name: row.last_name,
        email: row.email,
        phone: row.phone,
        status: row.status,
        employment_type: row.employment_type,
        department_name: row.department_name,
        role_name: row.role_name,
        created_at: row.created_at,
        hire_date: row.hire_date,
        attendance: {
          days_present: row.days_present || 0,
          late_days: row.late_days || 0,
          avg_working_hours: row.avg_working_hours || null
        },
        leaves: {
          approved: row.leaves_approved || 0,
          pending: row.leaves_pending || 0
        }
      };
    });

    res.json({ employees: enrichedRows, pagination: { total: total, page: page, limit: limit } });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// ATTENDANCE
// GET /api/reports/attendance
// Frontend expects: records (array), daily (array), pagination{total,page,limit}
// ============================================================
router.get('/attendance', async (req, res, next) => {
  try {
    var page = parseInt(req.query.page) || 1;
    var limit = parseInt(req.query.limit) || 50;
    var offset = (page - 1) * limit;
    var date_from = req.query.date_from;
    var date_to = req.query.date_to;
    var employee_id = req.query.employee_id;
    var dept_id = req.query.department_id;
    var status = req.query.status;

    var params = [];
    var where = 'WHERE 1=1';
    if (employee_id) { where += ' AND a.user_id = ?'; params.push(employee_id); }
    if (dept_id) { where += ' AND u.department_id = ?'; params.push(dept_id); }
    if (status) { where += ' AND a.status = ?'; params.push(status); }
    if (date_from) { where += ' AND a.date >= ?'; params.push(date_from); }
    if (date_to) { where += ' AND a.date <= ?'; params.push(date_to + ' 23:59:59'); }

    var [countRows] = await pool.query('SELECT COUNT(*) as total FROM attendance a JOIN users u ON a.user_id = u.id ' + where, params);
    var total = countRows[0].total;
    var [rows] = await pool.query(
      'SELECT a.id, a.user_id, u.first_name, u.last_name, u.email, COALESCE(d.name, \'Unassigned\') as department_name, a.date, a.status, a.clock_in_time, a.clock_out_time, a.is_late, a.late_minutes, a.working_hours, a.total_break_minutes, a.remarks FROM attendance a JOIN users u ON a.user_id = u.id LEFT JOIN departments d ON u.department_id = d.id ' + where + ' ORDER BY a.date DESC LIMIT ? OFFSET ?',
      [...params, limit, offset]
    );

    // Daily aggregation for chart
    var [dailyRows] = await pool.query(
      'SELECT a.date, a.status, COUNT(*) as count FROM attendance a ' + where + ' GROUP BY a.date, a.status ORDER BY a.date DESC LIMIT 30',
      params
    );

    res.json({ records: rows, daily: dailyRows, pagination: { total: total, page: page, limit: limit } });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// LEAVES
// GET /api/reports/leaves  (frontend uses "leaves" tab)
// Frontend expects: records (array), monthly (array), pagination{total,page,limit}
// ============================================================
router.get('/leaves', async (req, res, next) => {
  try {
    var page = parseInt(req.query.page) || 1;
    var limit = parseInt(req.query.limit) || 20;
    var offset = (page - 1) * limit;
    var date_from = req.query.date_from;
    var date_to = req.query.date_to;
    var status = req.query.status;
    var leave_type_id = req.query.leave_type_id;
    var dept_id = req.query.department_id;

    var params = [];
    var where = 'WHERE 1=1';
    if (status) { where += ' AND lr.status = ?'; params.push(status); }
    if (leave_type_id) { where += ' AND lr.leave_type_id = ?'; params.push(leave_type_id); }
    if (dept_id) { where += ' AND u.department_id = ?'; params.push(dept_id); }
    if (date_from) { where += ' AND lr.created_at >= ?'; params.push(date_from); }
    if (date_to) { where += ' AND lr.created_at <= ?'; params.push(date_to + ' 23:59:59'); }

    var [countRows] = await pool.query('SELECT COUNT(*) as total FROM leave_requests lr JOIN users u ON lr.user_id = u.id ' + where, params);
    var total = countRows[0].total;
    var [rows] = await pool.query(
      'SELECT lr.id, lr.user_id, u.first_name, u.last_name, u.email, u.employee_id, lt.name as leave_type, lr.start_date, lr.end_date, DATEDIFF(lr.end_date, lr.start_date) + 1 as days, lr.reason, lr.status, lr.created_at FROM leave_requests lr JOIN users u ON lr.user_id = u.id LEFT JOIN leave_types lt ON lr.leave_type_id = lt.id ' + where + ' ORDER BY lr.created_at DESC LIMIT ? OFFSET ?',
      [...params, limit, offset]
    );

    // Monthly aggregation for chart
    var monthlyParams = [];
    var monthlyWhere = 'WHERE 1=1';
    if (date_from) { monthlyWhere += ' AND lr.created_at >= ?'; monthlyParams.push(date_from); }
    if (date_to) { monthlyWhere += ' AND lr.created_at <= ?'; monthlyParams.push(date_to + ' 23:59:59'); }
    var [monthlyRows] = await pool.query(
      'SELECT DATE_FORMAT(lr.created_at, \'%Y-%m\') as month, lr.status, COUNT(*) as count FROM leave_requests lr ' + monthlyWhere + ' GROUP BY month, lr.status ORDER BY month DESC LIMIT 12',
      monthlyParams
    );

    res.json({ records: rows, monthly: monthlyRows, pagination: { total: total, page: page, limit: limit } });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// PROJECTS
// GET /api/reports/projects
// Frontend expects: records (array), pagination{total,page,limit}
// ============================================================
router.get('/projects', async (req, res, next) => {
  try {
    var page = parseInt(req.query.page) || 1;
    var limit = parseInt(req.query.limit) || 20;
    var offset = (page - 1) * limit;
    var status = req.query.status;
    var project_id = req.query.project_id;
    var dept_id = req.query.department_id;

    var params = [];
    var where = 'WHERE p.archived_at IS NULL';
    if (status) { where += ' AND p.status = ?'; params.push(status); }
    if (project_id) { where += ' AND p.id = ?'; params.push(project_id); }
    if (dept_id) { where += ' AND p.manager_id IN (SELECT id FROM users WHERE department_id = ?)'; params.push(dept_id); }

    var [countRows] = await pool.query('SELECT COUNT(*) as total FROM projects p ' + where, params);
    var total = countRows[0].total;
    var [rows] = await pool.query(
      'SELECT p.id, p.name, p.description, p.status, p.start_date, p.end_date, CONCAT(m.first_name, \' \', m.last_name) as manager_name, p.created_at, (SELECT COUNT(*) FROM tb_tasks tk WHERE tk.project_id = p.id AND tk.archived_at IS NULL) as task_count FROM projects p LEFT JOIN users m ON p.manager_id = m.id ' + where + ' ORDER BY p.created_at DESC LIMIT ? OFFSET ?',
      [...params, limit, offset]
    );

    res.json({ records: rows, pagination: { total: total, page: page, limit: limit } });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// TASKS
// GET /api/reports/tasks
// Frontend expects: records (array), pagination{total,page,limit}
// ============================================================
router.get('/tasks', async (req, res, next) => {
  try {
    var page = parseInt(req.query.page) || 1;
    var limit = parseInt(req.query.limit) || 50;
    var offset = (page - 1) * limit;
    var project_id = req.query.project_id;
    var priority = req.query.priority;
    var task_status = req.query.status; // column name filter
    var dept_id = req.query.department_id;

    var params = [];
    var where = 'WHERE tk.archived_at IS NULL';
    if (project_id) { where += ' AND tk.project_id = ?'; params.push(project_id); }
    if (priority) { where += ' AND tk.priority = ?'; params.push(priority); }
    if (task_status) { where += ' AND c.name = ?'; params.push(task_status); }

    var [countRows] = await pool.query(
      'SELECT COUNT(*) as total FROM tb_tasks tk JOIN tb_columns c ON tk.column_id = c.id ' + where,
      params
    );
    var total = countRows[0].total;
    var [rows] = await pool.query(
      'SELECT tk.id, tk.title, tk.description_html, c.name as column_name, tk.priority, tk.due_date, tk.start_date, tk.estimated_hours, p.name as project_name, CONCAT(u.first_name, \' \', u.last_name) as assignee_name, tk.created_at FROM tb_tasks tk JOIN tb_columns c ON tk.column_id = c.id LEFT JOIN projects p ON tk.project_id = p.id LEFT JOIN tb_assignees ta ON ta.task_id = tk.id LEFT JOIN users u ON ta.user_id = u.id ' + where + ' ORDER BY tk.created_at DESC LIMIT ? OFFSET ?',
      [...params, limit, offset]
    );

    res.json({ records: rows, pagination: { total: total, page: page, limit: limit } });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// DEPARTMENTS
// GET /api/reports/departments
// Frontend expects: records (array), pagination{total,page,limit}
// ============================================================
router.get('/departments', async (req, res, next) => {
  try {
    var page = parseInt(req.query.page) || 1;
    var limit = parseInt(req.query.limit) || 50;
    var offset = (page - 1) * limit;

    var [countRows] = await pool.query('SELECT COUNT(*) as total FROM departments d', []);
    var total = countRows[0].total;
    var [rows] = await pool.query(
      'SELECT d.id, d.name, d.created_at, (SELECT COUNT(*) FROM users u WHERE u.department_id = d.id) as employee_count, (SELECT COUNT(*) FROM projects p WHERE p.manager_id IN (SELECT id FROM users WHERE department_id = d.id) AND p.archived_at IS NULL) as project_count FROM departments d ORDER BY d.name ASC LIMIT ? OFFSET ?',
      [limit, offset]
    );

    res.json({ records: rows, pagination: { total: total, page: page, limit: limit } });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// CHARTS DATA
// GET /api/reports/charts
// ============================================================
router.get('/charts', async (req, res, next) => {
  try {
    var date_from = req.query.date_from;
    var date_to = req.query.date_to;

    var dateCond = '';
    var dateParams = [];
    if (date_from) { dateCond += ' AND a.date >= \'' + date_from + '\''; }
    if (date_to) { dateCond += ' AND a.date <= \'' + date_to + '\''; }

    var [attByDay] = await pool.query(
      'SELECT a.date, a.status, COUNT(*) as count FROM attendance a WHERE 1=1' + dateCond + ' GROUP BY a.date, a.status ORDER BY a.date DESC LIMIT 30',
      dateParams
    );

    var leaveMonthSql = 'SELECT DATE_FORMAT(lr.created_at, \'%Y-%m\') as month, lr.status, COUNT(*) as count FROM leave_requests lr WHERE 1=1';
    var leaveParams = [];
    if (date_from) { leaveMonthSql += ' AND lr.created_at >= \'' + date_from + '\''; }
    if (date_to) { leaveMonthSql += ' AND lr.created_at <= \'' + date_to + '\''; }
    leaveMonthSql += ' GROUP BY month, lr.status ORDER BY month DESC LIMIT 12';
    var [leaveByMonth] = await pool.query(leaveMonthSql, leaveParams);

    var [projStatus] = await pool.query('SELECT status, COUNT(*) as count FROM projects p WHERE p.archived_at IS NULL GROUP BY status', []);
    var [taskStatus] = await pool.query('SELECT c.name as status, COUNT(*) as count FROM tb_tasks tk JOIN tb_columns c ON tk.column_id = c.id WHERE tk.archived_at IS NULL GROUP BY c.name', []);
    var [deptEmp] = await pool.query('SELECT d.name, COUNT(u.id) as count FROM departments d LEFT JOIN users u ON u.department_id = d.id GROUP BY d.id, d.name', []);
    var [leaveTypeDist] = await pool.query('SELECT lt.name, COUNT(*) as count FROM leave_requests lr JOIN leave_types lt ON lr.leave_type_id = lt.id GROUP BY lt.name', []);

    // Employee growth trend: hires per month
    var [empGrowth] = await pool.query(
      "SELECT DATE_FORMAT(COALESCE(u.hire_date, u.created_at), '%Y-%m') as month, COUNT(*) as count FROM users u JOIN roles r ON u.role_id = r.id WHERE r.name != 'Administrator' GROUP BY month ORDER BY month ASC LIMIT 24",
      []
    );

    // Employee status breakdown
    var [empStatus] = await pool.query(
      "SELECT u.status, COUNT(*) as count FROM users u JOIN roles r ON u.role_id = r.id WHERE r.name != 'Administrator' GROUP BY u.status",
      []
    );

    // Task priority breakdown
    var [taskPriority] = await pool.query(
      "SELECT COALESCE(tk.priority, 'none') as priority, COUNT(*) as count FROM tb_tasks tk WHERE tk.archived_at IS NULL GROUP BY priority ORDER BY count DESC",
      []
    );

    res.json({
      attendance_by_day: attByDay,
      leave_by_month: leaveByMonth,
      project_status: projStatus,
      task_status: taskStatus,
      department_employees: deptEmp,
      leave_type_distribution: leaveTypeDist,
      employee_growth: empGrowth,
      employee_status: empStatus,
      task_priority: taskPriority
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// EXPORT
// GET /api/reports/export
// ============================================================
// Path-based export routes (must come before /export to avoid /export matching first)
// Frontend calls: GET /api/reports/export/:report?format=csv&date_from=...&date_to=...
var exportReportHandler = async function(req, res, next) {
  try {
    var report = req.params.report || req.query.report || 'employees';
    var format = req.query.format || 'csv';
    var date_from = req.query.date_from;
    var date_to = req.query.date_to;
    var filename = report + '_report_' + (date_from || 'all') + '_to_' + (date_to || 'all');
    var header = [];
    var rows = [];

    if (report === 'employees') {
      header = ['ID', 'Employee ID', 'First Name', 'Last Name', 'Email', 'Phone', 'Status', 'Type', 'Department', 'Role', 'Hire Date', 'Created'];
      var [empRows] = await pool.query('SELECT u.id, u.employee_id, u.first_name, u.last_name, u.email, u.phone, u.status, u.employment_type, COALESCE(d.name, \'Unassigned\') as department_name, r.name as role_name, u.hire_date, u.created_at FROM users u JOIN roles r ON u.role_id = r.id LEFT JOIN departments d ON u.department_id = d.id WHERE r.name != \'Administrator\' ORDER BY u.id', []);
      rows = empRows.map(function(r) { return [r.id, r.employee_id || '', r.first_name, r.last_name, r.email, r.phone || '', r.status, r.employment_type, r.department_name, r.role_name, r.hire_date || '', r.created_at]; });
    } else if (report === 'attendance') {
      header = ['ID', 'Employee ID', 'Employee Name', 'Date', 'Status', 'Clock In', 'Clock Out', 'Late', 'Late Min', 'Working Hrs', 'Break Min', 'Remarks'];
      var [attRows] = await pool.query('SELECT a.id, u.employee_id, CONCAT(u.first_name, \' \', u.last_name) as emp_name, a.date, a.status, a.clock_in_time, a.clock_out_time, a.is_late, a.late_minutes, a.working_hours, a.total_break_minutes, a.remarks FROM attendance a JOIN users u ON a.user_id = u.id ORDER BY a.date DESC LIMIT 500', []);
      rows = attRows.map(function(r) { return [r.id, r.employee_id || '', r.emp_name, r.date, r.status, r.clock_in_time || '', r.clock_out_time || '', r.is_late ? 'Yes' : 'No', r.late_minutes || 0, r.working_hours || '', r.total_break_minutes || 0, r.remarks || '']; });
    } else if (report === 'leaves') {
      header = ['ID', 'Employee ID', 'Employee Name', 'Leave Type', 'Start Date', 'End Date', 'Days', 'Reason', 'Status', 'Applied'];
      var [leaveRows] = await pool.query('SELECT lr.id, u.employee_id, CONCAT(u.first_name, \' \', u.last_name) as emp_name, lt.name as leave_type, lr.start_date, lr.end_date, DATEDIFF(lr.end_date, lr.start_date) + 1 as days, lr.reason, lr.status, lr.created_at FROM leave_requests lr JOIN users u ON lr.user_id = u.id LEFT JOIN leave_types lt ON lr.leave_type_id = lt.id ORDER BY lr.created_at DESC LIMIT 500', []);
      rows = leaveRows.map(function(r) { return [r.id, r.employee_id || '', r.emp_name, r.leave_type || '', r.start_date, r.end_date, r.days || 0, r.reason || '', r.status, r.created_at]; });
    } else if (report === 'projects') {
      header = ['ID', 'Name', 'Description', 'Status', 'Priority', 'Start Date', 'End Date', 'Budget', 'Manager', 'Task Count', 'Created'];
      var [projRows] = await pool.query('SELECT p.id, p.name, p.description, p.status, p.start_date, p.end_date, CONCAT(m.first_name, \' \', m.last_name) as manager, (SELECT COUNT(*) FROM tb_tasks tk WHERE tk.project_id = p.id AND tk.archived_at IS NULL) as task_count, p.created_at FROM projects p LEFT JOIN users m ON p.manager_id = m.id WHERE p.archived_at IS NULL ORDER BY p.created_at DESC LIMIT 500', []);
      rows = projRows.map(function(r) { return [r.id, r.name, r.description || '', r.status, r.priority || '', r.start_date || '', r.end_date || '', r.budget || '', r.manager || '', r.task_count, r.created_at]; });
    } else if (report === 'tasks') {
      header = ['ID', 'Title', 'Column', 'Priority', 'Due Date', 'Project', 'Assignee', 'Created'];
      var [taskRows] = await pool.query('SELECT tk.id, tk.title, c.name as column_name, tk.priority, tk.due_date, pr.name as project_name, CONCAT(u.first_name, \' \', u.last_name) as assignee, tk.created_at FROM tb_tasks tk JOIN tb_columns c ON tk.column_id = c.id LEFT JOIN projects pr ON tk.project_id = pr.id LEFT JOIN tb_assignees ta ON ta.task_id = tk.id LEFT JOIN users u ON ta.user_id = u.id WHERE tk.archived_at IS NULL ORDER BY tk.created_at DESC LIMIT 500', []);
      rows = taskRows.map(function(r) { return [r.id, r.title, r.column_name, r.priority, r.due_date || '', r.project_name || '', r.assignee || '', r.created_at]; });
    } else if (report === 'departments') {
      header = ['ID', 'Name', 'Employee Count', 'Project Count', 'Created'];
      var [deptRows] = await pool.query('SELECT d.id, d.name, (SELECT COUNT(*) FROM users u WHERE u.department_id = d.id) as emp_count, (SELECT COUNT(*) FROM projects p WHERE p.manager_id IN (SELECT id FROM users WHERE department_id = d.id) AND p.archived_at IS NULL) as proj_count, d.created_at FROM departments d ORDER BY d.name', []);
      rows = deptRows.map(function(r) { return [r.id, r.name, r.emp_count, r.proj_count, r.created_at]; });
    }

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '.csv"');
      var csvLines = [header.join(',')];
      rows.forEach(function(row) {
        csvLines.push(row.map(function(cell) { return '"' + String(cell === null ? '' : cell).replace(/"/g, '""') + '"'; }).join(','));
      });
      res.send(csvLines.join('\n'));
    } else if (format === 'excel' || format === 'xlsx') {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '.xlsx"');
      var excelLines = [header.join('\t')];
      rows.forEach(function(row) {
        excelLines.push(row.join('\t'));
      });
      res.send(excelLines.join('\n'));
    } else if (format === 'pdf') {
      res.setHeader('Content-Type', 'text/html');
      var htmlRows = rows.map(function(row) {
        return '<tr>' + row.map(function(cell) { return '<td>' + (cell === null ? '' : String(cell)) + '</td>'; }).join('') + '</tr>';
      }).join('');
      res.send('<html><head><title>' + filename + '</title><style>body{font-family:Arial,sans-serif;padding:20px;} table{border-collapse:collapse;width:100%;} th,td{border:1px solid #ddd;padding:8px;text-align:left;} th{background:#f2f2f2;} h1{color:#333;}</style></head><body><h1>ServerAvatar - ' + report.charAt(0).toUpperCase() + report.slice(1) + ' Report</h1><p>Generated: ' + new Date().toISOString() + '</p><table><tr>' + header.map(function(h) { return '<th>' + h + '</th>'; }).join('') + '</tr>' + htmlRows + '</table></body></html>');
    } else {
      res.status(400).json({ error: 'Unsupported format. Use csv, excel, or pdf.' });
    }
  } catch (err) {
    next(err);
  }
};

// Path-based export routes (frontend calls /api/reports/export/:report)
router.get('/export/:report', requirePermission('reports.export'), exportReportHandler);
// Query-based export route (direct API calls)
router.get('/export', requirePermission('reports.export'), exportReportHandler);

module.exports = router;
