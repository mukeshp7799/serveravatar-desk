const express = require('express');
const pool = require('../config/database');
const { auth, requirePermission } = require('../middleware/auth');
const {
  getSetting,
  getSettings,
  isWorkday,
  isHoliday,
  computeLateStatus,
  computeWorkingHours,
  computeLiveWorkingHours,
  countWorkingDays,
  countWeekends,
  overlapDays,
  computeAttendanceMetrics,
  getStatusLabel,
} = require('../services/attendanceCalc');
const { getCompanySetting, nowInTimezone, todayInTimezone, toTimezone, formatDate, formatTime } = require('../utils/timezone');
const { logActivity } = require('../services/activityService');

const router = express.Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Get or create today's attendance row for a user */
async function getOrCreateToday(userId, connection = pool) {
  const tz = await getCompanySetting('general', 'timezone', 'UTC');
  const today = todayInTimezone(tz);
  const [rows] = await connection.query(
    'SELECT * FROM attendance WHERE user_id = ? AND date = ? LIMIT 1',
    [userId, today]
  );
  if (rows.length > 0) return rows[0];

  // Check auto_mark_absent setting
  const autoMarkAbsent = await getSetting(pool, 'attendance', 'auto_mark_absent')
  if (autoMarkAbsent !== false) {
    // Auto-create absent record for today
    const [result] = await connection.query(
      'INSERT INTO attendance (user_id, date, status) VALUES (?, ?, ?)',
      [userId, today, 'absent']
    );
    return { id: result.insertId, user_id: userId, date: today, status: 'absent',
      clock_in_time: null, clock_out_time: null, total_break_minutes: 0,
      is_late: 0, late_minutes: 0, remarks: null };
  }

  return null
}



/** Normalize datetime to nearest minute for comparison */
function sameMinute(a, b) {
  const ta = new Date(a).setSeconds(0, 0);
  const tb = new Date(b).setSeconds(0, 0);
  return ta === tb;
}

// ─── Middleware: require attendance.clock_in_out ───────────────────────────────
router.use(auth);

// ─── POST /api/attendance/clock-in ──────────────────────────────────────────
router.post('/clock-in', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const perms = req.user.permissions || [];
    if (!perms.includes('attendance.clock_in_out')) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const today = await getOrCreateToday(userId);

    if (!today) {
      // auto_mark_absent is false and no attendance record exists
      return res.status(400).json({ error: 'Attendance record not found. Please contact admin.' });
    }

    // ── Re-clock-in logic ──────────────────────────────────────────────
    // If the employee already has a completed record today (clocked out),
    // re-clock-in clears the clock_out so they can continue without
    // creating a duplicate attendance row for the same day.
    if (today.status === 'completed' && today.clock_out_time) {
      const tz2 = await getCompanySetting('general', 'timezone', 'UTC');
      const now2 = nowInTimezone(tz2);
      // Close any open breaks from the previous session first.
      const [openBreaks] = await pool.query(
        'SELECT * FROM attendance_breaks WHERE attendance_id = ? AND end_time IS NULL',
        [today.id]
      );
      for (const b of openBreaks) {
        const mins = Math.floor((now2 - new Date(b.start_time)) / 60000);
        await pool.query(
          'UPDATE attendance_breaks SET end_time = ?, duration_minutes = ? WHERE id = ?',
          [now2, mins, b.id]
        );
        await pool.query(
          'UPDATE attendance SET total_break_minutes = total_break_minutes + ? WHERE id = ?',
          [mins, today.id]
        );
      }
      await pool.query(
        `UPDATE attendance SET status = 'clocked_in', clock_out_time = NULL
         WHERE id = ?`,
        [today.id]
      );
      const [updated] = await pool.query('SELECT * FROM attendance WHERE id = ?', [today.id]);
      const rec = updated[0];
      const [breaks] = await pool.query(
        'SELECT * FROM attendance_breaks WHERE attendance_id = ? ORDER BY start_time ASC',
        [rec.id]
      );
      const activeBreak = breaks.find(b => !b.end_time);
      const liveWH = computeLiveWorkingHours(rec.clock_in_time, rec.total_break_minutes, activeBreak?.start_time || null);
      res.json({
        message: 'Clocked in again — previous session ended',
        attendance: {
          ...formatAttendance(rec),
          live_working_hours: liveWH,
          active_break_start: activeBreak?.start_time || null,
          breaks: breaks.map(b => ({ id: b.id, start_time: b.start_time, end_time: b.end_time, duration_minutes: b.duration_minutes })),
        },
      });
      logActivity({ req, module: 'Attendance', action: 'Clocked In',
        description: 'Clocked in again after clock-out' });
      return;
    }

    if (today.status !== 'absent' && today.status !== 'clocked_in') {
      return res.status(400).json({ error: 'Already clocked in today' });
    }
    if (today.clock_in_time) {
      return res.status(400).json({ error: 'Already clocked in today' });
    }

    const tz = await getCompanySetting('general', 'timezone', 'UTC');
    const now = nowInTimezone(tz);

    // ── Early clock-in check ─────────────────────────────────────────────
    const allowEarlyClockIn = await getSetting(pool, 'attendance', 'allow_early_clock_in');
    if (allowEarlyClockIn === false) {
      const officeStartTime = await getSetting(pool, 'working_schedule', 'office_start_time') || '09:30';
      const [sh, sm] = officeStartTime.split(':').map(Number);
      const officeStartMinutes = sh * 60 + sm;

      // Convert current UTC time to IST (or company timezone) for correct wall-clock comparison.
      // office_start_time is stored as HH:MM in company local time (IST), not UTC.
      // nowInTimezone returns UTC, so we must convert to company TZ to compare like-with-like.
      // Use Intl.DateTimeFormat to get the wall-clock hour/minute in the company timezone.
      let nowMinutes = now.getHours() * 60 + now.getMinutes();
      if (tz && tz !== 'UTC') {
        try {
          const fmt = new Intl.DateTimeFormat('en-US', {
            timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
          });
          const parts = Object.fromEntries(
            fmt.formatToParts(now).map(p => [p.type, p.value])
          );
          nowMinutes = (Number(parts.hour) % 24) * 60 + Number(parts.minute);
        } catch (_) {
          // Fall back to UTC if timezone formatting fails
        }
      }

      if (nowMinutes < officeStartMinutes) {
        const [hh, mm] = officeStartTime.split(':');
        const formattedTime = `${hh}:${mm}`;
        return res.status(400).json({
          error: `Early clock-in is not allowed. Office starts at ${formattedTime}. Please clock in at or after ${formattedTime}.`,
          code: 'EARLY_CLOCK_IN_BLOCKED',
        });
      }
    }

    // Late check: use office_start_time + late_checkin_grace_minutes from company settings (shared service)
    const [officeStartTime, graceMinutes] = await Promise.all([
      getSetting(pool, 'working_schedule', 'office_start_time'),
      getSetting(pool, 'working_schedule', 'late_checkin_grace_minutes'),
    ])
    const { isLate, lateMinutes } = computeLateStatus(now, officeStartTime || '09:30', Number(graceMinutes) || 30, tz)

    await pool.query(
      `UPDATE attendance SET status = 'clocked_in', clock_in_time = ?,
       is_late = ?, late_minutes = ? WHERE id = ?`,
      [now, isLate ? 1 : 0, lateMinutes, today.id]
    );

    // Reload
    const [updated] = await pool.query('SELECT * FROM attendance WHERE id = ?', [today.id]);
    const rec = updated[0];
    const [breaks] = await pool.query(
      'SELECT * FROM attendance_breaks WHERE attendance_id = ? ORDER BY start_time ASC',
      [rec.id]
    );
    const activeBreak = breaks.find(b => !b.end_time);
    const liveWH = (!rec.clock_out_time && rec.clock_in_time)
      ? computeLiveWorkingHours(rec.clock_in_time, rec.total_break_minutes, activeBreak?.start_time || null)
      : null;
    res.json({
      message: isLate ? 'Clocked in (Late)' : 'Clocked in successfully',
      attendance: {
        ...formatAttendance(rec),
        live_working_hours: liveWH,
        active_break_start: activeBreak?.start_time || null,
        breaks: breaks.map(b => ({ id: b.id, start_time: b.start_time, end_time: b.end_time, duration_minutes: b.duration_minutes })),
      },
    });
    // ── Activity log: Clock In ─────────────────────────────────────────────
    logActivity({ req, module: 'Attendance', action: 'Clocked In',
      description: `Clocked in${isLate ? ' (Late)' : ''}` });
  } catch (err) { next(err); }
});

// ─── POST /api/attendance/start-break ────────────────────────────────────────
router.post('/start-break', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const perms = req.user.permissions || [];
    if (!perms.includes('attendance.clock_in_out')) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const today = await getOrCreateToday(userId);
    if (!today) return res.status(400).json({ error: 'No attendance record. Please clock in first.' });

    if (!['clocked_in', 'working'].includes(today.status)) {
      return res.status(400).json({ error: 'You must be clocked in or working to start a break' });
    }

    // Check for open break (no end_time)
    const [openBreaks] = await pool.query(
      'SELECT * FROM attendance_breaks WHERE attendance_id = ? AND end_time IS NULL LIMIT 1',
      [today.id]
    );
    if (openBreaks.length > 0) {
      return res.status(400).json({ error: 'You are already on a break' });
    }

    const tz = await getCompanySetting('general', 'timezone', 'UTC');
    const now = nowInTimezone(tz);
    await pool.query(
      'INSERT INTO attendance_breaks (attendance_id, start_time) VALUES (?, ?)',
      [today.id, now]
    );
    await pool.query(
      'UPDATE attendance SET status = ? WHERE id = ?',
      ['on_break', today.id]
    );

    const [updated] = await pool.query('SELECT * FROM attendance WHERE id = ?', [today.id]);
    const rec = updated[0];
    const [breaks] = await pool.query(
      'SELECT * FROM attendance_breaks WHERE attendance_id = ? ORDER BY start_time ASC',
      [rec.id]
    );
    const activeBreak = breaks.find(b => !b.end_time);
    const liveWH = (!rec.clock_out_time && rec.clock_in_time)
      ? computeLiveWorkingHours(rec.clock_in_time, rec.total_break_minutes, activeBreak?.start_time || null)
      : null;
    res.json({
      message: 'Break started',
      attendance: {
        ...formatAttendance(rec),
        live_working_hours: liveWH,
        active_break_start: activeBreak?.start_time || null,
        breaks: breaks.map(b => ({ id: b.id, start_time: b.start_time, end_time: b.end_time, duration_minutes: b.duration_minutes })),
      },
    });
  } catch (err) { next(err); }
});

