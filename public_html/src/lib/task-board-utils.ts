/**
 * Task Board — due date / overdue utilities
 *
 * Centralised here so the same logic powers the card label, the
 * filter chip counts, and the overdue highlight.
 */

/**
 * Names that mark a column as "completed" — i.e. any task in a column
 * with one of these names is treated as done and is excluded from
 * overdue / due-soon filters. Matching is case-insensitive and tolerates
 * leading/trailing whitespace.
 */
const COMPLETED_COLUMN_NAMES = new Set([
  'done',
  'completed',
  'complete',
  'closed',
  'resolved',
  'shipped',
])

export function isColumnCompleted(columnName: string | null | undefined): boolean {
  if (!columnName) return false
  return COMPLETED_COLUMN_NAMES.has(columnName.toLowerCase().trim())
}

/**
 * Urgency tier for a task's due date. Drives both the label text and
 * the colour treatment on the card.
 *
 * - `overdue`  — due date is before today, task is not completed
 * - `today`    — due date is today
 * - `tomorrow` — due date is tomorrow
 * - `soon`     — within the next 7 days (and after tomorrow)
 * - `far`      — more than 7 days in the future
 * - `none`     — no due date
 */
export type DueUrgency = 'overdue' | 'today' | 'tomorrow' | 'soon' | 'far' | 'none'

/** Parse a `YYYY-MM-DD` string into a local Date at midnight. */
function parseLocalDate(yyyyMmDd: string): Date {
  const [y, m, d] = yyyyMmDd.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

/** Returns today's date as a `YYYY-MM-DD` string (local time). */
export function todayYmd(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Add `n` calendar days to a `YYYY-MM-DD` string and return `YYYY-MM-DD`. */
function addDaysYmd(yyyyMmDd: string, n: number): string {
  const d = parseLocalDate(yyyyMmDd)
  d.setDate(d.getDate() + n)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Day-difference between two `YYYY-MM-DD` strings (b - a, in calendar days). */
function diffDaysYmd(a: string, b: string): number {
  const da = parseLocalDate(a).getTime()
  const db = parseLocalDate(b).getTime()
  return Math.round((db - da) / (1000 * 60 * 60 * 24))
}

/** Format a `YYYY-MM-DD` string for display, e.g. "Aug 23". */
function formatShortDate(yyyyMmDd: string): string {
  const d = parseLocalDate(yyyyMmDd)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** Format a `YYYY-MM-DD` string with year, e.g. "Aug 23, 2027". */
function formatLongDate(yyyyMmDd: string): string {
  const d = parseLocalDate(yyyyMmDd)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export interface DueLabel {
  /** Urgency tier — drives styling. */
  urgency: DueUrgency
  /** Short label to render in the card, e.g. "Today", "Tomorrow", "Due in 3 days", "Overdue by 2 days", "Aug 23". */
  label: string
  /** Longer, more descriptive label for tooltips / accessibility. */
  title: string
  /** True if the task is overdue (urgency === 'overdue' AND not completed). */
  isOverdue: boolean
}

/**
 * Build the contextual label for a task's due date.
 *
 * @param dueDate       `YYYY-MM-DD` string or `null`/`undefined`.
 * @param isCompleted   If `true`, the task is considered "done" — overdue
 *                      status is suppressed and the label is shown in a
 *                      muted tone.
 * @param today         Override "today" for tests; defaults to the current date.
 */
export function buildDueLabel(
  dueDate: string | null | undefined,
  isCompleted: boolean,
  today: string = todayYmd(),
): DueLabel | null {
  if (!dueDate) return null

  const delta = diffDaysYmd(today, dueDate)

  // Completed tasks: never overdue. Show the actual date muted.
  if (isCompleted) {
    return {
      urgency: 'none',
      label: formatShortDate(dueDate),
      title: `Completed · due ${formatLongDate(dueDate)}`,
      isOverdue: false,
    }
  }

  if (delta < 0) {
    const days = Math.abs(delta)
    const dayWord = days === 1 ? 'day' : 'days'
    return {
      urgency: 'overdue',
      label: 'Overdue',
      title: `Due ${formatLongDate(dueDate)} · Overdue by ${days} ${dayWord}`,
      isOverdue: true,
    }
  }
  if (delta === 0) {
    return {
      urgency: 'today',
      label: 'Today',
      title: `Due today (${formatLongDate(dueDate)})`,
      isOverdue: false,
    }
  }
  if (delta === 1) {
    return {
      urgency: 'tomorrow',
      label: 'Tomorrow',
      title: `Due tomorrow (${formatLongDate(dueDate)})`,
      isOverdue: false,
    }
  }
  if (delta <= 7) {
    return {
      urgency: 'soon',
      label: `Due in ${delta} days`,
      title: `Due ${formatLongDate(dueDate)}`,
      isOverdue: false,
    }
  }
  // Far future — show the actual date (e.g. "Aug 23").
  return {
    urgency: 'far',
    label: formatShortDate(dueDate),
    title: `Due ${formatLongDate(dueDate)}`,
    isOverdue: false,
  }
}

/**
 * Match a task against a due-date filter. `null` filter means "show all".
 */
export type DueFilter = 'all' | 'overdue' | 'today' | 'this-week' | 'no-date'

export function matchesDueFilter(
  filter: DueFilter,
  dueDate: string | null | undefined,
  isCompleted: boolean,
  today: string = todayYmd(),
): boolean {
  if (filter === 'all') return true
  if (filter === 'no-date') return !dueDate

  if (!dueDate) return false
  if (isCompleted) return false // completed tasks never match time-based filters

  const delta = diffDaysYmd(today, dueDate)

  switch (filter) {
    case 'overdue':
      return delta < 0
    case 'today':
      return delta === 0
    case 'this-week':
      // Today, tomorrow, or any of the next 6 days (covers the calendar week)
      return delta >= 0 && delta <= 6
    default:
      return true
  }
}

/**
 * Count overdue tasks across all columns for the toolbar badge.
 * A task is overdue if it has a due date in the past AND its column is
 * not in the "completed" set.
 */
export function countOverdueTasks(
  columns: ReadonlyArray<{ name: string; tasks: ReadonlyArray<{ due_date: string | null }> }>,
  today: string = todayYmd(),
): number {
  let count = 0
  for (const col of columns) {
    if (isColumnCompleted(col.name)) continue
    for (const task of col.tasks) {
      if (task.due_date && diffDaysYmd(today, task.due_date) < 0) count++
    }
  }
  return count
}

// Re-export for tests / other consumers
export const _internals = {
  parseLocalDate,
  diffDaysYmd,
  addDaysYmd,
  formatShortDate,
  formatLongDate,
}
