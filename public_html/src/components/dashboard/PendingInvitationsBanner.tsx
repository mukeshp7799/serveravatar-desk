'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Building, X, CheckCircle, XCircle, ChevronDown, ChevronUp } from 'lucide-react'
import {
  usePendingInvitations,
  acceptInvitation,
  declineInvitation,
  type InvitationDetails,
} from '@/lib/invitations-api'

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function PendingInvitationsBanner() {
  const router = useRouter()
  const storedUser = (() => {
    try {
      const u = localStorage.getItem('user')
      return u ? JSON.parse(u) : null
    } catch { return null }
  })()
  const email = storedUser?.email || null

  const { invitations, loading, refetch } = usePendingInvitations(email)
  const [accepted, setAccepted] = useState<Set<number>>(new Set())
  const [declined, setDeclined] = useState<Set<number>>(new Set())
  const [actionLoading, setActionLoading] = useState<Set<number>>(new Set())
  const [collapsed, setCollapsed] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  if (!email || loading || dismissed) return null

  const pending = invitations.filter(
    (inv) => !accepted.has(inv.id) && !declined.has(inv.id)
  )

  if (pending.length === 0) return null

  const handleAccept = async (inv: InvitationDetails) => {
    setActionLoading((prev) => new Set([...prev, inv.id]))
    try {
      await acceptInvitation(inv.token!)
      setAccepted((prev) => new Set([...prev, inv.id]))
      toast.success(`You joined "${inv.projectName}"!`)
      refetch()
      // Refresh page after a moment so the user sees the updated state
      setTimeout(() => router.refresh(), 800)
    } catch (e: any) {
      toast.error(e?.message || 'Failed to accept invitation')
    } finally {
      setActionLoading((prev) => { const s = new Set(prev); s.delete(inv.id); return s })
    }
  }

  const handleDecline = async (inv: InvitationDetails) => {
    setActionLoading((prev) => new Set([...prev, inv.id]))
    try {
      await declineInvitation(inv.token!)
      setDeclined((prev) => new Set([...prev, inv.id]))
      toast.success('Invitation declined.')
      refetch()
    } catch (e: any) {
      toast.error(e?.message || 'Failed to decline invitation')
    } finally {
      setActionLoading((prev) => { const s = new Set(prev); s.delete(inv.id); return s })
    }
  }

  const isAccepting = (id: number) => actionLoading.has(id)
  const isDeclining = (id: number) => actionLoading.has(id)

  return (
    <div className="relative bg-gradient-to-r from-amber-50 to-indigo-50 dark:from-amber-900/20 dark:to-indigo-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl shadow-sm overflow-hidden animate-fade-in-up">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-sm">
            <Building size={17} strokeWidth={2.25} />
          </div>
          <div>
            <p className="text-sm font-extrabold text-gray-900 dark:text-white leading-tight">
              You have {pending.length} pending project invitation{pending.length > 1 ? 's' : ''}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 leading-tight mt-0.5">
              Accept to join a project or decline to ignore
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {pending.length > 1 && (
            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 bg-white/60 dark:bg-gray-800/60 hover:bg-white dark:hover:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 transition cursor-pointer"
            >
              {collapsed ? <><ChevronDown size={13} strokeWidth={2.5} /> Show all</> : <><ChevronUp size={13} strokeWidth={2.5} /> Collapse</>}
            </button>
          )}
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 hover:bg-white/60 dark:hover:bg-gray-800/60 transition cursor-pointer"
            title="Dismiss"
          >
            <X size={16} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {/* Invitations list */}
      {(!collapsed || pending.length === 1) && (
        <div className="px-5 pb-4 space-y-2.5">
          {pending.map((inv) => {
            const isExpired = new Date(inv.expiresAt) < new Date()
            return (
              <div
                key={inv.id}
                className="flex items-center justify-between gap-3 bg-white/70 dark:bg-gray-800/70 rounded-xl px-4 py-3 border border-gray-100 dark:border-gray-700"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900 dark:text-white truncate">
                    {inv.projectName}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Invited as <span className="font-semibold">{inv.roleInProject || 'Member'}</span> ·{' '}
                    {isExpired ? (
                      <span className="text-amber-600 dark:text-amber-400 font-semibold">Expired</span>
                    ) : (
                      <>Expires {formatDate(inv.expiresAt)}</>
                    )}
                  </p>
                </div>

                {isExpired ? (
                  <span className="text-xs text-amber-600 dark:text-amber-400 font-semibold bg-amber-100 dark:bg-amber-900/30 px-2.5 py-1 rounded-lg border border-amber-200 dark:border-amber-800 shrink-0">
                    Expired
                  </span>
                ) : (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={isAccepting(inv.id) || isDeclining(inv.id)}
                      onClick={() => handleAccept(inv)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-lg text-xs font-bold border-none cursor-pointer transition hover:scale-[1.02] active:scale-[0.98]"
                    >
                      {isAccepting(inv.id) ? (
                        <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /></>
                      ) : (
                        <><CheckCircle size={13} strokeWidth={2.5} /></>
                      )}
                      Accept
                    </button>
                    <button
                      type="button"
                      disabled={isAccepting(inv.id) || isDeclining(inv.id)}
                      onClick={() => handleDecline(inv)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-60 disabled:cursor-not-allowed text-gray-600 dark:text-gray-300 rounded-lg text-xs font-bold border border-gray-200 dark:border-gray-700 cursor-pointer transition hover:scale-[1.02] active:scale-[0.98]"
                    >
                      {isDeclining(inv.id) ? (
                        <><span className="w-3.5 h-3.5 border-2 border-gray-300 border-t-gray-500 rounded-full animate-spin" /></>
                      ) : (
                        <><XCircle size={13} strokeWidth={2.5} /></>
                      )}
                      Decline
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