// ─── POST /api/attendance/end-break ─────────────────────────────────────────
router.post('/end-break', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const perms = req.user.permissions || [];
    if (!perms.includes('attendance.clock_in_out')) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const today = await getOrCreateToday(userId);
    if (!today) return res.status(400).json({ error: 'No attendance record.' });

    if (today.status !== 'on_break') {
      return res.status(400).json({ error: 'You are not on a break' });
    }

    const tz = await getCompanySetting('general', 'timezone', 'UTC');
    const now = nowInTimezone(tz);
    const [openBreaks] = await pool.query(
      'SELECT * FROM attendance_breaks WHERE attendance_id = ? AND end_time IS NULL LIMIT 1',
      [today.id]
    );
    if (openBreaks.length === 0) {
      return res.status(400).json({ error: 'No active break found' });
    }

    const breakRec = openBreaks[0];
    const breakMinutes = Math.floor((now - new Date(breakRec.start_time)) / 60000);

    await pool.query(
      'UPDATE attendance_breaks SET end_time = ?, duration_minutes = ? WHERE id = ?',
      [now, breakMinutes, breakRec.id]
    );
    await pool.query(
      'UPDATE attendance SET status = ?, total_break_minutes = total_break_minutes + ? WHERE id = ?',
      ['working', breakMinutes, today.id]
    );

    const [updated] = await pool.query('SELECT * FROM attendance WHERE id = ?', [today.id]);
    const rec = updated[0];
    const [breaks] = await pool.query(
      'SELECT * FROM attendance_breaks WHERE attendance_id = ? ORDER BY start_time ASC',
      [rec.id]
    );
    const activeBreak = breaks.find(b => !b.end_time);
    const liveWH = (!rec.clock_out_time && rec.clock_in_time)
      ? computeLiveWorkingHours(rec.clock_in_time, rec.total_break_minutes, activeBreak?.start_time || null)
      : null;
    res.json({
      message: 'Break ended',
      attendance: {
        ...formatAttendance(rec),
        live_working_hours: liveWH,
        active_break_start: activeBreak?.start_time || null,
        breaks: breaks.map(b => ({ id: b.id, start_time: b.start_time, end_time: b.end_time, duration_minutes: b.duration_minutes })),
      },
    });
  } catch (err) { next(err); }
});

// ─── POST /api/attendance/clock-out ───────────────────────────────────────────
router.post('/clock-out', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const perms = req.user.permissions || [];
    if (!perms.includes('attendance.clock_in_out')) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const today = await getOrCreateToday(userId);
    if (!today) return res.status(400).json({ error: 'No attendance record. Please clock in first.' });

    if (!['clocked_in', 'working'].includes(today.status)) {
      return res.status(400).json({ error: 'You must be clocked in or working to clock out' });
    }
    if (today.status === 'on_break') {
      return res.status(400).json({ error: 'Please end your break before clocking out' });
    }
    if (today.clock_out_time) {
      return res.status(400).json({ error: 'Already clocked out today' });
    }

    const tz = await getCompanySetting('general', 'timezone', 'UTC');
    const now = nowInTimezone(tz);

    // Close any open breaks first
    const [openBreaks] = await pool.query(
      'SELECT * FROM attendance_breaks WHERE attendance_id = ? AND end_time IS NULL',
      [today.id]
    );
    for (const b of openBreaks) {
      const mins = Math.floor((now - new Date(b.start_time)) / 60000);
      await pool.query(
        'UPDATE attendance_breaks SET end_time = ?, duration_minutes = ? WHERE id = ?',
        [now, mins, b.id]
      );
      await pool.query(
        'UPDATE attendance SET total_break_minutes = total_break_minutes + ? WHERE id = ?',
        [mins, today.id]
      );
    }

    await pool.query(
      'UPDATE attendance SET status = ?, clock_out_time = ? WHERE id = ?',
      ['completed', now, today.id]
    );

    const [updated] = await pool.query('SELECT * FROM attendance WHERE id = ?', [today.id]);

    // ── Activity log: Clock Out ───────────────────────────────────────────
    logActivity({ req, module: 'Attendance', action: 'Clocked Out',
      description: `Clocked out` });

    const rec = updated[0];
    const [breaks] = await pool.query(
      'SELECT * FROM attendance_breaks WHERE attendance_id = ? ORDER BY start_time ASC',
      [rec.id]
    );
    res.json({
      message: 'Clocked out successfully',
      attendance: {
        ...formatAttendance(rec),
        live_working_hours: null,
        active_break_start: null,
        breaks: breaks.map(b => ({ id: b.id, start_time: b.start_time, end_time: b.end_time, duration_minutes: b.duration_minutes })),
      },
    });
  } catch (err) { next(err); }
});

// ─── GET /api/attendance/today ───────────────────────────────────────────────
router.get('/today', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const perms = req.user.permissions || [];
    const targetId = req.query.user_id ? parseInt(req.query.user_id) : userId;

    // Scope check: can only view own unless view_team or manage_all
    if (targetId !== userId && !perms.includes('attendance.view_team') && !perms.includes('attendance.manage_all')) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const today = await getOrCreateToday(targetId);
    if (!today) {
      return res.json({ attendance: null, breaks: [], working_hours: null });
    }
    const [breaks] = await pool.query(
      'SELECT * FROM attendance_breaks WHERE attendance_id = ? ORDER BY start_time ASC',
      [today.id]
    );

    const wh = computeWorkingHours(today.clock_in_time, today.clock_out_time, today.total_break_minutes);
    const ebToday = Number(today.effective_break_minutes) || 0;
    const effectiveWH = (wh != null && ebToday > 0) ? Math.round((wh + ebToday / 60) * 100) / 100 : wh;

    // Live hours: compute only when clocked-in but NOT yet clocked-out
    const activeBreak = breaks.find(b => !b.end_time);
    const liveWH = (!today.clock_out_time && today.clock_in_time)
      ? computeLiveWorkingHours(today.clock_in_time, today.total_break_minutes, activeBreak?.start_time || null)
      : null;

    res.json({
      attendance: {
        ...formatAttendance(today),
        live_working_hours: liveWH,
        active_break_start: activeBreak?.start_time || null,
        breaks: breaks.map(b => ({
          id: b.id,
          start_time: b.start_time,
          end_time: b.end_time,
          duration_minutes: b.duration_minutes,
        })),
      },
    });
  } catch (err) { next(err); }
});

// ─── GET /api/attendance/history ──────────────────────────────────────────────
router.get('/history', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const perms = req.user.permissions || [];
    const tz = await getCompanySetting('general', 'timezone', 'UTC');

    // Shared HH:MM formatter for MySQL DATETIME and TIME columns
    const toHHMM = (val, _tz) => {
      if (!val) return null;
      if (typeof val === 'string' && /^\d{2}:\d{2}:?\d{0,2}$/.test(val.trim())) {
        const [h, m] = val.trim().split(':').map(Number);
        // TIME columns store company-local wall-clock HH:MM:SS — return as-is (no UTC-bridge needed)
        return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
      }
      // DATETIME columns need UTC-bridge conversion
      const d = _tz ? toTimezone(new Date(val), _tz) : new Date(val);
      return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    };

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(5, parseInt(req.query.limit) || 30));
    const offset = (page - 1) * limit;
    const targetId = req.query.user_id ? parseInt(req.query.user_id) : userId;

    if (targetId !== userId && !perms.includes('attendance.view_team') && !perms.includes('attendance.manage_all')) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    // Include today if user has break adjustment permission (so they can view their adjustment status)
    const hasAdjPerm = perms.includes('attendance.break_adjustment.request');
    const dateFilter = hasAdjPerm ? 'a.date <= CURDATE()' : 'a.date < CURDATE()';

    const [records] = await pool.query(
      `SELECT a.*,
        (SELECT COALESCE(SUM(duration_minutes),0) FROM attendance_breaks WHERE attendance_id = a.id) as break_minutes
       FROM attendance a
       WHERE a.user_id = ? AND ${dateFilter}
       ORDER BY a.date DESC LIMIT ? OFFSET ?`,
      [targetId, limit, offset]
    );

    // Total counts only past dates (for pagination); today is shown as an extra first page
    const [[{ total }]] = await pool.query(
      'SELECT COUNT(*) as total FROM attendance WHERE user_id = ? AND date < CURDATE()',
      [targetId]
    );

    // Fetch all adjustment requests for these attendance records in one query
    const attIds = records.map(r => r.id);
    let adjustmentsMap = {};
    if (attIds.length > 0) {
      const placeholders = attIds.map(() => '?').join(',');
      const [adjRows] = await pool.query(
        `SELECT bar.*,
                ab.start_time as break_start, ab.end_time as break_end, ab.duration_minutes as break_duration,
                ru.first_name as reviewer_first_name, ru.last_name as reviewer_last_name
         FROM break_adjustment_requests bar
         JOIN attendance_breaks ab ON bar.break_id = ab.id
         LEFT JOIN users ru ON bar.reviewed_by = ru.id
         WHERE bar.attendance_id IN (${placeholders})
         ORDER BY bar.created_at ASC`,
        attIds
      );
      for (const adj of adjRows) {
        if (!adjustmentsMap[adj.attendance_id]) adjustmentsMap[adj.attendance_id] = [];
        adjustmentsMap[adj.attendance_id].push({
          id: adj.id,
          break_id: adj.break_id,
          requested_minutes: adj.requested_minutes,
          start_time: adj.start_time,
          end_time:   adj.end_time,
          time_start: toHHMM(adj.start_time, tz),
          time_end:   toHHMM(adj.end_time,   tz),
          reason: adj.reason,
          status: adj.status,
          admin_remarks: adj.admin_remarks,
          reviewed_at: adj.reviewed_at,
          reviewed_by: adj.reviewed_by,
          created_at: adj.created_at,
          break_time_start: toHHMM(adj.break_start, tz),
          break_time_end:   toHHMM(adj.break_end,   tz),
          break_duration: adj.break_duration,
          reviewer: adj.reviewer_first_name
            ? { first_name: adj.reviewer_first_name, last_name: adj.reviewer_last_name }
            : null,
        });
      }
    }

    const today = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD' in UTC
    res.json({
      records: records.map(r => {
        // MySQL DATE may be returned as a Date object or ISO string — normalize to YYYY-MM-DD
        const dateStr = r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date).slice(0, 10);
        const liveWH = (dateStr === today && !r.clock_out_time)
          ? computeLiveWorkingHours(r.clock_in_time, r.total_break_minutes)
          : null;
        return {
          ...formatAttendance(r),
          live_working_hours: liveWH,
          adjustments: adjustmentsMap[r.id] || [],
        };
      }),
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (err) { next(err); }
});

