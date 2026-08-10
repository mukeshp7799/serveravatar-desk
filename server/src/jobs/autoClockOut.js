/**
 * Auto Clock-Out Job
 *
 * Runs every 60 seconds.
 * Finds all users who:
 *   1. Have auto_close_attendance = true in company settings
 *   2. Have require_clock_out = false in company settings
 *   3. Are currently clocked_in / working (not on break, not already completed)
 *   4. Current time has passed office_end_time
 *
 * Auto-completes their attendance by:
 *   - Closing any open breaks
 *   - Setting status = 'completed' with current time as clock_out_time
 */

const pool = require('../config/database');
const { getSetting } = require('../services/attendanceCalc');
const { getCompanySetting, nowInTimezone, todayInTimezone } = require('../utils/timezone');

/**
 * Parse "HH:MM" time string → total minutes from midnight.
 */
function timeToMinutes(timeStr) {
  if (!timeStr) return 18 * 60 + 30; // default 18:30
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Main job function. Call this every 60 seconds.
 */
async function runAutoClockOut() {
  try {
    // Check if auto_close_attendance is enabled
    const autoCloseEnabled = await getSetting(pool, 'attendance', 'auto_close_attendance');
    if (autoCloseEnabled !== true) {
      return { ran: false, reason: 'auto_close_attendance_disabled' };
    }

    // Check if require_clock_out is false (i.e., auto clock-out is the mode)
    const requireClockOut = await getSetting(pool, 'attendance', 'require_clock_out');
    if (requireClockOut === true) {
      return { ran: false, reason: 'require_clock_out_enabled' };
    }

    const tz = await getCompanySetting('general', 'timezone', 'UTC');
    const today = todayInTimezone(tz);
    const now = nowInTimezone(tz);

    // Convert UTC now to company timezone for correct wall-clock comparison.
    // office_end_time is stored as HH:MM in company local time, not UTC.
    let currentMinutes = now.getHours() * 60 + now.getMinutes();
    if (tz && tz !== 'UTC') {
      try {
        const fmt = new Intl.DateTimeFormat('en-US', {
          timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
        });
        const parts = Object.fromEntries(
          fmt.formatToParts(now).map(p => [p.type, p.value])
        );
        currentMinutes = (Number(parts.hour) % 24) * 60 + Number(parts.minute);
      } catch (_) {
        // Fall back to UTC
      }
    }

    // Get office end time
    const officeEndTime = await getSetting(pool, 'working_schedule', 'office_end_time') || '18:30';
    const officeEndMinutes = timeToMinutes(officeEndTime);

    // Only run if current time is at or past office end time
    // Add 1-minute tolerance so the job can fire right at office_end_time
    if (currentMinutes < officeEndMinutes) {
      return { ran: false, reason: 'before_office_end_time' };
    }

    // Find all active attendance records for today that are clocked in/working but not completed
    const [openRecords] = await pool.query(
      `SELECT a.*, u.first_name, u.last_name
       FROM attendance a
       JOIN users u ON a.user_id = u.id
       WHERE a.date = ?
         AND a.status IN ('clocked_in', 'working')
         AND a.clock_in_time IS NOT NULL
         AND a.clock_out_time IS NULL`,
      [today]
    );

    if (openRecords.length === 0) {
      return { ran: true, processed: 0, reason: 'no_open_records' };
    }

    let processed = 0;
    let skipped = 0;

    for (const record of openRecords) {
      try {
        // Close any open breaks first
        const [openBreaks] = await pool.query(
          'SELECT * FROM attendance_breaks WHERE attendance_id = ? AND end_time IS NULL',
          [record.id]
        );

        for (const b of openBreaks) {
          const breakMins = Math.floor((now - new Date(b.start_time)) / 60000);
          await pool.query(
            'UPDATE attendance_breaks SET end_time = ?, duration_minutes = ? WHERE id = ?',
            [now, breakMins, b.id]
          );
          await pool.query(
            'UPDATE attendance SET total_break_minutes = total_break_minutes + ? WHERE id = ?',
            [breakMins, record.id]
          );
        }

        // Auto-complete the attendance record
        await pool.query(
          'UPDATE attendance SET status = ?, clock_out_time = ? WHERE id = ?',
          ['completed', now, record.id]
        );

        processed++;
        console.log(
          `[autoClockOut] Auto clock-out: user ${record.user_id} (${record.first_name} ${record.last_name}) ` +
          `— date ${today}, office_end=${officeEndTime}`
        );
      } catch (err) {
        console.error(`[autoClockOut] Failed for attendance ${record.id}:`, err.message);
        skipped++;
      }
    }

    return { ran: true, processed, skipped, reason: 'completed' };
  } catch (err) {
    console.error('[autoClockOut] Job error:', err.message);
    return { ran: false, reason: 'error', error: err.message };
  }
}

// ─── Cron ─────────────────────────────────────────────────────────────────────

let cronStarted = false;

function startAutoClockOutCron() {
  if (cronStarted) return;
  cronStarted = true;

  console.log('[autoClockOut] Cron started — firing every 60 seconds');
  setInterval(async () => {
    try {
      const result = await runAutoClockOut();
      if (result.ran && result.processed > 0) {
        console.log('[autoClockOut] Run result:', result);
      }
    } catch (err) {
      console.error('[autoClockOut] Cron error:', err.message);
    }
  }, 60_000);
}

module.exports = { runAutoClockOut, startAutoClockOutCron };
