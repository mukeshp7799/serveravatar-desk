'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ShieldOff } from 'lucide-react'

/**
 * Client-side route guard.
 *
 * Wrap a page's content to gate it behind a permission. If the current user
 * lacks `permission`, they are redirected to the dashboard (or shown a
 * friendly 403 if `redirect` is false).
 *
 * Usage:
 *   export default function EmployeesPage() {
 *     return (
 *       <RequirePermission permission="hr.manage_employees">
 *         {/* page content *\/}
 *       </RequirePermission>
 *     )
 *   }
 */
export default function RequirePermission({
  permission,
  children,
  redirect = true,
}: {
  /** Permission required to view this page. If omitted, allows any logged-in user. */
  permission?: string
  children: React.ReactNode
  /** When true, redirects to /dashboard on lack of permission. When false, shows 403 UI. */
  redirect?: boolean
}) {
  const router = useRouter()
  const [state, setState] = useState<'loading' | 'allowed' | 'denied'>('loading')

  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = localStorage.getItem('user')
    if (!stored) {
      router.replace('/login')
      return
    }
    const user = JSON.parse(stored)
    const perms: string[] = Array.isArray(user?.permissions) ? user.permissions : []

    // No permission required → allowed
    if (!permission) {
      setState('allowed')
      return
    }

    // Has permission → allowed
    if (perms.includes(permission)) {
      setState('allowed')
      return
    }

    // Lacks permission
    if (redirect) {
      router.replace('/dashboard')
    } else {
      setState('denied')
    }
  }, [permission, redirect, router])

  if (state === 'loading') {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (state === 'denied') {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-rose-100 mx-auto flex items-center justify-center mb-4">
            <ShieldOff size={32} className="text-rose-600" strokeWidth={2.25} />
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-1">Access denied</h2>
          <p className="text-sm text-gray-500 mb-6">
            You don&apos;t have permission to view this page. Required permission:{' '}
            <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">{permission}</code>
          </p>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition shadow-sm hover:shadow no-underline"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
