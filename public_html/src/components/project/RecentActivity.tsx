'use client'

import Link from 'next/link'
import { ArrowRight, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, RefreshCcw } from 'lucide-react'
import { fmtRelative } from './format'
import { useActivities } from '@/lib/project-activities-api'
import { useMemo } from 'react'

interface RecentActivityProps {
  projectId: string | number
  /** Optional override — default is 10 (per requirement). */
  initialPerPage?: number
}

/**
 * Compact activity list — used on the dashboard sidebar.
 *
 * Renders real data from GET /api/projects/:id/activities with:
 *   - Server-side pagination (page + perPage selector)
 *   - Default 10 records per page
 *   - Per-page selector: 10 / 15 / 20 / 50
 *   - Auto-refresh via 15s polling (silent — doesn't tear down existing rows)
 *   - "View all" link to /projects/:id/activity for the full grouped view
 *
 * Each entry is rendered with the existing visual style so the rest of
 * the dashboard looks unchanged.
 */
export default function RecentActivity({ projectId, initialPerPage = 10 }: RecentActivityProps) {
  const {
    items,
    total,
    page,
    perPage,
    totalPages,
    perPageOptions,
    loading,
    error,
    setPage,
    setPerPage,
    refresh,
  } = useActivities(projectId, { initialPerPage, pollMs: 15000 })

  // Build a stable feature → href map once per render.
  const FEATURE_HREF = useMemo(
    () => ({
      project: (id: string | number) => `/projects/${id}`,
      team: (id: string | number) => `/projects/${id}/team`,
      'task-board': (id: string | number) => `/projects/${id}/task-board`,
      todos: (id: string | number) => `/projects/${id}/todos`,
      'message-board': (id: string | number) => `/projects/${id}/message-board`,
      files: (id: string | number) => `/projects/${id}/files`,
      chat: (id: string | number) => `/projects/${id}/chat`,
      schedule: (id: string | number) => `/projects/${id}/schedule`,
    }),
    [],
  )

  // Render the body in three states: initial loading, error, content.
  const isInitialLoading = loading && items.length === 0

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-gray-800">
        <div>
          <h3 className="font-bold text-gray-900 dark:text-white text-sm">Recent activity</h3>
          {!isInitialLoading && (
            <p className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">
              {total === 0
                ? 'No activity yet'
                : `${total} ${total === 1 ? 'event' : 'events'} · auto-refreshing`}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => refresh()}
            disabled={loading}
            title="Refresh now"
            aria-label="Refresh activity"
            className="p-1.5 rounded-md text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition disabled:opacity-50"
          >
            <RefreshCcw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
          <Link
            href={`/projects/${projectId}/activity`}
            className="text-xs font-semibold text-indigo-600 dark:text-indigo-300 hover:underline inline-flex items-center gap-1 no-underline"
          >
            View all
            <ArrowRight size={11} strokeWidth={2.5} />
          </Link>
        </div>
      </div>

      {/* Rows */}
      <ul className="divide-y divide-gray-100 dark:divide-gray-800">
        {isInitialLoading ? (
          Array.from({ length: Math.min(perPage, 5) }).map((_, i) => (
            <li key={i} className="px-5 py-3 flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-800 animate-pulse shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-3/4 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
                <div className="h-2.5 w-1/2 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
              </div>
            </li>
          ))
        ) : items.length === 0 ? (
          <li className="px-5 py-10 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">No recent activity yet.</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Activity will appear here as the team works.</p>
          </li>
        ) : (
          items.map((entry) => {
            const hrefFn = FEATURE_HREF[entry.feature]
            const href = hrefFn ? hrefFn(projectId) : `/projects/${projectId}/activity`
            return (
              <li key={entry.id}>
                <Link
                  href={href}
                  className="flex items-start gap-3 px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition no-underline group"
                >
                  <span
                    className={`w-8 h-8 rounded-full bg-indigo-500 text-white text-[11px] font-bold flex items-center justify-center shrink-0`}
                    title={entry.actor}
                  >
                    {entry.initials || '??'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-700 dark:text-gray-300 leading-snug">
                      <span className="font-semibold text-gray-900 dark:text-white">{entry.actor}</span>{' '}
                      {entry.actionVerb || entry.action}
                      {entry.targetLabel ? (
                        <>
                          {' · '}
                          <span className="font-medium text-indigo-600 dark:text-indigo-300 group-hover:underline">
                            {entry.targetLabel}
                          </span>
                        </>
                      ) : null}
                    </p>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 font-medium">
                      <span className="uppercase tracking-wider">{entry.featureLabel}</span>
                      {' · '}
                      {fmtRelative(entry.timestamp)}
                    </p>
                  </div>
                </Link>
              </li>
            )
          })
        )}
      </ul>

      {/* Footer: per-page selector + pagination controls.
          Only render the controls when we have data and >1 page so the card
          stays compact on small projects. */}
      {!isInitialLoading && total > 0 && (
        <div className="flex items-center justify-between gap-2 px-5 py-2.5 border-t border-gray-100 dark:border-gray-800 bg-gray-50/40 dark:bg-gray-800/30">
          {/* Per-page selector */}
          <label className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400 font-medium">
            <span>Rows</span>
            <select
              value={perPage}
              onChange={(e) => setPerPage(Number(e.target.value))}
              className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md text-[11px] font-semibold text-gray-700 dark:text-gray-200 px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              aria-label="Activities per page"
            >
              {perPageOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>

          {/* Page indicator + nav buttons */}
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-gray-500 dark:text-gray-400 font-semibold tabular-nums mr-1">
              {page} / {Math.max(1, totalPages)}
            </span>
            <PagerButton
              disabled={page <= 1 || loading}
              onClick={() => setPage(1)}
              label="First page"
              icon={<ChevronsLeft size={12} strokeWidth={2.5} />}
            />
            <PagerButton
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              label="Previous page"
              icon={<ChevronLeft size={12} strokeWidth={2.5} />}
            />
            <PagerButton
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              label="Next page"
              icon={<ChevronRight size={12} strokeWidth={2.5} />}
            />
            <PagerButton
              disabled={page >= totalPages || loading}
              onClick={() => setPage(totalPages)}
              label="Last page"
              icon={<ChevronsRight size={12} strokeWidth={2.5} />}
            />
          </div>
        </div>
      )}

      {/* Soft error banner — silent auto-refresh failures shouldn't blow up
          the page, but we should give the user a hint + a retry button. */}
      {error && !isInitialLoading && items.length > 0 && (
        <div className="px-5 py-2 text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border-t border-amber-100 dark:border-amber-900/40">
          <span>Couldn't refresh activity. </span>
          <button
            type="button"
            onClick={() => refresh()}
            className="font-semibold underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  )
}

function PagerButton({
  disabled,
  onClick,
  label,
  icon,
}: {
  disabled?: boolean
  onClick: () => void
  label: string
  icon: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="p-1 rounded-md text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed"
    >
      {icon}
    </button>
  )
}