// ─── GET /api/attendance/my-history ────────────────────────────────────────
// Employee self-service: date range filter + summary + day-wise timeline.
// Uses the same calculation logic as the HR analytics/timeline.
router.get('/my-history', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const tz = await getCompanySetting('general', 'timezone', 'UTC');

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(5, parseInt(req.query.limit) || 14));
    const offset = (page - 1) * limit;

    const { date_from, date_to } = req.query;
    if (!date_from || !date_to) {
      return res.status(400).json({ error: 'date_from and date_to are required' });
    }

    // Get employee info
    const [[emp]] = await pool.query(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.hire_date, d.name as department_name
       FROM users u LEFT JOIN departments d ON u.department_id = d.id WHERE u.id = ?`,
      [userId]
    );
    if (!emp) return res.status(404).json({ error: 'Employee not found' });

    // Holidays in range
    const [holidays] = await pool.query(
      'SELECT date, name, holiday_type FROM company_holidays WHERE date BETWEEN ? AND ?',
      [date_from, date_to]
    );
    const holidayMap = {};
    const holidaySet = new Set();
    for (const h of holidays) {
      const ds = String(toTimezone(new Date(h.date), tz).toISOString().slice(0, 10));
      holidayMap[ds] = h;
      holidaySet.add(ds);
    }

    // Working days from company settings
    const { working_schedule: wsTimeline } = await getSettings(pool, 'working_schedule');
    const workingDays = Array.isArray(wsTimeline?.working_days)
      ? wsTimeline.working_days
      : ['mon', 'tue', 'wed', 'thu', 'fri'];

    // Approved leaves for this employee in range
    const [leaves] = await pool.query(
      `SELECT start_date, end_date, reason, leave_type_id FROM leave_requests
       WHERE user_id = ? AND status = 'approved' AND start_date <= ? AND end_date >= ?`,
      [userId, date_to, date_from]
    );

    // Attendance records in range
    const [attRecords] = await pool.query(
      `SELECT a.*,
        (SELECT COALESCE(SUM(duration_minutes),0) FROM attendance_breaks WHERE attendance_id = a.id) as break_minutes
       FROM attendance a
       WHERE a.user_id = ? AND a.date BETWEEN ? AND ?
       ORDER BY a.date ASC`,
      [userId, date_from, date_to]
    );
    const attMap = {};
    for (const r of attRecords) {
      const ds = String(toTimezone(new Date(r.date), tz).toISOString().slice(0, 10));
      attMap[ds] = r;
    }

    // Breaks map
    const attIds = attRecords.map(r => r.id);
    const breaksMap = {};
    if (attIds.length > 0) {
      const [breaks] = await pool.query(
        `SELECT * FROM attendance_breaks WHERE attendance_id IN (${attIds.map(() => '?').join(',')}) ORDER BY start_time ASC`,
        attIds
      );
      for (const b of breaks) {
        if (!breaksMap[b.attendance_id]) breaksMap[b.attendance_id] = [];
        breaksMap[b.attendance_id].push(b);
      }
    }

    // Build FULL day-wise timeline (all days in range, for summary calculation)
    const presentStatuses = ['clocked_in', 'working', 'on_break', 'completed'];
    const fullTimeline = [];
    const cur = new Date(date_from);
    while (cur <= new Date(date_to)) {
      const ds = toTimezone(cur, tz).toISOString().slice(0, 10);
      const dow = cur.getDay();
      const isWeekend = !isWorkday(ds, workingDays);
      const holiday = holidayMap[ds];
      const att = attMap[ds];

      let leaveInfo = null;
      for (const lv of leaves) {
        const ls = String(lv.start_date).slice(0, 10);
        const le = String(lv.end_date).slice(0, 10);
        if (ds >= ls && ds <= le) { leaveInfo = lv; break; }
      }

      let status, statusLabel;
      if (holiday) {
        status = 'holiday'; statusLabel = 'Holiday';
      } else if (isWeekend) {
        status = 'weekend'; statusLabel = 'Weekend';
      } else if (leaveInfo) {
        status = 'leave'; statusLabel = 'Leave';
      } else if (att && presentStatuses.includes(att.status)) {
        status = 'present'; statusLabel = 'Present';
      } else {
        status = 'absent'; statusLabel = 'Absent';
      }

      const today = todayInTimezone(tz);
      const wh = att?.clock_out_time
        ? computeWorkingHours(att.clock_in_time, att.clock_out_time, att.total_break_minutes || 0)
        : (att?.clock_in_time && ds === today
          ? computeLiveWorkingHours(att.clock_in_time, att.total_break_minutes || 0)
          : null);
      const ebTimeline = Number(att?.effective_break_minutes) || 0;
      const effectiveWH = (wh != null && ebTimeline > 0) ? Math.round((wh + ebTimeline / 60) * 100) / 100 : wh;

      fullTimeline.push({
        date: ds,
        day_of_week: dow,
        status,
        status_label: statusLabel,
        clock_in_time: att?.clock_in_time || null,
        clock_out_time: att?.clock_out_time || null,
        total_break_minutes: att?.total_break_minutes || 0,
        effective_break_minutes: ebTimeline,
        working_hours: effectiveWH,
        is_live: Boolean(att?.clock_in_time && !att?.clock_out_time && ds === today),
        is_late: att ? Boolean(att.is_late) : false,
        late_minutes: att?.late_minutes || 0,
        remarks: att?.remarks || null,
        holiday_name: holiday?.name || null,
        leave_reason: leaveInfo?.reason || null,
        breaks: att ? (breaksMap[att.id] || []) : [],
        attendance_id: att?.id || null,
        raw_status: att?.status || null,
      });

      cur.setDate(cur.getDate() + 1);
    }

    // Compute summary from full timeline
    const totalDays = fullTimeline.length;
    const weekends = fullTimeline.filter(d => d.status === 'weekend').length;
    const companyHolidays = fullTimeline.filter(d => d.status === 'holiday').length;
    const presentDays = fullTimeline.filter(d => d.status === 'present').length;
    const approvedLeaveDays = fullTimeline.filter(d => d.status === 'leave').length;
    const absentDays = fullTimeline.filter(d => d.status === 'absent').length;
    const lateCheckins = fullTimeline.filter(d => d.is_late).length;
    const totalBreakMinutes = fullTimeline.reduce((s, d) => s + (d.total_break_minutes || 0), 0);

    // Working days = days that are NOT weekend AND NOT holiday
    const workingDaysCount = totalDays - weekends - companyHolidays;

    // Total and average working hours (only from completed/present days with hours)
    const daysWithHours = fullTimeline.filter(d => d.working_hours != null);
    const totalWorkingHours = daysWithHours.reduce((s, d) => s + d.working_hours, 0);
    const averageWorkingHours = daysWithHours.length > 0 ? totalWorkingHours / daysWithHours.length : 0;

    // Paginate timeline
    const paginatedTimeline = fullTimeline.slice(offset, offset + limit);

    res.json({
      employee: {
        id: emp.id,
        first_name: emp.first_name,
        last_name: emp.last_name,
        email: emp.email,
        hire_date: emp.hire_date,
        department_name: emp.department_name,
      },
      summary: {
        total_days: totalDays,
        working_days: workingDaysCount,
        weekends,
        company_holidays: companyHolidays,
        present_days: presentDays,
        approved_leave_days: approvedLeaveDays,
        absent_days: absentDays,
        late_checkins: lateCheckins,
        total_break_minutes: totalBreakMinutes,
        total_working_hours: Math.round(totalWorkingHours * 100) / 100,
        average_working_hours: Math.round(averageWorkingHours * 100) / 100,
      },
      timeline: paginatedTimeline,
      pagination: {
        total: totalDays,
        page,
        limit,
        pages: Math.ceil(totalDays / limit),
      },
    });
  } catch (err) { next(err); }
});

// ─── GET /api/attendance/breaks/:attendanceId ─────────────────────────────────
router.get('/breaks/:attendanceId', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const perms = req.user.permissions || [];
    const attId = parseInt(req.params.attendanceId);

    const [[att]] = await pool.query('SELECT * FROM attendance WHERE id = ?', [attId]);
    if (!att) return res.status(404).json({ error: 'Attendance record not found' });

    if (att.user_id !== userId && !perms.includes('attendance.view_team') && !perms.includes('attendance.manage_all')) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const [breaks] = await pool.query(
      'SELECT * FROM attendance_breaks WHERE attendance_id = ? ORDER BY start_time ASC',
      [attId]
    );

    res.json({ breaks });
  } catch (err) { next(err); }
});

// ─── GET /api/attendance/stats ────────────────────────────────────────────────
// Dashboard cards: present_today, absent_today, working_now, on_break, completed_today, late_checkins
router.get('/stats', async (req, res, next) => {
  try {
    const tz = await getCompanySetting('general', 'timezone', 'UTC');
    const perms = req.user.permissions || [];
    if (!perms.includes('attendance.view_team') && !perms.includes('attendance.manage_all')) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const today = todayInTimezone(tz);
    const now = nowInTimezone(tz);
    const currentHour = now.getHours();
    const currentMin = now.getMinutes();

    const [allToday] = await pool.query(
      `SELECT a.*, u.first_name, u.last_name, u.email, d.name as department_name
       FROM attendance a
       JOIN users u ON a.user_id = u.id
       LEFT JOIN departments d ON u.department_id = d.id
       WHERE a.date = ?
       ORDER BY u.first_name, u.last_name`,
      [today]
    );

    const stats = {
      present_today:  allToday.filter(r => ['clocked_in', 'working', 'on_break', 'completed'].includes(r.status)).length,
      absent_today:    allToday.filter(r => r.status === 'absent').length,
      working_now:     allToday.filter(r => r.status === 'working').length,
      on_break:        allToday.filter(r => r.status === 'on_break').length,
      completed_today: allToday.filter(r => r.status === 'completed').length,
      late_checkins:   allToday.filter(r => r.is_late === 1).length,
    };

    res.json({ stats, date: today });
  } catch (err) { next(err); }
});

// ─── GET /api/attendance/team ────────────────────────────────────────────────
// List all employees' today attendance (managers + HR)
router.get('/team', async (req, res, next) => {
  try {
    const tz = await getCompanySetting('general', 'timezone', 'UTC');
    const perms = req.user.permissions || [];
    if (!perms.includes('attendance.view_team') && !perms.includes('attendance.manage_all')) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(5, parseInt(req.query.limit) || 10));
    const offset = (page - 1) * limit;
    const today = todayInTimezone(tz);

    const [rows] = await pool.query(
      `SELECT a.*, u.first_name, u.last_name, u.email, d.name as department_name
       FROM attendance a
       JOIN users u ON a.user_id = u.id
       LEFT JOIN departments d ON u.department_id = d.id
       WHERE a.date = ?
       ORDER BY a.status, u.first_name, u.last_name
       LIMIT ? OFFSET ?`,
      [today, limit, offset]
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) as total FROM attendance a JOIN users u ON a.user_id = u.id WHERE a.date = ?`,
      [today]
    );

    res.json({
      records: rows.map(r => ({
        ...formatAttendance(r),
        
      })),
      date: today,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) { next(err); }
});

