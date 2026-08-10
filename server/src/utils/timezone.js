/**
 * server/src/utils/timezone.js
 *
 * Centralized timezone and date formatting utilities.
 * All server-side date operations MUST use these helpers to respect
 * the Company's configured timezone and date/time formats.
 *
 * Single source of truth: company_settings (general.timezone, general.date_format, general.time_format)
 */

const pool = require('../config/database');

// ─── In-memory cache (60s TTL) ────────────────────────────────────────────────
const cache = new Map();
const CACHE_TTL_MS = 60_000;

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) { cache.delete(key); return null; }
  return entry.val;
}

function setCached(key, val) {
  cache.set(key, { val, ts: Date.now() });
}

// ─── Settings Fetchers ────────────────────────────────────────────────────────

/**
 * Fetch a single company setting with caching.
 * @param {string} group  e.g. 'general', 'working_schedule'
 * @param {string} key     e.g. 'timezone', 'date_format'
 * @param {any} defaultVal  fallback if not found
 */
async function getCompanySetting(group, key, defaultVal = null) {
  const cacheKey = `${group}:${key}`;
  const cached = getCached(cacheKey);
  if (cached !== null) return cached;

  try {
    const [rows] = await pool.query(
      'SELECT setting_value FROM company_settings WHERE setting_group = ? AND setting_key = ?',
      [group, key]
    );
    if (!rows[0]) return defaultVal;
    let val = rows[0].setting_value;
    try { val = JSON.parse(val); } catch { /* keep string */ }
    setCached(cacheKey, val);
    return val;
  } catch {
    return defaultVal;
  }
}

/**
 * Fetch all general settings (timezone, date_format, time_format) with caching.
 */
async function getGeneralSettings() {
  const cacheKey = 'general:all';
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const [rows] = await pool.query(
    "SELECT setting_key, setting_value FROM company_settings WHERE setting_group = 'general'"
  );
  const result = { timezone: 'UTC', date_format: 'YYYY-MM-DD', time_format: '24h' };
  for (const row of rows) {
    try {
      if (row.setting_key === 'timezone') result.timezone = row.setting_value || 'UTC';
      else if (row.setting_key === 'date_format') result.date_format = row.setting_value || 'YYYY-MM-DD';
      else if (row.setting_key === 'time_format') result.time_format = row.setting_value || '24h';
    } catch { /* ignore parse errors */ }
  }
  setCached(cacheKey, result);
  return result;
}

/** Invalidate the settings cache (call after settings are updated). */
function invalidateCache() {
  cache.clear();
}

// ─── Timezone Conversion ─────────────────────────────────────────────────────

/**
 * Convert a JS Date to a given timezone, returning a new Date representing
 * that moment in the target timezone.
 *
 * Uses Intl.DateTimeFormat to compute the offset at the given moment,
 * then adjusts the timestamp accordingly.
 *
 * @param {Date} date
 * @param {string} timezone  IANA timezone, e.g. 'Asia/Kolkata'
 * @returns {Date}  adjusted Date object
 */
function toTimezone(date, timezone) {
  if (!timezone || timezone === 'UTC' || !Intl.DateTimeFormat.prototype[Symbol.toStringTag]) {
    return new Date(date);
  }
  try {
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: false });
    const parts = fmt.formatToParts(date);
    const get = (k) => Number(parts.find(p => p.type === k)?.value || 0);
    const tzDate = new Date(Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')));
    // The offset in minutes between UTC and the target timezone at this moment
    const utcDate = new Date(date);
    const tzOffsetMs = tzDate.getTime() - utcDate.getTime();
    return new Date(date.getTime() + tzOffsetMs);
  } catch {
    return new Date(date);
  }
}

/**
 * Get "now" as a Date object in UTC.
 *
 * NOTE: MySQL stores all attendance datetimes as naive UTC datetimes.
 * This function returns actual UTC so that:
 *   - Stored value:  actual UTC moment (e.g. 08:55 UTC = 2:25 PM IST)
 *   - Frontend:     interprets stored UTC as UTC → formats correctly as IST
 *
 * The previous implementation used `toTimezone` which stored the IST
 * wall-clock as a UTC timestamp (e.g. 14:25 IST stored as 14:25 UTC),
 * causing a +5:30 h display error.
 *
 * @param {string} _timezone  (deprecated, always returns UTC)
 */
