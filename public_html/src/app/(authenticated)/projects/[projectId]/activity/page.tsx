'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import FeaturePage from '@/components/project/FeaturePage'
import EmptyState from '@/components/project/EmptyState'
import { fmtRelative } from '@/components/project/format'
import { useActivities } from '@/lib/project-activities-api'
import { Activity, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Filter, Loader2, RefreshCcw, User as UserIcon } from 'lucide-react'

const FEATURE_LABEL: Record<string, string> = {
  'message-board': 'Message Board',
  'todos': 'To-dos',
  'task-board': 'Task Board',
  'files': 'Files',
  'schedule': 'Schedule',
  'team': 'Team',
  'chat': 'Chat',
  'project': 'Project',
}

export default function ActivityPage() {
  const params = useParams<{ projectId: string }>()
  const projectId = params.projectId

  const [featureFilter, setFeatureFilter] = useState<string | undefined>(undefined)
  const [actorFilter, setActorFilter] = useState<number | undefined>(undefined)

  const {
    items,
    total,
    page,
    perPage,
    totalPages,
    perPageOptions,
    features,
    actors,
    loading,
    isPaginating,
    isRefreshing,
    error,
    setPage,
    setPerPage,
    refresh,
  } = useActivities(projectId, {
    initialPerPage: 10,
    pollMs: 20000,
    feature: featureFilter,
    actorId: actorFilter,
  })

  // Derived boundary flags for the pagination buttons. We only disable when
  // the user has hit an edge — never while loading — so clicking Next rapidly
  // feels responsive instead of "stuck for a second after each click".
  const atFirst = page <= 1
  const atLast = page >= totalPages

  // Group by day (newest first by activity.timestamp).
  const groups: Record<string, typeof items> = {}
  items.forEach((e) => {
    const key = new Date(e.timestamp).toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
    if (!groups[key]) groups[key] = []
    groups[key].push(e)
  })

  return (
    <FeaturePage featureKey="activity" title="Activity Timeline">
      <div className="space-y-4">
        {/* Header card with totals + filter chips */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm px-5 py-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-base font-bold text-gray-900 dark:text-white">Activity timeline</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 inline-flex items-center gap-1.5 flex-wrap">
                {total === 0 ? (
                  'No activity yet'
                ) : (
                  <>
                    <span>{total} {total === 1 ? 'event' : 'events'}, newest first · auto-refreshing</span>
                    {/* Inline "loading" chip — visible while the user is paginating
                        or while a manual refresh is in flight, so they know the
                        app is reacting without the list being wiped. */}
                    {(isPaginating || isRefreshing) && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-600 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-900/40 rounded-full px-1.5 py-0.5">
                        <Loader2 size={10} className="animate-spin" />
                        {isPaginating ? 'Loading page…' : 'Refreshing…'}
                      </span>
                    )}
                  </>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Filter chips — each is a bordered pill with icon + label + select.
                  Padding is generous so the controls feel "weighty" and easy to read
                  instead of being squished into a single line of dense text. */}
              <FilterChip
                icon={<Filter size={13} className="text-indigo-500 dark:text-indigo-300" />}
                label="Card"
              >
                <select
                  value={featureFilter || ''}
                  onChange={(e) => setFeatureFilter(e.target.value || undefined)}
                  className="bg-transparent text-xs font-semibold text-gray-700 dark:text-gray-200 focus:outline-none cursor-pointer pr-1"
                  aria-label="Filter by card / feature"
                >
                  <option value="">All cards</option>
                  {features.map((f) => (
                    <option key={f} value={f}>
                      {FEATURE_LABEL[f] || f}
                    </option>
                  ))}
                </select>
              </FilterChip>
              <FilterChip
                icon={<UserIcon size={13} className="text-indigo-500 dark:text-indigo-300" />}
                label="By"
              >
                <select
                  value={actorFilter ?? ''}
                  onChange={(e) => {
                    const v = e.target.value
                    setActorFilter(v ? Number(v) : undefined)
                  }}
                  className="bg-transparent text-xs font-semibold text-gray-700 dark:text-gray-200 focus:outline-none cursor-pointer pr-1 min-w-[120px]"
                  aria-label="Filter by user"
                >
                  <option value="">All users</option>
                  {actors.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.eventCount})
                    </option>
                  ))}
                </select>
              </FilterChip>

              {/* Right-side cluster: per page + refresh */}
              <div className="flex items-center gap-2 ml-auto">
                <FilterChip label="Per page">
                  <select
                    value={perPage}
                    onChange={(e) => setPerPage(Number(e.target.value))}
                    className="bg-transparent text-xs font-semibold text-gray-700 dark:text-gray-200 focus:outline-none cursor-pointer pr-1"
                    aria-label="Activities per page"
                  >
                    {perPageOptions.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </FilterChip>
                <button
                  type="button"
                  onClick={() => refresh()}
                  title="Refresh now"
                  aria-label="Refresh activity"
                  className="inline-flex items-center justify-center h-9 w-9 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600 transition shadow-sm"
                >
                  <RefreshCcw size={14} className={isRefreshing ? 'animate-spin text-indigo-500' : ''} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Body */}
        {loading && items.length === 0 ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 h-16 animate-pulse" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            iconName="Activity"
            title={featureFilter || actorFilter ? 'No matching activity' : 'No activity yet'}
            description={
              featureFilter || actorFilter
                ? 'Try clearing one of the filters above.'
                : 'Events will appear here as the team works.'
            }
          />
        ) : (
          <div className="space-y-6">
            {Object.entries(groups).map(([day, events]) => (
              <div key={day}>
                <h3 className="text-xs uppercase tracking-wider font-bold text-gray-500 dark:text-gray-400 mb-2">{day}</h3>
                <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
                  <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                    {events.map((e) => (
                      <li key={e.id} className="px-5 py-3 flex items-start gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition">
                        <span
                          className={`w-9 h-9 rounded-full bg-indigo-500 text-white text-xs font-bold flex items-center justify-center shrink-0`}
                          title={e.actor}
                        >
                          {e.initials || '??'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-700 dark:text-gray-300 leading-snug">
                            <span className="font-semibold text-gray-900 dark:text-white">{e.actor}</span>{' '}
                            {e.actionVerb || e.action}
                            {e.targetLabel ? (
                              <>
                                {' · '}
                                <span className="text-indigo-600 dark:text-indigo-300 font-medium">{e.targetLabel}</span>
                              </>
                            ) : null}
                          </p>
                          <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold mt-0.5">
                            <span>{(FEATURE_LABEL[e.feature] || e.featureLabel)}</span>
                            {' · '}
                            <span>{fmtRelative(e.timestamp)}</span>
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination footer */}
        {total > 0 && (
          <div className="flex items-center justify-between gap-3 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm p-3">
            <div className="text-xs text-gray-500 dark:text-gray-400 font-medium">
              Showing page <span className="font-bold text-gray-900 dark:text-white">{page}</span> of{' '}
              <span className="font-bold text-gray-900 dark:text-white">{Math.max(1, totalPages)}</span>
              {' · '}
              <span className="font-bold text-gray-900 dark:text-white">{total}</span> total
            </div>
            <div className="flex items-center gap-1">
              {/* Buttons only disable at the boundary. We don't disable them
                  during pagination so the user can flip through pages quickly
                  without losing a click — the in-list "Loading page…" chip is
                  the sole indicator that work is in flight. */}
              <PagerButton
                disabled={atFirst}
                onClick={() => setPage(1)}
                label="First page"
                icon={<ChevronsLeft size={14} strokeWidth={2.5} />}
              />
              <PagerButton
                disabled={atFirst}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                label="Previous page"
                icon={<ChevronLeft size={14} strokeWidth={2.5} />}
              />
              <span className="text-xs text-gray-700 dark:text-gray-200 font-semibold tabular-nums px-2 inline-flex items-center gap-1.5">
                {page} / {Math.max(1, totalPages)}
                {isPaginating && (
                  <Loader2 size={11} className="animate-spin text-indigo-500" aria-hidden="true" />
                )}
              </span>
              <PagerButton
                disabled={atLast}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                label="Next page"
                icon={<ChevronRight size={14} strokeWidth={2.5} />}
              />
              <PagerButton
                disabled={atLast}
                onClick={() => setPage(totalPages)}
                label="Last page"
                icon={<ChevronsRight size={14} strokeWidth={2.5} />}
              />
            </div>
          </div>
        )}

        {error && items.length > 0 && (
          <div className="px-5 py-2 text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/40 rounded-xl">
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
    </FeaturePage>
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
      className="p-1.5 rounded-md text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed"
    >
      {icon}
    </button>
  )
}

/* ──────────────────────────────────────────────────────────────────
 * Filter chip — a bordered pill with an optional leading icon, a label,
 * and a child element (almost always a <select>). Designed to sit
 * comfortably at h-9 with px-3 padding so the controls read as
 * "weighty" rather than cramped.
 * ──────────────────────────────────────────────────────────────── */
function FilterChip({
  icon,
  label,
  children,
}: {
  icon?: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="inline-flex items-center gap-1.5 h-9 px-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm hover:border-gray-300 dark:hover:border-gray-600 transition focus-within:ring-2 focus-within:ring-indigo-300 dark:focus-within:ring-indigo-700 focus-within:border-indigo-300">
      {icon}
      <span className="text-[11px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500 select-none">
        {label}
      </span>
      <div className="w-px h-4 bg-gray-200 dark:bg-gray-700" aria-hidden="true" />
      <div className="flex items-center">{children}</div>
    </div>
  )
}
