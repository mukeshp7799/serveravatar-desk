/**
 * Attendance Reminder Job
 *
 * Fires once per minute, checks if it's past office_start_time + grace_minutes,
 * then notifies all active users who haven't clocked in today.
 *
 * Each user is notified at most once per day (tracked in sent_daily_reminders table).
 */

const pool = require('../config/database');
let broadcast;
try { broadcast = require('../sse/notifications').broadcast; } catch { broadcast = () => {}; }
const { getSetting } = require('../services/attendanceCalc');
const { getCompanySetting, nowInTimezone, todayInTimezone } = require('../utils/timezone');
const { isNotificationAllowed } = require('../utils/notificationPreferences');

const JOB_LOCK = 'attendance_reminder_daily_sent';
const REMINDER_TYPE = 'attendance_reminder';

/**
 * Parse "HH:MM" time string → total minutes from midnight.
 */
function timeToMinutes(timeStr) {
  if (!timeStr) return 570; // default 09:30
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Get the next reminder time (office_start_time + grace_minutes) as minutes-from-midnight.
 */
async function getReminderWindowMinutes() {
  const officeStart = await getSetting(pool, 'working_schedule', 'office_start_time') || '09:30';
  const graceMinutes = Number(await getSetting(pool, 'working_schedule', 'late_checkin_grace_minutes')) || 30;
  return timeToMinutes(officeStart) + graceMinutes;
}

/**
 * Ensure the sent_daily_reminders table exists.
 */
async function ensureTable() {
  try {
    await pool.query(
      `CREATE TABLE IF NOT EXISTS sent_daily_reminders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        reminder_date DATE NOT NULL,
        reminder_type VARCHAR(100) NOT NULL,
        sent_at DATETIME NOT NULL,
        UNIQUE KEY uk_date_type (reminder_date, reminder_type)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    );
  } catch (err) {
    console.error('[attendanceReminder] Failed to create table:', err.message);
  }
}

/**
 * Main job function. Call this every minute.
 * Does nothing if the reminder was already sent today (checked via sent_daily_reminders).
 */
async function runAttendanceReminder() {
  await ensureTable();

  const tz = await getCompanySetting('general', 'timezone', 'UTC');
  const today = todayInTimezone(tz);
  const now = nowInTimezone(tz);

  // Convert UTC now to company timezone for correct wall-clock comparison.
  // office_start_time is stored as HH:MM in company local time, not UTC.
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

  // Check if we've already sent reminders today
  try {
    const [sent] = await pool.query(
      'SELECT id FROM sent_daily_reminders WHERE reminder_date = ? AND reminder_type = ?',
      [today, JOB_LOCK]
    );
    if (sent.length > 0) {
      return { ran: false, reason: 'already_sent_today' };
    }
  } catch (err) {
    console.error('[attendanceReminder] Lock check failed:', err.message);
    return { ran: false, reason: 'lock_check_failed' };
  }

  // Check if we're within the reminder window
  const reminderWindowMinutes = await getReminderWindowMinutes();
  // Only fire if current time is within 2 minutes of the window
  // (checking every minute, so allow 1-minute tolerance)
  if (Math.abs(currentMinutes - reminderWindowMinutes) > 1) {
    return { ran: false, reason: 'outside_reminder_window' };
  }

  // Find active users with no clock-in today who should be working today
  // Get all active users
  const [activeUsers] = await pool.query(
    "SELECT id, first_name, last_name, email FROM users WHERE status = 'active'"
  );

  if (activeUsers.length === 0) {
    return { ran: true, sent: 0, reason: 'no_active_users' };
  }

  // Get all attendance records for today
  const userIds = activeUsers.map(u => u.id);
  const [attendanceRows] = await pool.query(
    'SELECT user_id FROM attendance WHERE user_id IN (?) AND date = ? AND clock_in_time IS NOT NULL',
    [userIds, today]
  );
  const clockedInUsers = new Set(attendanceRows.map(r => r.user_id));

  // Filter to users who haven't clocked in
  const pendingUsers = activeUsers.filter(u => !clockedInUsers.has(u.id));

  if (pendingUsers.length === 0) {
    // Everyone clocked in — mark as sent and exit
    await markAsSent(today);
    return { ran: true, sent: 0, reason: 'all_clocked_in' };
  }

  // Send notifications
  let sentCount = 0;
  for (const user of pendingUsers) {
    try {
      // Check attendance_reminders preference
      if (!(await isNotificationAllowed(user.id, REMINDER_TYPE))) {
        continue;
      }

      const notifMessage = `Hi ${user.first_name}, you haven't clocked in today. Please clock in now.`;
      await pool.query(
        `INSERT INTO notifications (user_id, type, title, message, link, is_read, created_at)
         VALUES (?, ?, ?, ?, ?, FALSE, NOW())`,
        [user.id, REMINDER_TYPE, '⏰ Attendance Reminder', notifMessage, '/attendance']
      );
      if (broadcast) {
        broadcast(user.id, {
          event: 'new_notification',
          notification: { type: REMINDER_TYPE, title: '⏰ Attendance Reminder', message: notifMessage, link: '/attendance', is_read: false, created_at: new Date().toISOString() },
        });
      }
      sentCount++;
    } catch (err) {
      console.error(`[attendanceReminder] Failed to notify user ${user.id}:`, err.message);
    }
  }

  // Mark as sent for today
  await markAsSent(today);

  console.log(`[attendanceReminder] Sent ${sentCount} attendance reminders for ${today}`);
  return { ran: true, sent: sentCount, pending: pendingUsers.length };
}

/**
 * Record that reminders were sent today so we don't re-send.
 */
async function markAsSent(today) {
  await pool.query(
    `INSERT INTO sent_daily_reminders (reminder_date, reminder_type, sent_at)
     VALUES (?, ?, NOW())
     ON DUPLICATE KEY UPDATE sent_at = NOW()`,
    [today, JOB_LOCK]
  );
}

/**
 * Start the attendance reminder cron — runs every 60 seconds.
 * Uses a process-level flag so the interval is set only once.
 */
let cronStarted = false;

function startAttendanceReminderCron() {
  if (cronStarted) return;
  cronStarted = true;

  console.log('[attendanceReminder] Cron started — firing every 60 seconds');
  setInterval(async () => {
    try {
      const result = await runAttendanceReminder();
      if (result.ran) {
        console.log('[attendanceReminder] Check result:', result);
      }
    } catch (err) {
      console.error('[attendanceReminder] Cron error:', err.message);
    }
  }, 60_000);
}

module.exports = { runAttendanceReminder, startAttendanceReminderCron };
