'use client'
import PageLoader from '@/components/PageLoader'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import {
  Bell, BellOff, Check, CheckCircle2, FileText, ListChecks,
  Megaphone, MessageSquare, XCircle, Building, Mail, Clock,
  CheckCircle, XCircle as XCircleIcon, AlertTriangle, AtSign
} from 'lucide-react'
import api from '@/lib/api'
import { acceptInvitation, declineInvitation } from '@/lib/invitations-api'

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}

type NotificationItem = {
  id: string
  type: string
  title: string
  message: string
  link?: string
  is_read: boolean
  created_at: string
  // Invitation fields
  is_invitation?: boolean
  invitation_id?: number
  invitation_token?: string
  project_name?: string
  project_id?: number
  role_in_project?: string
  inviter_name?: string
  expires_at?: string
}

export default function NotificationsPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [pendingInvitations, setPendingInvitations] = useState<NotificationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<Record<string, 'accept' | 'decline' | null>>({})

  useEffect(() => { loadNotifications() }, [])

  const loadNotifications = () => {
    setLoading(true)
    api.get('/notifications').then(res => {
      setNotifications(res.notifications || [])
      setPendingInvitations(res.pendingInvitations || [])
    }).catch(() => {}).finally(() => setLoading(false))
  }

  const markRead = async (id: string) => {
    try {
      await api.put(`/notifications/${id}/read`)
      loadNotifications()
    } catch (err: any) {}
  }

  const markAllRead = async () => {
    try {
      await api.put('/notifications/read-all')
      toast.success(t('notifications.allMarkedRead'), { duration: 2000 })
      loadNotifications()
    } catch (err: any) {}
  }

  const handleAccept = async (item: NotificationItem) => {
    if (!item.invitation_token) return
    setActionLoading(prev => ({ ...prev, [item.id]: 'accept' }))
    try {
      await acceptInvitation(item.invitation_token)
      await api.put(`/notifications/${item.id}/read`)
      toast.success(`You joined "${item.project_name}"!`)
      loadNotifications()
    } catch (e: any) {
      toast.error(e?.message || 'Failed to accept invitation')
    } finally {
      setActionLoading(prev => { const n = { ...prev }; delete n[item.id]; return n })
    }
  }

  const handleDecline = async (item: NotificationItem) => {
    if (!item.invitation_token) return
    setActionLoading(prev => ({ ...prev, [item.id]: 'decline' }))
    try {
      await declineInvitation(item.invitation_token)
      await api.put(`/notifications/${item.id}/read`)
      toast.success('Invitation declined.')
      loadNotifications()
    } catch (e: any) {
      toast.error(e?.message || 'Failed to decline invitation')
    } finally {
      setActionLoading(prev => { const n = { ...prev }; delete n[item.id]; return n })
    }
  }

  const typeIcon: Record<string, any> = {
    leave_request: FileText, leave_approved: CheckCircle2, leave_rejected: XCircle,
    task_assigned: ListChecks, new_message: MessageSquare, announcement: Megaphone,
    project_invitation: Building, mention: AtSign, default: Bell
  }

  const allItems: NotificationItem[] = [
    ...pendingInvitations.filter(inv => !inv.is_read),
    ...notifications,
  ]

  const unreadCount = allItems.filter(n => !n.is_read).length

  const handleNotificationClick = (n: NotificationItem) => {
    // Mark as read
    if (!n.is_read) {
      markRead(n.id)
    }
    // Navigate to the link if it exists
    if (n.link && n.link !== '#') {
      router.push(n.link)
    }
  }

  return (
    <div className="space-y-5 animate-fade-in-up">
      {/* Page header */}
      <div className="flex flex-wrap justify-end items-center gap-3">
        <button
          onClick={markAllRead}
          className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white hover:shadow-lg rounded-xl text-sm font-bold transition shadow-lg cursor-pointer border-none flex items-center gap-2"
        >
          <Check size={14} strokeWidth={2.5} /> {t('notifications.markAllRead')}
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {loading ? (
          <PageLoader label={t('common.loading')} />
        ) : allItems.length === 0 ? (
          <div className="p-16 text-center">
            <BellOff size={48} strokeWidth={1.75} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-600 font-bold mb-1">{t('notifications.noNotifications')}</p>
            <p className="text-gray-400 text-sm">{t('notifications.allCaughtUp')}</p>
          </div>
        ) : (
          allItems.map((n: NotificationItem) => {
            const Icon = typeIcon[n.type] || typeIcon.default
            const isAccepting = actionLoading[n.id] === 'accept'
            const isDeclining = actionLoading[n.id] === 'decline'
            const isExpired = n.expires_at ? new Date(n.expires_at) < new Date() : false

            if (n.is_invitation) {
              return (
                <div
                  key={n.id}
                  onClick={() => !n.is_read && markRead(n.id)}
                  className={`relative px-5 py-4 border-b border-gray-100 transition ${
                    !n.is_read ? 'bg-amber-50/40 hover:bg-amber-50' : 'bg-white hover:bg-gray-50'
                  }`}
                >
                  {!n.is_read && (
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-400"></div>
                  )}

                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-11 h-11 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
                      <Building size={20} strokeWidth={2.25} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm mb-0.5 ${!n.is_read ? 'font-extrabold text-gray-900' : 'font-semibold text-gray-700'}`}>
                        {n.title}
                      </div>
                      <div className={`text-sm ${!n.is_read ? 'text-gray-700' : 'text-gray-500'}`}>
                        {n.message}
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400">
                        <span className="flex items-center gap-1"><Clock size={11} strokeWidth={2.5} /> {isExpired ? 'Expired' : 'Expires'}: {formatDate(n.expires_at || '')}</span>
                      </div>
                    </div>
                    {!n.is_read && (
                      <span className="w-3 h-3 rounded-full bg-amber-400 shrink-0 mt-1.5 animate-pulse"></span>
                    )}
                  </div>

                  {isExpired ? (
                    <div className="bg-amber-100 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-3 py-2">
                      <p className="text-xs text-amber-700 dark:text-amber-300 font-semibold">
                        This invitation has expired. Ask the project owner to send a new invitation.
                      </p>
                    </div>
                  ) : (
                    <div className="flex gap-2 ml-14">
                      <button
                        type="button"
                        disabled={!!actionLoading[n.id]}
                        onClick={(e) => { e.stopPropagation(); handleAccept(n) }}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold border-none cursor-pointer transition hover:scale-[1.02] active:scale-[0.98]"
                      >
                        {isAccepting
                          ? <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Accepting…</>
                          : <><CheckCircle size={13} strokeWidth={2.5} /> Accept</>
                        }
                      </button>
                      <button
                        type="button"
                        disabled={!!actionLoading[n.id]}
                        onClick={(e) => { e.stopPropagation(); handleDecline(n) }}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-60 disabled:cursor-not-allowed text-gray-600 dark:text-gray-300 rounded-xl text-xs font-bold border-2 border-gray-200 dark:border-gray-700 cursor-pointer transition hover:scale-[1.02] active:scale-[0.98]"
                      >
                        {isDeclining
                          ? <><span className="w-3.5 h-3.5 border-2 border-gray-300 border-t-gray-500 rounded-full animate-spin" /> Declining…</>
                          : <><XCircleIcon size={13} strokeWidth={2.5} /> Decline</>
                        }
                      </button>
                    </div>
                  )}
                </div>
              )
            }

            return (
              <div
                key={n.id}
                onClick={() => handleNotificationClick(n)}
                className={`relative px-5 py-4 border-b border-gray-100 transition cursor-pointer ${
                  !n.is_read ? 'bg-indigo-50/50 hover:bg-indigo-50' : 'bg-white hover:bg-gray-50'
                }`}
              >
                {!n.is_read && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500"></div>
                )}
                <div className="flex items-start gap-3">
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                    n.type === 'mention' ? 'bg-violet-600 text-white' : 'bg-indigo-600 text-white'
                  }`}>
                    <Icon size={20} strokeWidth={2.25} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm mb-0.5 ${!n.is_read ? 'font-extrabold text-gray-900' : 'font-normal text-gray-700'}`}>
                      {n.title}
                    </div>
                    <div className={`text-sm ${!n.is_read ? 'text-gray-600' : 'text-gray-500'}`}>
                      {n.message}
                    </div>
                    <div className="text-xs text-gray-400 mt-1.5 font-semibold">
                      {n.created_at ? new Date(n.created_at).toLocaleString() : ''}
                    </div>
                    {n.type === 'mention' && n.link && (
                      <div className="text-xs text-violet-600 dark:text-violet-400 mt-1 font-medium">
                        Click to view mention →
                      </div>
                    )}
                  </div>
                  {!n.is_read && (
                    <span className="w-3 h-3 rounded-full bg-indigo-500 shrink-0 mt-1.5 animate-pulse"></span>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
