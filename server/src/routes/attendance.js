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
const { isNotificationAllowed } = require('../utils/notificationPreferences');
const { broadcast } = require('../sse/notifications');

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

// ─── Middleware: require attendance.clock ───────────────────────────────
router.use(auth);

// ─── POST /api/attendance/clock-in ──────────────────────────────────────────
router.post('/clock-in', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const perms = req.user.permissions || [];
    if (!perms.includes('attendance.clock')) {
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
        description: 'Clocked in again' });
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
    if (!perms.includes('attendance.clock')) {
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

    // Check if multiple breaks are allowed
    const allowMultipleBreaks = await getCompanySetting('working_schedule', 'allow_multiple_breaks', false);
    if (!allowMultipleBreaks) {
      const [existingBreaks] = await pool.query(
        'SELECT id FROM attendance_breaks WHERE attendance_id = ? LIMIT 1',
        [today.id]
      );
      if (existingBreaks.length > 0) {
        return res.status(400).json({ error: 'Multiple breaks are not allowed. You have already taken a break today.' });
      }
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
    if (!perms.includes('attendance.clock')) {
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
    if (!perms.includes('attendance.clock')) {
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

    // ── Late clock-out check ──────────────────────────────────────────────
    const tz = await getCompanySetting('general', 'timezone', 'UTC');
    const now = nowInTimezone(tz);
    const allowLateClockOut = await getSetting(pool, 'attendance', 'allow_late_clock_out');
    if (allowLateClockOut === false) {
      const officeEndTime = await getSetting(pool, 'working_schedule', 'office_end_time') || '18:30';
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
        } catch (_) { /* fall back to UTC */ }
      }
      const [eh, em] = officeEndTime.split(':').map(Number);
      const officeEndMinutes = (eh || 18) * 60 + (em || 30);
      if (nowMinutes > officeEndMinutes) {
        const [hh, mm] = officeEndTime.split(':');
        return res.status(400).json({
          error: `Late clock-out is not allowed. Office ends at ${hh}:${mm}. Please clock out at or before ${hh}:${mm}.`,
          code: 'LATE_CLOCK_OUT_BLOCKED',
        });
      }
    }

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
    if (targetId !== userId && !perms.includes('attendance.view_team') && !perms.includes('attendance.manage')) {
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
    // effective_break_minutes is audit trail only; total_break_minutes is already adjusted
    const effectiveWH = wh;

    // Live hours: compute only when clocked-in but NOT yet clocked-out
    const activeBreak = breaks.find(b => !b.end_time);
    const liveWH = (!today.clock_out_time && today.clock_in_time)
      ? computeLiveWorkingHours(today.clock_in_time, today.total_break_minutes, activeBreak?.start_time || null)
      : null;

    // Compute current status: if 'clocked_in' and >=1 minute has elapsed since clock_in,
    // return 'working' instead. This ensures status is correct on page refresh.
    const tz = await getCompanySetting('general', 'timezone', 'UTC');
    const currentStatus = computeCurrentStatus(today, tz);

    res.json({
      attendance: {
        ...formatAttendance(today),
        status: currentStatus,
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

    if (targetId !== userId && !perms.includes('attendance.view_team') && !perms.includes('attendance.manage')) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    // Include today if user has break adjustment permission (so they can view their adjustment status)
    const hasAdjPerm = perms.includes('attendance.adjust_break');
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
                ab.start_time as break_start, ab.end_time as break_end, ab.original_duration_minutes, ab.duration_minutes as break_duration,
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
          approved_work_minutes: adj.approved_work_minutes,
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
          break_original_duration: adj.original_duration_minutes,
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

    // toHHMM helper (same as in /history endpoint)
    const toHHMM = (val, _tz) => {
      if (!val) return null;
      if (typeof val === 'string' && /^\d{2}:\d{2}:?\d{0,2}$/.test(val.trim())) {
        const [h, m] = val.trim().split(':').map(Number);
        return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
      }
      const d = _tz ? toTimezone(new Date(val), _tz) : new Date(val);
      return d.toISOString().slice(11, 16);
    };

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
      `SELECT start_date, end_date, reason, leave_type_id, half_day FROM leave_requests
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
        const ls = new Date(lv.start_date).toISOString().slice(0, 10);
        const le = new Date(lv.end_date).toISOString().slice(0, 10);
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
      // effective_break_minutes is audit trail only; total_break_minutes is already adjusted
      const effectiveWH = wh != null ? Math.round(wh * 100) / 100 : wh;

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
        leave_half_day: leaveInfo?.half_day || false,
        breaks: att ? (breaksMap[att.id] || []) : [],
        attendance_id: att?.id || null,
        raw_status: att?.status || null,
      });

      cur.setDate(cur.getDate() + 1);
    }

    // Fetch break adjustment requests for all attendance records in timeline
    const attIdsInTimeline = fullTimeline.filter(d => d.attendance_id).map(d => d.attendance_id);
    let adjustmentsMap = {};
    if (attIdsInTimeline.length > 0) {
      const placeholders = attIdsInTimeline.map(() => '?').join(',');
      const [adjRows] = await pool.query(
        `SELECT bar.*,
                ab.start_time as break_start, ab.end_time as break_end, ab.original_duration_minutes, ab.duration_minutes as break_duration,
                ru.first_name as reviewer_first_name, ru.last_name as reviewer_last_name
         FROM break_adjustment_requests bar
         JOIN attendance_breaks ab ON bar.break_id = ab.id
         LEFT JOIN users ru ON bar.reviewed_by = ru.id
         WHERE bar.attendance_id IN (${placeholders})
         ORDER BY bar.created_at ASC`,
        attIdsInTimeline
      );
      for (const adj of adjRows) {
        if (!adjustmentsMap[adj.attendance_id]) adjustmentsMap[adj.attendance_id] = [];
        adjustmentsMap[adj.attendance_id].push({
          id: adj.id,
          break_id: adj.break_id,
          requested_minutes: adj.requested_minutes,
          approved_work_minutes: adj.approved_work_minutes,
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
          break_original_duration: adj.original_duration_minutes,
          reviewer: adj.reviewer_first_name
            ? { first_name: adj.reviewer_first_name, last_name: adj.reviewer_last_name }
            : null,
        });
      }
    }

    // Attach adjustments to each timeline entry
    for (const entry of fullTimeline) {
      entry.adjustments = entry.attendance_id ? (adjustmentsMap[entry.attendance_id] || []) : [];
    }

    // Compute summary from full timeline
    const totalDays = fullTimeline.length;
    const weekends = fullTimeline.filter(d => d.status === 'weekend').length;
    const companyHolidays = fullTimeline.filter(d => d.status === 'holiday').length;
    const presentDays = fullTimeline.filter(d => d.status === 'present').length;
    const approvedLeaveDays = fullTimeline.reduce((sum, d) => {
      if (d.status !== 'leave') return sum;
      return sum + (d.leave_half_day ? 0.5 : 1);
    }, 0);
    const absentDays = fullTimeline.filter(d => d.status === 'absent').length;
    const lateCheckins = fullTimeline.filter(d => d.is_late).length;
    const totalBreakMinutes = fullTimeline.reduce((s, d) => s + (d.total_break_minutes || 0), 0);
    // Break adjustment time: sum of all approved effective_break_minutes in the range
    const breakAdjustmentMinutes = fullTimeline.reduce((s, d) => s + (d.effective_break_minutes > 0 ? d.effective_break_minutes : 0), 0);

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
        break_adjustment_minutes: breakAdjustmentMinutes,
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

    if (att.user_id !== userId && !perms.includes('attendance.view_team') && !perms.includes('attendance.manage')) {
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
    if (!perms.includes('attendance.view_team') && !perms.includes('attendance.manage')) {
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
    if (!perms.includes('attendance.view_team') && !perms.includes('attendance.manage')) {
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

    // Get active breaks for all team attendance records today
    const attIds = rows.map(r => r.id);
    let breaksMap = {};
    if (attIds.length > 0) {
      const [allBreaks] = await pool.query(
        `SELECT * FROM attendance_breaks WHERE attendance_id IN (?)`,
        [attIds]
      );
      for (const b of allBreaks) {
        if (!breaksMap[b.attendance_id]) breaksMap[b.attendance_id] = [];
        breaksMap[b.attendance_id].push(b);
      }
    }

    res.json({
      records: rows.map(r => {
        const breaks = breaksMap[r.id] || [];
        const activeBreak = breaks.find(b => !b.end_time);
        const liveWH = (!r.clock_out_time && r.clock_in_time)
          ? computeLiveWorkingHours(r.clock_in_time, r.total_break_minutes, activeBreak?.start_time || null)
          : null;
        return {
          ...formatAttendance(r),
          status: computeCurrentStatus(r, tz),
          live_working_hours: liveWH,
        };
      }),
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
    if (!perms.includes('attendance.manage')) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const tz = await getCompanySetting('general', 'timezone', 'UTC');
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
        status: computeCurrentStatus(r, tz),
      })),
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (err) { next(err); }
});

// ─── PUT /api/attendance/:id ───────────────────────────────────────────────────
router.put('/:id', async (req, res, next) => {
  try {
    const perms = req.user.permissions || [];
    if (!perms.includes('attendance.manage')) {
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
    const [[userRow]] = await pool.query('SELECT email FROM users WHERE id = ?', [existing.user_id]);
    const attDate = existing.attendance_date
      ? new Date(existing.attendance_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
      : '';
    logActivity({ req, module: 'Attendance', action: 'Updated',
      description: `Attendance${userRow ? ` (${userRow.email})` : ''}${attDate ? ` (${attDate})` : ''} updated`,
      previousValue: existing, newValue: updated });
    res.json({ message: 'Updated', attendance: formatAttendance(updated) });
  } catch (err) { next(err); }
});

// ─── Format helper ───────────────────────────────────────────────────────────
function formatAttendance(r) {
  const totalBreak = Number(r.total_break_minutes) || 0;
  const effectiveBreak = Number(r.effective_break_minutes) || 0;
  // working_hours = shift - total_break_minutes + effective_break_minutes
  // After adjustment approval: total_break_minutes = original - approved (break deduction removed)
  // effective_break_minutes = approved (the credited adjustment minutes = additional work time)
  // Net break deduction = total_break_minutes - effective_break_minutes = original_break - approved - approved = original_break - 2*approved (wait)
  // Actually: net deduction = total_break_minutes = original_break - approved
  // effective_break_minutes = approved (extra work time credited)
  // So working_hours = (shift - (original_break - approved)) + approved = shift - original_break + 2*approved
  // But wait — total_break_minutes = original_break - approved, so:
  // working_hours = (shift - total_break_minutes) + effective_break_minutes = (shift - (original_break - approved)) + approved = shift - original_break + 2*approved
  // That double-counts! Let me re-think...
  //
  // SIMPLIFIED VIEW:
  // The adjustment credits the employee for minutes they spent on break.
  // These minutes should be ADDED to working hours (they worked but break was counted).
  // The MySQL working_hours = shift - total_break_minutes (already reduced by adjustment).
  // effective_break_minutes is an AUDIT TRAIL ONLY — not added to working_hours.
  // total_break_minutes is the ADJUSTED break (updated by applyAdjustmentToAttendance).
  // MySQL's STORED GENERATED working_hours = (shift - adjusted_break) / 60 is correct.
  const wh = computeWorkingHours(r.clock_in_time, r.clock_out_time, totalBreak);
  const effectiveWH = wh;
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

/**
 * Compute the current status for an attendance record.
 * If status is 'clocked_in' and >= 1 minute has elapsed since clock_in,
 * returns 'working'. Otherwise returns the stored status.
 * @param {object} r - attendance record (must have status and clock_in_time)
 * @param {string} tz - company timezone
 * @returns {string} computed current status
 */
function computeCurrentStatus(r, tz) {
  if (r.status !== 'clocked_in' || !r.clock_in_time) return r.status;
  const clockInDate = new Date(r.clock_in_time);
  const now = new Date();
  const clockInInTz = toTimezone(clockInDate, tz);
  const nowInTz = toTimezone(now, tz);
  const elapsedMinutes = (nowInTz.getTime() - clockInInTz.getTime()) / 60000;
  return elapsedMinutes >= 1 ? 'working' : r.status;
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
    if (!perms.includes('attendance.manage') && !perms.includes('attendance.view_team')) {
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
    const limit = Math.min(100, Math.max(5, parseInt(req.query.limit || req.query.per_page) || 20));
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
      `SELECT user_id, start_date, end_date, half_day FROM leave_requests
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
      // Use shared service: respects configured working_days + hire_date
      const empWorkingDays = countWorkingDays(date_from, date_to, emp.hire_date, workingDays, holidaySet);

      // Build full day timeline (all days in range) - same approach as user history
      const empAtt = attByUser[emp.id] || {};
      const empLeaves = leaves.filter(lv => lv.user_id === emp.id);
      const fullTimeline = [];
      const cur = new Date(date_from);
      while (cur <= new Date(date_to)) {
        const ds = toTimezone(cur, tz).toISOString().slice(0, 10);
        const dayRec = empAtt[ds];
        const isHoliday = holidaySet.has(ds);
        const dow = cur.getDay();
        const isWeekend = !isWorkday(ds, workingDays);

        // Check if on approved leave this day
        let onLeave = false;
        let leaveHalfDay = false;
        for (const lv of empLeaves) {
          const ls = new Date(lv.start_date).toISOString().slice(0, 10);
          const le = new Date(lv.end_date).toISOString().slice(0, 10);
          if (ds >= ls && ds <= le) { onLeave = true; leaveHalfDay = Boolean(lv.half_day); break; }
        }

        // Determine status (same logic as user history)
        let status;
        if (isWeekend) {
          status = 'weekend';
        } else if (isHoliday) {
          status = 'holiday';
        } else if (onLeave) {
          status = 'leave';
        } else if (dayRec && presentStatuses.includes(dayRec.status)) {
          status = 'present';
        } else {
          status = 'absent';
        }

        // Calculate working hours if applicable (same as user history)
        let wh = null;
        if (dayRec?.clock_in_time && dayRec?.clock_out_time) {
          wh = computeWorkingHours(dayRec.clock_in_time, dayRec.clock_out_time, Number(dayRec.total_break_minutes) || 0);
        } else if (dayRec?.clock_in_time && !dayRec?.clock_out_time && ds === today) {
          const activeBreakStart = activeBreaksMap[emp.id] || null;
          wh = computeLiveWorkingHours(dayRec.clock_in_time, Number(dayRec.total_break_minutes) || 0, activeBreakStart);
        }

        if (wh != null) wh = Math.round(wh * 100) / 100;

        fullTimeline.push({
          date: ds,
          status,
          working_hours: wh,
          is_late: dayRec ? Boolean(dayRec.is_late) : false,
          total_break_minutes: dayRec?.total_break_minutes || 0,
          effective_break_minutes: dayRec ? Number(dayRec.effective_break_minutes) || 0 : 0,
          break_minutes: dayRec?.break_minutes || 0,
          leave_half_day: onLeave ? leaveHalfDay : false,
        });

        cur.setDate(cur.getDate() + 1);
      }

      // Now compute summary from full timeline (same as user history)
      const presentDays = fullTimeline.filter(d => d.status === 'present').length;
      const absentDays = fullTimeline.filter(d => d.status === 'absent').length;
      const lateCheckins = fullTimeline.filter(d => d.is_late).length;
      const daysWithHours = fullTimeline.filter(d => d.working_hours != null).length;
      const totalWH = fullTimeline.reduce((s, d) => s + (d.working_hours || 0), 0);
      const totalBreak = fullTimeline.reduce((s, d) => s + (d.total_break_minutes || 0), 0);
      const breakAdjustmentMinutes = fullTimeline.reduce((s, d) => s + (d.effective_break_minutes > 0 ? d.effective_break_minutes : 0), 0);

      // Approved leave days: count from fullTimeline (respects working days, excludes weekends/holidays — same correct logic as user history)
      const approvedLeaveDays = fullTimeline.reduce((sum, d) => {
      if (d.status !== 'leave') return sum;
      return sum + (d.leave_half_day ? 0.5 : 1);
    }, 0);

      // avgWH: use daysWithHours as denominator (same as user history)
      const avgWH = daysWithHours > 0 ? Math.round((totalWH / daysWithHours) * 100) / 100 : 0;

      // Calculate weekends and holidays from full timeline (same as user history)
      const weekends = fullTimeline.filter(d => d.status === 'weekend').length;
      const compHol = fullTimeline.filter(d => d.status === 'holiday').length;

      return {
        user_id: emp.id,
        first_name: emp.first_name,
        last_name: emp.last_name,
        email: emp.email,
        department_name: emp.department_name,
        hire_date: emp.hire_date,
        total_days: totalDays,
        working_days: empWorkingDays,
        weekends,
        company_holidays: compHol,
        present_days: presentDays,
        approved_leave_days: approvedLeaveDays,
        absent_days: absentDays,
        late_checkins: lateCheckins,
        total_working_hours: Math.round(totalWH * 100) / 100,
        total_break_minutes: totalBreak,
        break_adjustment_minutes: breakAdjustmentMinutes,
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
    if (!perms.includes('attendance.manage') && !perms.includes('attendance.view_team')) {
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
      `SELECT start_date, end_date, reason, leave_type_id, half_day FROM leave_requests
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
        const ls = new Date(lv.start_date).toISOString().slice(0, 10);
        const le = new Date(lv.end_date).toISOString().slice(0, 10);
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
      // effective_break_minutes is audit trail only; total_break_minutes is already adjusted
      const effectiveWH = wh;

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
        leave_half_day: leaveInfo?.half_day || false,
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
    if (!perms.includes('attendance.manage')) {
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
    if (!perms.includes('attendance.manage')) {
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
    if (!perms.includes('attendance.manage')) {
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
    if (!perms.includes('attendance.manage')) {
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
    const [[userRow]] = await pool.query('SELECT email FROM users WHERE id = ?', [existing.user_id]);
    const attDate = existing.attendance_date
      ? new Date(existing.attendance_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
      : '';
    logActivity({ req, module: 'Attendance', action: 'Updated',
      description: `Attendance${userRow ? ` (${userRow.email})` : ''}${attDate ? ` (${attDate})` : ''} updated`,
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
 * Recalculate effective break duration for a specific break record and its attendance.
 * Formula: duration_minutes = original_duration_minutes - SUM(approved_work_minutes)
 * Then recalculates attendance-level totals.
 *
 * @param {number} breakId    - break record id
 * @param {object} connection - db connection
 */
async function recalcBreakDuration(breakId, connection = pool) {
  // Sum all approved work minutes for this break
  const [[sumRow]] = await connection.query(
    `SELECT COALESCE(SUM(approved_work_minutes), 0) as total_approved
     FROM break_adjustment_requests
     WHERE break_id = ? AND status = 'Approved'`,
    [breakId]
  );
  const totalApproved = Number(sumRow.total_approved);

  // Get original duration
  const [[br]] = await connection.query(
    'SELECT original_duration_minutes, attendance_id FROM attendance_breaks WHERE id = ?',
    [breakId]
  );
  if (!br) return;
  const attId = br.attendance_id;
  const original = Number(br.original_duration_minutes) || 0;
  const effectiveBreak = Math.max(0, original - totalApproved);

  // Update break record's current duration
  await connection.query(
    'UPDATE attendance_breaks SET duration_minutes = ? WHERE id = ?',
    [effectiveBreak, breakId]
  );

  // Recalculate attendance totals
  await recalcAttendanceTotals(attId, connection);
}

/**
 * Recalculate attendance-level totals:
 *   total_break_minutes  = SUM(duration_minutes) across all breaks
 *   effective_break_minutes = SUM(approved_work_minutes) across all approved requests
 * Then MySQL auto-updates working_hours via STORED GENERATED column.
 */
async function recalcAttendanceTotals(attId, connection = pool) {
  // total_break_minutes = sum of current break durations
  await connection.query(
    `UPDATE attendance a
     SET total_break_minutes = COALESCE(
       (SELECT SUM(ab.duration_minutes)
        FROM attendance_breaks ab
        WHERE ab.attendance_id = a.id), 0)
     WHERE a.id = ?`,
    [attId]
  );
  // effective_break_minutes = sum of all approved work minutes across all breaks
  await connection.query(
    `UPDATE attendance a
     SET effective_break_minutes = COALESCE(
       (SELECT SUM(bar.approved_work_minutes)
        FROM break_adjustment_requests bar
        JOIN attendance_breaks ab ON bar.break_id = ab.id
        WHERE ab.attendance_id = a.id AND bar.status = 'Approved'), 0)
     WHERE a.id = ?`,
    [attId]
  );
}

/**
 * Apply a break adjustment approval to the attendance record.
 *
 * Formula:
 *   effective_break = original_break_duration - total approved work minutes for this break
 *   working_hours  auto-calculated by MySQL: (shift_hours - total_break_minutes/60)
 *
 * Steps:
 * 1. Set approved_work_minutes on the request record
 * 2. Recalculate this break's duration = original - total approved for this break
 * 3. Recalculate attendance totals (total_break_minutes + effective_break_minutes)
 *
 * @param {number} reqId      - break_adjustment_request id
 * @param {number} approvedWorkMinutes - minutes approved (may differ from requested)
 * @param {object} connection  - db connection
 */
async function applyAdjustmentToAttendance(reqId, approvedWorkMinutes, connection = pool) {
  // Get the request details
  const [[req]] = await connection.query(
    'SELECT * FROM break_adjustment_requests WHERE id = ?', [reqId]
  );
  if (!req) return;

  // Step 1: Store approved minutes on the request
  await connection.query(
    'UPDATE break_adjustment_requests SET approved_work_minutes = ? WHERE id = ?',
    [approvedWorkMinutes, reqId]
  );

  // Step 2: Recalculate this break's effective duration
  await recalcBreakDuration(req.break_id, connection);

  // Step 3: Recalculate attendance totals (total_break_minutes + effective_break_minutes)
  await recalcAttendanceTotals(req.attendance_id, connection);

  const [[rec]] = await connection.query(
    'SELECT * FROM attendance WHERE id = ?', [req.attendance_id]
  );
  return rec;
}

/**
 * Reverse a previously approved adjustment.
 * Called when an approved request is rejected/cancelled.
 * Clears approved_work_minutes and recalculates break + attendance totals.
 *
 * @param {number} reqId      - break_adjustment_request id
 * @param {object} connection - db connection
 */
async function reverseAdjustmentFromAttendance(reqId, connection = pool) {
  const [[req]] = await connection.query(
    'SELECT * FROM break_adjustment_requests WHERE id = ?', [reqId]
  );
  if (!req) return;

  // Clear approved minutes
  await connection.query(
    'UPDATE break_adjustment_requests SET approved_work_minutes = NULL WHERE id = ?',
    [reqId]
  );

  // Recalculate this break's effective duration
  await recalcBreakDuration(req.break_id, connection);

  // Recalculate attendance totals
  await recalcAttendanceTotals(req.attendance_id, connection);
}

// ─── POST /api/attendance/break-adjustments ────────────────────────────────────
// Employee submits a new break adjustment request
router.post('/break-adjustments', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const perms = req.user.permissions || [];

    if (!perms.includes('attendance.adjust_break')) {
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

    // Use original_duration_minutes as the authoritative break duration
    // (falls back to duration_minutes for breaks created before this schema change)
    const originalBreakDuration = Number(breakRec.original_duration_minutes ?? breakRec.duration_minutes ?? 0);

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
      return res.status(400).json({ error: `Start time must be after the break start time (${formatTime(breakRec.start_time, '12h', tz)})` });
    }
    if (reqEnd > new Date(breakRec.end_time)) {
      return res.status(400).json({ error: `End time must be before the break end time (${formatTime(breakRec.end_time, '12h', tz)})` });
    }

    // Compute requested_minutes from the window (use floor to match how original break duration is calculated)
    const requested_minutes = Math.floor((reqEnd - reqStart) / 60000);
    if (requested_minutes <= 0) {
      return res.status(400).json({ error: 'Adjustment window must be at least 1 minute' });
    }

    // ── Prevent overlapping time ranges ─────────────────────────────────────
    // Check against all Pending/Approved requests for this break (excluding self for edits)
    // Two ranges overlap if: reqStart < existingEnd AND reqEnd > existingStart
    const [existingRanges] = await pool.query(
      `SELECT id, start_time, end_time, status, requested_minutes
       FROM break_adjustment_requests
       WHERE break_id = ? AND status IN ('Pending', 'Approved')`,
      [break_id]
    );
    for (const existing of existingRanges || []) {
      // Skip if same time range (for future edit support)
      if (existing.start_time === start_time && existing.end_time === end_time) {
        return res.status(409).json({
          error: `A ${existing.status.toLowerCase()} request already exists for this exact time range`,
        });
      }
      // Convert existing TIME strings (HH:MM:SS in company-local) to UTC for proper comparison
      const existStartUtc = parseCompanyTimeToUTC(existing.start_time, new Date(breakRec.start_time));
      const existEndUtc   = parseCompanyTimeToUTC(existing.end_time,   new Date(breakRec.start_time));
      if (!existStartUtc || !existEndUtc) continue; // skip malformed
      // Overlap: newStart < existingEnd AND newEnd > existingStart (UTC-to-UTC comparison)
      if (reqStart < existEndUtc && reqEnd > existStartUtc) {
        const fmtT12 = (t) => {
          const [h, m] = t.split(':').map(Number);
          const ampm = h < 12 ? 'AM' : 'PM';
          const h12 = h % 12 || 12;
          return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
        };
        return res.status(409).json({
          error: `This time range overlaps with an existing ${existing.status.toLowerCase()} request (${fmtT12(existing.start_time)} – ${fmtT12(existing.end_time)})`,
        });
      }
    }

    // Check total requested vs available minutes for this break
    const [[totalRow]] = await pool.query(
      `SELECT
         COALESCE(SUM(requested_minutes), 0) as total_pending,
         COALESCE(SUM(CASE WHEN status = 'Approved' THEN approved_work_minutes ELSE 0 END), 0) as total_approved
       FROM break_adjustment_requests
       WHERE break_id = ? AND status IN ('Pending', 'Approved')`,
      [break_id]
    );
    const alreadyUsed = Number(totalRow.total_approved); // approved takes absolute priority
    const alreadyPending = Number(totalRow.total_pending);
    const available = originalBreakDuration - alreadyUsed;
    if (requested_minutes > available) {
      return res.status(409).json({
        error: `Only ${available} minutes are available for this break (original: ${originalBreakDuration} min, approved: ${alreadyUsed} min)`,
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

    const [[reqUserRow]] = await pool.query('SELECT email FROM users WHERE id = ?', [userId]);
    logActivity({
      req,
      module: 'Attendance',
      action: 'Requested',
      description: `Break adjustment${reqUserRow ? ` (${reqUserRow.email})` : ''} (${requested_minutes} min) requested`,
      newValue: newReq,
    });

    res.status(201).json({ message: 'Break adjustment request submitted', request: newReq });

    // Notify admins about the new request
    const [admins] = await pool.query(
      `SELECT u.id FROM users u
       JOIN role_permissions rp ON u.role_id = rp.role_id
       JOIN permissions p ON rp.permission_id = p.id
       WHERE p.name = 'attendance.manage'
       AND u.id != ?`,
      [userId]
    );
    for (const admin of admins) {
      if (await isNotificationAllowed(admin.id, 'attendance')) {
        const notifMessage = `${req.user.first_name} ${req.user.last_name} requested ${requested_minutes} min work-during-break`;
        await pool.query(
          `INSERT INTO notifications (user_id, type, title, message, link) VALUES (?, ?, ?, ?, ?)`,
          [admin.id, 'break_adjustment_request', 'New Break Adjustment Request', notifMessage, `/attendance?tab=adjustments`]
        );
        broadcast(admin.id, {
          event: 'new_notification',
          notification: { type: 'break_adjustment_request', title: 'New Break Adjustment Request', message: notifMessage, link: `/attendance?tab=adjustments`, is_read: false, created_at: new Date().toISOString() },
        });
      }
    }
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
      user_id, status, date_from, date_to, search,
    } = req.query;

    const isAdmin = perms.includes('attendance.manage');
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
    if (search) {
      where.push('(u.first_name LIKE ? OR u.last_name LIKE ? OR u.email LIKE ? OR bar.reason LIKE ?)');
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    const whereStr = where.join(' AND ');

    const [rows] = await pool.query(
      `SELECT bar.*,
              a.date, a.clock_in_time, a.clock_out_time,
              u.first_name, u.last_name, u.email,
              d.name as department_name,
              ab.start_time as break_start, ab.end_time as break_end,
              ab.original_duration_minutes, ab.duration_minutes as break_duration,
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
       JOIN users u ON bar.user_id = u.id
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
        approved_work_minutes: r.approved_work_minutes,
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
          original_duration_minutes: r.original_duration_minutes,
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
    if (att.user_id !== userId && !perms.includes('attendance.view_team') && !perms.includes('attendance.manage')) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    // Fetch all breaks for this attendance
    const [breaks] = await pool.query(
      `SELECT ab.*
       FROM attendance_breaks ab
       WHERE ab.attendance_id = ? AND ab.end_time IS NOT NULL
       ORDER BY ab.start_time ASC`,
      [attId]
    );

    // Helper: convert UTC datetime to company-local HH:MM for display in time inputs
    // Handles both DATETIME columns (UTC strings) and TIME columns ('HH:MM:SS' strings).
    // TIME columns are company-local wall-clock times stored directly; return as HH:MM.
    // DATETIME columns need UTC-to-timezone conversion via toTimezone().
    const toCompanyHHMM = (dt) => {
      if (!dt) return null;
      if (typeof dt === 'string' && /^\d{2}:\d{2}:?\d{0,2}$/.test(dt.trim())) {
        // TIME column — already company-local wall-clock time
        const [h, m] = dt.trim().split(':').map(Number);
        return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
      }
      // DATETIME column — convert from UTC to company timezone
      const local = toTimezone(new Date(dt), tz);
      return `${String(local.getHours()).padStart(2,'0')}:${String(local.getMinutes()).padStart(2,'0')}`;
    };

    // Fetch all adjustment requests for all these breaks
    const breakIds = breaks.map(b => b.id);
    let allRequests = [];
    if (breakIds.length > 0) {
      const [reqRows] = await pool.query(
        `SELECT bar.*,
                rb.first_name as reviewer_first_name, rb.last_name as reviewer_last_name
         FROM break_adjustment_requests bar
         LEFT JOIN users rb ON bar.reviewed_by = rb.id
         WHERE bar.break_id IN (?)`,
        [breakIds]
      );
      allRequests = reqRows;
    }

    // Group requests by break_id; compute total approved per break
    const requestsByBreak = {};
    const approvedMap = {}; // breakId -> total approved work minutes
    for (const req of allRequests) {
      if (!requestsByBreak[req.break_id]) requestsByBreak[req.break_id] = [];
      requestsByBreak[req.break_id].push({
        id: req.id,
        requested_minutes: req.requested_minutes,
        approved_work_minutes: req.approved_work_minutes,
        start_time: req.start_time,
        end_time: req.end_time,
        time_start: req.start_time ? toCompanyHHMM(req.start_time) : null,
        time_end: req.end_time ? toCompanyHHMM(req.end_time) : null,
        reason: req.reason,
        status: req.status,
        admin_remarks: req.admin_remarks,
        reviewed_at: req.reviewed_at,
        reviewed_by: req.reviewed_by,
        created_at: req.created_at,
        reviewer: req.reviewer_first_name
          ? { first_name: req.reviewer_first_name, last_name: req.reviewer_last_name }
          : null,
      });
      if (req.status === 'Approved' && req.approved_work_minutes != null) {
        approvedMap[req.break_id] = (approvedMap[req.break_id] || 0) + Number(req.approved_work_minutes);
      }
    }

    res.json({
      attendance_id: attId,
      date: att.date,
      clock_in_time: att.clock_in_time,
      clock_out_time: att.clock_out_time,
      company_tz: tz,
      breaks: breaks.map(b => {
        const original = Number(b.original_duration_minutes ?? b.duration_minutes);
        const totalApproved = approvedMap[b.id] || 0;
        const available = Math.max(0, original - totalApproved);
        const lastReq = (requestsByBreak[b.id] || []).slice(-1)[0];
        return {
          id: b.id,
          start_time: b.start_time,
          end_time:   b.end_time,
          time_start: toCompanyHHMM(b.start_time),
          time_end:   toCompanyHHMM(b.end_time),
          original_duration_minutes: original,
          duration_minutes: b.duration_minutes,
          adjustable_minutes: available,
          existing_requests: requestsByBreak[b.id] || [],
          adjustment: lastReq
            ? {
                id: lastReq.id,
                requested_minutes: lastReq.requested_minutes,
                approved_work_minutes: lastReq.approved_work_minutes,
                start_time: lastReq.start_time,
                end_time:   lastReq.end_time,
                time_start: lastReq.time_start,
                time_end:   lastReq.time_end,
                reason: lastReq.reason,
                status: lastReq.status,
                admin_remarks: lastReq.admin_remarks,
                reviewed_at: lastReq.reviewed_at,
              }
            : null,
        };
      }),
    });
  } catch (err) { next(err); }
});

// ─── GET /api/attendance/break-adjustments/stats ──────────────────────────────
router.get('/break-adjustments/stats', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const perms = req.user.permissions || [];
    const isAdmin = perms.includes('attendance.manage');
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
    const isAdmin = perms.includes('attendance.manage');
    const reqId = parseInt(req.params.id);

    const [[r]] = await pool.query(
      `SELECT bar.*,
              a.date, a.clock_in_time, a.clock_out_time, a.total_break_minutes,
              u.first_name, u.last_name, u.email,
              d.name as department_name,
              ab.start_time as break_start, ab.end_time as break_end, ab.original_duration_minutes, ab.duration_minutes as break_duration,
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
        approved_work_minutes: r.approved_work_minutes,
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
          original_duration_minutes: r.original_duration_minutes,
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
    const isAdmin = perms.includes('attendance.manage');
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
// Admin approves a break adjustment request. The approved minutes may differ from requested.
// recalcBreakDuration is called to recompute: duration = original - totalApprovedForBreak
router.put('/break-adjustments/:id/approve', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const perms = req.user.permissions || [];
    const isAdmin = perms.includes('attendance.manage');

    if (!isAdmin) {
      return res.status(403).json({ error: 'Permission denied. Requires attendance.manage' });
    }

    const reqId = parseInt(req.params.id);
    // approved_work_minutes defaults to requested_minutes if not specified
    const { admin_remarks, approved_work_minutes } = req.body;

    const [[existing]] = await pool.query(
      'SELECT * FROM break_adjustment_requests WHERE id = ?',
      [reqId]
    );
    if (!existing) return res.status(404).json({ error: 'Break adjustment request not found' });
    if (existing.status !== 'Pending') {
      return res.status(400).json({ error: `Cannot approve a request that is already ${existing.status}` });
    }
    if (Number(existing.requested_minutes) <= 0) {
      return res.status(400).json({ error: 'Requested minutes must be greater than zero' });
    }

    // Get break's original duration to validate (fallback to duration_minutes if NULL)
    const [[br]] = await pool.query(
      'SELECT original_duration_minutes, duration_minutes FROM attendance_breaks WHERE id = ?',
      [existing.break_id]
    );
    const originalBreak = Number(br?.original_duration_minutes) || Number(br?.duration_minutes) || 0;

    // Get already-approved work minutes for this break (excluding this request)
    const [[approvedTotal]] = await pool.query(
      `SELECT COALESCE(SUM(approved_work_minutes), 0) as total
       FROM break_adjustment_requests
       WHERE break_id = ? AND status = 'Approved' AND id != ?`,
      [existing.break_id, reqId]
    );
    const alreadyApproved = Number(approvedTotal.total);
    const requested = Number(existing.requested_minutes);
    // approved minutes defaults to requested, capped at available minutes
    const approvedMinutes = Math.min(
      approved_work_minutes ?? requested,
      originalBreak - alreadyApproved
    );

    if (approvedMinutes <= 0) {
      return res.status(400).json({ error: 'No available minutes to approve for this break' });
    }

    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    // Update request status + store approved minutes
    await pool.query(
      `UPDATE break_adjustment_requests
       SET status = 'Approved', approved_work_minutes = ?, reviewed_by = ?, reviewed_at = ?, admin_remarks = ?
       WHERE id = ?`,
      [approvedMinutes, userId, now, admin_remarks || null, reqId]
    );

    // Recalculate break duration and attendance totals
    await applyAdjustmentToAttendance(reqId, approvedMinutes, pool);

    const [[updated]] = await pool.query(
      'SELECT * FROM break_adjustment_requests WHERE id = ?',
      [reqId]
    );

    const [[empRow]] = await pool.query('SELECT email FROM users WHERE id = ?', [existing.user_id]);
    logActivity({
      req,
      module: 'Attendance',
      action: 'Approved',
      description: `Break adjustment${empRow ? ` (${empRow.email})` : ''} (${approvedMinutes} min) approved`,
      previousValue: existing,
      newValue: updated,
    });

    const [[attUpdated]] = await pool.query(
      'SELECT * FROM attendance WHERE id = ?',
      [existing.attendance_id]
    );

    res.json({
      message: 'Break adjustment approved',
      request: updated,
      attendance: formatAttendance(attUpdated),
    });

    // Notify the employee about approval
    if (await isNotificationAllowed(existing.user_id, 'attendance')) {
      const notifMessage = `Your work-during-break request (${approvedMinutes} min) has been approved`;
      await pool.query(
        `INSERT INTO notifications (user_id, type, title, message, link) VALUES (?, ?, ?, ?, ?)`,
        [existing.user_id, 'break_adjustment_approved', 'Break Adjustment Approved', notifMessage, `/attendance?tab=history`]
      );
      broadcast(existing.user_id, {
        event: 'new_notification',
        notification: { type: 'break_adjustment_approved', title: 'Break Adjustment Approved', message: notifMessage, link: `/attendance?tab=history`, is_read: false, created_at: new Date().toISOString() },
      });
    }
  } catch (err) { next(err); }
});

// ─── PUT /api/attendance/break-adjustments/:id/reject ─────────────────────────
// Admin rejects a pending request. The requested time range becomes available again.
router.put('/break-adjustments/:id/reject', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const perms = req.user.permissions || [];
    const isAdmin = perms.includes('attendance.manage');

    if (!isAdmin) {
      return res.status(403).json({ error: 'Permission denied. Requires attendance.manage' });
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

    // No recalculation needed — rejecting a Pending request restores the available window
    const [[updated]] = await pool.query(
      'SELECT * FROM break_adjustment_requests WHERE id = ?',
      [reqId]
    );

    const [[empRowRej]] = await pool.query('SELECT email FROM users WHERE id = ?', [existing.user_id]);
    logActivity({
      req,
      module: 'Attendance',
      action: 'Rejected',
      description: `Break adjustment${empRowRej ? ` (${empRowRej.email})` : ''} rejected`,
      previousValue: existing,
      newValue: updated,
    });

    res.json({ message: 'Break adjustment rejected', request: updated });

    // Notify the employee about rejection
    if (await isNotificationAllowed(existing.user_id, 'attendance')) {
      const notifMessage = `Your work-during-break request (${existing.requested_minutes} min) was rejected${admin_remarks?.trim() ? ': ' + admin_remarks.trim() : ''}`;
      await pool.query(
        `INSERT INTO notifications (user_id, type, title, message, link) VALUES (?, ?, ?, ?, ?)`,
        [existing.user_id, 'break_adjustment_rejected', 'Break Adjustment Rejected', notifMessage, `/attendance?tab=history`]
      );
      broadcast(existing.user_id, {
        event: 'new_notification',
        notification: { type: 'break_adjustment_rejected', title: 'Break Adjustment Rejected', message: notifMessage, link: `/attendance?tab=history`, is_read: false, created_at: new Date().toISOString() },
      });
    }
  } catch (err) { next(err); }
});

// ─── PUT /api/attendance/break-adjustments/:id/cancel ─────────────────────────
// Employee cancels their own pending request. Makes the time range available again.
router.put('/break-adjustments/:id/cancel', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const perms = req.user.permissions || [];

    if (!perms.includes('attendance.adjust_break')) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const reqId = parseInt(req.params.id);

    const [[existing]] = await pool.query(
      'SELECT * FROM break_adjustment_requests WHERE id = ?',
      [reqId]
    );
    if (!existing) return res.status(404).json({ error: 'Break adjustment request not found' });
    if (existing.user_id !== userId) {
      return res.status(403).json({ error: 'You can only cancel your own requests' });
    }
    if (existing.status !== 'Pending') {
      return res.status(400).json({ error: `Cannot cancel a request that is ${existing.status}` });
    }

    await pool.query(
      `UPDATE break_adjustment_requests SET status = 'Cancelled' WHERE id = ?`,
      [reqId]
    );

    // Reverse any approved work minutes if they had been approved (shouldn't happen for Pending, but safe)
    await reverseAdjustmentFromAttendance(reqId, pool);

    const [[empRowCan]] = await pool.query('SELECT email FROM users WHERE id = ?', [existing.user_id]);
    logActivity({
      req,
      module: 'Attendance',
      action: 'Cancelled',
      description: `Break adjustment${empRowCan ? ` (${empRowCan.email})` : ''} cancelled`,
      previousValue: existing,
    });

    res.json({ message: 'Break adjustment request cancelled' });
  } catch (err) { next(err); }
});



