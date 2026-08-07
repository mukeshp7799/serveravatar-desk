/**
 * dateFormat.ts
 *
 * Centralized date/time formatting utilities for the frontend.
 * Uses the Company's configured timezone, date_format, and time_format.
 * Uses native Intl.DateTimeFormat (no external libraries needed).
 */

export type DateFormat = 'YYYY-MM-DD' | 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'DD-MM-YYYY'
export type TimeFormat = '12h' | '24h'

export interface CompanyDateSettings {
  timezone: string   // IANA timezone, e.g. 'Asia/Kolkata'
  date_format: DateFormat
  time_format: TimeFormat
}

const DEFAULT_SETTINGS: CompanyDateSettings = {
  timezone: 'UTC',
  date_format: 'YYYY-MM-DD',
  time_format: '24h',
}

// ─── Date-only formatters ─────────────────────────────────────────────────────

/**
 * Format a date string or Date as a date-only string using company's date_format.
 * @param input  ISO date string ('YYYY-MM-DD') or Date
 * @param format  override format (optional)
 * @param tz      override timezone (optional)
 */
export function formatDateOnly(
  input: string | Date | null | undefined,
  format?: DateFormat,
  tz?: string
): string {
  if (!input) return ''
  const d = typeof input === 'string' ? new Date(input + 'T00:00:00') : input
  if (isNaN(d.getTime())) return ''

  const dateFormat = format || 'YYYY-MM-DD'
  return applyDateFormat(d, dateFormat)
}

/**
 * Apply a date format pattern to a Date object (naive - no timezone conversion).
 * Handles: YYYY, YY, MM, M, DD, D
 */
export function applyDateFormat(d: Date, pattern: string): string {
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  const day = d.getDate()
  return pattern
    .replace('YYYY', String(y))
    .replace('YY', String(y).slice(-2))
    .replace('MM', String(m).padStart(2, '0'))
    .replace('M', String(m))
    .replace('DD', String(day).padStart(2, '0'))
    .replace('D', String(day))
}

/**
 * Format a datetime as a time string using company's time_format.
 * @param input  ISO datetime string or Date
 * @param timeFormat  '12h' or '24h'
 * @param tz     timezone (IANA)
 */
export function formatTimeOnly(
  input: string | Date | null | undefined,
  timeFormat: TimeFormat = '24h',
  tz?: string
): string {
  if (!input) return ''
  const date = typeof input === 'string' ? new Date(input) : input
  if (isNaN(date.getTime())) return ''

  const timeZone = tz || 'UTC'
  const opts: Intl.DateTimeFormatOptions = {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: timeFormat === '12h',
  }
  const parts = new Intl.DateTimeFormat('en-GB', opts).formatToParts(date)
  const get = (t: string) => parts.find(p => p.type === t)?.value || '00'
  const hh = get('hour')
  const mm = get('minute')
  return `${hh}:${mm}`
}

/**
 * Format a datetime with both date and time components.
 * @param input  ISO datetime string or Date
 * @param dateFormat  date pattern
 * @param timeFormat  '12h' or '24h'
 * @param tz     timezone
 */
export function formatDateTime(
  input: string | Date | null | undefined,
  dateFormat: DateFormat = 'YYYY-MM-DD',
  timeFormat: TimeFormat = '24h',
  tz?: string
): string {
  if (!input) return ''
  const date = typeof input === 'string' ? new Date(input) : input
  if (isNaN(date.getTime())) return ''

  const dateStr = formatDateOnly(input, dateFormat, tz)
  const timeStr = formatTimeOnly(input, timeFormat, tz)
  return `${dateStr} ${timeStr}`
}

/**
 * Format a timestamp (ISO string or Date) as relative time (e.g. "2 hours ago").
 */
export function formatRelative(input: string | Date | null | undefined): string {
  if (!input) return ''
  const date = typeof input === 'string' ? new Date(input) : input
  if (isNaN(date.getTime())) return ''

  const now = Date.now()
  const diffMs = now - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)

  if (diffSec < 60) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHour < 24) return `${diffHour}h ago`
  if (diffDay < 7) return `${diffDay}d ago`
  return formatDateOnly(date)
}

/**
 * Get today's date as a YYYY-MM-DD string in a given timezone.
 * Uses Intl to compute the date in the target timezone.
 */
export function todayInTimezone(tz: string): string {
  const now = new Date()
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
  return fmt.format(now) // en-CA gives YYYY-MM-DD
}

/**
 * Format a Date object in a specific timezone, returning a new Date representing
 * the same moment in the target timezone.
 */
export function toTimezone(date: Date, tz: string): Date {
  if (!tz || tz === 'UTC') return new Date(date)
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: false,
    })
    const parts = fmt.formatToParts(date)
    const get = (k: string) => Number(parts.find(p => p.type === k)?.value || 0)
    return new Date(Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')))
  } catch {
    return new Date(date)
  }
}

// ─── Time-only formatters ─────────────────────────────────────────────────────

/**
 * Format a time value (HH:MM) using the Company's timezone and time_format.
 * Uses Intl.DateTimeFormat to ensure the company timezone is always used,
 * regardless of the browser's local timezone.
 *
 * All attendance datetimes are stored as UTC naive datetimes in MySQL.
 * The server returns them as UTC ISO strings (e.g. "2026-08-06T08:55:00.000Z").
 * This function interprets that UTC value and formats it in the Company timezone.
 *
 * @param datetimeInput  ISO datetime string or Date — the raw UTC value from the server
 * @param settings  CompanyDateSettings containing timezone + time_format
 */
