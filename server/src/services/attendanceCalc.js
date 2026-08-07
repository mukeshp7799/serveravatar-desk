/**
 * server/src/services/attendanceCalc.js
 *
 * Shared attendance calculation service — single source of truth for all
 * attendance, leave, and report calculations driven by Company Settings.
 *
 * All modules (attendance, leaves, analytics, dashboard) MUST use functions
 * from this service instead of duplicating business logic.
 */

const DAY_MAP = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 0 };
const DAY_REVERSE = { 0: 'sun', 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat' };

// ─── Settings Fetchers ────────────────────────────────────────────────────────

/**
 * Get a single setting value from company_settings.
 * @param {import('mysql2/promise').Pool} pool
 * @param {string} group  e.g. 'working_schedule', 'attendance', 'leave'
 * @param {string} key    e.g. 'office_start_time'
 * @returns {Promise<any>} parsed value (JSON-parsed if stringified, else string)
 */
async function getSetting(pool, group, key) {
  const [rows] = await pool.query(
    'SELECT setting_value FROM company_settings WHERE setting_group = ? AND setting_key = ?',
    [group, key]
  );
  if (!rows[0]) return null;
  let val = rows[0].setting_value;
  try { val = JSON.parse(val); } catch { /* keep string */ }
  return val;
}

/**
 * Get all settings for one or more groups.
 * Returns { group: { key: value, ... }, ... }
 * @param {import('mysql2/promise').Pool} pool
 * @param {...string} groups
 */
async function getSettings(pool, ...groups) {
  if (groups.length === 0) return {};
  const [rows] = await pool.query(
    'SELECT setting_group, setting_key, setting_value FROM company_settings WHERE setting_group IN (?)',
    [groups]
  );
  const result = {};
  for (const g of groups) result[g] = {};
  for (const row of rows) {
    let val = row.setting_value;
    try { val = JSON.parse(val); } catch { /* keep string */ }
    if (result[row.setting_group]) result[row.setting_group][row.setting_key] = val;
  }
  return result;
}

// ─── Date / Day Helpers ───────────────────────────────────────────────────────

/**
 * Returns the JS day-of-week number (0=Sun … 6=Sat) for a date string or Date.
 */
function dayOfWeek(date) {
  return new Date(date).getDay();
}

/**
 * Convert a 'YYYY-MM-DD' string or Date to a Date at local midnight.
 */
function parseDate(str) {
  if (!str) return new Date();
  if (str instanceof Date) return new Date(str);
  const [y, m, d] = String(str).split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Returns true if the given date falls on a configured working day.
 * @param {string} dateStr  'YYYY-MM-DD'
 * @param {string[]} workingDays  ['mon','tue','wed','thu','fri'] etc.
 */
function isWorkday(dateStr, workingDays) {
  const dow = dayOfWeek(dateStr);
  const key = DAY_REVERSE[dow];
  return workingDays.includes(key);
}

/**
 * Returns true if the given date is in the holidaySet.
 * @param {string} dateStr  'YYYY-MM-DD'
 * @param {Set<string>} holidaySet
 */
function isHoliday(dateStr, holidaySet) {
  return holidaySet.has(dateStr);
}

// ─── Core Calculation Functions ─────────────────────────────────────────────────

/**
 * Compute late status based on actual clock-in time vs configured office start + grace.
 * @param {Date|string} clockInTime
 * @param {string} officeStartTime  'HH:MM'
 * @param {number} graceMinutes
 * @returns {{ isLate: boolean, lateMinutes: number }}
 */
function computeLateStatus(clockInTime, officeStartTime, graceMinutes = 30) {
  if (!clockInTime) return { isLate: false, lateMinutes: 0 };
  const [sh, sm] = (officeStartTime || '09:30').split(':').map(Number);
  const clockIn = new Date(clockInTime);
  const officeMinutes = sh * 60 + sm;
  const clockMinutes = clockIn.getHours() * 60 + clockIn.getMinutes();
  const latestAllowed = officeMinutes + (Number(graceMinutes) || 0);
  const isLate = clockMinutes > latestAllowed;
  return {
    isLate,
    lateMinutes: isLate ? clockMinutes - officeMinutes : 0,
  };
}

/**
 * Compute working hours from clock-in/out and total break minutes.
 * @param {Date|string|null} clockIn
 * @param {Date|string|null} clockOut
 * @param {number} totalBreakMinutes
 * @returns {number|null} hours (decimal), or null if insufficient data
 */
function computeWorkingHours(clockIn, clockOut, totalBreakMinutes = 0) {
  if (!clockIn || !clockOut) return null;
  const ms = new Date(clockOut) - new Date(clockIn);
  if (ms <= 0) return null;
  const totalMinutes = Math.floor(ms / 60000) - (Number(totalBreakMinutes) || 0);
  return Math.max(0, totalMinutes / 60);
}

/**
 * Compute live (real-time) working hours from clock-in to NOW.
 * Used when the employee has clocked in but not yet clocked out.
 * Optionally subtracts the duration of an in-progress break.
 * @param {Date|string|null} clockIn
 * @param {number} totalBreakMinutes  — completed break minutes only
 * @param {Date|string|null} activeBreakStart  — ongoing break start time (optional)
 * @returns {number|null} hours (decimal), or null if clockIn is missing
 */
function computeLiveWorkingHours(clockIn, totalBreakMinutes = 0, activeBreakStart = null) {
  if (!clockIn) return null;
  const now = new Date();
  const ms = now - new Date(clockIn);
  if (ms <= 0) return null;
  let totalMinutes = Math.floor(ms / 60000);
  // Subtract completed break minutes
  totalMinutes -= Number(totalBreakMinutes) || 0;
  // Subtract ongoing break duration if an open break exists
  if (activeBreakStart) {
    const activeBreakMs = now - new Date(activeBreakStart);
    if (activeBreakMs > 0) {
      totalMinutes -= Math.floor(activeBreakMs / 60000);
    }
  }
  return Math.max(0, totalMinutes / 60);
}

/**
 * Count working days in [from, to] that are also workdays (not weekends/holidays).
 * Respects hireDate — days before hireDate are excluded.
 * @param {string} from  'YYYY-MM-DD'
 * @param {string} to    'YYYY-MM-DD'
 * @param {string} [hireDate]  employee hire date 'YYYY-MM-DD'
 * @param {string[]} workingDays  configured working days
 * @param {Set<string>} holidaySet  company holiday dates
 */
function countWorkingDays(from, to, hireDate, workingDays, holidaySet) {
  let count = 0;
  const start = parseDate(from);
  // Don't count days before hire
  const hd = hireDate ? parseDate(hireDate) : null;
  const end = parseDate(to);
  const cur = new Date(Math.max(start.getTime(), hd ? hd.getTime() : start.getTime()));
  const last = end;

  while (cur <= last) {
    const ds = cur.toISOString().slice(0, 10);
    if (isWorkday(ds, workingDays) && !isHoliday(ds, holidaySet)) {
      count++;
    }
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

/**
 * Count weekends (Sat + Sun) in [from, to].
 * @param {string} from
 * @param {string} to
 */
function countWeekends(from, to) {
  let count = 0;
  const cur = parseDate(from);
  const end = parseDate(to);
  while (cur <= end) {
    const dow = cur.getDay();
    if (dow === 0 || dow === 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

/**
 * Count overlapping days between two ranges.
 * @param {string} rangeStart
 * @param {string} rangeEnd
 * @param {string} queryStart
 * @param {string} queryEnd
 */
function overlapDays(rangeStart, rangeEnd, queryStart, queryEnd) {
  const ls = parseDate(rangeStart);
  const le = parseDate(rangeEnd);
  const qf = parseDate(queryStart);
  const qt = parseDate(queryEnd);
  const start = ls > qf ? ls : qf;
  const end = le < qt ? le : qt;
  if (start > end) return 0;
  return Math.round((end - start) / 86400000) + 1;
}

/**
 * Full attendance metrics for one employee over a date range.
 * Returns all required metrics for analytics, reports, dashboard.
 *
 * @param {Object} emp  - employee row (id, hire_date, ...)
 * @param {Object} attByUser - { 'YYYY-MM-DD': attendanceRecord }
 * @param {Object[]} leaves  - approved leave records for this employee
 * @param {Set<string>} holidaySet
 * @param {string[]} workingDays
 * @returns {Object} metrics object
 */
function computeAttendanceMetrics(emp, attByUser, leaves, holidaySet, workingDays) {
  const presentStatuses = ['clocked_in', 'working', 'on_break', 'completed'];

  let presentDays = 0;
  let lateCheckins = 0;
  let totalWorkingHours = 0;
  let totalBreakMinutes = 0;

  for (const [, rec] of Object.entries(attByUser)) {
    if (presentStatuses.includes(rec.status)) {
      presentDays++;
    }
    if (rec.is_late) lateCheckins++;
    const wh = computeWorkingHours(rec.clock_in_time, rec.clock_out_time, rec.total_break_minutes || 0);
    if (wh != null) totalWorkingHours += wh;
    totalBreakMinutes += rec.total_break_minutes || 0;
  }

  // Approved leave days overlapping this employee's att range
  let approvedLeaveDays = 0;
  for (const lv of leaves) {
    approvedLeaveDays += overlapDays(
      String(lv.start_date).slice(0, 10),
      String(lv.end_date).slice(0, 10),
      Object.keys(attByUser)[0] || '',
      Object.keys(attByUser).slice(-1)[0] || ''
    );
  }

  return {
    present_days: presentDays,
    late_checkins: lateCheckins,
    total_working_hours: Math.round(totalWorkingHours * 100) / 100,
    total_break_minutes: totalBreakMinutes,
    approved_leave_days: Math.min(approvedLeaveDays, 999), // cap to avoid huge numbers
    average_working_hours: presentDays > 0
      ? Math.round((totalWorkingHours / presentDays) * 100) / 100
      : 0,
  };
}

/**
 * Status label helper for timeline display.
 */
function getStatusLabel(dateStr, holidaySet, workingDays, attRec, leaveInfo) {
  if (isHoliday(dateStr, holidaySet)) return 'holiday';
  if (!isWorkday(dateStr, workingDays)) return 'weekend';
  if (leaveInfo) return 'leave';
  if (attRec && ['clocked_in', 'working', 'on_break', 'completed'].includes(attRec.status)) return 'present';
  return 'absent';
}

module.exports = {
  getSetting,
  getSettings,
  dayOfWeek,
  parseDate,
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
  DAY_MAP,
  DAY_REVERSE,
};
