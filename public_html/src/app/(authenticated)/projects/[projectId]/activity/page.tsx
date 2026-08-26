'use client'

import { useState, useRef, useEffect } from 'react'
import { useParams } from 'next/navigation'
import FeaturePage from '@/components/project/FeaturePage'
import PaginationBar from '@/components/project/PaginationBar'
import EmptyState from '@/components/project/EmptyState'
import { fmtRelative } from '@/components/project/format'
import { useActivities, getFriendlyAction, formatActivityLabel } from '@/lib/project-activities-api'
import { TruncatedActivity } from '@/components/project/TruncatedActivity'
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
  const [actionFilter, setActionFilter] = useState<string | undefined>(undefined)

  const {
    items,
    total,
    page,
    perPage,
    totalPages,
    perPageOptions,
    features,
    actions,
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
    action: actionFilter,
    actorId: actorFilter,
  })

  // Derived boundary flags for the pagination buttons. We only disable when
  // the user has hit an edge — never while loading — so clicking Next rapidly
  // feels responsive instead of "stuck for a second after each click".
  const atFirst = page <= 1
  const atLast = page >= totalPages

  // Ref for the table card — used to scroll back to the table top on page/limit change.
  const tableCardRef = useRef<HTMLDivElement>(null)

  // Scroll to the table card whenever page or perPage changes after initial mount.
  const hasMounted = useRef(false)
  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true
      return
    }
    tableCardRef.current?.scrollIntoView({ block: 'start' })
  }, [page, perPage])


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
              <FilterChip
                icon={<Filter size={13} className="text-indigo-500 dark:text-indigo-300" />}
                label="Action"
              >
                <select
                  value={actionFilter || ''}
                  onChange={(e) => setActionFilter(e.target.value || undefined)}
                  className="bg-transparent text-xs font-semibold text-gray-700 dark:text-gray-200 focus:outline-none cursor-pointer pr-1"
                  aria-label="Filter by action"
                >
                  <option value="">All actions</option>
                  {actions.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </FilterChip>

              {/* Right-side cluster: refresh only */}
              <div className="flex items-center gap-2 ml-auto">
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
            title={featureFilter || actorFilter || actionFilter ? 'No matching activity' : 'No activity yet'}
            description={
              featureFilter || actorFilter || actionFilter
                ? 'Try clearing one of the filters above.'
                : 'Events will appear here as the team works.'
            }
          />
        ) : (
          <div
            ref={tableCardRef}
            className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800">
                    <th className="text-left px-4 py-3 text-xs uppercase tracking-wider font-bold text-gray-500 dark:text-gray-400">
                      <span className="inline-flex items-center gap-1.5">
                        <UserIcon size={12} />
                        User
                      </span>
                    </th>
                    <th className="text-left px-4 py-3 text-xs uppercase tracking-wider font-bold text-gray-500 dark:text-gray-400">
                      <span className="inline-flex items-center gap-1.5">
                        <Activity size={12} />
                        Action
                      </span>
                    </th>
                    <th className="text-left px-4 py-3 text-xs uppercase tracking-wider font-bold text-gray-500 dark:text-gray-400">
                      <span className="inline-flex items-center gap-1.5">
                        <Activity size={12} />
                        Activity
                      </span>
                    </th>
                    <th className="text-left px-4 py-3 text-xs uppercase tracking-wider font-bold text-gray-500 dark:text-gray-400">
                      <span className="inline-flex items-center gap-1.5">
                        <Filter size={12} />
                        Feature
                      </span>
                    </th>
                    <th className="text-left px-4 py-3 text-xs uppercase tracking-wider font-bold text-gray-500 dark:text-gray-400">
                      Timestamp
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                  {items.map((e) => (
                    <tr key={e.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/60 transition">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <span
                            className="w-8 h-8 rounded-full bg-indigo-500 text-white text-xs font-bold flex items-center justify-center shrink-0"
                            title={e.actor}
                          >
                            {e.initials || '??'}
                          </span>
                          <span className="font-semibold text-gray-900 dark:text-white text-xs whitespace-nowrap">
                            {e.actor}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 whitespace-nowrap">
                          {getFriendlyAction(e.actionVerb)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {e.targetLabel ? (
                          <span
                            data-tooltip-id="app-tooltip"
                            data-tooltip-content={formatActivityLabel(e.actionVerb, e.targetLabel, e.targetType, e.meta)}
                            className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-800"
                          >
                            <TruncatedActivity
                              value={formatActivityLabel(e.actionVerb, e.targetLabel, e.targetType, e.meta)}
                              maxChars={36}
                              showTitle={false}
                            />
                          </span>
                        ) : (
                          <span className="text-gray-400 dark:text-gray-600 text-xs italic">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 whitespace-nowrap">
                          {FEATURE_LABEL[e.feature] || e.featureLabel || e.feature}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        <div className="flex flex-col gap-0.5">
                          <span>{fmtRelative(e.timestamp)}</span>
                          <span className="text-[10px] text-gray-400 dark:text-gray-600 tabular-nums">
                            {new Date(e.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} · {new Date(e.timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination footer — inside the card as the card's bottom section */}
            <PaginationBar
              page={total === 0 ? 0 : page}
              total={total}
              limit={perPage}
              onPage={setPage}
              onLimitChange={setPerPage}
            />
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

// ─── Filter chip ──────────────────────────────────────────────────────────
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