export function formatCompanyTime(
  datetimeInput: string | Date | null | undefined,
  settings: CompanyDateSettings
): string {
  if (!datetimeInput) return '—'
  const date = typeof datetimeInput === 'string' ? new Date(datetimeInput) : datetimeInput
  if (isNaN(date.getTime())) return '—'

  const opts: Intl.DateTimeFormatOptions = {
    timeZone: settings.timezone,   // Company timezone (e.g. Asia/Kolkata)
    hour: '2-digit',
    minute: '2-digit',
    hour12: settings.time_format === '12h',
  }
  // Intl.DateTimeFormat with timeZone interprets the Date as UTC and converts
  // to the target timezone, giving us the correct wall-clock in Company TZ.
  return new Intl.DateTimeFormat('en-GB', opts).format(date)
}

/**
 * Convert a server datetime string into a datetime-local input value (YYYY-MM-DDTHH:MM).
 *
 * The server stores clock_in/out as naive MYSQL DATETIMEs representing the
 * wall-clock time in the Company timezone.  When displayed on the frontend, we
 * use Intl.DateTimeFormat with the Company timezone so all users see the
 * correct wall-clock time regardless of their browser's local timezone.
 *
 * For the edit form, we need to produce a datetime-local value that will
 * pre-fill the input with the correct wall-clock time.  Since datetime-local
 * always treats its value as local browser time, we compute the UTC
 * equivalent of the company-timezone wall-clock, then format as
 * YYYY-MM-DDTHH:MM — when the browser submits this, the resulting UTC
 * timestamp will be correct.
 *
 * @param datetimeInput  ISO datetime string from the server
 * @param settings  CompanyDateSettings (timezone is required)
 * @returns  YYYY-MM-DDTHH:MM string suitable for a <input type="datetime-local">
 */
export function toDateTimeLocalForInput(
  datetimeInput: string | Date | null | undefined,
  settings: CompanyDateSettings
): string {
  if (!datetimeInput) return ''
  const date = typeof datetimeInput === 'string' ? new Date(datetimeInput) : datetimeInput
  if (isNaN(date.getTime())) return ''

  // Extract the wall-clock components in the Company timezone
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: settings.timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
    hour12: false,
  })
  const parts = fmt.formatToParts(date)
  const get = (k: string) => parts.find(p => p.type === k)?.value || '00'
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`
}

/**
 * Convert a datetime-local value (YYYY-MM-DDTHH:MM) from the edit form into
 * a UTC ISO string for transmission to the server.
 *
 * The datetime-local input always submits the wall-clock in the browser's LOCAL
 * timezone.  We interpret that wall-clock as the Company timezone, compute its
 * UTC equivalent, and return a UTC ISO string (with 'Z') for MySQL.
 *
 * Algorithm:
 * 1. Use Date.UTC() to get the UTC milliseconds for the wall-clock COMPONENTS
 *    (this always interprets parts as UTC, regardless of browser TZ).
 * 2. Compute the Company timezone's UTC offset at midnight UTC on the given date
 *    using Intl.DateTimeFormat — this gives the correct offset including DST.
 * 3. Since Company TZ = UTC + offset,   UTC = UTC_wall_clock - offset.
 *
 * @param dateTimeLocal  YYYY-MM-DDTHH:MM value from a datetime-local input
 * @param settings  CompanyDateSettings
 * @returns  UTC ISO string  e.g. "2026-08-06T04:00:00.000Z"
 */
export function fromDateTimeLocalToUTC(
  dateTimeLocal: string | null | undefined,
  settings: CompanyDateSettings
): string | null {
  if (!dateTimeLocal) return null

  const [datePart, timePart] = dateTimeLocal.split('T')
  if (!datePart || !timePart) return null

  const [year, month, day] = datePart.split('-').map(Number)
  const [hour, minute] = timePart.split(':').map(Number)

  // Step 1: UTC milliseconds for these wall-clock components (browser-independent)
  const utcWallClockMs = Date.UTC(year, month - 1, day, hour, minute)

  // Step 2: Company timezone's UTC offset at midnight UTC on the given date.
  // Using midnight UTC as the reference avoids DST transitions within the day.
  const midnightUtc = new Date(Date.UTC(year, month - 1, day, 0, 0, 0))
  const offsetFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: settings.timezone,
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: false,
    timeZoneName: 'short',
  })
  const tzPart = offsetFmt.formatToParts(midnightUtc)
    .find(p => p.type === 'timeZoneName')?.value || 'UTC'

  // Parse "GMT+05:30" or "GMT-08:00" or "UTC" → offset in ms
  // Positive = company TZ is AHEAD of UTC (IST = +5:30 = +19800s)
  let offsetMs = 0
  const match = tzPart.match(/GMT([+-])(\d{1,2}):?(\d{2})?/)
  if (match) {
    const sign = match[1] === '+' ? 1 : -1
    const h = parseInt(match[2] || '0', 10)
    const m = parseInt(match[3] || '0', 10)
    offsetMs = sign * (h * 60 + m) * 60 * 1000
  }

  // Step 3: UTC = UTC_wall_clock - offset
  // e.g. IST 09:00:  utc_wall_clock=09:00 UTC, offset=+5.5h,  UTC=09:00-5.5=03:30 UTC ✅
  // e.g. UTC 09:00:  utc_wall_clock=09:00 UTC, offset=0,        UTC=09:00-0=09:00 UTC ✅
  const utcMs = utcWallClockMs - offsetMs
  return new Date(utcMs).toISOString()
}
