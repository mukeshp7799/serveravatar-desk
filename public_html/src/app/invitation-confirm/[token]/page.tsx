'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import ThemeSelector from '@/components/ThemeSelector'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import {
  useInvitationDetails,
  acceptInvitation,
  declineInvitation,
  type InvitationDetails,
} from '@/lib/invitations-api'
import { Sparkles, Mail, Clock, CheckCircle, XCircle, ArrowRight, AlertTriangle, Building } from 'lucide-react'

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}

export default function InvitationConfirmPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const router = useRouter()
  const { invitation, loading, error, notFound } = useInvitationDetails(token)

  const [accepted, setAccepted] = useState(false)
  const [declined, setDeclined] = useState(false)
  const [actionLoading, setActionLoading] = useState<'accept' | 'decline' | null>(null)

  // Redirect to login if not authenticated
  useEffect(() => {
    const storedToken = localStorage.getItem('token')
    if (!storedToken) {
      localStorage.setItem('pending_invitation_token', token)
      router.push(`/login?next=${encodeURIComponent(`/invitation-confirm/${token}`)}`)
    }
  }, [token, router])

  // After login/register, user lands here. Check if email matches invitation.
  useEffect(() => {
    if (!invitation) return
    const storedUser = localStorage.getItem('user')
    if (storedUser) {
      try {
        const user = JSON.parse(storedUser)
        if (user?.email?.toLowerCase() !== invitation.email?.toLowerCase()) {
          // Email mismatch — don't allow accept/decline
        }
      } catch {}
    }
  }, [invitation])

  const handleAccept = async () => {
    if (!invitation) return
    setActionLoading('accept')
    try {
      await acceptInvitation(token)
      setAccepted(true)
      toast.success(`You joined "${invitation.projectName}"!`)
    } catch (e: any) {
      toast.error(e?.message || 'Failed to accept invitation')
    } finally {
      setActionLoading(null)
    }
  }

  const handleDecline = async () => {
    if (!invitation) return
    setActionLoading('decline')
    try {
      await declineInvitation(token)
      setDeclined(true)
      toast.success('Invitation declined.')
    } catch (e: any) {
      toast.error(e?.message || 'Failed to decline invitation')
    } finally {
      setActionLoading(null)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400 text-sm">Loading invitation…</p>
        </div>
      </div>
    )
  }

  if (notFound || error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="glass rounded-3xl p-8 sm:p-10 shadow-2xl max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-full bg-rose-100 dark:bg-rose-900/40 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle size={28} className="text-rose-600 dark:text-rose-400" />
          </div>
          <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white mb-2">Invitation not found</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
            {error || 'This invitation link may be invalid or has already been used.'}
          </p>
          <Link href="/dashboard" className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold border-none">
            Go to dashboard <ArrowRight size={14} strokeWidth={2.5} />
          </Link>
        </div>
      </div>
    )
  }

  if (accepted || declined) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="glass rounded-3xl p-8 sm:p-10 shadow-2xl max-w-md w-full text-center">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${accepted ? 'bg-emerald-100 dark:bg-emerald-900/40' : 'bg-gray-100 dark:bg-gray-800'}`}>
            {accepted
              ? <CheckCircle size={28} className="text-emerald-600 dark:text-emerald-400" />
              : <XCircle size={28} className="text-gray-500 dark:text-gray-400" />
            }
          </div>
          <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white mb-2">
            {accepted ? 'Invitation accepted!' : 'Invitation declined'}
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
            {accepted
              ? `You are now a member of "${invitation?.projectName}".`
              : `You have declined the invitation to "${invitation?.projectName}".`
            }
          </p>
          <Link href="/dashboard" className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold border-none">
            Go to dashboard <ArrowRight size={14} strokeWidth={2.5} />
          </Link>
        </div>
      </div>
    )
  }

  // Determine if invitation is expired
  const isExpired = invitation ? new Date(invitation.expiresAt) < new Date() : false

  // Email mismatch warning
  const [emailMismatch, setEmailMismatch] = useState(false)
  useEffect(() => {
    if (!invitation) return
    const storedUser = localStorage.getItem('user')
    if (storedUser) {
      try {
        const user = JSON.parse(storedUser)
        if (user?.email?.toLowerCase() !== invitation.email?.toLowerCase()) {
          setEmailMismatch(true)
        }
      } catch {}
    }
  }, [invitation])

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 auth-bg-base" />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-400 rounded-full filter blur-3xl opacity-30 animate-float-slow auth-glow-a" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-500 rounded-full filter blur-3xl opacity-20 animate-pulse-slow auth-glow-b" />

      {/* Top controls */}
      <div className="absolute top-4 right-4 z-30 flex items-center gap-2">
        <div className="bg-white/30 backdrop-blur-md border border-white/50 rounded-2xl shadow-lg dark:bg-white/10 dark:border-white/20">
          <ThemeSelector />
        </div>
        <div className="bg-white/30 backdrop-blur-md border border-white/50 rounded-2xl shadow-lg dark:bg-white/10 dark:border-white/20">
          <LanguageSwitcher compact />
        </div>
      </div>

      <div className="relative z-10 w-full max-w-lg">
        <div className="glass rounded-3xl p-8 sm:p-10 shadow-2xl animate-scale-in">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center">
              <Sparkles size={24} strokeWidth={2.25} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">Accept Invitation</h1>
              <p className="text-gray-500 text-xs">Serveravatar Hub</p>
            </div>
          </div>

          {invitation && (
            <>
              {/* Invitation card */}
              <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800 rounded-2xl p-5 mb-5">
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-800 flex items-center justify-center shrink-0">
                    <Building size={18} className="text-indigo-600 dark:text-indigo-300" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-xl font-extrabold text-gray-900 dark:text-white">
                      {invitation.projectName}
                    </h2>
                    {invitation.projectDescription && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5 line-clamp-2">
                        {invitation.projectDescription}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-2 text-sm mb-4">
                  <div className="flex items-center gap-2">
                    <Mail size={14} strokeWidth={2.25} className="text-gray-400 shrink-0" />
                    <span className="text-gray-700 dark:text-gray-300">
                      Invited by <strong>{invitation.inviterName}</strong>
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3.5 h-3.5 rounded-full bg-indigo-500 flex items-center justify-center text-white text-[8px] font-bold shrink-0">R</span>
                    <span className="text-gray-700 dark:text-gray-300">
                      Role: <strong>{invitation.roleInProject || 'Member'}</strong>
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock size={14} strokeWidth={2.25} className="text-gray-400 shrink-0" />
                    <span className={isExpired ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-gray-700 dark:text-gray-300'}>
                      {isExpired ? 'Expired' : 'Expires'}: <strong>{formatDate(invitation.expiresAt)}</strong>
                    </span>
                  </div>
                </div>

                {/* Email mismatch warning */}
                {emailMismatch && (
                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 flex items-start gap-2 mb-4">
                    <AlertTriangle size={14} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      You're logged in as a different account. Only the invited person can accept this invitation.
                    </p>
                  </div>
                )}

                {isExpired ? (
                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-3 py-2">
                    <p className="text-xs text-amber-600 dark:text-amber-400 font-semibold">
                      This invitation has expired. Ask the project owner to send a new invitation.
                    </p>
                  </div>
                ) : emailMismatch ? null : (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <button
                      type="button"
                      disabled={!!actionLoading}
                      onClick={handleAccept}
                      className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-xl text-sm font-semibold border-none cursor-pointer transition hover:scale-[1.02] active:scale-[0.98]"
                    >
                      {actionLoading === 'accept' ? (
                        <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Accepting…</>
                      ) : (
                        <><CheckCircle size={15} strokeWidth={2.25} /> Accept Invitation</>
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={!!actionLoading}
                      onClick={handleDecline}
                      className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-60 disabled:cursor-not-allowed text-gray-700 dark:text-gray-300 rounded-xl text-sm font-semibold border-2 border-gray-200 dark:border-gray-700 cursor-pointer transition hover:scale-[1.02] active:scale-[0.98]"
                    >
                      {actionLoading === 'decline' ? (
                        <><span className="w-4 h-4 border-2 border-gray-300 border-t-gray-500 rounded-full animate-spin" /> Declining…</>
                      ) : (
                        <><XCircle size={15} strokeWidth={2.25} /> Decline</>
                      )}
                    </button>
                  </div>
                )}
              </div>

              <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
                By accepting, you'll become a member of this project and gain access to its features.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