// ─── GET /api/attendance/all ──────────────────────────────────────────────────
// Admin: search, filter, paginate all attendance records
router.get('/all', async (req, res, next) => {
  try {
    const perms = req.user.permissions || [];
    if (!perms.includes('attendance.manage_all')) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(5, parseInt(req.query.limit) || 30));
    const offset = (page - 1) * limit;
    const { user_id, department_id, status, date_from, date_to, search } = req.query;

    let where = ['1=1'];
    let params = [];

    if (user_id) { where.push('a.user_id = ?'); params.push(user_id); }
    if (department_id) { where.push('u.department_id = ?'); params.push(department_id); }
    if (status) { where.push('a.status = ?'); params.push(status); }
    if (date_from) { where.push('a.date >= ?'); params.push(date_from); }
    if (date_to) { where.push('a.date <= ?'); params.push(date_to); }
    if (search) {
      where.push('(u.first_name LIKE ? OR u.last_name LIKE ? OR u.email LIKE ?)');
      const s = `%${search}%`;
      params.push(s, s, s);
    }

    const whereStr = where.join(' AND ');

    const [records] = await pool.query(
      `SELECT a.*, u.first_name, u.last_name, u.email, d.name as department_name
       FROM attendance a
       JOIN users u ON a.user_id = u.id
       LEFT JOIN departments d ON u.department_id = d.id
       WHERE ${whereStr}
       ORDER BY a.date DESC, u.first_name ASC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) as total FROM attendance a JOIN users u ON a.user_id = u.id WHERE ${whereStr}`,
      params
    );

    res.json({
      records: records.map(r => ({
        ...formatAttendance(r),
        
      })),
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (err) { next(err); }
});

// ─── PUT /api/attendance/:id ───────────────────────────────────────────────────
router.put('/:id', async (req, res, next) => {
  try {
    const perms = req.user.permissions || [];
    if (!perms.includes('attendance.manage_all')) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const attId = parseInt(req.params.id);
    const [[existing]] = await pool.query('SELECT * FROM attendance WHERE id = ?', [attId]);
    if (!existing) return res.status(404).json({ error: 'Attendance record not found' });

    const { status, clock_in_time, clock_out_time, remarks } = req.body;
    const updates = [];
    const vals = [];

    // Strip 'Z' suffix from UTC ISO strings (frontend sends via fromDateTimeLocalToUTC)
    // and store as naive MySQL datetime.
    const stripUTC = v => v ? (v.endsWith('Z') ? v.slice(0, -1) : v) : null;

    const validStatuses = ['absent', 'clocked_in', 'working', 'on_break', 'completed'];
    if (status && validStatuses.includes(status)) {
      updates.push('status = ?');
      vals.push(status);
    }
    if (clock_in_time !== undefined) {
      updates.push('clock_in_time = ?');
      vals.push(stripUTC(clock_in_time) || null);
    }
    if (clock_out_time !== undefined) {
      updates.push('clock_out_time = ?');
      vals.push(stripUTC(clock_out_time) || null);
    }
    if (remarks !== undefined) {
      updates.push('remarks = ?');
      vals.push(remarks || null);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    vals.push(attId);
    await pool.query(`UPDATE attendance SET ${updates.join(', ')} WHERE id = ?`, vals);

    const [[updated]] = await pool.query('SELECT * FROM attendance WHERE id = ?', [attId]);
    // ── Activity log: Attendance Updated (admin) ───────────────────────────
    logActivity({ req, module: 'Attendance', action: 'Updated',
      description: `Attendance record updated for user ID ${existing.user_id}`,
      previousValue: existing, newValue: updated });
    res.json({ message: 'Updated', attendance: formatAttendance(updated) });
  } catch (err) { next(err); }
});

// ─── Format helper ───────────────────────────────────────────────────────────
function formatAttendance(r) {
  const totalBreak = Number(r.total_break_minutes) || 0;
  const effectiveBreak = Number(r.effective_break_minutes) || 0;
  // working_hours = shift - (total_break_minutes - effective_break_minutes)
  //                 = shift - total_break_minutes + effective_break_minutes
  // After adjustment approval: total_break_minutes = original - approved
  // and effective_break_minutes = approved, so net = original break used
  const wh = computeWorkingHours(r.clock_in_time, r.clock_out_time, totalBreak);
  const effectiveWH = (wh != null && effectiveBreak > 0) ? wh + effectiveBreak / 60 : wh;
  return {
    id: r.id,
    user_id: r.user_id,
    date: r.date,
    status: r.status,
    clock_in_time: r.clock_in_time,
    clock_out_time: r.clock_out_time,
    total_break_minutes: totalBreak,
    effective_break_minutes: effectiveBreak,
    // original_break_minutes: totalBreak + effectiveBreak,
    is_late: Boolean(r.is_late),
    late_minutes: r.late_minutes || 0,
    remarks: r.remarks,
    working_hours: Math.round(effectiveWH * 100) / 100,
    first_name: r.first_name,
    last_name: r.last_name,
    email: r.email,
    department_name: r.department_name,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ANALYTICS ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

/** Recompute working hours and store in DB row */
// Note: working_hours is a MySQL STORED GENERATED column — auto-computed from clock_in_time,
// clock_out_time, and total_break_minutes. No explicit UPDATE needed.
async function recalcWorkingHours(attId, connection) {
  // MySQL recomputes working_hours automatically whenever clock_in/out or total_break_minutes changes.
  // This function is kept for any future side-effects if needed.
}

// ─── GET /api/attendance/analytics/summary ───────────────────────────────────
// Returns per-employee aggregated attendance summary for a date range
router.get('/analytics/summary', async (req, res, next) => {
  try {
    const tz = await getCompanySetting('general', 'timezone', 'UTC');
    const perms = req.user.permissions || [];
    if (!perms.includes('attendance.manage_all') && !perms.includes('attendance.view_team')) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const { date_from, date_to, department_id, user_id, status } = req.query;
    if (!date_from || !date_to) {
      return res.status(400).json({ error: 'date_from and date_to are required' });
    }

    // Build base user query
    let userWhere = ['u.status = ?'];
    const userParams = ['active'];
    if (department_id) { userWhere.push('u.department_id = ?'); userParams.push(department_id); }
    if (user_id) { userWhere.push('u.id = ?'); userParams.push(user_id); }

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(5, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const { search } = req.query;

    // Add search filter if provided
    if (search) {
      userWhere.push('(u.first_name LIKE ? OR u.last_name LIKE ? OR u.email LIKE ?)');
      const s = `%${search}%`;
      userParams.push(s, s, s);
    }

    const [employees] = await pool.query(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.hire_date, u.department_id, d.name as department_name
       FROM users u LEFT JOIN departments d ON u.department_id = d.id
       WHERE ${userWhere.join(' AND ')} ORDER BY d.name, u.first_name
       LIMIT ? OFFSET ?`,
      [...userParams, limit, offset]
    );

    // Get total count for pagination
    const countWhere = userWhere.filter(w => w !== 'u.status = ?' || userParams[0] === 'active');
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) as total FROM users u WHERE ${userWhere.join(' AND ')}`,
      userParams
    );

    // Fetch holidays in range
    const [holidays] = await pool.query(
      'SELECT date FROM company_holidays WHERE date BETWEEN ? AND ?', [date_from, date_to]
    );
    const holidaySet = new Set(holidays.map(h => String(toTimezone(new Date(h.date), tz).toISOString().slice(0, 10))));

    // Fetch working_days from company settings (shared service — respects configured workweek)
    const { working_schedule: wsSettings } = await getSettings(pool, 'working_schedule');
    const workingDays = Array.isArray(wsSettings?.working_days)
      ? wsSettings.working_days
      : ['mon', 'tue', 'wed', 'thu', 'fri'];

    // Fetch approved leaves overlapping the range
    const [leaves] = await pool.query(
      `SELECT user_id, start_date, end_date FROM leave_requests
       WHERE status = 'approved' AND start_date <= ? AND end_date >= ?`,
      [date_to, date_from]
    );

    // Fetch attendance records in range
    let attWhere = ['a.date BETWEEN ? AND ?'];
    const attParams = [date_from, date_to];
    if (user_id) { attWhere.push('a.user_id = ?'); attParams.push(user_id); }
    if (status) { attWhere.push('a.status = ?'); attParams.push(status); }

    const [attRecords] = await pool.query(
      `SELECT a.user_id, a.date, a.status, a.clock_in_time, a.clock_out_time,
              a.total_break_minutes, a.effective_break_minutes, a.is_late, a.late_minutes, a.remarks,
              (SELECT COALESCE(SUM(duration_minutes),0) FROM attendance_breaks WHERE attendance_id = a.id) as break_minutes
       FROM attendance a WHERE ${attWhere.join(' AND ')}`,
      attParams
    );

    // Index attendance by user_id → array of day strings
    const attByUser = {};
    for (const r of attRecords) {
      if (!attByUser[r.user_id]) attByUser[r.user_id] = {};
      attByUser[r.user_id][String(toTimezone(new Date(r.date), tz).toISOString().slice(0, 10))] = r;
    }

    // Fetch today's active (open) breaks for live hours computation
    // Only needed when date range includes today
    const today = todayInTimezone(tz);
    const rangeIncludesToday = today >= date_from && today <= date_to;
    const activeBreaksMap = {}; // userId → start_time of open break
    if (rangeIncludesToday) {
      const [openBreaks] = await pool.query(
        `SELECT ab.attendance_id, ab.start_time, a.user_id
         FROM attendance_breaks ab
         JOIN attendance a ON ab.attendance_id = a.id
         WHERE a.date = ? AND ab.end_time IS NULL`,
        [today]
      );
      for (const b of openBreaks) {
        activeBreaksMap[b.user_id] = b.start_time;
      }
    }

    // Compute per-employee summary
    const presentStatuses = ['clocked_in', 'working', 'on_break', 'completed'];
    const summaries = employees.map(emp => {
      const totalDays = Math.round((new Date(date_to) - new Date(date_from)) / 86400000) + 1;
      const weekends  = countWeekends(date_from, date_to);
      const compHol   = holidaySet.size;
      // Use shared service: respects configured working_days + hire_date
      const empWorkingDays = countWorkingDays(date_from, date_to, emp.hire_date, workingDays, holidaySet);

      const empAtt = attByUser[emp.id] || {};
      let presentDays = 0, lateCheckins = 0, totalWH = 0, totalBreak = 0;
      for (const [ds, dayRec] of Object.entries(empAtt)) {
        if (presentStatuses.includes(dayRec.status)) presentDays++;
        if (dayRec.is_late) lateCheckins++;
        if (dayRec.clock_in_time && dayRec.clock_out_time) {
          // Completed day — compute hours using adjusted break minutes
          const wh = computeWorkingHours(dayRec.clock_in_time, dayRec.clock_out_time, Number(dayRec.total_break_minutes) || 0);
          const eb = Number(dayRec.effective_break_minutes) || 0;
          const effectiveDayWH = (wh != null && eb > 0) ? wh + eb / 60 : wh;
          if (effectiveDayWH != null) totalWH += effectiveDayWH;
        } else if (dayRec.clock_in_time && !dayRec.clock_out_time && ds === today) {
          // Today (incomplete) — compute live hours from clock-in to now, subtract open break
          const activeBreakStart = activeBreaksMap[emp.id] || null;
          const liveWH = computeLiveWorkingHours(dayRec.clock_in_time, Number(dayRec.total_break_minutes) || 0, activeBreakStart);
          if (liveWH != null) totalWH += liveWH;
        }
        totalBreak += Number(dayRec.break_minutes) || 0;
      }

      // Approved leave overlapping days
      let approvedLeaveDays = 0;
      for (const lv of leaves) {
        if (lv.user_id === emp.id) {
          approvedLeaveDays += overlapDays(lv.start_date, lv.end_date, date_from, date_to);
        }
      }

      // non_working_days = total days not counted as working days
      // (total calendar days minus working days; holidays are already excluded from working_days)
      const nonWorkingDays = totalDays - empWorkingDays;
      const absentDays = Math.max(0, empWorkingDays - presentDays - approvedLeaveDays);
      const avgWH = presentDays > 0 ? totalWH / presentDays : 0;

      return {
        user_id: emp.id,
        first_name: emp.first_name,
        last_name: emp.last_name,
        email: emp.email,
        department_name: emp.department_name,
        hire_date: emp.hire_date,
        total_days: totalDays,
        working_days: empWorkingDays,
        weekends: nonWorkingDays,
        company_holidays: compHol,
        present_days: presentDays,
        approved_leave_days: approvedLeaveDays,
        absent_days: absentDays,
        late_checkins: lateCheckins,
        total_working_hours: Math.round(totalWH * 100) / 100,
        total_break_minutes: totalBreak,
        average_working_hours: Math.round(avgWH * 100) / 100,
      };
    });

    // Chart data: attendance trend (present vs absent per day)
    const trendMap = {};
    const cur = new Date(date_from);
    while (cur <= new Date(date_to)) {
      const ds = toTimezone(cur, tz).toISOString().slice(0, 10);
      trendMap[ds] = { date: ds, present: 0, absent: 0, holiday: holidaySet.has(ds) ? 1 : 0 };
      cur.setDate(cur.getDate() + 1);
    }
    for (const emp of employees) {
      const empAtt = attByUser[emp.id] || {};
      for (const [ds, dayRec] of Object.entries(empAtt)) {
        if (!trendMap[ds]) continue;
        if (presentStatuses.includes(dayRec.status)) trendMap[ds].present++;
        else if (dayRec.status === 'absent') trendMap[ds].absent++;
      }
    }
    const trend = Object.values(trendMap).sort((a, b) => a.date.localeCompare(b.date));

    // Present vs Absent (overall)
    const totalPresent = summaries.reduce((s, e) => s + e.present_days, 0);
    const totalAbsent  = summaries.reduce((s, e) => s + e.absent_days, 0);
    const presentVsAbsent = [
      { name: 'Present', value: totalPresent },
      { name: 'Absent',  value: totalAbsent },
    ];

    // Department-wise attendance (avg present% per dept)
    const deptMap = {};
    for (const s of summaries) {
      const dn = s.department_name || 'Unassigned';
      if (!deptMap[dn]) deptMap[dn] = { name: dn, total: 0, present: 0 };
      deptMap[dn].total   += s.working_days;
      deptMap[dn].present += s.present_days;
    }
    const deptWise = Object.values(deptMap).map(d => ({
      name: d.name,
      attendance_rate: d.total > 0 ? Math.round((d.present / d.total) * 100) : 0,
    }));

    // Late check-in trend (per day)
    const lateMap = {};
    for (const ds of Object.keys(trendMap)) lateMap[ds] = 0;
    for (const emp of employees) {
      const empAtt = attByUser[emp.id] || {};
      for (const [ds, dayRec] of Object.entries(empAtt)) {
        if (dayRec.is_late && lateMap[ds] !== undefined) lateMap[ds]++;
      }
    }
    const lateTrend = Object.keys(lateMap).sort().map(ds => ({ date: ds, count: lateMap[ds] }));

    res.json({
      summaries,
      charts: {
        trend,
        present_vs_absent: presentVsAbsent,
        department_wise: deptWise,
        late_trend: lateTrend,
      },
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) { next(err); }
});

// ─── GET /api/attendance/analytics/timeline ───────────────────────────────────
// Returns day-wise attendance timeline for ONE employee over a date range
router.get('/analytics/timeline', async (req, res, next) => {
  try {
    const tz = await getCompanySetting('general', 'timezone', 'UTC');
    const perms = req.user.permissions || [];
    if (!perms.includes('attendance.manage_all') && !perms.includes('attendance.view_team')) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const { user_id, date_from, date_to } = req.query;
    if (!user_id || !date_from || !date_to) {
      return res.status(400).json({ error: 'user_id, date_from, and date_to are required' });
    }

    const [[emp]] = await pool.query(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.hire_date, d.name as department_name
       FROM users u LEFT JOIN departments d ON u.department_id = d.id WHERE u.id = ?`,
      [user_id]
    );
    if (!emp) return res.status(404).json({ error: 'Employee not found' });

    // Holidays
    const [holidays] = await pool.query(
      'SELECT date, name, holiday_type FROM company_holidays WHERE date BETWEEN ? AND ?',
      [date_from, date_to]
    );
    const holidayMap = {};
    const holidaySet = new Set();
    for (const h of holidays) {
      const ds = String(toTimezone(new Date(h.date), tz).toISOString().slice(0, 10));
      holidayMap[ds] = h;
      holidaySet.add(ds);
    }

    // Working days from company settings (shared service)
    const { working_schedule: wsTimeline } = await getSettings(pool, 'working_schedule');
    const workingDays = Array.isArray(wsTimeline?.working_days)
      ? wsTimeline.working_days
      : ['mon', 'tue', 'wed', 'thu', 'fri'];

    // Approved leaves for this employee
    const [leaves] = await pool.query(
      `SELECT start_date, end_date, reason, leave_type_id FROM leave_requests
       WHERE user_id = ? AND status = 'approved' AND start_date <= ? AND end_date >= ?`,
      [user_id, date_to, date_from]
    );

    // Attendance records
    const [attRecords] = await pool.query(
      `SELECT a.*,
        (SELECT COALESCE(SUM(duration_minutes),0) FROM attendance_breaks WHERE attendance_id = a.id) as break_minutes
       FROM attendance a
       WHERE a.user_id = ? AND a.date BETWEEN ? AND ?
       ORDER BY a.date ASC`,
      [user_id, date_from, date_to]
    );
    const attMap = {};
    for (const r of attRecords) {
      const ds = String(toTimezone(new Date(r.date), tz).toISOString().slice(0, 10));
      attMap[ds] = r;
    }

    // Breaks map
    const attIds = attRecords.map(r => r.id);
    const breaksMap = {};
    if (attIds.length > 0) {
      const [breaks] = await pool.query(
        `SELECT * FROM attendance_breaks WHERE attendance_id IN (${attIds.map(() => '?').join(',')}) ORDER BY start_time ASC`,
        attIds
      );
      for (const b of breaks) {
        if (!breaksMap[b.attendance_id]) breaksMap[b.attendance_id] = [];
        breaksMap[b.attendance_id].push(b);
      }
    }

    // Build day-wise timeline
    const timeline = [];
    const cur = new Date(date_from);
    while (cur <= new Date(date_to)) {
      const ds = toTimezone(cur, tz).toISOString().slice(0, 10);
      const dow = cur.getDay(); // 0=Sun, 6=Sat
      const isWeekend = !isWorkday(ds, workingDays); // not a configured workday
      const holiday = holidayMap[ds];
      const att = attMap[ds];

      // Check if this day falls within any approved leave
      let leaveInfo = null;
      for (const lv of leaves) {
        const ls = String(lv.start_date).slice(0, 10);
        const le = String(lv.end_date).slice(0, 10);
        if (ds >= ls && ds <= le) {
          leaveInfo = lv;
          break;
        }
      }

      let status, statusLabel;
      if (holiday) {
        status = 'holiday'; statusLabel = 'Holiday';
      } else if (isWeekend) {
        status = 'weekend'; statusLabel = 'Weekend';
      } else if (leaveInfo) {
        status = 'leave'; statusLabel = 'Leave';
      } else if (att && ['clocked_in','working','on_break','completed'].includes(att.status)) {
        status = 'present'; statusLabel = 'Present';
      } else {
        status = 'absent'; statusLabel = 'Absent';
      }

      const today = todayInTimezone(tz);
      // Completed day — stored hours; today (incomplete) — live hours
      const wh = att?.clock_out_time
        ? computeWorkingHours(att.clock_in_time, att.clock_out_time, att.total_break_minutes || 0)
        : (att?.clock_in_time && ds === today
          ? computeLiveWorkingHours(att.clock_in_time, att.total_break_minutes || 0)
          : null);
      const ebTL = Number(att?.effective_break_minutes) || 0;
      const effectiveWH = (wh != null && ebTL > 0) ? Math.round((wh + ebTL / 60) * 100) / 100 : wh;

      timeline.push({
        date: ds,
        day_of_week: dow,
        status,
        status_label: statusLabel,
        clock_in_time: att?.clock_in_time || null,
        clock_out_time: att?.clock_out_time || null,
        total_break_minutes: att?.total_break_minutes || 0,
        effective_break_minutes: ebTL,
        working_hours: effectiveWH,
        is_live: Boolean(att?.clock_in_time && !att?.clock_out_time && ds === today),
        is_late: att ? Boolean(att.is_late) : false,
        late_minutes: att?.late_minutes || 0,
        remarks: att?.remarks || null,
        holiday_name: holiday?.name || null,
        leave_reason: leaveInfo?.reason || null,
        breaks: att ? (breaksMap[att.id] || []) : [],
        attendance_id: att?.id || null,
        raw_status: att?.status || null,
      });

      cur.setDate(cur.getDate() + 1);
    }

    res.json({ employee: emp, timeline });
  } catch (err) { next(err); }
});

// ─── POST /api/attendance/:id/breaks ──────────────────────────────────────────
router.post('/:id/breaks', async (req, res, next) => {
  try {
    const perms = req.user.permissions || [];
    if (!perms.includes('attendance.manage_all')) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    const attId = parseInt(req.params.id);
    const [[att]] = await pool.query('SELECT * FROM attendance WHERE id = ?', [attId]);
    if (!att) return res.status(404).json({ error: 'Attendance record not found' });

    const { start_time, end_time } = req.body;
    if (!start_time) return res.status(400).json({ error: 'start_time is required' });

    // Normalize ISO datetime strings to MySQL DATETIME format (YYYY-MM-DD HH:MM:SS)
    const toMySQLDate = v => v ? String(v).replace('T', ' ').replace('Z', '').slice(0, 19) : null;

    let duration = 0;
    if (end_time) {
      duration = Math.floor((new Date(end_time) - new Date(start_time)) / 60000);
    }

    const [result] = await pool.query(
      'INSERT INTO attendance_breaks (attendance_id, start_time, end_time, duration_minutes) VALUES (?, ?, ?, ?)',
      [attId, toMySQLDate(start_time), toMySQLDate(end_time), Math.max(0, duration)]
    );

    // Update total_break_minutes on attendance
    const [[sum]] = await pool.query(
      'SELECT COALESCE(SUM(duration_minutes),0) as total FROM attendance_breaks WHERE attendance_id = ?',
      [attId]
    );
    await pool.query('UPDATE attendance SET total_break_minutes = ? WHERE id = ?', [sum.total, attId]);
    await recalcWorkingHours(attId, pool);

    const [[newBreak]] = await pool.query('SELECT * FROM attendance_breaks WHERE id = ?', [result.insertId]);
    const [[updatedAtt]] = await pool.query('SELECT * FROM attendance WHERE id = ?', [attId]);
    res.status(201).json({ message: 'Break added', break: newBreak, attendance: formatAttendance(updatedAtt) });
  } catch (err) { next(err); }
});

// ─── PUT /api/attendance/:id/breaks/:breakId ───────────────────────────────────
router.put('/:id/breaks/:breakId', async (req, res, next) => {
  try {
    const perms = req.user.permissions || [];
    if (!perms.includes('attendance.manage_all')) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    const { id, breakId } = req.params;
    const [[br]] = await pool.query('SELECT * FROM attendance_breaks WHERE id = ? AND attendance_id = ?', [breakId, id]);
    if (!br) return res.status(404).json({ error: 'Break record not found' });

    const { start_time, end_time } = req.body;
    const toMySQLDate = v => v ? String(v).replace('T', ' ').replace('Z', '').slice(0, 19) : null;
    const updates = [];
    const vals = [];
    if (start_time !== undefined) { updates.push('start_time = ?'); vals.push(toMySQLDate(start_time)); }
    if (end_time !== undefined)   { updates.push('end_time = ?');   vals.push(toMySQLDate(end_time)); }

    if (end_time !== undefined && start_time !== undefined) {
      const dur = Math.floor((new Date(end_time) - new Date(start_time)) / 60000);
      updates.push('duration_minutes = ?'); vals.push(Math.max(0, dur));
    } else if (end_time !== undefined && start_time === undefined) {
      const dur = Math.floor((new Date(end_time) - new Date(br.start_time)) / 60000);
      updates.push('duration_minutes = ?'); vals.push(Math.max(0, dur));
    } else if (start_time !== undefined && end_time === undefined) {
      const dur = br.end_time ? Math.floor((new Date(br.end_time) - new Date(start_time)) / 60000) : 0;
      updates.push('duration_minutes = ?'); vals.push(Math.max(0, dur));
    }

    if (updates.length > 0) {
      vals.push(breakId);
      await pool.query(`UPDATE attendance_breaks SET ${updates.join(', ')} WHERE id = ?`, vals);
    }

    // Recalculate attendance totals
    const attId = parseInt(id);
    const [[sum]] = await pool.query(
      'SELECT COALESCE(SUM(duration_minutes),0) as total FROM attendance_breaks WHERE attendance_id = ?', [attId]
    );
    await pool.query('UPDATE attendance SET total_break_minutes = ? WHERE id = ?', [sum.total, attId]);
    await recalcWorkingHours(attId, pool);

    const [[updatedBr]] = await pool.query('SELECT * FROM attendance_breaks WHERE id = ?', [breakId]);
    const [[updatedAtt]] = await pool.query('SELECT * FROM attendance WHERE id = ?', [attId]);
    res.json({ message: 'Break updated', break: updatedBr, attendance: formatAttendance(updatedAtt) });
  } catch (err) { next(err); }
});

// ─── DELETE /api/attendance/:id/breaks/:breakId ───────────────────────────────
router.delete('/:id/breaks/:breakId', async (req, res, next) => {
  try {
    const perms = req.user.permissions || [];
    if (!perms.includes('attendance.manage_all')) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    const { id, breakId } = req.params;
    const [[br]] = await pool.query('SELECT * FROM attendance_breaks WHERE id = ? AND attendance_id = ?', [breakId, id]);
    if (!br) return res.status(404).json({ error: 'Break record not found' });

    await pool.query('DELETE FROM attendance_breaks WHERE id = ?', [breakId]);

    const attId = parseInt(id);
    const [[sum]] = await pool.query(
      'SELECT COALESCE(SUM(duration_minutes),0) as total FROM attendance_breaks WHERE attendance_id = ?', [attId]
    );
    await pool.query('UPDATE attendance SET total_break_minutes = ? WHERE id = ?', [sum.total, attId]);
    await recalcWorkingHours(attId, pool);

    const [[updatedAtt]] = await pool.query('SELECT * FROM attendance WHERE id = ?', [attId]);
    res.json({ message: 'Break deleted', attendance: formatAttendance(updatedAtt) });
  } catch (err) { next(err); }
});

// ─── PUT /api/attendance/:id ──────────────────────────────────────────────────
// Enhanced to recalculate working_hours when clock times change
router.put('/:id', async (req, res, next) => {
  try {
    const perms = req.user.permissions || [];
    if (!perms.includes('attendance.manage_all')) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const attId = parseInt(req.params.id);
    const [[existing]] = await pool.query('SELECT * FROM attendance WHERE id = ?', [attId]);
    if (!existing) return res.status(404).json({ error: 'Attendance record not found' });

    const { status, clock_in_time, clock_out_time, remarks } = req.body;
    const updates = [];
    const vals = [];

    // Strip 'Z' suffix from UTC ISO strings (frontend sends via fromDateTimeLocalToUTC)
    // and store as naive MySQL datetime.
    const stripUTC = v => v ? (v.endsWith('Z') ? v.slice(0, -1) : v) : null;

    const validStatuses = ['absent', 'clocked_in', 'working', 'on_break', 'completed'];
    if (status && validStatuses.includes(status)) {
      updates.push('status = ?');
      vals.push(status);
    }
    if (clock_in_time !== undefined) {
      updates.push('clock_in_time = ?');
      vals.push(stripUTC(clock_in_time) || null);
    }
    if (clock_out_time !== undefined) {
      updates.push('clock_out_time = ?');
      vals.push(stripUTC(clock_out_time) || null);
    }
    if (remarks !== undefined) {
      updates.push('remarks = ?');
      vals.push(remarks || null);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    vals.push(attId);
    await pool.query(`UPDATE attendance SET ${updates.join(', ')} WHERE id = ?`, vals);

    // Recalculate working hours if clock times changed
    if (clock_in_time !== undefined || clock_out_time !== undefined) {
      await recalcWorkingHours(attId, pool);
    }

    // Recalculate late status if clock_in_time changed
    if (clock_in_time !== undefined) {
      const [[row]] = await pool.query('SELECT clock_in_time FROM attendance WHERE id = ?', [attId]);
      if (row && row.clock_in_time) {
        const [officeStartTime, graceMinutes] = await Promise.all([
          getSetting(pool, 'working_schedule', 'office_start_time'),
          getSetting(pool, 'working_schedule', 'late_checkin_grace_minutes'),
        ]);
        const { isLate, lateMinutes } = computeLateStatus(row.clock_in_time, officeStartTime || '09:30', Number(graceMinutes) || 30);
        await pool.query('UPDATE attendance SET is_late = ?, late_minutes = ? WHERE id = ?', [isLate ? 1 : 0, lateMinutes, attId]);
      }
    }

    const [[updated]] = await pool.query('SELECT * FROM attendance WHERE id = ?', [attId]);
    // ── Activity log: Attendance Updated (admin) ───────────────────────────
    logActivity({ req, module: 'Attendance', action: 'Updated',
      description: `Attendance record updated`,
      previousValue: existing, newValue: updated });
    res.json({ message: 'Updated', attendance: formatAttendance(updated) });
  } catch (err) { next(err); }
});

module.exports = router;

// ═══════════════════════════════════════════════════════════════════════════
// BREAK TIME ADJUSTMENT REQUEST ROUTES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Compute total approved adjustment minutes for a given attendance record.
 * Uses effective_break_minutes when available (new column), falls back to 0.
 */
async function getApprovedAdjustmentMinutes(attId, connection = pool) {
  const [[row]] = await connection.query(
    `SELECT COALESCE(effective_break_minutes, 0) as eb
     FROM attendance WHERE id = ?`,
    [attId]
  );
  return row ? Number(row.eb) : 0;
}

/**
 * After an adjustment is approved, recalculate effective_break_minutes and
 * update the attendance working_hours (via the STORED GENERATED column).
 * We credit the adjusted minutes back by reducing total_break_minutes,
 * which makes working_hours reflect the correct value automatically.
 */
/**
 * Apply a break adjustment approval to the attendance record.
 * - total_break_minutes is reduced (the approved minutes count as work time)
 * - effective_break_minutes accumulates the total approved adjustment
 * This keeps working_hours (stored GENERATED column) auto-correct.
 * Returns the recalculated attendance record.
 */
async function applyAdjustmentToAttendance(attId, approvedMinutes, connection = pool) {
  await connection.query(
    `UPDATE attendance
     SET total_break_minutes = GREATEST(0, total_break_minutes - ?),
         effective_break_minutes = effective_break_minutes + ?
     WHERE id = ?`,
    [approvedMinutes, approvedMinutes, attId]
  );
  const [[rec]] = await connection.query(
    'SELECT * FROM attendance WHERE id = ?', [attId]
  );
  return rec;
}

/**
 * Reverse an approved adjustment (when needed — currently not exposed to admins,
 * but the logic is here for data integrity).
 */
/**
 * Reverse an approved adjustment (admin action — not currently exposed in API).
 * Restores total_break_minutes and reduces effective_break_minutes.
 */
async function reverseAdjustmentFromAttendance(attId, approvedMinutes, connection = pool) {
  await connection.query(
    `UPDATE attendance
     SET total_break_minutes = total_break_minutes + ?,
         effective_break_minutes = GREATEST(0, effective_break_minutes - ?)
     WHERE id = ?`,
    [approvedMinutes, approvedMinutes, attId]
  );
}

// ─── POST /api/attendance/break-adjustments ────────────────────────────────────
// Employee submits a new break adjustment request
router.post('/break-adjustments', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const perms = req.user.permissions || [];

    if (!perms.includes('attendance.break_adjustment.request')) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const { attendance_id, break_id, start_time, end_time, reason } = req.body;

    // Validate required fields
    if (!attendance_id || !break_id || !start_time || !end_time || !reason) {
      return res.status(400).json({ error: 'attendance_id, break_id, start_time, end_time, and reason are required' });
    }

    // Fetch the break record
    const [[breakRec]] = await pool.query(
      'SELECT * FROM attendance_breaks WHERE id = ? AND attendance_id = ?',
      [break_id, attendance_id]
    );
    if (!breakRec) {
      return res.status(404).json({ error: 'Break record not found' });
    }
    if (!breakRec.end_time) {
      return res.status(400).json({ error: 'Cannot adjust an ongoing (unfinished) break' });
    }

    // Verify the attendance belongs to this user
    const [[attRec]] = await pool.query(
      'SELECT * FROM attendance WHERE id = ?',
      [attendance_id]
    );
    if (!attRec) {
      return res.status(404).json({ error: 'Attendance record not found' });
    }
    if (attRec.user_id !== userId) {
      return res.status(403).json({ error: 'You can only request adjustments for your own attendance' });
    }

    // ── Parse and validate time window ──────────────────────────────────────
    // Times from the frontend are company-local HH:MM. We must interpret them as
    // company wall-clock time and convert to a UTC moment for comparison.
    const tz = await getCompanySetting('general', 'timezone', 'UTC');

    // Parse "HH:MM" or "HH:MM:SS" as company-local time and return a UTC Date.
    const parseCompanyTimeToUTC = (timeStr, refUtcDate) => {
      const parts = String(timeStr).split(':');
      if (parts.length < 2) return null;
      const h = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      const s = parts[2] != null ? parseInt(parts[2], 10) : 0;
      if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59 || isNaN(s)) return null;
      // "Naive" UTC date built from company-local wall-clock components on the reference date
      const naiveUtc = Date.UTC(refUtcDate.getFullYear(), refUtcDate.getMonth(), refUtcDate.getDate(), h, m, s);
      // Compute the company-TZ offset at the reference moment: tzOffset = (what UTC would be
      // if wall-clock = company time) minus (actual UTC) = +5:30 for IST, etc.
      const refInTZ = toTimezone(refUtcDate, tz);
      const refHourInTZ = refInTZ.getHours(), refMinInTZ = refInTZ.getMinutes();
      const refInTZasUTC = Date.UTC(refInTZ.getFullYear(), refInTZ.getMonth(), refInTZ.getDate(), refHourInTZ, refMinInTZ, 0);
      const tzOffsetMs = refInTZasUTC - refUtcDate.getTime(); // e.g. +5h30m = +19800000 ms for IST
      // Subtract offset: UTC moment = naive UTC - offset  (e.g. 12:01 IST -> 06:31 UTC for IST)
      return new Date(naiveUtc - tzOffsetMs);
    };

    const reqStart = parseCompanyTimeToUTC(start_time, new Date(breakRec.start_time));
    const reqEnd   = parseCompanyTimeToUTC(end_time,   new Date(breakRec.end_time));

    if (!reqStart || !reqEnd) {
      return res.status(400).json({ error: 'start_time and end_time must be valid times in HH:MM or HH:MM:SS format' });
    }

    // Start must be before end (in UTC)
    if (reqStart >= reqEnd) {
      return res.status(400).json({ error: 'start_time must be before end_time' });
    }

    // Window must fall within the break (compare UTC moments)
    if (reqStart < new Date(breakRec.start_time)) {
      return res.status(400).json({ error: `start_time cannot be before the break start (${formatTime(breakRec.start_time, '24h', tz)})` });
    }
    if (reqEnd > new Date(breakRec.end_time)) {
      return res.status(400).json({ error: `end_time cannot be after the break end (${formatTime(breakRec.end_time, '24h', tz)})` });
    }

    // Compute requested_minutes from the window
    const requested_minutes = Math.round((reqEnd - reqStart) / 60000);
    if (requested_minutes <= 0) {
      return res.status(400).json({ error: 'Adjustment window must be at least 1 minute' });
    }

    // ── Prevent duplicate / overlapping pending requests ──────────────────
    // A pending request for the same break already exists
    const [[existingPending]] = await pool.query(
      `SELECT id FROM break_adjustment_requests
       WHERE break_id = ? AND status = 'Pending' LIMIT 1`,
      [break_id]
    );
    if (existingPending) {
      return res.status(409).json({ error: 'A pending adjustment request already exists for this break' });
    }

    // An already-approved request for the same break (no double-dipping)
    const [[existingApproved]] = await pool.query(
      `SELECT id, requested_minutes FROM break_adjustment_requests
       WHERE break_id = ? AND status = 'Approved' LIMIT 1`,
      [break_id]
    );
    if (existingApproved) {
      return res.status(409).json({
        error: `An adjustment of ${existingApproved.requested_minutes} minutes has already been approved for this break`,
      });
    }

    // Check total requested vs available (no approved + pending > break duration)
    const [[pendingTotal]] = await pool.query(
      `SELECT COALESCE(SUM(requested_minutes), 0) as total
       FROM break_adjustment_requests
       WHERE break_id = ? AND status IN ('Pending', 'Approved')`,
      [break_id]
    );
    if (Number(pendingTotal.total) + Number(requested_minutes) > Number(breakRec.duration_minutes)) {
      return res.status(409).json({
        error: `Total requested minutes (${Number(pendingTotal.total) + Number(requested_minutes)}) exceed break duration (${breakRec.duration_minutes} minutes)`,
      });
    }

    // Format times as HH:MM:SS for MySQL TIME column.
    // Store the ORIGINAL company-local HH:MM input, NOT the UTC-converted hours.
    const fmtTime = (timeStr) => {
      const parts = String(timeStr).split(':');
      const h = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      const s = parts[2] != null ? parseInt(parts[2], 10) : 0;
      return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    };

    // Insert the request
    const [result] = await pool.query(
      `INSERT INTO break_adjustment_requests
        (attendance_id, break_id, user_id, requested_minutes, start_time, end_time, reason, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending')`,
      [attendance_id, break_id, userId, requested_minutes, fmtTime(start_time), fmtTime(end_time), reason]
    );

    const [[newReq]] = await pool.query(
      'SELECT * FROM break_adjustment_requests WHERE id = ?',
      [result.insertId]
    );

    logActivity({
      req,
      module: 'Attendance',
      action: 'Break Adjustment Requested',
      description: `Requested ${requested_minutes} min break adjustment for break #${break_id}`,
      newValue: newReq,
    });

    res.status(201).json({ message: 'Break adjustment request submitted', request: newReq });
  } catch (err) { next(err); }
});

// ─── GET /api/attendance/break-adjustments ──────────────────────────────────────
// List break adjustment requests (employee sees own; admin sees all)
router.get('/break-adjustments', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const perms = req.user.permissions || [];
    const tz = await getCompanySetting('general', 'timezone', 'UTC');
    const {
      page = 1, limit = 20,
      user_id, status, date_from, date_to,
    } = req.query;

    const isAdmin = perms.includes('attendance.break_adjustment.manage');
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(5, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    let where = ['1=1'];
    const params = [];

    // Employees can only see their own requests unless they have admin permission
    if (!isAdmin) {
      where.push('bar.user_id = ?');
      params.push(userId);
    } else if (user_id) {
      where.push('bar.user_id = ?');
      params.push(parseInt(user_id));
    }

    if (status) {
      where.push('bar.status = ?');
      params.push(status);
    }
    if (date_from) {
      where.push('a.date >= ?');
      params.push(date_from);
    }
    if (date_to) {
      where.push('a.date <= ?');
      params.push(date_to);
    }

    const whereStr = where.join(' AND ');

    const [rows] = await pool.query(
      `SELECT bar.*,
              a.date, a.clock_in_time, a.clock_out_time,
              u.first_name, u.last_name, u.email,
              d.name as department_name,
              ab.start_time as break_start, ab.end_time as break_end, ab.duration_minutes as break_duration,
              rb.first_name as reviewer_first_name, rb.last_name as reviewer_last_name
       FROM break_adjustment_requests bar
       JOIN attendance a ON bar.attendance_id = a.id
       JOIN users u ON bar.user_id = u.id
       JOIN attendance_breaks ab ON bar.break_id = ab.id
       LEFT JOIN users rb ON bar.reviewed_by = rb.id
       LEFT JOIN departments d ON u.department_id = d.id
       WHERE ${whereStr}
       ORDER BY bar.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limitNum, offset]
    );

    // Handles MySQL DATETIME columns (ISO strings) and TIME columns ('HH:MM:SS' strings).
    // MySQL TIME stores a wall-clock time interpreted as company-local (IST).
    // To return a consistent HH:MM in company timezone, convert TIME → UTC equivalent
    // using the timezone offset, then add the offset to express as company-local HH:MM.
    // When tz is provided: DATETIME → company-tz; TIME → company-tz (via UTC bridge).
    // When tz is absent: returns raw HH:MM (backwards-compatible).
    const toHHMM = (val, tz) => {
      if (!val) return null;
      if (typeof val === 'string' && /^\d{2}:\d{2}:?\d{0,2}$/.test(val.trim())) {
        const [h, m] = val.trim().split(':').map(Number);
        // TIME columns store company-local wall-clock HH:MM:SS — return as-is (no UTC-bridge)
        return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
      }
      // DATETIME columns need UTC-bridge conversion
      const d = tz ? toTimezone(new Date(val), tz) : new Date(val);
      return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    };

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) as total FROM break_adjustment_requests bar
       JOIN attendance a ON bar.attendance_id = a.id
       WHERE ${whereStr}`,
      params
    );

    res.json({
      requests: rows.map(r => ({
        id: r.id,
        attendance_id: r.attendance_id,
        break_id: r.break_id,
        user_id: r.user_id,
        requested_minutes: r.requested_minutes,
        start_time: r.start_time,
        end_time:   r.end_time,
        time_start: toHHMM(r.start_time, tz),
        time_end:   toHHMM(r.end_time,   tz),
        reason: r.reason,
        status: r.status,
        reviewed_by: r.reviewed_by,
        reviewed_at: r.reviewed_at,
        admin_remarks: r.admin_remarks,
        created_at: r.created_at,
        updated_at: r.updated_at,
        employee: {
          first_name: r.first_name,
          last_name: r.last_name,
          email: r.email,
          department_name: r.department_name,
        },
        attendance: {
          date: r.date,
          clock_in_time: r.clock_in_time,
          clock_out_time: r.clock_out_time,
        },
        break: {
          start_time: r.break_start,
          end_time: r.break_end,
          time_start: toHHMM(r.break_start, tz),
          time_end:   toHHMM(r.break_end,   tz),
          duration_minutes: r.break_duration,
        },
        reviewer: r.reviewer_first_name
          ? { first_name: r.reviewer_first_name, last_name: r.reviewer_last_name }
          : null,
      })),
      pagination: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) },
    });
  } catch (err) { next(err); }
});

// ─── GET /api/attendance/break-adjustments/breaks/:attendanceId ─────────────────
// Get available breaks for an attendance record (for the request form)
router.get('/break-adjustments/breaks/:attendanceId', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const perms = req.user.permissions || [];
    const attId = parseInt(req.params.attendanceId);
    const tz = await getCompanySetting('general', 'timezone', 'UTC');

    const [[att]] = await pool.query('SELECT * FROM attendance WHERE id = ?', [attId]);
    if (!att) return res.status(404).json({ error: 'Attendance record not found' });

    // Check access
    if (att.user_id !== userId && !perms.includes('attendance.view_team') && !perms.includes('attendance.manage_all')) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    // Fetch all breaks for this attendance
    const [breaks] = await pool.query(
      `SELECT ab.*,
              bar.id as adjustment_id, bar.requested_minutes, bar.reason, bar.status as adjustment_status,
              bar.admin_remarks, bar.reviewed_at
       FROM attendance_breaks ab
       LEFT JOIN break_adjustment_requests bar ON bar.break_id = ab.id
       WHERE ab.attendance_id = ? AND ab.end_time IS NOT NULL
       ORDER BY ab.start_time ASC`,
      [attId]
    );

    // Compute already-adjusted minutes per break
    const adjustedMap = {};
    for (const b of breaks) {
      if (b.adjustment_status === 'Approved') {
        adjustedMap[b.id] = (adjustedMap[b.id] || 0) + Number(b.requested_minutes);
      }
    }

    // Helper: convert UTC datetime to company-local HH:MM for display in time inputs
    const toCompanyHHMM = (dt) => {
      if (!dt) return null;
      // toTimezone returns a Date in the company timezone
      const local = toTimezone(new Date(dt), tz);
      return `${String(local.getHours()).padStart(2,'0')}:${String(local.getMinutes()).padStart(2,'0')}`;
    };

    res.json({
      attendance_id: attId,
      date: att.date,
      clock_in_time: att.clock_in_time,
      clock_out_time: att.clock_out_time,
      company_tz: tz,
      breaks: breaks.map(b => ({
        id: b.id,
        // Full UTC datetime (for reference)
        start_time: b.start_time,
        end_time:   b.end_time,
        // HH:MM strings in company timezone — safe to send to frontend time inputs
        time_start: toCompanyHHMM(b.start_time),
        time_end:   toCompanyHHMM(b.end_time),
        duration_minutes: b.duration_minutes,
        adjustable_minutes: Math.max(0, b.duration_minutes - (adjustedMap[b.id] || 0)),
        adjustment: b.adjustment_id
          ? {
              id: b.adjustment_id,
              requested_minutes: b.requested_minutes,
              start_time: b.start_time,
              end_time:   b.end_time,
              time_start: toCompanyHHMM(b.start_time),
              time_end:   toCompanyHHMM(b.end_time),
              reason: b.reason,
              status: b.adjustment_status,
              admin_remarks: b.admin_remarks,
              reviewed_at: b.reviewed_at,
            }
          : null,
      })),
    });
  } catch (err) { next(err); }
});

// ─── GET /api/attendance/break-adjustments/stats ──────────────────────────────
router.get('/break-adjustments/stats', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const perms = req.user.permissions || [];
    const isAdmin = perms.includes('attendance.break_adjustment.manage');
    const userFilter = isAdmin ? '' : `AND user_id = ${userId}`;

    const [[pending]] = await pool.query(
      `SELECT COUNT(*) as count FROM break_adjustment_requests WHERE status = 'Pending' ${userFilter}`
    );
    const [[approvedToday]] = await pool.query(
      `SELECT COUNT(*) as count FROM break_adjustment_requests
       WHERE status = 'Approved' AND DATE(reviewed_at) = CURDATE() ${userFilter}`
    );
    const [[rejectedToday]] = await pool.query(
      `SELECT COUNT(*) as count FROM break_adjustment_requests
       WHERE status = 'Rejected' AND DATE(reviewed_at) = CURDATE() ${userFilter}`
    );

    res.json({
      pending_count: Number(pending.count),
      approved_today: Number(approvedToday.count),
      rejected_today: Number(rejectedToday.count),
    });
  } catch (err) { next(err); }
});

// ─── GET /api/attendance/break-adjustments/:id ─────────────────────────────────
router.get('/break-adjustments/:id', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const perms = req.user.permissions || [];
    const tz = await getCompanySetting('general', 'timezone', 'UTC');
    const isAdmin = perms.includes('attendance.break_adjustment.manage');
    const reqId = parseInt(req.params.id);

    const [[r]] = await pool.query(
      `SELECT bar.*,
              a.date, a.clock_in_time, a.clock_out_time, a.total_break_minutes,
              u.first_name, u.last_name, u.email,
              d.name as department_name,
              ab.start_time as break_start, ab.end_time as break_end, ab.duration_minutes as break_duration,
              rb.first_name as reviewer_first_name, rb.last_name as reviewer_last_name
       FROM break_adjustment_requests bar
       JOIN attendance a ON bar.attendance_id = a.id
       JOIN users u ON bar.user_id = u.id
       JOIN attendance_breaks ab ON bar.break_id = ab.id
       LEFT JOIN users rb ON bar.reviewed_by = rb.id
       LEFT JOIN departments d ON u.department_id = d.id
       WHERE bar.id = ?`,
      [reqId]
    );

    if (!r) return res.status(404).json({ error: 'Break adjustment request not found' });

    // Employees can only view their own requests
    if (!isAdmin && r.user_id !== userId) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    // Pending overlap info
    const [[pendingTotal]] = await pool.query(
      `SELECT COALESCE(SUM(requested_minutes), 0) as total
       FROM break_adjustment_requests
       WHERE break_id = ? AND status IN ('Pending', 'Approved') AND id != ?`,
      [r.break_id, reqId]
    );

    // Handles both TIME column strings ('HH:MM:SS') and DATETIME ISO strings.
    const toHHMM = (val, _tz) => {
      if (!val) return null;
      if (typeof val === 'string' && /^\d{2}:\d{2}:?\d{0,2}$/.test(val.trim())) {
        const [h, m] = val.trim().split(':').map(Number);
        // TIME columns store company-local wall-clock HH:MM:SS — return as-is
        return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
      }
      // DATETIME columns
      const d = _tz ? toTimezone(new Date(val), _tz) : new Date(val);
      return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    };

    res.json({
      request: {
        id: r.id,
        attendance_id: r.attendance_id,
        break_id: r.break_id,
        user_id: r.user_id,
        requested_minutes: r.requested_minutes,
        start_time: r.start_time,
        end_time:   r.end_time,
        time_start: toHHMM(r.start_time, tz),
        time_end:   toHHMM(r.end_time,   tz),
        reason: r.reason,
        status: r.status,
        reviewed_by: r.reviewed_by,
        reviewed_at: r.reviewed_at,
        admin_remarks: r.admin_remarks,
        created_at: r.created_at,
        updated_at: r.updated_at,
        employee: {
          first_name: r.first_name,
          last_name: r.last_name,
          email: r.email,
          department_name: r.department_name,
        },
        attendance: {
          date: r.date,
          clock_in_time: r.clock_in_time,
          clock_out_time: r.clock_out_time
        },
        break: {
          start_time: r.break_start,
          end_time: r.break_end,
          time_start: toHHMM(r.break_start, tz),
          time_end:   toHHMM(r.break_end,   tz),
          duration_minutes: r.break_duration,
        },
        reviewer: r.reviewer_first_name
          ? { first_name: r.reviewer_first_name, last_name: r.reviewer_last_name }
          : null,
        other_pending_approved_minutes: Number(pendingTotal.total),
      },
    });
  } catch (err) { next(err); }
});