function nowInTimezone(_timezone) {
  return new Date();
}

/**
 * Get today's date string (YYYY-MM-DD) in the company timezone.
 * @param {string} timezone  IANA timezone
 * @returns {string}
 */
function todayInTimezone(timezone) {
  if (timezone && timezone !== 'UTC') {
    try {
      const fmt = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric', month: '2-digit', day: '2-digit',
      });
      // Format: 2026-08-10
      const [y, m, day] = fmt.format(nowInTimezone()).split('-');
      return `${y}-${m}-${day}`;
    } catch (_) {
      // Fall back to UTC
    }
  }
  const d = nowInTimezone();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ─── Date Formatting ─────────────────────────────────────────────────────────

/**
 * Parse a company date-format string (e.g. 'DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD')
 * and format a Date object accordingly.
 *
 * @param {Date|string|number} dateInput
 * @param {string} format  e.g. 'DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'
 * @param {string} timezone  IANA timezone
 * @returns {string}  formatted date string
 */
function formatDate(dateInput, format, timezone = 'UTC') {
  if (!dateInput) return '';
  const d = toTimezone(new Date(dateInput), timezone);
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const hh = d.getHours();
  const mm = d.getMinutes();

  // Pad helpers
  const YYYY = String(y);
  const YY = String(y).slice(-2);
  const MM = String(m).padStart(2, '0');
  const M = String(m);
  const DD = String(day).padStart(2, '0');
  const D = String(day);
  const hh12 = String(hh % 12 || 12);
  const HH = String(hh).padStart(2, '0');
  const mm2 = String(mm).padStart(2, '0');

  return format
    .replace('YYYY', YYYY)
    .replace('YYY', YY)
    .replace('YY', YY)
    .replace('MM', MM)
    .replace('M', M)
    .replace('DD', DD)
    .replace('D', D)
    .replace('hh', hh12)
    .replace('HH', HH)
    .replace('mm', mm2);
}

/**
 * Format a date as time string based on company's time_format setting.
 * @param {Date|string|number} dateInput
 * @param {'12h'|'24h'} timeFormat
 * @param {string} timezone
 * @returns {string}  e.g. '02:30 PM' or '14:30'
 */
function formatTime(dateInput, timeFormat = '24h', timezone = 'UTC') {
  if (!dateInput) return '';
  const d = toTimezone(new Date(dateInput), timezone);
  const hh = d.getHours();
  const mm = d.getMinutes();
  const HH = String(hh).padStart(2, '0');
  const mm2 = String(mm).padStart(2, '0');
  if (timeFormat === '12h') {
    const h12 = hh % 12 || 12;
    const ampm = hh < 12 ? 'AM' : 'PM';
    return `${String(h12).padStart(2, '0')}:${mm2} ${ampm}`;
  }
  return `${HH}:${mm2}`;
}

/**
 * Format a full datetime (date + time) according to company settings.
 * @param {Date|string|number} dateInput
 * @param {object} opts  { dateFormat, timeFormat, timezone }
 */
function formatDateTime(dateInput, { dateFormat = 'YYYY-MM-DD', timeFormat = '24h', timezone = 'UTC' } = {}) {
  if (!dateInput) return '';
  return `${formatDate(dateInput, dateFormat, timezone)} ${formatTime(dateInput, timeFormat, timezone)}`;
}

// ─── Date Input Helpers ──────────────────────────────────────────────────────

/**
 * Create a Date in company timezone representing midnight (00:00:00) of the given YYYY-MM-DD.
 * @param {string} dateStr  'YYYY-MM-DD'
 * @param {string} timezone
 */
function parseDateInTimezone(dateStr, timezone = 'UTC') {
  if (!dateStr) return new Date();
  const [y, m, d] = String(dateStr).split('-').map(Number);
  // Create at midnight in the target timezone
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
  // Returns 'YYYY-MM-DD' in that timezone — use it to construct
  return new Date(`${String(y).padStart(4,'0')}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}T00:00:00`);
}

module.exports = {
  getCompanySetting,
  getGeneralSettings,
  invalidateCache,
  toTimezone,
  nowInTimezone,
  todayInTimezone,
  formatDate,
  formatTime,
  formatDateTime,
  parseDateInTimezone,
};
