/**
 * Project Activities API client + hook.
 *
 * Real-API hooks for the "Activity Timeline" card on the Project Dashboard
 * AND the full /projects/:id/activity page.
 *
 * Replaces the mock `useTimeline` / `getRecentActivity` helpers in
 * `lib/mock-project-data.ts` and `lib/project-features.ts` with real REST
 * calls against:
 *
 *   - `GET /api/projects/:id/activities?page=&perPage=&feature=&action=`
 *
 * Returns the paginated payload from the server:
 *   { items, total, page, perPage, totalPages, perPageOptions, features }
 *
 * The same hook is used by:
 *   1. `components/project/RecentActivity.tsx` — sidebar card on the dashboard
 *      with 10/15/20/50 per-page selector and auto-refresh.
 *   2. `app/(authenticated)/projects/[projectId]/activity/page.tsx` — full
 *      grouped-by-day view.
 *
 * Each entry carries:
 *   { id, actor, initials, feature, featureLabel, featureAccent, action,
 *     actionVerb, targetType, targetId, targetLabel, meta, timestamp }
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import api from '@/lib/api'

/* ──────────────────────────────────────────────────────────────────
 * Types
 * ────────────────────────────────────────────────────────────────── */

export interface ActivityEntry {
  id: number | string
  projectId: number | string
  actorId: number
  actor: string
  initials: string
  avatar: string | null
  feature:
    | 'project'
    | 'team'
    | 'task-board'
    | 'todos'
    | 'message-board'
    | 'files'
    | 'chat'
    | 'schedule'
  featureLabel: string
  featureAccent: string
  action: string
  actionVerb: string
  targetType: string
  targetId: string | null
  targetLabel: string | null
  meta: Record<string, unknown> | null
  timestamp: string
}

export interface ActivitiesPayload {
  items: ActivityEntry[]
  total: number
  page: number
  perPage: number
  totalPages: number
  perPageOptions: number[]
  features: string[]
  /** Distinct humans who have ever produced an event in this project, with
   * the count of events each has on record. Used by the "Performed by" filter
   * dropdown so it doesn't need a separate round-trip. */
  actors: { id: number; name: string; email: string; eventCount: number }[]
}

export interface ActivitiesQuery {
  page?: number
  perPage?: number
  feature?: string
  action?: string
  actorId?: number
}

/* ──────────────────────────────────────────────────────────────────
 * Pure fetch helper — usable from both the React hook and from
 * server-rendered pages / tests.
 * ────────────────────────────────────────────────────────────────── */

export async function fetchActivities(
  projectId: string | number,
  query: ActivitiesQuery = {},
): Promise<ActivitiesPayload> {
  const params: string[] = []
  if (query.page) params.push(`page=${query.page}`)
  if (query.perPage) params.push(`perPage=${query.perPage}`)
  if (query.feature) params.push(`feature=${encodeURIComponent(query.feature)}`)
  if (query.action) params.push(`action=${encodeURIComponent(query.action)}`)
  if (query.actorId) params.push(`actorId=${query.actorId}`)
  const qs = params.length ? `?${params.join('&')}` : ''
  return api.get(`/projects/${projectId}/activities${qs}`)
}

/* ──────────────────────────────────────────────────────────────────
 * React hook — fetch + pagination + auto-refresh (poll).
 *
 * Options:
 *   projectId          required
 *   initialPerPage     optional, default 10
 *   pollMs             optional, default 15000 (15s). Pass 0 to disable polling.
 *   feature            optional feature filter
 *   actorId            optional user filter
 *
 * Returns:
 *   { items, total, page, perPage, totalPages, perPageOptions, features,
 *     actors, loading, isPaginating, isRefreshing, error,
 *     setPage, setPerPage, setActorId, refresh }
 *
 * Loading semantics:
 *   - `loading`        — first load ever (or after projectId change). UI
 *                        shows a skeleton.
 *   - `isPaginating`   — user changed page/perPage/filter. Existing rows
 *                        stay on screen; UI shows a subtle overlay.
 *   - `isRefreshing`   — user clicked "refresh now". Existing rows stay on
 *                        screen; UI shows a tiny inline spinner.
 *   - Polling never sets any of these — it's purely background.
 * ────────────────────────────────────────────────────────────────── */

export interface UseActivitiesOptions {
  initialPerPage?: number
  pollMs?: number
  feature?: string
  actorId?: number
}

