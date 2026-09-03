'use client'
import PageLoader from '@/components/PageLoader'
import RequirePermission from '@/components/RequirePermission'
import PortalModal from '@/components/PortalModal'
import ConfirmDialog from '@/components/project/ConfirmDialog'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import {
  Shield, ShieldCheck, Eye, KeyRound, Pencil, Plus, Trash2,
  ChevronRight, Users, Tag, Check
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import api from '@/lib/api'

export default function RolesPage() {
  return (
    <RequirePermission permission="admin.roles">
      <RolesPageInner />
    </RequirePermission>
  )
}

// Role card skeleton
function SkeletonCard() {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-slate-100 dark:border-slate-800 animate-pulse">
      <div className="flex items-start gap-4 mb-5">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-600 shrink-0" />
        <div className="flex-1">
          <div className="w-32 h-5 bg-slate-200 dark:bg-slate-700 rounded-xl mb-2" />
          <div className="w-20 h-3 bg-slate-100 dark:bg-slate-700 rounded-lg" />
        </div>
      </div>
      <div className="flex gap-2">
        <div className="w-20 h-6 bg-slate-100 dark:bg-slate-800 rounded-full" />
        <div className="w-16 h-6 bg-slate-100 dark:bg-slate-800 rounded-full" />
      </div>
    </div>
  )
}

// Empty state
function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="col-span-full flex flex-col items-center justify-center py-20 px-6 bg-white dark:bg-slate-900 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">
      <div className="relative mb-8">
        <div className="w-24 h-24 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 flex items-center justify-center">
          <Shield size={40} strokeWidth={1.5} className="text-slate-400" />
        </div>
        <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-amber-400 opacity-60" />
        <div className="absolute -bottom-2 -left-3 w-4 h-4 rounded-full bg-violet-400 opacity-40" />
      </div>
      <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">No Roles Yet</h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 text-center mb-8 max-w-xs leading-relaxed">
        Define roles and permissions to control what your team members can access and do within the system.
      </p>
      <button
        onClick={onCreate}
        className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-sm font-bold transition shadow-lg shadow-indigo-200 dark:shadow-indigo-900/50 cursor-pointer border-none"
      >
        <Plus size={18} strokeWidth={2.5} />
        Create First Role
      </button>
    </div>
  )
}

