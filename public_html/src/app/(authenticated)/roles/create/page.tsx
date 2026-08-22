'use client'
import PageLoader from '@/components/PageLoader'
import RequirePermission from '@/components/RequirePermission'
import PermissionsTree from '@/components/PermissionsTree'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { ArrowLeft, Check, Shield } from 'lucide-react'
import api from '@/lib/api'
import { roleSchema, type RoleInput } from '@/lib/schemas'

export default function CreateRolePage() {
  return (
    <RequirePermission permission="admin.roles">
      <CreateRolePageInner />
    </RequirePermission>
  )
}

function CreateRolePageInner() {
  const { t } = useTranslation()
  const router = useRouter()

  const [allPerms, setAllPerms] = useState<any[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<RoleInput>({
    resolver: zodResolver(roleSchema),
    mode: 'onBlur',
  })

  // ── Load master permission list ──────────────────────────────────────────
  useEffect(() => {
    api.get('/roles').then(res => {
      setAllPerms(res.permissions || [])
    }).catch(() => {
      toast.error('Failed to load permissions')
    }).finally(() => setLoading(false))
  }, [])

  // ── Submit ──────────────────────────────────────────────────────────────
  const onSubmit = async (data: RoleInput) => {
    if (!data.name || !data.name.trim()) {
      toast.error('Role name is required')
      return
    }
    setSubmitting(true)
    try {
      // 1. Create the role
      const createRes = await api.post('/roles', { name: data.name.trim() })
      const newRoleId = createRes.role?.id || createRes.id

      if (!newRoleId) {
        throw new Error('Role ID not returned from server')
      }

      // 2. Assign selected permissions
      const nameToId: Record<string, number> = {}
      allPerms.forEach((p: any) => { nameToId[p.name] = p.id })
      const permissionIds = Array.from(selected)
        .filter(n => nameToId[n] != null)
        .map(n => nameToId[n])

      await api.put(`/roles/${newRoleId}/permissions`, { permissionIds })

      toast.success('Role created successfully')
      router.push('/roles')
    } catch (err: any) {
      toast.error(err.message || 'Failed to create role')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div className="p-10"><PageLoader label={t('common.loading')} size="lg" /></div>

  return (
    <div className="space-y-0 animate-fade-in-up">
      {/* ── Back button ── */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push('/roles')}
          className="flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 transition cursor-pointer border-none bg-transparent"
        >
          <ArrowLeft size={16} strokeWidth={2} />
          Back to Roles
        </button>
      </div>

      {/* ── Card ── */}
      <div className="bg-white dark:bg-[#1a1d27] rounded-2xl border border-slate-200 dark:border-[#2a2d38] overflow-hidden shadow-sm dark:shadow-none">
        {/* Card header */}
        <div className="px-6 py-4 bg-indigo-600 flex items-center gap-2">
          <Shield size={18} strokeWidth={2} className="text-white" />
          <h2 className="text-white font-bold">Create Role</h2>
        </div>

        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="p-6 space-y-6">
            {/* ── Role Name ── */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-2">
                Role Name *
              </label>
              <input
                {...register('name')}
                className={`w-full border-2 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-4 transition bg-white dark:bg-[#12141c] ${
                  errors.name
                    ? 'border-red-400 focus:border-red-500 focus:ring-red-100 text-red-900 dark:text-red-300'
                    : 'border-slate-200 dark:border-[#2a2d38] focus:border-indigo-500 focus:ring-indigo-100 text-slate-900 dark:text-slate-100'
                }`}
                placeholder="e.g. Manager"
                autoFocus
              />
              {errors.name && (
                <p className="mt-1 text-xs text-red-500">{String(errors.name.message)}</p>
              )}
            </div>

            {/* ── Permissions Tree ── */}
            <PermissionsTree
              allPerms={allPerms}
              selected={selected}
              onChange={setSelected}
              showCheckAll={true}
            />
          </div>

          {/* ── Footer ── */}
          <div className="flex items-center gap-3 px-6 py-4 border-t border-slate-100 dark:border-[#2a2d38] bg-slate-50 dark:bg-[#12141c]">
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition cursor-pointer border-none shadow-sm"
            >
              {submitting ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
              ) : (
                <Check size={14} strokeWidth={2.5} />
              )}
              {submitting ? 'Creating Role...' : 'Create Role'}
            </button>
            <button
              type="button"
              onClick={() => router.push('/roles')}
              className="px-6 py-2.5 text-sm font-semibold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 rounded-xl transition cursor-pointer border border-slate-200 dark:border-[#2a2d38] bg-white dark:bg-slate-800/60"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
