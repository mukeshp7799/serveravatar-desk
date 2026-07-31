'use client'
import PageLoader from '@/components/PageLoader'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import api from '@/lib/api'

const TYPE_META: Record<string, { icon: string; bg: string; key: string }> = {
  task_assigned:       { icon: '📌', bg: 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300', key: 'emailLogsPage.typeTaskAssigned' },
  leave_request:       { icon: '📋', bg: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',     key: 'emailLogsPage.typeLeaveRequest' },
  leave_approved:      { icon: '✅', bg: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300', key: 'emailLogsPage.typeLeaveApproved' },
  leave_rejected:      { icon: '❌', bg: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300',                 key: 'emailLogsPage.typeLeaveRejected' },
  leave_cancelled:     { icon: '🚫', bg: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300',                key: 'emailLogsPage.typeLeaveCancelled' },
}

function fmtDate(raw: string | null | undefined): string {
  if (!raw) return ''
  const d = new Date(raw)
  if (isNaN(d.getTime())) return raw
  return d.toLocaleString()
}

export default function EmailLogsPage() {
  const { t } = useTranslation()
  const [logs, setLogs] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [bodyCache, setBodyCache] = useState<Record<number, string>>({})
  const [bodyLoading, setBodyLoading] = useState<number | null>(null)
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('user')
      if (stored) setUser(JSON.parse(stored))
    }
  }, [])

  useEffect(() => { loadLogs() }, [typeFilter])

  const loadLogs = () => {
    setLoading(true)
    const qs = typeFilter ? `?type=${typeFilter}&limit=100` : '?limit=100'
    api.get(`/email-logs${qs}`).then(res => {
      setLogs(res.logs || [])
      setTotal(res.total || 0)
    }).catch((err: any) => {
      toast.error(err?.message || t('common.failedToLoad'))
      setLogs([])
    }).finally(() => setLoading(false))
  }

  const loadBody = async (id: number) => {
    if (bodyCache[id] !== undefined) return
    setBodyLoading(id)
    try {
      const res = await api.get(`/email-logs/${id}`)
      setBodyCache(prev => ({ ...prev, [id]: res.log?.body || '' }))
    } catch (err: any) {
      setBodyCache(prev => ({ ...prev, [id]: '' }))
    } finally {
      setBodyLoading(null)
    }
  }

  const toggleBody = (id: number) => {
    if (expandedId === id) {
      setExpandedId(null)
    } else {
      setExpandedId(id)
      loadBody(id)
    }
  }

  if (loading && logs.length === 0) return <PageLoader />

  const isHRAdmin = user?.roleName === 'HR Admin' || user?.roleName === 'System Admin'

  return (
    <div className="space-y-5 animate-fade-in-up">
      {/* Banner */}
      <div className="rounded-xl border-2 border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/30 p-4 flex flex-wrap items-center gap-3">
        <div className="text-2xl">✉️</div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-indigo-900 dark:text-indigo-200">{t('emailLogsPage.title')}</div>
          <div className="text-xs text-indigo-700 dark:text-indigo-300 mt-0.5">{t('emailLogsPage.etherealBanner')}</div>
        </div>
        <a
          href="https://ethereal.email/login"
          target="_blank"
          rel="noreferrer"
          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white no-underline transition shadow-sm"
        >
          {t('emailLogsPage.openEtherealLogin')} ↗
        </a>
      </div>

      {/* Page header */}
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('emailLogsPage.title')}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{t('emailLogsPage.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">{t('emailLogsPage.filterAll')}</option>
            <option value="task_assigned">{t('emailLogsPage.typeTaskAssigned')}</option>
            <option value="leave_request">{t('emailLogsPage.typeLeaveRequest')}</option>
            <option value="leave_approved">{t('emailLogsPage.typeLeaveApproved')}</option>
            <option value="leave_rejected">{t('emailLogsPage.typeLeaveRejected')}</option>
            <option value="leave_cancelled">{t('emailLogsPage.typeLeaveCancelled')}</option>
          </select>
          <button
            onClick={loadLogs}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition shadow-sm cursor-pointer border-none flex items-center gap-1.5"
          >
            <span>↻</span> {t('common.refresh')}
          </button>
        </div>
      </div>

      {/* Count */}
      <div className="text-xs text-gray-500 dark:text-gray-400">{total} {total === 1 ? 'email' : 'emails'}</div>

      {/* List */}
      {logs.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-10 text-center">
          <div className="text-5xl mb-3">📭</div>
          <div className="text-sm text-gray-500 dark:text-gray-400">{t('emailLogsPage.empty')}</div>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {logs.map((log) => {
              const meta = TYPE_META[log.type] || TYPE_META.task_assigned
              const isFailed = log.status === 'failed'
              const isExpanded = expandedId === log.id
              return (
                <div key={log.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">
                  <div className="flex flex-wrap items-start gap-3">
                    {/* Icon */}
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0 ${meta.bg}`}>
                      {meta.icon}
                    </div>

                    {/* Body */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${meta.bg}`}>
                          {t(meta.key)}
                        </span>
                        {isFailed ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300">
                            {t('emailLogsPage.statusFailed')}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
                            {t('emailLogsPage.statusSent')}
                          </span>
                        )}
                      </div>
                      <div className="mt-1.5 text-sm font-semibold text-gray-900 dark:text-white truncate">
                        {log.subject}
                      </div>
                      <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 flex flex-wrap gap-x-3 gap-y-0.5">
                        <span>→ <span className="font-medium text-gray-700 dark:text-gray-300">{log.recipient_name || log.recipient_email}</span></span>
                        <span className="text-gray-400">·</span>
                        <span>{log.recipient_email}</span>
                        <span className="text-gray-400">·</span>
                        <span>{fmtDate(log.sent_at)}</span>
                      </div>
                      {isFailed && log.error && (
                        <div className="mt-1 text-xs text-red-600 dark:text-red-400">⚠ {log.error}</div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      {log.preview_url && (
                        <a
                          href={log.preview_url}
                          target="_blank"
                          rel="noreferrer"
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white no-underline transition shadow-sm flex items-center gap-1"
                        >
                          {t('emailLogsPage.viewOnEthereal')} ↗
                        </a>
                      )}
                      <button
                        onClick={() => toggleBody(log.id)}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 transition cursor-pointer border-none"
                      >
                        {isExpanded ? t('emailLogsPage.hideBody') : t('emailLogsPage.viewBody')}
                      </button>
                    </div>
                  </div>

                  {/* Expanded body */}
                  {isExpanded && (
                    <div className="mt-3 ml-13">
                      {bodyLoading === log.id ? (
                        <div className="text-xs text-gray-500 dark:text-gray-400 py-3">{t('emailLogsPage.loading')}</div>
                      ) : bodyCache[log.id] ? (
                        <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden bg-white">
                          <iframe
                            srcDoc={bodyCache[log.id]}
                            title={`Email body ${log.id}`}
                            className="w-full bg-white"
                            style={{ height: '480px', border: 'none' }}
                            sandbox=""
                          />
                        </div>
                      ) : (
                        <div className="text-xs text-gray-400 py-3">—</div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {!isHRAdmin && (
        <div className="text-xs text-amber-600 dark:text-amber-400 text-center">
          ℹ {t('emailLogsPage.subtitle')}
        </div>
      )}
    </div>
  )
}
