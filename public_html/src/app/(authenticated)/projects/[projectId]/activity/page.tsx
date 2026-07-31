'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import FeaturePage from '@/components/project/FeaturePage'
import EmptyState from '@/components/project/EmptyState'
import { fmtRelative } from '@/components/project/format'
import { useActivities } from '@/lib/project-activities-api'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Loader2, RefreshCcw, User as UserIcon, MessageSquare, CheckCircle2 } from 'lucide-react'

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

  const [featureFilter] = useState<string | undefined>(undefined)
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

  const atFirst = page <= 1
  const atLast = page >= totalPages

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
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3 mb-2">
          <div>
            <h2 className="text-2xl font-serif font-bold text-gray-900 dark:text-white">Activity</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {total === 0 ? 'No activity yet' : `${total} events`}
              {(isPaginating || isRefreshing) && (
                <span className="ml-2 text-amber-500">Refreshing…</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Filter By User */}
            <div className="inline-flex items-center h-9 px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm">
              <UserIcon size={13} className="text-gray-400 mr-2 shrink-0" />
              <select
                value={actorFilter ?? ''}
                onChange={(e) => {
                  const v = e.target.value
                  setActorFilter(v ? Number(v) : undefined)
                }}
                className="bg-transparent text-xs font-medium text-gray-700 dark:text-gray-200 focus:outline-none cursor-pointer pr-2"
                aria-label="Filter by user"
              >
                <option value="">All users</option>
                {actors.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
            {/* Refresh */}
            <button
              type="button"
              onClick={() => refresh()}
              className="inline-flex items-center justify-center h-9 w-9 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-800 transition shadow-sm"
            >
              <RefreshCcw size={14} className={isRefreshing ? 'animate-spin text-amber-500' : ''} />
            </button>
          </div>
        </div>

        {/* Body */}
        {loading && items.length === 0 ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm p-5 h-24 animate-pulse" />
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
          <div className="space-y-5">
            {Object.entries(groups).map(([day, events]) => (
              <div key={day}>
                {/* Day header */}
                <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 mb-3 pl-1">
                  {new Date(events[0].timestamp).toLocaleDateString(undefined, {
                    weekday: 'long',
                    month: 'short',
                    day: 'numeric',
                  })}
                </h3>
                <div className="space-y-3">
                  {events.map((e) => (
                    <div
                      key={e.id}
                      className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm px-5 py-4 flex items-start gap-4 hover:shadow-md transition-shadow"
                    >
                      {/* Icon badge */}
                      <div className="shrink-0 mt-0.5">
                        {e.actionVerb?.toLowerCase().includes('complet') || e.action?.toLowerCase().includes('complet') ? (
                          <div className="w-9 h-9 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                            <CheckCircle2 size={16} className="text-amber-600 dark:text-amber-400" />
                          </div>
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-stone-100 dark:bg-stone-800 flex items-center justify-center">
                            <MessageSquare size={16} className="text-stone-500 dark:text-stone-400" />
                          </div>
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        {/* Header row: project label + author */}
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-xs font-bold text-amber-700 dark:text-amber-400 underline underline-offset-2 decoration-amber-400 dark:decoration-amber-600 decoration-1">
                            {e.targetLabel || 'Project'}
                          </span>
                          <span className="text-gray-300 dark:text-gray-600 text-xs">·</span>
                          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                            {e.actor}
                          </span>
                        </div>

                        {/* Title */}
                        <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 leading-snug mb-1">
                          {e.actionVerb || e.action}
                        </p>

                        {/* Description / subtext */}
                        {e.targetLabel && (
                          <p className="text-xs text-gray-400 dark:text-gray-500">
                            in {FEATURE_LABEL[e.feature] || e.featureLabel}
                          </p>
                        )}
                      </div>

                      {/* Timestamp */}
                      <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0 mt-1">
                        {fmtRelative(e.timestamp)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {total > 0 && (
          <div className="flex items-center justify-between gap-3 mt-6 pt-2">
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Page {page} of {Math.max(1, totalPages)} · {total} total
            </div>
            <div className="flex items-center gap-1">
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
              <span className="px-3 text-xs font-medium text-gray-600 dark:text-gray-300">
                {page} / {Math.max(1, totalPages)}
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
          <div className="text-center text-xs text-amber-600 dark:text-amber-400 mt-2">
            Couldn&apos;t refresh. <button onClick={() => refresh()} className="underline font-medium">Retry</button>
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
      className="p-1.5 rounded-md text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition disabled:opacity-30 disabled:cursor-not-allowed"
    >
      {icon}
    </button>
  )
}
