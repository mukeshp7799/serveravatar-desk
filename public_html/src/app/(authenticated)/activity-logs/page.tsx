'use client'
import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { Activity, RefreshCw, Search, X } from 'lucide-react'
import api from '@/lib/api'
import PaginationBar from '@/components/project/PaginationBar'
import { ScrollFade } from '@/components/ui/scroll-fade'

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const secs  = Math.floor(diff / 1000)
  const mins  = Math.floor(secs / 60)
  const hours = Math.floor(mins / 60)
  const days  = Math.floor(hours / 24)
  if (days  > 0) return `${days}d ago`
  if (hours > 0) return `${hours}h ago`
  if (mins  > 0) return `${mins}m ago`
  return 'Just now'
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

const MODULE_COLORS: Record<string, string> = {
  Auth:              'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
  Employee:          'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  Attendance:        'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300',
  Leave:             'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  Calendar:          'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  Announcement:      'bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300',
  CompanySettings:   'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
  Role:              'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300',
  Permission:        'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300',
  Project:           'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
}

const ACTION_BADGE: Record<string, string> = {
  Login:         'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  Logout:        'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  Created:       'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  Updated:       'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  Deleted:       'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300',
  Approved:      'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  Rejected:      'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  Archived:       'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  Restored:      'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300',
  Clocked_In:    'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300',
  Clocked_Out:   'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300',
  Applied:       'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  Permissions_Updated: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
}

function getBadgeClass(module: string, action: string): string {
  return MODULE_COLORS[module] || 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300'
}

