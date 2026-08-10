'use client'
import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { Activity, ChevronLeft, ChevronRight, Filter, RefreshCw, Search, User, X } from 'lucide-react'
import api from '@/lib/api'

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
  filter_user_id: string
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
  const [limit] = useState(20)
  const [totalPages, setTotalPages] = useState(1)
const [employees, setEmployees] = useState<any[]>([])
  const [modules, setModules] = useState<string[]>([])
  const [actions, setActions] = useState<string[]>([])

  const [filters, setFilters] = useState<FilterState>({
    filter_user_id: '',
    module: '',
    action: '',
    date_from: '',
    date_to: '',
  })

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

  // Load employees for filter dropdown (needs view_all)
  useEffect(() => {
    if (!hasViewAll) return
    api.get('/employees?limit=100')
      .then((res: any) => setEmployees(res.employees || []))
      .catch(() => {})
  }, [hasViewAll])

  // Load filter helper lists (modules + actions)
  useEffect(() => {
    if (!hasViewAll) return
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
        if (filters.filter_user_id) params.set('filter_user_id', filters.filter_user_id)
        if (filters.module)         params.set('module', filters.module)
        if (filters.action)         params.set('action', filters.action)
        if (filters.date_from)      params.set('date_from', filters.date_from)
        if (filters.date_to)        params.set('date_to', filters.date_to)
      }
      const res = await api.get(`/activity-logs?${params}`)
      setLogs(res.data || [])
      setTotal(res.pagination?.total ?? 0)
      setTotalPages(res.pagination?.totalPages ?? 1)
    } catch (err: any) {
      toast.error(err.message || t('common.errorLoading'))
    } finally {
      setLoading(false)
    }
  }, [page, limit, filters, hasViewAll, canView, t])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  const handleFilterChange = (key: keyof FilterState, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }))
    setPage(1)
  }

  const clearFilters = () => {
    setFilters({ filter_user_id: '', module: '', action: '', date_from: '', date_to: '' })
    setPage(1)
  }

  const hasActiveFilters = filters.module || filters.action || filters.date_from || filters.date_to || (hasViewAll && filters.filter_user_id)

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
    <div className="space-y-5">
      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-indigo-600 flex items-center justify-center shadow">
            <Activity size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Activity Logs</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {total > 0 ? `${total.toLocaleString()} total record${total !== 1 ? 's' : ''}` : 'Audit trail'}
            </p>
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

      {/* ── Filter Panel — always visible ───────────────────────────────── */}
      {hasViewAll && (
        <div className="rounded-2xl border border-gray-200 bg-white dark:bg-gray-900 dark:border-gray-700 shadow-sm p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Filter Activities</h3>
            {hasActiveFilters && (
              <button onClick={clearFilters} className="flex items-center gap-1 text-xs text-rose-600 hover:text-rose-700 font-medium cursor-pointer bg-transparent border-none">
                <X size={12} /> Clear all
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* User filter */}
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">User</label>
              <select
                value={filters.filter_user_id}
                onChange={e => handleFilterChange('filter_user_id', e.target.value)}
                className="w-full h-9 px-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">All Users</option>
                {employees.map((emp: any) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.first_name} {emp.last_name}
                  </option>
                ))}
              </select>
            </div>

            {/* Module filter */}
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Module</label>
              <select
                value={filters.module}
                onChange={e => handleFilterChange('module', e.target.value)}
                className="w-full h-9 px-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">All Modules</option>
                {modules.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            {/* Action filter */}
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Action</label>
              <select
                value={filters.action}
                onChange={e => handleFilterChange('action', e.target.value)}
                className="w-full h-9 px-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">All Actions</option>
                {actions.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>

            {/* Date range */}
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">From</label>
              <input
                type="date"
                value={filters.date_from}
                onChange={e => handleFilterChange('date_from', e.target.value)}
                className="w-full h-9 px-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">To</label>
              <input
                type="date"
                value={filters.date_to}
                onChange={e => handleFilterChange('date_to', e.target.value)}
                className="w-full h-9 px-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Scope badge for view_own users ─────────────────────────────────── */}
      {!hasViewAll && hasViewOwn && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-800 px-4 py-2.5 flex items-center gap-2 text-sm text-blue-700 dark:text-blue-300">
          <User size={14} />
          Showing only your own activity logs.
          <span className="ml-auto text-xs opacity-70">Request <strong>activity_logs.view_all</strong> permission to view all users.</span>
        </div>
      )}

      {/* ── Logs Table ────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
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
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-800/60">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">User</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Module</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Action</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-full">Description</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">IP Address</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                {logs.map(log => (
                  <tr key={log.id} className="hover:bg-gray-50/70 dark:hover:bg-gray-800/50 transition">
                    {/* User */}
                    <td className="px-4 py-3">
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
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-semibold ${getBadgeClass(log.module, log.action)}`}>
                        {log.module}
                      </span>
                    </td>
                    {/* Action */}
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-semibold ${getActionBadgeClass(log.action)}`}>
                        {log.action}
                      </span>
                    </td>
                    {/* Description */}
                    <td className="px-4 py-3">
                      <span className="text-gray-700 dark:text-gray-300 leading-relaxed">{log.description}</span>
                    </td>
                    {/* IP */}
                    <td className="px-4 py-3">
                      <span className="text-gray-400 dark:text-gray-500 font-mono text-xs">
                        {log.ip_address || <span className="italic opacity-50">—</span>}
                      </span>
                    </td>
                    {/* When */}
                    <td className="px-4 py-3 whitespace-nowrap">
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
          </div>
        )}
      </div>

      {/* ── Pagination ────────────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Showing page {page} of {totalPages} ({total.toLocaleString()} total)
          </p>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="w-9 h-9 flex items-center justify-center rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
            >
              <ChevronLeft size={16} />
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum: number
              if (totalPages <= 5) {
                pageNum = i + 1
              } else if (page <= 3) {
                pageNum = i + 1
              } else if (page >= totalPages - 2) {
                pageNum = totalPages - 4 + i
              } else {
                pageNum = page - 2 + i
              }
              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  className={`w-9 h-9 flex items-center justify-center rounded-xl text-sm font-medium transition cursor-pointer ${
                    page === pageNum
                      ? 'bg-indigo-600 text-white shadow'
                      : 'border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  {pageNum}
                </button>
              )
            })}
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="w-9 h-9 flex items-center justify-center rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