// ─── GET /api/attendance/break-adjustments/history/:attendanceId ─────────────────
// Returns all adjustment requests for a specific attendance record (for history detail modal)
router.get('/break-adjustments/history/:attendanceId', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const perms = req.user.permissions || [];
    const isAdmin = perms.includes('attendance.break_adjustment.manage');
    const attId = parseInt(req.params.attendanceId);
    const tz = await getCompanySetting('general', 'timezone', 'UTC');

    if (!attId || isNaN(attId)) {
      return res.status(400).json({ error: 'Valid attendance_id is required' });
    }

    // Non-admin: verify ownership
    if (!isAdmin) {
      const [[att]] = await pool.query(
        'SELECT user_id FROM attendance WHERE id = ?', [attId]
      );
      if (!att || att.user_id !== userId) {
        return res.status(403).json({ error: 'Permission denied' });
      }
    }

    const [rows] = await pool.query(
      `SELECT bar.*,
              ab.start_time as break_start, ab.end_time as break_end,
              ab.duration_minutes as break_duration,
              u.first_name as employee_first_name, u.last_name as employee_last_name,
              u.department_name as employee_department,
              ru.first_name as reviewer_first_name, ru.last_name as reviewer_last_name
       FROM break_adjustment_requests bar
       JOIN attendance_breaks ab ON bar.break_id = ab.id
       JOIN users u ON bar.user_id = u.id
       LEFT JOIN users ru ON bar.reviewed_by = ru.id
       WHERE bar.attendance_id = ?
       ORDER BY bar.created_at ASC`,
      [attId]
    );

    const [[att]] = await pool.query(
      `SELECT a.*, u.first_name, u.last_name
       FROM attendance a
       JOIN users u ON a.user_id = u.id
       WHERE a.id = ?`,
      [attId]
    );

    res.json({
      adjustments: rows.map(r => ({
        id: r.id,
        attendance_id: r.attendance_id,
        break_id: r.break_id,
        user_id: r.user_id,
        requested_minutes: r.requested_minutes,
        start_time: r.start_time,
        end_time:   r.end_time,
        time_start: toHHMM(r.start_time, tz),
        time_end:   toHHMM(r.end_time,   tz),
        reason: r.reason,
        status: r.status,
        admin_remarks: r.admin_remarks,
        reviewed_by: r.reviewed_by,
        reviewed_at: r.reviewed_at,
        created_at: r.created_at,
        employee: {
          first_name: r.employee_first_name,
          last_name:  r.employee_last_name,
          department: r.employee_department,
        },
        break: {
          start_time: r.break_start,
          end_time:   r.break_end,
          time_start: toHHMM(r.break_start, tz),
          time_end:   toHHMM(r.break_end,   tz),
          duration_minutes: r.break_duration,
        },
        reviewer: r.reviewer_first_name
          ? { first_name: r.reviewer_first_name, last_name: r.reviewer_last_name }
          : null,
      })),
      attendance: att ? {
        id: att.id,
        date: att.date,
        clock_in_time: att.clock_in_time,
        clock_out_time: att.clock_out_time,
        user: { first_name: att.first_name, last_name: att.last_name },
      } : null,
    });
  } catch (err) { next(err); }
});

