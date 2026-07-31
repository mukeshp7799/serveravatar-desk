const express = require('express');
const pool = require('../config/database');
const { auth } = require('../middleware/auth');
const { translateNotifications } = require('../i18n');

const router = express.Router();

// GET /api/dashboard
router.get('/', auth, async (req, res, next) => {
  try {
    const roleName = req.user.role_name;
    const userId = req.user.id;

    // Pending approvals for managers and HR
    let pendingApprovals = [];
    if (roleName === 'Project Manager' || roleName === 'HR Admin' || roleName === 'System Admin') {
      let query = `SELECT lr.*, u.first_name, u.last_name, lt.name as leave_type
                   FROM leave_requests lr JOIN users u ON lr.user_id = u.id
                   JOIN leave_types lt ON lr.leave_type_id = lt.id
                   WHERE lr.status = 'pending'`;
      if (roleName === 'Project Manager') {
        query += ' AND (u.reporting_manager_id = ? OR lr.user_id = ?)';
      }
      query += ' ORDER BY lr.created_at ASC LIMIT 10';
      const params = roleName === 'Project Manager' ? [userId, userId] : [];
      const [pending] = await pool.query(query, params);
      pendingApprovals = pending;
    }

    // My tasks (assigned to current user via tb_assignees)
    const [myTasks] = await pool.query(
      `SELECT t.id, t.title, t.priority, t.due_date, t.column_id, t.project_id,
              p.name as project_name,
              c.name as column_name
       FROM tb_tasks t
       JOIN tb_assignees a ON a.task_id = t.id
       JOIN projects p ON p.id = t.project_id
       LEFT JOIN tb_columns c ON c.id = t.column_id
       WHERE a.user_id = ? AND t.archived_at IS NULL
       ORDER BY t.due_date IS NULL, t.due_date ASC LIMIT 10`,
      [userId]
    );

    // My upcoming leave
    const [myUpcomingLeave] = await pool.query(
      `SELECT lr.*, lt.name as leave_type FROM leave_requests lr
       JOIN leave_types lt ON lr.leave_type_id = lt.id
       WHERE lr.user_id = ? AND lr.status = 'approved' AND lr.start_date >= CURDATE()
       ORDER BY lr.start_date ASC LIMIT 5`,
      [userId]
    );

    // Recent notifications
    const [notifications] = await pool.query(
      'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 5',
      [userId]
    );

    // Leave balances
    const [leaveBalances] = await pool.query(
      `SELECT lb.*, lt.name as leave_type_name FROM leave_balances lb
       JOIN leave_types lt ON lb.leave_type_id = lt.id WHERE lb.user_id = ?`,
      [userId]
    );

    // My projects
    const [myProjects] = await pool.query(
      `SELECT p.*, pm.role_in_project,
              (SELECT COUNT(*) FROM tb_tasks tk WHERE tk.project_id = p.id AND tk.archived_at IS NULL) as total_tasks,
              (SELECT COUNT(*) FROM tb_tasks tk JOIN tb_columns c ON tk.column_id = c.id WHERE tk.project_id = p.id AND LOWER(c.name) IN ('done', 'completed', 'complete') AND tk.archived_at IS NULL) as done_tasks
       FROM projects p JOIN project_members pm ON p.id = pm.project_id
       WHERE pm.user_id = ? AND p.status = 'active' ORDER BY p.created_at DESC LIMIT 5`,
      [userId]
    );

    // Announcements
    const [announcements] = await pool.query(
      `SELECT a.*, u.first_name, u.last_name FROM announcements a
       JOIN users u ON a.posted_by = u.id WHERE a.is_active = TRUE ORDER BY a.created_at DESC LIMIT 5`
    );

    // HR-specific stats
    let hrStats = {};
    if (roleName === 'HR Admin' || roleName === 'System Admin') {
      const [totalEmployees] = await pool.query('SELECT COUNT(*) as count FROM users WHERE status = ?', ['active']);
      const [totalLeavePending] = await pool.query("SELECT COUNT(*) as count FROM leave_requests WHERE status = 'pending'");
      const [deptBreakdown] = await pool.query(
        'SELECT d.name, COUNT(u.id) as count FROM departments d LEFT JOIN users u ON d.id = u.department_id AND u.status = ? GROUP BY d.id',
        ['active']
      );
      hrStats = {
        totalEmployees: totalEmployees[0].count,
        pendingLeaveRequests: totalLeavePending[0].count,
        departmentBreakdown: deptBreakdown
      };
    }

    res.json({
      pendingApprovals,
      myTasks,
      myUpcomingLeave,
      notifications: translateNotifications(notifications, req.lang),
      leaveBalances,
      myProjects,
      announcements,
      hrStats
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
