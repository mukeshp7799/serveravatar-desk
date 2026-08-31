const express = require('express');
const pool = require('../config/database');
const { auth } = require('../middleware/auth');
const { translateNotifications } = require('../i18n');
const { getCompanySetting, nowInTimezone, todayInTimezone, toTimezone } = require('../utils/timezone');
const { computeWorkingHours, computeLiveWorkingHours } = require('../services/attendanceCalc');

const router = express.Router();

// GET /api/dashboard
router.get('/', auth, async (req, res, next) => {
  try {
    const tz = await getCompanySetting('general', 'timezone', 'UTC');

    const perms = req.user.permissions || [];
    const userId = req.user.id;

    // Pending approvals for managers and HR — get total count + limited list
    let pendingApprovals = [];
    let pendingApprovalsCount = 0;
    if (perms.includes('leaves.approve')) {
      const canManageAll = perms.includes('leaves.manage');
      let listQuery = `SELECT lr.*, u.first_name, u.last_name, lt.name as leave_type
                   FROM leave_requests lr JOIN users u ON lr.user_id = u.id
                   JOIN leave_types lt ON lr.leave_type_id = lt.id
                   WHERE lr.status = 'pending'`;
      let countQuery = `SELECT COUNT(*) as total FROM leave_requests lr
                        JOIN users u ON lr.user_id = u.id
                        WHERE lr.status = 'pending'`;
      let params = [];
      let countParams = [];
      if (!canManageAll) {
        listQuery += ' AND (u.reporting_manager_id = ? OR lr.user_id = ?)';
        countQuery += ' AND (u.reporting_manager_id = ? OR lr.user_id = ?)';
        params = [userId, userId];
        countParams = [userId, userId];
      }
      listQuery += ' ORDER BY lr.created_at ASC LIMIT 10';
      const [pending] = await pool.query(listQuery, params);
      const [countRows] = await pool.query(countQuery, countParams);
      pendingApprovals = pending;
      pendingApprovalsCount = countRows[0]?.total ?? 0;
    }

    // My tasks — get total count + limited list
    const [myTasksCountRows] = await pool.query(
      `SELECT COUNT(DISTINCT t.id) as total
       FROM tb_tasks t
       JOIN tb_assignees a ON a.task_id = t.id
       WHERE a.user_id = ? AND t.archived_at IS NULL`,
      [userId]
    );
    const myTasksCount = myTasksCountRows[0]?.total ?? 0;
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

    // Leave allocations with dynamic used/available
    const [leaveAllocs] = await pool.query(
      `SELECT la.leave_type_id, la.allocated_days, lt.name as leave_type_name, lt.is_paid,
              lt.max_allowed,
              (SELECT COALESCE(SUM(GREATEST(0, DATEDIFF(lr.end_date, lr.start_date)) + 1), 0)
               FROM leave_requests lr WHERE lr.user_id = la.user_id AND lr.leave_type_id = la.leave_type_id AND lr.status = 'approved') as used
       FROM leave_allocations la
       JOIN leave_types lt ON la.leave_type_id = lt.id
       WHERE la.user_id = ?`, [userId]
    );

    // My projects — get total count + limited list
    const [myProjectsCountRows] = await pool.query(
      `SELECT COUNT(DISTINCT p.id) as total
       FROM projects p JOIN project_members pm ON p.id = pm.project_id
       WHERE pm.user_id = ? AND p.status = 'active'`,
      [userId]
    );
    const myProjectsCount = myProjectsCountRows[0]?.total ?? 0;
    const [myProjects] = await pool.query(
      `SELECT p.*, pm.role_in_project,
              (SELECT COUNT(*) FROM tb_tasks tk WHERE tk.project_id = p.id AND tk.archived_at IS NULL) as total_tasks,
              (SELECT COUNT(*) FROM tb_tasks tk JOIN tb_columns c ON tk.column_id = c.id WHERE tk.project_id = p.id AND LOWER(c.name) IN ('done', 'completed', 'complete') AND tk.archived_at IS NULL) as done_tasks
       FROM projects p JOIN project_members pm ON p.id = pm.project_id
       WHERE pm.user_id = ? AND p.status = 'active' ORDER BY p.created_at DESC LIMIT 5`,
      [userId]
    );

    // Announcements (respects audience targeting, shows published only, top 5)
    const userDept = (await pool.query('SELECT department_id FROM users WHERE id = ?', [userId]))[0][0]?.department_id;
    const userRole = (await pool.query('SELECT role_id FROM users WHERE id = ?', [userId]))[0][0]?.role_id;
    let annWhere = "a.status = 'published' AND (a.audience_target = 'everyone'";
    let annParams = [];
    if (userDept) { annWhere += " OR (a.audience_target = 'departments' AND JSON_CONTAINS(a.target_ids, ?))"; annParams.push(String(userDept)); }
    if (userRole) { annWhere += " OR (a.audience_target = 'roles' AND JSON_CONTAINS(a.target_ids, ?))"; annParams.push(String(userRole)); }
    annWhere += " OR (a.audience_target = 'employees' AND JSON_CONTAINS(a.target_ids, ?))"; annParams.push(String(userId));
    annWhere += ")";
    const [announcementsRaw] = await pool.query(
      `SELECT a.id, a.title, a.content, a.priority, a.status, a.publish_date, a.expiry_date, a.audience_target, a.posted_by, a.created_at, a.is_pinned, u.first_name, u.last_name FROM announcements a JOIN users u ON a.posted_by = u.id WHERE ${annWhere} ORDER BY a.is_pinned DESC, a.created_at DESC LIMIT 5`,
      annParams
    );
    // Get reaction counts for these announcements
    const annIds = announcementsRaw.map(a => a.id);
    let reactionsMap = {};
    if (annIds.length > 0) {
      const [reactionCounts] = await pool.query(
        'SELECT announcement_id, emoji, COUNT(*) as count FROM announcement_reactions WHERE announcement_id IN (?) GROUP BY announcement_id, emoji',
        [annIds]
      );
      const [totalPerAnn] = await pool.query(
        'SELECT announcement_id, COUNT(*) as total FROM announcement_reactions WHERE announcement_id IN (?) GROUP BY announcement_id',
        [annIds]
      );
      const totalMap = {};
      totalPerAnn.forEach(r => { totalMap[r.announcement_id] = r.total; });
      reactionCounts.forEach(rc => {
        if (!reactionsMap[rc.announcement_id]) reactionsMap[rc.announcement_id] = { emojis: [], total: 0 };
        reactionsMap[rc.announcement_id].emojis.push({ emoji: rc.emoji, count: rc.count });
        reactionsMap[rc.announcement_id].total = totalMap[rc.announcement_id] || 0;
      });
    }
    const announcements = announcementsRaw.map(a => ({
      id: a.id, title: a.title, content: a.content && a.content.length > 200 ? a.content.substring(0, 200) + '...' : a.content,
      priority: a.priority, status: a.status, publish_date: a.publish_date, expiry_date: a.expiry_date,
      audience_target: a.audience_target, posted_by: a.posted_by, created_at: a.created_at,
      is_pinned: Boolean(a.is_pinned),
      poster_name: a.first_name + ' ' + a.last_name,
      reactions: reactionsMap[a.id] || { emojis: [], total: 0 }
    }));

    // HR-specific stats (any user with `hr.view_directory` or `users.view_all` sees them)
    let hrStats = {};
    if (perms.includes('hr.view_directory') || perms.includes('users.view_all')) {
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

    // Date string in company timezone (available regardless of permissions)
    const today = todayInTimezone(tz);

    // Attendance stats (users with attendance.view_team or attendance.manage_all)
    let attendanceStats = null;
    if (perms.includes('attendance.view_team') || perms.includes('attendance.manage_all')) {
      const [allToday] = await pool.query(
        `SELECT a.status, a.is_late FROM attendance a WHERE a.date = ?`,
        [today]
      );
      attendanceStats = {
        present_today:    allToday.filter(r => ['clocked_in','working','on_break','completed'].includes(r.status)).length,
        absent_today:     allToday.filter(r => r.status === 'absent').length,
        working_now:      allToday.filter(r => r.status === 'working').length,
        on_break:        allToday.filter(r => r.status === 'on_break').length,
        completed_today:  allToday.filter(r => r.status === 'completed').length,
        late_checkins:    allToday.filter(r => r.is_late === 1).length,
      };
    }

    // My today's attendance
    const [myTodayRows] = await pool.query(
      'SELECT * FROM attendance WHERE user_id = ? AND date = ? LIMIT 1',
      [userId, today]
    );
    const myToday = myTodayRows.length > 0 ? myTodayRows[0] : null;

    // Break count and active break for today
    let breakCount = 0;
    let activeBreakStart = null;
    if (myToday) {
      const [breakRows] = await pool.query(
        'SELECT start_time, end_time FROM attendance_breaks WHERE attendance_id = ?',
        [myToday.id]
      );
      breakCount = breakRows.length;
      const open = breakRows.find(b => !b.end_time);
      activeBreakStart = open ? open.start_time : null;
    }

    // ── Recent Activity Logs ───────────────────────────────────────────────
    const hasActivityViewAll = perms.includes('activity_logs.view_all');
    const hasActivityViewOwn = perms.includes('activity_logs.view_own');
    let recentActivities = [];
    if (hasActivityViewAll || hasActivityViewOwn) {
      const limit = 5;
      let actQuery, actParams;
      if (hasActivityViewAll) {
        actQuery = `SELECT al.id, al.user_id, al.module, al.action, al.description, al.created_at,
                           u.first_name, u.last_name
                    FROM activity_logs al
                    JOIN users u ON al.user_id = u.id
                    ORDER BY al.created_at DESC LIMIT ?`;
        actParams = [limit];
      } else {
        actQuery = `SELECT al.id, al.user_id, al.module, al.action, al.description, al.created_at,
                           u.first_name, u.last_name
                    FROM activity_logs al
                    JOIN users u ON al.user_id = u.id
                    WHERE al.user_id = ?
                    ORDER BY al.created_at DESC LIMIT ?`;
        actParams = [userId, limit];
      }
      const [actRows] = await pool.query(actQuery, actParams);
      recentActivities = actRows;
    }

    res.json({
      pendingApprovals,
      pendingApprovalsCount,
      myTasks,
      myTasksCount,
      myUpcomingLeave,
      notifications: translateNotifications(notifications, req.lang),
      leaveBalances: leaveAllocs,
      myProjects,
      myProjectsCount,
      announcements,
      hrStats,
      attendanceStats,
      myToday: myToday ? (() => {
        // Compute current status: if 'clocked_in' and >=1 minute has elapsed since clock_in,
        // return 'working'. Ensures consistent status across all pages.
        let currentStatus = myToday.status;
        if (myToday.status === 'clocked_in' && myToday.clock_in_time) {
          const clockInDate = new Date(myToday.clock_in_time);
          const now = new Date();
          const clockInInTz = toTimezone(clockInDate, tz);
          const nowInTz = toTimezone(now, tz);
          const elapsedMinutes = (nowInTz.getTime() - clockInInTz.getTime()) / 60000;
          if (elapsedMinutes >= 1) currentStatus = 'working';
        }
        return {
        id: myToday.id,
        status: currentStatus,
        clock_in_time: myToday.clock_in_time,
        clock_out_time: myToday.clock_out_time,
        total_break_minutes: myToday.total_break_minutes,
        is_late: Boolean(myToday.is_late),
        late_minutes: myToday.late_minutes || 0,
        break_count: breakCount,
        active_break_start: activeBreakStart,
        working_hours: (() => {
          if (!myToday.clock_in_time || !myToday.clock_out_time) return null;
          const ms = new Date(myToday.clock_out_time) - new Date(myToday.clock_in_time);
          return Math.max(0, (ms / 60000 - (myToday.total_break_minutes || 0)) / 60);
        })(),
        live_working_hours: (!myToday.clock_out_time && myToday.clock_in_time)
          ? computeLiveWorkingHours(myToday.clock_in_time, myToday.total_break_minutes || 0, activeBreakStart)
          : null,
        };
      })() : null,
      recentActivities,
      hasActivityViewAll,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