function getActionBadgeClass(action: string): string {
  return ACTION_BADGE[action] || 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface ActivityLog {
  id: number
  user_id: number
  module: string
  action: string
  description: string
  ip_address: string | null
  previous_value: any | null
  new_value: any | null
  created_at: string
  first_name: string
  last_name: string
  email: string
  role_name: string
}

interface FilterState {
  user_search: string
  module: string
  action: string
  date_from: string
  date_to: string
}

// ── Page Component ─────────────────────────────────────────────────────────────

export default function ActivityLogsPage() {
  const { t } = useTranslation()

  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [logs, setLogs] = useState<ActivityLog[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [totalPages, setTotalPages] = useState(1)
  const [modules, setModules] = useState<string[]>([])
  const [actions, setActions] = useState<string[]>([])

  const [filters, setFilters] = useState<FilterState>({
    user_search: '',
    module: '',
    action: '',
    date_from: '',
    date_to: '',
  })

  // 'my' = own activity only, 'all' = all users (admin/HR)
  const [viewMode, setViewMode] = useState<'my' | 'all'>('my')

  const hasViewAll = user?.permissions?.includes('activity_logs.view_all')
  const hasViewOwn = user?.permissions?.includes('activity_logs.view_own')
  const canView    = hasViewAll || hasViewOwn

  // Load user from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('user')
      if (stored) setUser(JSON.parse(stored))
    } catch {}
  }, [])

  // Load filter helper lists (modules + actions)
  useEffect(() => {
    if (!canView) return
    api.get('/activity-logs/modules')
      .then((res: any) => setModules(res.modules || []))
      .catch(() => {})
    api.get('/activity-logs/actions')
      .then((res: any) => setActions(res.actions || []))
      .catch(() => {})
  }, [hasViewAll])

  const fetchLogs = useCallback(async () => {
    if (!canView) return
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('limit', String(limit))

      if (hasViewAll) {
        // Admin/HR: decide based on viewMode tab
        if (viewMode === 'my') {
          params.set('filter_user_id', String(user?.id))
        } else {
          // viewMode='all': show everyone, allow user search
          if (filters.user_search) params.set('user_search', filters.user_search)
        }
      }
      // else: non-admin users (hasViewOwn only) — API uses auth token to get own user_id

      // Filters apply to everyone who can view
      if (filters.module)    params.set('module', filters.module)
      if (filters.action)    params.set('action', filters.action)
      if (filters.date_from) params.set('date_from', filters.date_from)
      if (filters.date_to)   params.set('date_to', filters.date_to)

      const res = await api.get(`/activity-logs?${params}`)
      setLogs(res.data || [])
      setTotal(res.pagination?.total ?? 0)
      setTotalPages(res.pagination?.totalPages ?? 1)
    } catch (err: any) {
      toast.error(err.message || t('common.errorLoading'))
    } finally {
      setLoading(false)
    }
  }, [page, limit, filters, hasViewAll, canView, viewMode, user, t])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  const handleFilterChange = (key: keyof FilterState, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }))
    setPage(1)
  }

  const clearFilters = () => {
    setFilters({ user_search: '', module: '', action: '', date_from: '', date_to: '' });
    setViewMode('my')
    setPage(1)
  }

  const hasActiveFilters = filters.module || filters.action || filters.date_from || filters.date_to || (hasViewAll && filters.user_search)

  // ── Render ──────────────────────────────────────────────────────────────────

  if (!user) return null

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <Activity size={48} className="text-gray-300 dark:text-gray-600" />
        <p className="text-gray-500 dark:text-gray-400 text-center">
          You do not have permission to view activity logs.
        </p>
      </div>
    )
  }

  return (
    <div className="">
      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap px-1 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shadow-sm">
            <Activity size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Activity Logs</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">View and filter user activity across the system.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">

          <button
            onClick={fetchLogs}
            className="w-9 h-9 flex items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition cursor-pointer dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700"
            title="Refresh"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ── View Mode Tabs (admin only) ────────────────────────────────────── */}
      {hasViewAll && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl mb-4 border border-gray-200 dark:border-gray-700 p-1.5 w-full flex gap-1">
          <button
            onClick={() => { setViewMode('my'); setPage(1); }}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition cursor-pointer ${
              viewMode === 'my'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            My Activity
          </button>
          <button
            onClick={() => { setViewMode('all'); setPage(1); }}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition cursor-pointer ${
              viewMode === 'all'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            All Activity
          </button>
        </div>
      )}

      {/* ── Filter Panel — visible to all who can view ─────────────────────────── */}
      {canView && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border mb-4 border-gray-200 dark:border-gray-700 px-5 py-4">
          <div className="flex flex-wrap gap-3 items-center w-full">
            {/* Group 1: User Search — only shown in 'all' viewMode (admin only) */}
            {hasViewAll && viewMode === 'all' && (
              <>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400 shrink-0">Search</span>
                  <div className="relative">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    <input
                      type="text"
                      value={filters.user_search}
                      onChange={e => handleFilterChange('user_search', e.target.value)}
                      placeholder="Name or email..."
                      className="h-9 pl-8 pr-7 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-44"
                    />
                    {filters.user_search && (
                      <button
                        onClick={() => handleFilterChange('user_search', '')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </div>

                <div className="h-5 w-px bg-gray-200 dark:bg-gray-700 hidden sm:block" />
              </>
            )}

            {/* Group 2: Module */}
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 shrink-0">Module</span>
              <select
                value={filters.module}
                onChange={e => handleFilterChange('module', e.target.value)}
                className="h-9 pl-3 pr-8 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer appearance-none"
              >
                <option value="">All</option>
                {modules.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            {/* Group 3: Action */}
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 shrink-0">Action</span>
              <select
                value={filters.action}
                onChange={e => handleFilterChange('action', e.target.value)}
                className="h-9 pl-3 pr-8 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer appearance-none"
              >
                <option value="">All</option>
                {actions.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>

            <div className="h-5 w-px bg-gray-200 dark:bg-gray-700 hidden sm:block" />

            {/* Group 4: Date range */}
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 shrink-0">From</span>
              <input
                type="date"
                value={filters.date_from}
                onChange={e => handleFilterChange('date_from', e.target.value)}
                className="h-9 px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 shrink-0">To</span>
              <input
                type="date"
                value={filters.date_to}
                onChange={e => handleFilterChange('date_to', e.target.value)}
                className="h-9 px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Divider + Clear */}
            {hasActiveFilters && (
              <>
                <div className="h-5 w-px bg-gray-200 dark:bg-gray-700 hidden sm:block" />
                <button
                  onClick={clearFilters}
                  className="h-9 px-3 rounded-lg text-xs font-medium text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition cursor-pointer border border-rose-200 dark:border-rose-800 bg-transparent"
                >
                  Clear
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Logs Table ────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 rounded-t-2xl border border-gray-200 dark:border-gray-700">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <RefreshCw size={24} className="animate-spin text-gray-400" />
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <Activity size={40} className="text-gray-300 dark:text-gray-600" />
            <p className="text-gray-500 dark:text-gray-400 text-sm">No activity logs found</p>
          </div>
        ) : (
          <ScrollFade fadeEdge={false} className="relative">
            <table className="min-w-max w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-800/60">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">User</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Module</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Action</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Description</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">IP Address</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {logs.map(log => (
                  <tr key={log.id} className="hover:bg-gray-50/70 dark:hover:bg-gray-700/30 transition-colors">
                    {/* User */}
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 flex items-center justify-center text-xs font-bold shrink-0">
                          {log.first_name?.[0]}{log.last_name?.[0]}
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-gray-900 dark:text-white truncate max-w-[120px]">
                            {log.first_name} {log.last_name}
                          </div>
                          <div className="text-xs text-gray-400 truncate max-w-[120px]">{log.role_name}</div>
                        </div>
                      </div>
                    </td>
                    {/* Module */}
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold ${getBadgeClass(log.module, log.action)}`}>
                        {log.module}
                      </span>
                    </td>
                    {/* Action */}
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold ${getActionBadgeClass(log.action)}`}>
                        {log.action}
                      </span>
                    </td>
                    {/* Description */}
                    <td className="px-5 py-3 max-w-[300px]">
                      <div
                        className="text-gray-700 dark:text-gray-300 text-sm truncate whitespace-nowrap"
                        data-tooltip-id="app-tooltip"
                        data-tooltip-content={log.description}
                      >
                        {log.description}
                      </div>
                    </td>
                    {/* IP */}
                    <td className="px-5 py-3">
                      <span className="text-gray-400 dark:text-gray-500 font-mono text-xs">
                        {log.ip_address || <span className="italic opacity-50">—</span>}
                      </span>
                    </td>
                    {/* When */}
                    <td className="px-5 py-3 whitespace-nowrap">
                      <div className="text-gray-500 dark:text-gray-400 text-xs" title={formatDateTime(log.created_at)}>
                        {timeAgo(log.created_at)}
                      </div>
                      <div className="text-gray-400 dark:text-gray-600 text-[10px]">
                        {formatDateTime(log.created_at)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollFade>
        )}
      </div>

      {/* ── Pagination ────────────────────────────────────────────────────── */}
      <div className="border-t  shadow border-gray-100 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-800 rounded-b-2xl -mt-px">
        {totalPages > 1 && (
          <PaginationBar
            page={page}
            total={total}
            limit={limit}
            onPage={p => setPage(p)}
            onLimitChange={l => { setLimit(l); setPage(1); fetchLogs() }}
            pageSizeOptions={[10, 20, 30, 50]}
          />
        )}
      </div>
    </div>
  )
}
