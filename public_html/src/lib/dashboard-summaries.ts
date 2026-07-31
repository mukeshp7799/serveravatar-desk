/**
 * Pure functions that derive a `CardSummaryData` from each project's
 * real API responses. Replaces the deterministic mock builders in
 * `mock-project-data.ts`.
 *
 * Each function returns:
 *   - count      total items
 *   - lastUpdatedAt   ISO timestamp of the most recent item (or null)
 *   - recentTitle     short title / label of the most recent item
 *   - recentActivity  human-readable description of the most recent action
 *   - recentActor     display name of the actor (or null)
 */

import type { CardSummaryData } from '@/components/project/ProjectDashboardCard'
import type {
  DashboardMessage,
  DashboardTodoList,
  DashboardTaskColumn,
  DashboardDocument,
  DashboardEvent,
  DashboardChatMessage,
  DashboardActivity,
} from './project-api'

/** Pick the most recent item from an array (by updated_at → created_at). */
function pickMostRecent<T extends { updated_at?: string | null; created_at: string }>(items: T[]): T | null {
  if (!items.length) return null
  return items.reduce((best, cur) => {
    const bestTime = new Date(best.updated_at || best.created_at).getTime()
    const curTime = new Date(cur.updated_at || cur.created_at).getTime()
    return curTime > bestTime ? cur : best
  })
}

/** Strip HTML to a short plain-text snippet. */
function htmlToText(html: string, maxLen = 140): string {
  const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  return text.length > maxLen ? `${text.slice(0, maxLen).trim()}…` : text
}

const emptySummary: CardSummaryData = {
  count: 0,
  lastUpdatedAt: null,
  recentTitle: null,
  recentActivity: 'No activity yet',
  recentActor: null,
}

/* ──────────────────────────────────────────────────────────────────
 *  Per-card summary builders
 * ────────────────────────────────────────────────────────────────── */

export function summarizeMessages(items: DashboardMessage[]): CardSummaryData {
  if (!items.length) return emptySummary
  const recent = pickMostRecent(items) as DashboardMessage
  const title = recent.title?.trim() || (recent.body_html ? htmlToText(recent.body_html, 80) : 'Update')
  return {
    count: items.length,
    lastUpdatedAt: recent.updated_at || recent.created_at,
    recentTitle: title,
    recentActivity: title,
    recentActor: recent.author_name,
  }
}

export function summarizeTodos(items: DashboardTodoList[]): CardSummaryData {
  const flat = items.flatMap((l) => (l.items || []).map((it) => ({ ...it, listName: l.name })))
  if (!flat.length) return emptySummary
  const recent = pickMostRecent(flat) as DashboardTodoList['items'][number] & { listName: string }
  const completed = flat.filter((it) => it.is_completed === true || it.is_completed === 1).length
  return {
    count: items.reduce((sum, l) => sum + (l.items?.length || 0), 0),
    lastUpdatedAt: recent.updated_at || recent.created_at,
    recentTitle: recent.title,
    recentActivity: `${completed} done · ${flat.length - completed} open`,
    recentActor: recent.assignee_name || null,
  }
}

export function summarizeTaskBoard(columns: DashboardTaskColumn[]): CardSummaryData {
  const flat = columns.flatMap((c) => (c.tasks || []).map((t) => ({ ...t, columnName: c.name })))
  if (!flat.length) return emptySummary
  const recent = pickMostRecent(flat) as DashboardTaskColumn['tasks'][number] & { columnName: string }
  return {
    count: flat.length,
    lastUpdatedAt: recent.updated_at || recent.created_at,
    recentTitle: recent.title,
    recentActivity: `in ${recent.columnName}`,
    recentActor: recent.assignee_name || null,
  }
}