export function useActivities(
  projectId: string | number,
  options: UseActivitiesOptions = {},
) {
  const { initialPerPage = 10, pollMs = 15000, feature, actorId: initialActorId } = options

  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState<number>(initialPerPage)
  const [actorId, setActorId] = useState<number | undefined>(initialActorId)

  // Mirror the `actorId` option into local state when the caller changes it,
  // so dropping a new `actorId` prop into the hook actually re-fetches. The
  // internal state also drives `setActorId` so the page can flip the filter
  // from inside the hook (e.g. via a "show all" button).
  // Use a ref to detect a real prop change vs. us echoing our own setter.
  const lastActorIdPropRef = useRef<number | undefined>(initialActorId)
  useEffect(() => {
    if (initialActorId !== lastActorIdPropRef.current) {
      lastActorIdPropRef.current = initialActorId
      setActorId(initialActorId)
    }
  }, [initialActorId])
  const [data, setData] = useState<ActivitiesPayload | null>(null)
  // Three distinct loading flavours so the UI can react differently:
  //   loading       — very first load (no rows yet). Caller shows a skeleton.
  //   isPaginating  — page / perPage / filter just changed. Caller shows a
  //                   subtle in-list overlay; the existing rows stay visible.
  //   isRefreshing  — user clicked "refresh now". Caller shows a tiny spinner
  //                   next to the button but keeps the list stable.
  // This stops the previous behaviour where every page click wiped the list
  // and re-showed the skeleton for ~100–300ms, which felt "not smooth".
  const [loading, setLoading] = useState(true)
  const [isPaginating, setIsPaginating] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Track whether we've ever completed an initial load for this projectId.
  // Without this, navigating between two projects with cached rows would
  // briefly skip the skeleton and look like a flash.
  const hadFirstLoadRef = useRef(false)

  // Reset to page 1 when the filter or page size changes (avoid landing on
  // a now-empty page if the new filter returns fewer rows).
  const firstRunRef = useRef(true)
  useEffect(() => {
    if (firstRunRef.current) {
      firstRunRef.current = false
      return
    }
    setPage(1)
  }, [perPage, feature, actorId])

  const load = useCallback(
    async (opts: { kind?: 'initial' | 'paginate' | 'refresh' | 'poll' } = {}) => {
      if (!projectId) return
      const kind = opts.kind || 'paginate'
      const isFirstLoad = !hadFirstLoadRef.current
      // Show the right loading flag — never more than one at a time, and
      // never tear down the existing list during pagination / poll / refresh.
      if (kind === 'initial' || isFirstLoad) {
        setLoading(true)
      } else if (kind === 'paginate') {
        setIsPaginating(true)
      } else if (kind === 'refresh') {
        setIsRefreshing(true)
      }
      setError(null)
      try {
        const res = await fetchActivities(projectId, {
          page,
          perPage,
          feature,
          actorId,
        })
        setData(res)
        hadFirstLoadRef.current = true
        // If the server says our requested page is beyond the total (e.g. data
        // was deleted while we were paginating), snap back to the last real
        // page so the UI doesn't get stuck showing an empty list.
        if (res.totalPages > 0 && page > res.totalPages) {
          setPage(res.totalPages)
        } else if (res.totalPages === 0 && page !== 1) {
          setPage(1)
        }
      } catch (err: any) {
        // Don't tear down the existing list on a transient refresh failure —
        // keep what's on screen and surface the error to the caller.
        setError(err?.message || 'Failed to load activities')
      } finally {
        if (kind === 'initial' || isFirstLoad) setLoading(false)
        else if (kind === 'paginate') setIsPaginating(false)
        else if (kind === 'refresh') setIsRefreshing(false)
      }
    },
    [projectId, page, perPage, feature, actorId],
  )

  // Re-fetch whenever page/perPage/filter change.
  // We mark these as 'paginate' so the hook never blanks the list — the old
  // rows stay visible until the new ones arrive.
  useEffect(() => {
    load({ kind: hadFirstLoadRef.current ? 'paginate' : 'initial' })
  }, [load])

  // Polling — silently refresh in the background.
  useEffect(() => {
    if (!pollMs || pollMs < 1000) return
    const id = window.setInterval(() => {
      // Only poll if we already have data AND we're sitting on page 1.
      // Polling while the user is browsing page 3 would be confusing — new
      // rows would appear in page 1 only, not on the page they're looking at.
      if (!hadFirstLoadRef.current) return
      if (page !== 1) return
      load({ kind: 'poll' })
    }, pollMs)
    return () => window.clearInterval(id)
  }, [load, pollMs, page])

  return {
    items: data?.items ?? [],
    total: data?.total ?? 0,
    // Expose the *requested* page (local state) rather than the page echoed
    // back by the server. This keeps the page indicator in sync with what
    // the user clicked during the brief moment between click and response,
    // instead of briefly showing the previous page number.
    page,
    perPage: data?.perPage ?? perPage,
    totalPages: data?.totalPages ?? 0,
    perPageOptions: data?.perPageOptions ?? [10, 20, 30, 50],
    features: data?.features ?? [],
    actors: data?.actors ?? [],
    loading,
    isPaginating,
    isRefreshing,
    error,
    setPage,
    setPerPage,
    setActorId,
    refresh: () => load({ kind: 'refresh' }),
  }
}

/* ──────────────────────────────────────────────────────────────────
 * Color resolver — maps an actor (or a stable seed) to one of the
 * Tailwind avatar background classes used by the existing UI.
 * ────────────────────────────────────────────────────────────────── */

const COLORS = [
  'bg-indigo-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-sky-500',
  'bg-pink-500',
  'bg-violet-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-orange-500',
]

export function actorColorFor(actor: string): string {
  let h = 0
  for (let i = 0; i < actor.length; i++) {
    h = (h * 31 + actor.charCodeAt(i)) >>> 0
  }
  return COLORS[h % COLORS.length]
}