function RolesPageInner() {
  const { t } = useTranslation()
  const router = useRouter()
  const [roles, setRoles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showPermsModal, setShowPermsModal] = useState(false)
  const [permsRole, setPermsRole] = useState<any>(null)
  const [permsData, setPermsData] = useState<any[]>([])
  const [permsLoading, setPermsLoading] = useState(false)
  const [editName, setEditName] = useState('')
  const [editNameSaving, setEditNameSaving] = useState(false)
  const [editNameError, setEditNameError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<{ id: number; name: string } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [editingRole, setEditingRole] = useState<any>(null)

  const user = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('user') || '{}') : {}
  const isAdmin = Array.isArray(user.permissions) && user.permissions.includes('admin.roles')

  useEffect(() => { loadData() }, [])

  useEffect(() => {
    if (showPermsModal) {
      document.documentElement.style.overflow = 'hidden'
      document.body.style.overflow = 'hidden'
    } else {
      document.documentElement.style.overflow = ''
      document.body.style.overflow = ''
    }
    return () => {
      document.documentElement.style.overflow = ''
      document.body.style.overflow = ''
    }
  }, [showPermsModal])

  const loadData = () => {
    setLoading(true)
    api.get('/roles').then(res => {
      setRoles(res.roles || [])
    }).catch(() => {}).finally(() => setLoading(false))
  }

  const handleEditRole = (role: any) => {
    setEditingRole(role)
    setEditName(role.name)
    setEditNameError('')
    setShowEditModal(true)
  }

  const handleSaveEditName = async () => {
    if (!editingRole) return
    const trimmedName = editName.trim()
    setEditNameSaving(true)
    setEditNameError('')
    try {
      const res = await api.put(`/roles/${editingRole.id}`, { name: trimmedName })
      toast.success(res.data?.message || 'Role updated')
      setShowEditModal(false)
      loadData()
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Failed to update role'
      if (err?.response?.status >= 400 && err?.response?.status < 500) {
        setEditNameError(msg)
      } else {
        toast.error(msg)
        setShowEditModal(false)
      }
    } finally {
      setEditNameSaving(false)
    }
  }

  const handleDelete = (id: number) => {
    const role = roles.find(r => r.id === id)
    setConfirmDelete({ id, name: role?.name || 'this role' })
  }

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return
    setDeleting(true)
    try {
      const res = await api.delete(`/roles/${confirmDelete.id}`)
      setConfirmDelete(null)
      toast.success(res.data?.message || 'Role deleted')
      loadData()
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err.message || 'Failed to delete role')
      setConfirmDelete(null)
    } finally {
      setDeleting(false)
    }
  }

  const handleShowPermissions = async (role: any) => {
    setPermsRole(role)
    setPermsData([])
    setShowPermsModal(true)
    setPermsLoading(true)
    try {
      const res = await api.get(`/roles/${role.id}/permissions`)
      setPermsData(res.permissions || [])
    } catch {
      toast.error('Failed to load permissions')
    } finally {
      setPermsLoading(false)
    }
  }

  // Shield icon color themes — cycles through roles
  const SHIELD_THEMES = [
    { icon: 'from-indigo-500 to-purple-600',   bg: 'bg-indigo-50',        text: 'text-indigo-600',    badge: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
    { icon: 'from-emerald-500 to-teal-600',     bg: 'bg-emerald-50',       text: 'text-emerald-600',  badge: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    { icon: 'from-amber-500 to-orange-600',     bg: 'bg-amber-50',         text: 'text-amber-600',    badge: 'bg-amber-100 text-amber-700 border-amber-200' },
    { icon: 'from-rose-500 to-pink-600',        bg: 'bg-rose-50',          text: 'text-rose-600',     badge: 'bg-rose-100 text-rose-700 border-rose-200' },
    { icon: 'from-violet-500 to-purple-600',   bg: 'bg-violet-50',        text: 'text-violet-600',  badge: 'bg-violet-100 text-violet-700 border-violet-200' },
    { icon: 'from-cyan-500 to-blue-600',        bg: 'bg-cyan-50',          text: 'text-cyan-600',     badge: 'bg-cyan-100 text-cyan-700 border-cyan-200' },
  ]

  return (
    <div className="space-y-6">

      {/* ── Page Header ── */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-extrabold text-slate-900 dark:text-white leading-tight">Roles & Permissions</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Define and manage roles for your team</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => router.push('/roles/create')}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition cursor-pointer border-none shrink-0"
          >
            <Plus size={14} strokeWidth={2.5} />
            Add Role
          </button>
        )}
      </div>

      {/* ── Roles Cards Grid ── */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 w-full">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : roles.length === 0 ? (
        <div className="grid grid-cols-1 gap-3 w-full">
          <EmptyState onCreate={() => router.push('/roles/create')} />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 w-full">
          {roles.map((role: any, i: number) => {
            const theme = SHIELD_THEMES[i % SHIELD_THEMES.length]
            return (
              <div
                key={role.id}
                className="group relative bg-white dark:bg-slate-900 rounded-xl p-4 shadow-sm hover:shadow-xl border border-slate-100 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-indigo-700 transition-all duration-300 flex flex-col animate-fade-in-up"
              >
                {/* Top-right actions (always visible) */}
                {isAdmin && (
                  <div className="absolute top-3 right-3 flex items-center gap-1">
                    <button
                      onClick={() => handleEditRole(role)}
                      className="w-8 h-8 rounded-xl text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/50 flex items-center justify-center cursor-pointer border-none bg-white/80 dark:bg-slate-700/80 shadow-sm transition-colors"
                      title={t('common.edit')}
                    >
                      <Pencil size={13} strokeWidth={2.5} />
                    </button>
                    <button
                      onClick={() => handleDelete(role.id)}
                      className="w-8 h-8 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/50 flex items-center justify-center cursor-pointer border-none bg-white/80 dark:bg-slate-700/80 shadow-sm transition-colors"
                      title={t('common.delete')}
                    >
                      <Trash2 size={13} strokeWidth={2.25} />
                    </button>
                  </div>
                )}

                {/* Shield icon block */}
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${theme.icon} flex items-center justify-center mb-3 shadow-lg group-hover:scale-105 group-hover:shadow-xl transition-all duration-300`}>
                  <ShieldCheck size={18} strokeWidth={2} className="text-white" />
                </div>

                {/* Role name */}
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-white mb-1 pr-10 leading-tight">
                  {role.name}
                </h3>

                {/* Role ID */}
                <div className="flex items-center gap-1.5 text-[10px] text-slate-400 dark:text-slate-500 font-medium mb-3">
                  <Tag size={10} strokeWidth={2} />
                  <span>ID {role.id}</span>
                </div>

                <div className="flex-1" />

                {/* Divider */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                  {/* Permissions quick stats */}
                  <button
                    onClick={() => handleShowPermissions(role)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold border ${theme.badge} hover:opacity-80 transition-opacity cursor-pointer`}
                  >
                    <Eye size={10} strokeWidth={2.5} />
                    View Permissions
                  </button>

                  {/* Manage link */}
                  <button
                    onClick={() => router.push(`/roles/${role.id}/permissions`)}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 transition-colors cursor-pointer border-none bg-transparent"
                  >
                    Manage
                    <ChevronRight size={12} strokeWidth={2.5} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Edit Role Modal ── */}
      {showEditModal && editingRole && (
        <PortalModal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm" onClick={() => setShowEditModal(false)} />
            <div
              className="relative bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[calc(100vh-2rem)] overflow-hidden animate-scale-in"
              onClick={e => e.stopPropagation()}
            >
              {/* Modal header */}
              <div className="px-7 py-5 bg-gradient-to-r from-indigo-600 to-violet-600 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                    <Shield size={18} strokeWidth={2} className="text-white" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">Edit Role</h3>
                    <p className="text-indigo-200 text-xs mt-0.5">Update the role name below</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowEditModal(false)}
                  className="w-8 h-8 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center text-white/80 hover:text-white cursor-pointer border-none transition-colors text-lg leading-none"
                >
                  ×
                </button>
              </div>

              <div className="p-7">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-2 uppercase tracking-widest">
                    Role Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    value={editName}
                    onChange={e => { setEditName(e.target.value); setEditNameError('') }}
                    onKeyDown={e => e.key === 'Enter' && handleSaveEditName()}
                    className={`w-full border-2 rounded-xl px-4 py-3 text-sm font-medium transition-all focus:outline-none focus:ring-4 ${
                      editNameError
                        ? 'border-red-400 bg-red-50/50 dark:bg-red-900/10 focus:border-red-500 focus:ring-red-100 dark:focus:ring-red-900/30'
                        : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:border-indigo-500 focus:ring-indigo-100 dark:focus:ring-indigo-900/30'
                    }`}
                    placeholder="e.g. Project Manager"
                    autoFocus
                  />
                  {editNameError && (
                    <p className="mt-2 text-xs text-red-500 font-medium flex items-center gap-1">
                      <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx={12} cy={12} r={10} /><line x1={12} y1={8} x2={12} y2={12} /><line x1={12} y1={16} x2="12.01" y2={16} /></svg>
                      {editNameError}
                    </p>
                  )}
                </div>
              </div>

              <div className="border-t border-slate-100 dark:border-slate-800 px-7 py-5 flex items-center justify-end gap-3 bg-slate-50/50 dark:bg-slate-800/50 shrink-0">
                <button
                  onClick={() => setShowEditModal(false)}
                  disabled={editNameSaving}
                  className="px-5 py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600 rounded-xl transition cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEditName}
                  disabled={editNameSaving || !editName.trim()}
                  className="px-6 py-2.5 text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition cursor-pointer border-none disabled:opacity-50 inline-flex items-center gap-2 shadow-md shadow-indigo-200 dark:shadow-indigo-900/40"
                >
                  {editNameSaving ? (
                    <>
                      <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                      </svg>
                      Saving…
                    </>
                  ) : (
                    <>
                      <Check size={14} strokeWidth={2.5} />
                      Save Changes
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </PortalModal>
      )}

      {/* ── Show Permissions Modal ── */}
      {showPermsModal && permsRole && (
        <PortalModal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm" onClick={() => setShowPermsModal(false)} />
            <div
              className="relative bg-white dark:bg-slate-900 rounded-2xl w-full max-w-2xl shadow-2xl animate-scale-in border border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden"
              style={{ maxHeight: 'calc(90vh - 2rem)' }}
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
                      <Eye size={18} strokeWidth={2} className="text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900 dark:text-white">Role Permissions</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{permsRole.name}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowPermsModal(false)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer border-none"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>

                {!permsLoading && (
                  <div className="flex items-center gap-4 mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                      <span className="text-xs text-slate-600 dark:text-slate-300">
                        <span className="font-bold">{permsData.filter((p: any) => p.assigned).length}</span> assigned
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600"></div>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-bold">{permsData.filter((p: any) => !p.assigned).length}</span> unassigned
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Body — scrollable */}
              <div className="overflow-y-auto p-6 flex-1">
                {permsLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <svg className="w-6 h-6 animate-spin text-indigo-500" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                    <span className="ml-3 text-sm text-slate-500">Loading permissions...</span>
                  </div>
                ) : (
                  <PermissionsGroupedView perms={permsData} />
                )}
              </div>

              {/* Footer */}
              <div className="shrink-0 flex justify-end px-6 py-4 border-t border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50">
                <button
                  onClick={() => setShowPermsModal(false)}
                  className="px-6 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition cursor-pointer border-none shadow-sm"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </PortalModal>
      )}

      {/* ── Delete Confirmation Dialog ── */}
      <ConfirmDialog
        open={confirmDelete !== null}
        title={`Delete Role "${confirmDelete?.name}"?`}
        description="This action cannot be undone. The role and all associated data will be permanently removed."
        confirmLabel="Delete"
        destructive
        loading={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  )
}

// ── Permissions grouped view (read-only) ──────────────────────────────────
function PermissionsGroupedView({ perms }: { perms: any[] }) {
  const MODULE_LABELS: Record<string, string> = {
    users: 'User Management',
    leaves: 'Leave Management',
    attendance: 'Attendance',
    calendar: 'Calendar',
    reports: 'Reports',
    announcements: 'Announcements',
    projects: 'Project Management',
    discussions: 'Discussion Management',
    notifications: 'Notifications',
    activity_logs: 'Activity Logs',
    admin: 'Admin & Settings',
  }

  const MODULE_ICONS: Record<string, string> = {
    users: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
    leaves: 'M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z',
    attendance: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
    calendar: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
    reports: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
    announcements: 'M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z',
    projects: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z',
    discussions: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
    notifications: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9',
    activity_logs: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01',
    admin: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
  }

  const groups: Record<string, any[]> = {}
  perms.forEach((p: any) => {
    const mod = p.name.split('.')[0]
    if (!groups[mod]) groups[mod] = []
    groups[mod].push(p)
  })

  const sortedModules = Object.keys(groups).sort()

  if (sortedModules.length === 0) {
    return <p className="text-sm text-slate-400 text-center py-8">No permissions found.</p>
  }

  return (
    <div className="space-y-4">
      {sortedModules.map((mod) => {
        const label = MODULE_LABELS[mod] || mod.charAt(0).toUpperCase() + mod.slice(1)
        const iconPath = MODULE_ICONS[mod] || null
        const assigned = groups[mod].filter((p: any) => p.assigned)
        const notAssigned = groups[mod].filter((p: any) => !p.assigned)

        return (
          <div key={mod} className="border border-slate-100 dark:border-slate-700 rounded-xl overflow-hidden">
            <div className="bg-slate-50 dark:bg-slate-800/50 px-4 py-3 flex items-center gap-3">
              {iconPath && (
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-indigo-500 dark:text-indigo-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d={iconPath} />
                </svg>
              )}
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide">
                {label}
              </span>
              <div className="ml-auto flex items-center gap-3">
                {assigned.length > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold">
                    {assigned.length}
                  </span>
                )}
                {notAssigned.length > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 text-[10px] font-bold">
                    {notAssigned.length} left
                  </span>
                )}
              </div>
            </div>

            <div className="p-4 bg-white dark:bg-slate-900 flex flex-wrap gap-2">
              {groups[mod].map((p: any) => (
                <div
                  key={p.name}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                    p.assigned
                      ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300'
                      : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500'
                  }`}
                  title={p.description || ''}
                >
                  {p.assigned ? (
                    <Check size={11} strokeWidth={2.5} className="text-indigo-500 dark:text-indigo-400 shrink-0" />
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 text-slate-300 dark:text-slate-600 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  )}
                  <span className="whitespace-nowrap">{p.name.split('.')[1]?.replace(/_/g, ' ')}</span>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
