'use client'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Link from 'next/link'
import { Check, ClipboardList, Clock, Gem, Inbox, Megaphone, Palmtree, Target, Users } from 'lucide-react'
import api from '@/lib/api'
import PendingInvitationsBanner from '@/components/dashboard/PendingInvitationsBanner'

export default function DashboardPage() {
  const { t, i18n } = useTranslation()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState('')
  const user = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('user') || '{}') : {}

  useEffect(() => {
    api.get('/dashboard').then(setData).catch(console.error).finally(() => setLoading(false))
  }, [])

  // Locale-aware date format
  const localeMap: Record<string, string> = {
    en: 'en-US',
    hi: 'hi-IN',
    gu: 'gu-IN',
    mr: 'mr-IN',
    ur: 'ur-PK',
    es: 'es-ES',
    zh: 'zh-CN',
  }

  useEffect(() => {
    const update = () => {
      const d = new Date()
      const loc = i18n.language?.split('-')[0] || 'en'
      const dateLocale = localeMap[loc] || 'en-US'
      try {
        setNow(d.toLocaleDateString(dateLocale, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }))
      } catch {
        setNow(d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }))
      }
    }
    update()
    const t = setInterval(update, 60000)
    return () => clearInterval(t)
  }, [i18n.language])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-gray-500 text-sm">{t('dashboard.loading')}</p>
        </div>
      </div>
    )
  }
  if (!data) return null

  const { pendingApprovals = [], myTasks = [], leaveBalances = [], myProjects = [], announcements = [], hrStats = {} } = data
  const greeting = (() => {
    const h = new Date().getHours()
    if (h < 12) return t('dashboard.goodMorning')
    if (h < 17) return t('dashboard.goodAfternoon')
    return t('dashboard.goodEvening')
  })()

  // Translate priority tags in task list
  const priorityKey = (p: string) => {
    const k = `dashboard.priority.${p}` as unknown as string
    // Fall back to the raw word if a translation missing
    return p
  }

  const stats = [
    { key: 'myTasks', label: t('dashboard.myTasks'), icon: Check, value: myTasks.length },
    { key: 'myProjects', label: t('dashboard.myProjects'), icon: Gem, value: myProjects.length },
    { key: 'pendingApprovals', label: t('dashboard.pendingApprovals'), icon: Clock, value: pendingApprovals.length },
    ...(hrStats.totalEmployees !== undefined ? [
      { key: 'totalEmployees', label: t('dashboard.totalEmployees'), icon: Users, value: hrStats.totalEmployees },
      { key: 'pendingLeaveRequests', label: t('dashboard.pendingLeaves'), icon: Palmtree, value: hrStats.pendingLeaveRequests },
    ] : []),
  ]

  // Use the current locale for leave-request date ranges
  const loc = i18n.language?.split('-')[0] || 'en'
  const dateLocale = localeMap[loc] || 'en-US'
  const fmt = (d: string) => {
    try { return new Date(d).toLocaleDateString(dateLocale) } catch { return d }
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Pending project invitations banner — shown to manually registered users */}
      <PendingInvitationsBanner />

      {/* Welcome Banner with vibrant gradient */}
      <div className="flex flex-wrap justify-end items-center gap-3">
        <Link href="/tasks" className="px-4 py-2.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 rounded-xl text-sm font-bold transition no-underline inline-flex items-center gap-1.5">
              <ClipboardList size={14} strokeWidth={2.25} /> {t('dashboard.viewTasks')}
            </Link>
        <Link href="/announcements" className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition shadow hover:shadow-lg no-underline inline-flex items-center gap-1.5">
              <Megaphone size={14} strokeWidth={2.25} /> {t('dashboard.announcements')}
            </Link>
      </div>

      {/* Stat Cards (Indigo Calm) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4">
        {stats.map((stat, i) => (
          <div
            key={stat.key}
            className={`rounded-xl p-4 sm:p-5 bg-white border border-gray-200 hover:border-indigo-300 hover:shadow-sm transition hover-lift animate-fade-in-up`}
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center mb-3`}>
              <stat.icon size={20} strokeWidth={2.25} />
            </div>
            <div className="text-xs sm:text-sm font-semibold text-gray-500 mb-1">{stat.label}</div>
            <div className="text-2xl sm:text-3xl font-bold text-indigo-600 leading-none">
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* My Tasks */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden animate-fade-in-up" style={{ animationDelay: '200ms' }}>
          <div className="border-b border-gray-200 px-5 py-4 flex justify-between items-center">
            <div className="flex items-center gap-2 text-gray-900">
              <Check size={20} strokeWidth={2.5} />
              <h3 className="font-bold">{t('dashboard.myTasks')}</h3>
            </div>
            <Link href="/tasks" className="text-xs font-medium text-indigo-600 hover:text-indigo-800 no-underline">{t('common.viewAll')} →
            </Link>
          </div>
          <div className="divide-y divide-gray-100">
            {myTasks.length === 0 ? (
              <div className="p-8 text-center">
                <Target size={36} strokeWidth={1.75} className="text-gray-300 mx-auto mb-2" />
                <p className="text-gray-400 text-sm">{t('dashboard.noPendingTasks')}</p>
              </div>
            ) : (
              myTasks.slice(0, 5).map((task: any) => (
                <div key={task.id} className="px-5 py-3.5 row-hover">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm text-gray-800 truncate">{task.description}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{task.project_name} • {task.list_name}</div>
                    </div>
                    <span className={`shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${
                      task.priority === 'urgent' ? 'bg-red-50 text-red-700 border border-red-200' :
                      task.priority === 'high' ? 'bg-gray-50 text-amber-700 border border-amber-200' :
                      task.priority === 'medium' ? 'bg-gray-50 text-sky-700 border border-sky-200' : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                    }`}>
                      {priorityKey(task.priority)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Leave Balances */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden animate-fade-in-up" style={{ animationDelay: '250ms' }}>
          <div className="border-b border-gray-200 px-5 py-4 flex justify-between items-center">
            <div className="flex items-center gap-2 text-gray-900">
              <Palmtree size={20} strokeWidth={2.25} />
              <h3 className="font-bold">{t('dashboard.leaveBalances')}</h3>
            </div>
            <Link href="/leaves" className="text-xs font-bold text-white bg-white/20 hover:bg-white/30 backdrop-blur-sm px-3 py-1 rounded-full transition no-underline">
              {t('dashboard.applyLeave')} →
            </Link>
          </div>
          <div className="p-4 space-y-3">
            {leaveBalances.slice(0, 4).map((b: any) => {
              const pct = Math.min(100, (parseFloat(b.current_balance) / b.max_allowed) * 100)
              return (
                <div key={b.id}>
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="font-semibold text-sm text-gray-700">{b.leave_type_name}</span>
                    <span className="text-sm font-bold text-emerald-600">{b.current_balance} <span className="text-gray-400 font-normal">/ {b.max_allowed}</span></span>
                  </div>
                  <div className="bg-gray-50 rounded-full h-2.5 overflow-hidden">
                    <div className="bg-indigo-600 hover:bg-indigo-700 h-full rounded-full transition-all" style={{ width: `${pct}%` }}></div>
                  </div>
                </div>
              )
            })}
            {leaveBalances.length === 0 && (
              <div className="p-4 text-center text-gray-400 text-sm">{t('dashboard.noLeaveBalances')}</div>
            )}
          </div>
        </div>

        {/* Pending Approvals */}
        {pendingApprovals.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden animate-fade-in-up" style={{ animationDelay: '300ms' }}>
            <div className="border-b border-gray-200 px-5 py-4 flex justify-between items-center">
              <div className="flex items-center gap-2 text-gray-900">
                <Clock size={20} strokeWidth={2.25} />
                <h3 className="font-bold">{t('dashboard.pendingApprovals')}</h3>
                <span className="bg-white/30 backdrop-blur-sm px-2 py-0.5 rounded-full text-xs font-bold">{pendingApprovals.length}</span>
              </div>
              <Link href="/leaves" className="text-xs font-bold text-white bg-white/20 hover:bg-white/30 backdrop-blur-sm px-3 py-1 rounded-full transition no-underline">
                {t('dashboard.review')} →
              </Link>
            </div>
            <div className="divide-y divide-gray-100">
              {pendingApprovals.slice(0, 5).map((lr: any) => (
                <div key={lr.id} className="px-5 py-3.5 hover:bg-gray-50 transition">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center text-xs font-bold shrink-0">
                      {lr.first_name?.[0]}{lr.last_name?.[0]}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm text-gray-800">{lr.first_name} {lr.last_name}</div>
                      <div className="text-xs text-gray-500">{lr.leave_type} • {fmt(lr.start_date)} - {fmt(lr.end_date)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Announcements */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden animate-fade-in-up" style={{ animationDelay: '350ms' }}>
          <div className="border-b border-gray-200 px-5 py-4 flex justify-between items-center">
            <div className="flex items-center gap-2 text-gray-900">
              <Megaphone size={20} strokeWidth={2.25} />
              <h3 className="font-bold">{t('dashboard.announcements')}</h3>
            </div>
            <Link href="/announcements" className="text-xs font-medium text-indigo-600 hover:text-indigo-800 no-underline">{t('common.viewAll')} →
            </Link>
          </div>
          <div className="divide-y divide-gray-100">
            {announcements.length === 0 ? (
              <div className="p-8 text-center">
                <Inbox size={32} strokeWidth={1.75} className="text-gray-300 mx-auto mb-2" />
                <p className="text-gray-400 text-sm">{t('dashboard.noAnnouncements')}</p>
              </div>
            ) : (
              announcements.slice(0, 3).map((a: any) => (
                <div key={a.id} className="px-5 py-3.5 row-hover">
                  <div className="font-bold text-sm text-gray-800 mb-1">{a.title}</div>
                  <div className="text-xs text-gray-500 line-clamp-2">{a.content.substring(0, 100)}{a.content.length > 100 ? '...' : ''}</div>
                  <div className="text-[10px] text-gray-400 mt-1">{t('dashboard.by')} {a.first_name} {a.last_name}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