export function summarizeFiles(items: DashboardDocument[]): CardSummaryData {
  if (!items.length) return emptySummary
  const recent = pickMostRecent(items) as DashboardDocument
  return {
    count: items.length,
    lastUpdatedAt: recent.last_modified || recent.updated_at || recent.created_at,
    recentTitle: recent.title,
    recentActivity: recent.kind === 'doc' ? 'document updated' : 'file uploaded',
    recentActor: recent.author_name,
  }
}

export function summarizeSchedule(items: DashboardEvent[]): CardSummaryData {
  if (!items.length) return emptySummary
  // Use start_at for "next upcoming" — but for "recent activity" use the
  // last updated. Fall back to most-recently-created.
  const byStartDesc = [...items].sort(
    (a, b) => new Date(b.start_at).getTime() - new Date(a.start_at).getTime(),
  )
  const next = byStartDesc[0]
  const recent = pickMostRecent(items) as DashboardEvent
  return {
    count: items.length,
    lastUpdatedAt: recent.updated_at || recent.created_at,
    recentTitle: next.title,
    recentActivity: `upcoming · ${new Date(next.start_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`,
    recentActor: null,
  }
}

export function summarizeChat(items: DashboardChatMessage[]): CardSummaryData {
  if (!items.length) return emptySummary
  const recent = pickMostRecent(items) as DashboardChatMessage
  return {
    count: items.length,
    lastUpdatedAt: recent.created_at,
    recentTitle: `#${recent.channel}`,
    recentActivity: htmlToText(recent.body, 100),
    recentActor: recent.author_name,
  }
}

export function summarizeActivity(items: DashboardActivity[]): CardSummaryData {
  if (!items.length) return emptySummary
  const recent = items[0] // activities endpoint returns newest-first
  const verb = recent.actionVerb || recent.action
  const target = recent.targetLabel || ''
  return {
    count: items.length,
    lastUpdatedAt: recent.timestamp,
    recentTitle: `${verb}${target ? ` ${target}` : ''}`,
    recentActivity: `${verb}${target ? ` ${target}` : ''}`,
    recentActor: recent.actor,
  }
}

export function summarizeTeam(members: Array<{ user_id: number | string; is_owner?: boolean; first_name?: string; last_name?: string; email?: string }>): CardSummaryData {
  if (!members.length) return emptySummary
  // Sort: most-recently-added first if there's a hint, else by name. The API
  // doesn't currently return joined_at in this shape, so just use count + owner.
  const owner = members.find((m) => m.is_owner)
  return {
    count: members.length,
    lastUpdatedAt: null,
    recentTitle: `${members.length} member${members.length === 1 ? '' : 's'}`,
    recentActivity: owner
      ? `Owned by ${[owner.first_name, owner.last_name].filter(Boolean).join(' ') || owner.email}`
      : 'Team assembled',
    recentActor: owner ? ([owner.first_name, owner.last_name].filter(Boolean).join(' ') || owner.email || null) : null,
  }
}

/* ──────────────────────────────────────────────────────────────────
 * Test Cases — counts test cases and surfaces the most recent title +
 * status for the dashboard card. Reuses the same shape used by the
 * task board / todos cards.
 * ────────────────────────────────────────────────────────────────── */

export interface DashboardTestCase {
  id: number | string
  title: string
  status: string
  priority: string
  assigned_tester_id?: number | string | null
  suite_name?: string | null
  author_name?: string | null
  updated_at?: string | null
  created_at: string
}

export function summarizeTestCases(items: DashboardTestCase[]): CardSummaryData {
  if (!items.length) return emptySummary
  const recent = pickMostRecent(items) as DashboardTestCase
  const passed = items.filter((it) => it.status === 'passed').length
  const failed = items.filter((it) => it.status === 'failed').length
  return {
    count: items.length,
    lastUpdatedAt: recent.updated_at || recent.created_at,
    recentTitle: recent.title,
    recentActivity: `${recent.status}${recent.suite_name ? ` · ${recent.suite_name}` : ''}${passed + failed > 0 ? ` · ${passed}✓ ${failed}✗` : ''}`,
    recentActor: recent.author_name || null,
  }
}