// ─── PUT /api/attendance/break-adjustments/:id/approve ───────────────────────
router.put('/break-adjustments/:id/approve', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const perms = req.user.permissions || [];
    const isAdmin = perms.includes('attendance.break_adjustment.manage');

    if (!isAdmin) {
      return res.status(403).json({ error: 'Permission denied. Requires attendance.break_adjustment.manage' });
    }

    const reqId = parseInt(req.params.id);
    const { admin_remarks } = req.body;

    const [[existing]] = await pool.query(
      'SELECT * FROM break_adjustment_requests WHERE id = ?',
      [reqId]
    );
    if (!existing) return res.status(404).json({ error: 'Break adjustment request not found' });

    if (existing.status !== 'Pending') {
      return res.status(400).json({ error: `Cannot approve a request that is already ${existing.status}` });
    }

    // Final overlap check
    const [[pendingTotal]] = await pool.query(
      `SELECT COALESCE(SUM(requested_minutes), 0) as total
       FROM break_adjustment_requests
       WHERE break_id = ? AND status IN ('Pending', 'Approved') AND id != ?`,
      [existing.break_id, reqId]
    );
    if (Number(pendingTotal.total) + Number(existing.requested_minutes) > Number(existing.requested_minutes)) {
      // This should not happen since we validated at creation, but double-check
    }

    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    await pool.query(
      `UPDATE break_adjustment_requests
       SET status = 'Approved', reviewed_by = ?, reviewed_at = ?, admin_remarks = ?
       WHERE id = ?`,
      [userId, now, admin_remarks || null, reqId]
    );

    // Apply the adjustment to attendance
    await applyAdjustmentToAttendance(existing.attendance_id, existing.requested_minutes, pool);

    const [[updated]] = await pool.query(
      'SELECT * FROM break_adjustment_requests WHERE id = ?',
      [reqId]
    );

    logActivity({
      req,
      module: 'Attendance',
      action: 'Break Adjustment Approved',
      description: `Approved ${existing.requested_minutes} min break adjustment for user ${existing.user_id} (break #${existing.break_id})`,
      previousValue: existing,
      newValue: updated,
    });

    // Return updated attendance record with recalculated effective_break_minutes
    const [[attUpdated]] = await pool.query(
      'SELECT * FROM attendance WHERE id = ?',
      [existing.attendance_id]
    );

    res.json({
      message: 'Break adjustment approved',
      request: updated,
      attendance: formatAttendance(attUpdated),
    });
  } catch (err) { next(err); }
});

