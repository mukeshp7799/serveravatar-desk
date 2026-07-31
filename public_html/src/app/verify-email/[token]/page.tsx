'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle2, XCircle, Loader2, Sparkles, Mail } from 'lucide-react'
import api from '@/lib/api'

type Status = 'verifying' | 'success' | 'already' | 'error' | 'expired'

export default function VerifyEmailPage() {
  const router = useRouter()
  const params = useParams<{ token: string }>()
  const token = params?.token

  const [status, setStatus] = useState<Status>('verifying')
  const [message, setMessage] = useState('')
  const ran = useRef(false)

  useEffect(() => {
    if (!token || ran.current) return
    ran.current = true

    api
      .post('/auth/verify-email', { token })
      .then(async (res: any) => {
        if (res?.alreadyVerified) {
          setStatus('already')
          setMessage(res.message || 'Your email is already verified.')
        } else if (res?.verified) {
          setStatus('success')
          setMessage(res.message || 'Email verified successfully!')

          // If user is logged in, refresh /me so the stored user object
          // (and the persistent banner) reflect the new status.
          try {
            if (api.getToken()) {
              const me = await api.get('/auth/me')
              if (me?.user) {
                localStorage.setItem('user', JSON.stringify(me.user))
                window.dispatchEvent(new Event('storage'))
              }
            }
          } catch {
            /* not logged in — fine */
          }

          setTimeout(() => {
            // Hard-reload so the authenticated layout re-reads the updated
            // `localStorage` user object (and removes the verification banner).
            window.location.href = '/dashboard'
          }, 2500)
        }
      })
      .catch((err: any) => {
        const m: string = err?.message || 'Verification failed'
        setMessage(m)
        if (/expired/i.test(m)) setStatus('expired')
        else setStatus('error')
      })
  }, [token, router])

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-gradient-to-br from-indigo-50 via-white to-violet-50 dark:from-gray-950 dark:via-gray-900 dark:to-indigo-950">
      <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-indigo-400 rounded-full filter blur-3xl opacity-20 animate-float-slow" />
      <div className="absolute bottom-1/4 left-1/4 w-96 h-96 bg-violet-400 rounded-full filter blur-3xl opacity-20 animate-pulse-slow" />

      <div className="relative z-10 w-full max-w-md">
        <div className="glass rounded-3xl p-8 sm:p-10 shadow-2xl animate-scale-in">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center shadow">
              <Sparkles size={24} strokeWidth={2.25} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">Serveravatar Hub</h1>
              <p className="text-gray-500 text-xs">Email verification</p>
            </div>
          </div>

          {status === 'verifying' && (
            <div className="text-center py-6">
              <Loader2 size={56} strokeWidth={2} className="text-indigo-600 animate-spin mx-auto mb-4" />
              <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Verifying your email…</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">Just a moment.</p>
            </div>
          )}

          {status === 'success' && (
            <div className="text-center py-6">
              <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 size={36} strokeWidth={2.25} className="text-emerald-600 dark:text-emerald-400" />
              </div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Email verified!</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{message}</p>
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center gap-2 w-full px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition shadow hover:shadow-lg no-underline"
              >
                Go to dashboard →
              </Link>
              <p className="text-xs text-gray-400 mt-3">Redirecting automatically…</p>
            </div>
          )}

          {status === 'already' && (
            <div className="text-center py-6">
              <div className="w-16 h-16 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center mx-auto mb-4">
                <Mail size={36} strokeWidth={2.25} className="text-indigo-600 dark:text-indigo-400" />
              </div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Already verified</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{message}</p>
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center gap-2 w-full px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition shadow hover:shadow-lg no-underline"
              >
                Go to dashboard →
              </Link>
            </div>
          )}

          {(status === 'error' || status === 'expired') && (
            <div className="text-center py-6">
              <div className="w-16 h-16 rounded-full bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center mx-auto mb-4">
                <XCircle size={36} strokeWidth={2.25} className="text-rose-600 dark:text-rose-400" />
              </div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
                {status === 'expired' ? 'Link expired' : 'Verification failed'}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{message}</p>
              <Link
                href="/login"
                className="inline-flex items-center justify-center gap-2 w-full px-5 py-3 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-900 dark:text-white rounded-xl font-bold transition no-underline"
              >
                Back to sign in
              </Link>
              <p className="text-xs text-gray-400 mt-3">
                You can request a new verification link from the banner at the top of the dashboard after signing in.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