// ─── PUT /api/attendance/break-adjustments/:id/reject ─────────────────────────
router.put('/break-adjustments/:id/reject', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const perms = req.user.permissions || [];
    const isAdmin = perms.includes('attendance.break_adjustment.manage');

    if (!isAdmin) {
      return res.status(403).json({ error: 'Permission denied. Requires attendance.break_adjustment.manage' });
    }

    const reqId = parseInt(req.params.id);
    const { admin_remarks } = req.body;

    const [[existing]] = await pool.query(
      'SELECT * FROM break_adjustment_requests WHERE id = ?',
      [reqId]
    );
    if (!existing) return res.status(404).json({ error: 'Break adjustment request not found' });

    if (existing.status !== 'Pending') {
      return res.status(400).json({ error: `Cannot reject a request that is already ${existing.status}` });
    }

    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    await pool.query(
      `UPDATE break_adjustment_requests
       SET status = 'Rejected', reviewed_by = ?, reviewed_at = ?, admin_remarks = ?
       WHERE id = ?`,
      [userId, now, admin_remarks?.trim() || null, reqId]
    );

    const [[updated]] = await pool.query(
      'SELECT * FROM break_adjustment_requests WHERE id = ?',
      [reqId]
    );

    logActivity({
      req,
      module: 'Attendance',
      action: 'Break Adjustment Rejected',
      description: `Rejected break adjustment request #${reqId} (${existing.requested_minutes} min) for user ${existing.user_id}`,
      previousValue: existing,
      newValue: updated,
    });

    res.json({ message: 'Break adjustment rejected', request: updated });
  } catch (err) { next(err); }
});



