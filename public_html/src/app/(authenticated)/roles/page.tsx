'use client'
import PageLoader from '@/components/PageLoader'
import RequirePermission from '@/components/RequirePermission'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { Check, Eye, KeyRound, Pencil, Plus, Shield, Tag, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import api from '@/lib/api'

export default function RolesPage() {
  return (
    <RequirePermission permission="admin.roles">
      <RolesPageInner />
    </RequirePermission>
  )
}

function RolesPageInner() {
  const { t } = useTranslation()
  const router = useRouter()
  const [roles, setRoles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showEdit, setShowEdit] = useState<any>(null) // role being edited
  const [showEditModal, setShowEditModal] = useState(false)
  // Permissions view modal
  const [showPermsModal, setShowPermsModal] = useState(false)
  const [permsRole, setPermsRole] = useState<any>(null)
  const [permsData, setPermsData] = useState<any[]>([])
  const [permsLoading, setPermsLoading] = useState(false)
  const user = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('user') || '{}') : {}
  const isAdmin = Array.isArray(user.permissions) && user.permissions.includes('admin.roles')

  useEffect(() => { loadData() }, [])

  // Lock viewport scroll when permissions modal is open
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

  // Inline edit role name — lightweight modal (no permissions tree needed)
  const [editName, setEditName] = useState('')
  const [editNameSaving, setEditNameSaving] = useState(false)

  const handleEditRole = (role: any) => {
    setShowEdit(role)
    setEditName(role.name)
    setShowEditModal(true)
  }

  const handleSaveEditName = async () => {
    if (!showEdit || !editName.trim()) return
    setEditNameSaving(true)
    try {
      await api.put(`/roles/${showEdit.id}`, { name: editName.trim() })
      toast.success('Role updated')
      setShowEditModal(false)
      loadData()
    } catch (err: any) {
      toast.error(err.message || 'Failed to update role')
    } finally {
      setEditNameSaving(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm(t('roles.deleteConfirm') || 'Delete this role?')) return
    try {
      await api.delete(`/roles/${id}`)
      toast.success(t('roles.roleDeleted') || 'Role deleted'); loadData()
    } catch (err: any) { toast.error(err.message || t('common.failedToDelete')) }
  }

  // Show permissions in a read-only modal
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

  return (
    <div className="space-y-5 animate-fade-in-up">
      <div className="flex flex-wrap justify-end items-center gap-3">
        {isAdmin && (
          <button onClick={() => router.push('/roles/create')} className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white hover:shadow-lg rounded-xl text-sm font-bold transition shadow-lg cursor-pointer border-none flex items-center gap-2">
            <span className="text-lg">+</span> {t('common.add')} {t('roles.title')}
          </button>
        )}
      </div>

      {loading ? (
        <PageLoader label={t('common.loading')} size="lg" />
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="bg-indigo-600 hover:bg-indigo-700 px-5 py-4">
            <h3 className="font-bold text-white flex items-center gap-2"><Tag size={16} strokeWidth={2.25} /> {t('roles.allRoles')} <span className="ml-auto bg-white/20 backdrop-blur-sm px-2 py-0.5 rounded-full text-xs">{roles.length}</span></h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[600px]">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wider whitespace-nowrap">{t('roles.roleName')}</th>
                  {isAdmin && <th className="text-left px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wider whitespace-nowrap">{t('common.actions')}</th>}
                </tr>
              </thead>
              <tbody>
                {roles.map((r: any) => (
                  <tr key={r.id} className="border-b border-gray-100 row-hover">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center text-base font-bold shadow">
                          <Shield size={16} strokeWidth={2.25} />
                        </div>
                        <div>
                          <div className="font-extrabold text-gray-900">{r.name}</div>
                          <div className="text-xs text-gray-500">Role ID: {r.id}</div>
                        </div>
                      </div>
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3">
                        <div className="flex gap-1.5 items-center">
                          {/* Show Permissions */}
                          <button
                            onClick={() => handleShowPermissions(r)}
                            title="Show Permissions"
                            className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 rounded-lg transition cursor-pointer border-none inline-flex items-center gap-1"
                          >
                            <Eye size={12} strokeWidth={2.25} />
                            View
                          </button>
                          {/* Manage Permissions */}
                          <button
                            onClick={() => router.push(`/roles/${r.id}/permissions`)}
                            title="Manage Permissions"
                            className="px-3 py-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-800 rounded-lg transition cursor-pointer border-none inline-flex items-center gap-1"
                          >
                            <KeyRound size={12} strokeWidth={2.25} />
                            Manage
                          </button>
                          {/* Edit */}
                          <button onClick={() => handleEditRole(r)} className="px-3 py-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-800 rounded-lg transition cursor-pointer border-none inline-flex items-center gap-1">
                            <Pencil size={12} strokeWidth={2.25} /> {t('common.edit')}
                          </button>
                          {/* Delete */}
                          <button onClick={() => handleDelete(r.id)} className="px-3 py-1.5 text-xs font-bold text-red-600 hover:text-red-800 rounded-lg transition cursor-pointer border-none inline-flex items-center gap-1">
                            <Trash2 size={12} strokeWidth={2.25} /> {t('common.delete')}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {roles.length === 0 && (
            <div className="p-10 text-center">
              <Tag size={36} strokeWidth={1.75} className="text-gray-300 mx-auto mb-2" />
              <p className="text-gray-400">{t('roles.noRoles')}</p>
            </div>
          )}
        </div>
      )}

      {showEditModal && showEdit && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowEditModal(false)}>
          <div className="bg-white dark:bg-[#1a1d27] rounded-2xl w-full max-w-md shadow-2xl animate-scale-in" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 bg-indigo-600 rounded-t-2xl flex items-center gap-2">
              <Pencil size={16} strokeWidth={2} className="text-white" />
              <h3 className="text-white font-bold">Edit Role</h3>
            </div>
            <div className="p-6">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-2">Role Name *</label>
              <input
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSaveEditName()}
                className="w-full border-2 border-slate-200 dark:border-[#2a2d38] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-4 focus:border-indigo-500 focus:ring-indigo-100 bg-white dark:bg-[#12141c] text-slate-900 dark:text-slate-100"
                placeholder="e.g. Manager"
                autoFocus
              />
            </div>
            <div className="flex items-center gap-3 px-6 py-4 border-t border-slate-100 dark:border-[#2a2d38] bg-slate-50 dark:bg-[#12141c] rounded-b-2xl">
              <button
                onClick={handleSaveEditName}
                disabled={editNameSaving || !editName.trim()}
                className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition cursor-pointer border-none"
              >
                {editNameSaving ? (
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                ) : <Check size={13} strokeWidth={2.5} />}
                {editNameSaving ? 'Saving...' : 'Save Changes'}
              </button>
              <button onClick={() => setShowEditModal(false)} className="px-5 py-2 text-sm font-semibold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 rounded-xl transition cursor-pointer border border-slate-200 dark:border-[#2a2d38] bg-white dark:bg-slate-800/60">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Show Permissions Modal ── */}
      {showPermsModal && permsRole && (
        <div
          className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          style={{ minHeight: '100vh' }}
          onClick={() => setShowPermsModal(false)}
        >
          <div
            className="bg-white dark:bg-[#1a1d27] rounded-2xl w-full max-w-2xl shadow-2xl animate-scale-in border border-slate-200 dark:border-[#2a2d38] flex flex-col overflow-hidden"
            style={{ maxHeight: 'calc(90vh - 3rem)', margin: 'auto', height: 'auto' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100 dark:border-[#2a2d38] shrink-0">
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

              {/* Stats bar */}
              {!permsLoading && (
                <div className="flex items-center gap-4 mt-3 pt-3 border-t border-slate-100 dark:border-[#2a2d38]">
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
            <div className="overflow-y-auto p-6" style={{ maxHeight: "calc(90vh - 8rem)" }}>
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
            <div className="shrink-0 flex justify-end px-6 py-4 border-t border-slate-100 dark:border-[#2a2d38] bg-slate-50 dark:bg-[#12141c]">
              <button
                onClick={() => setShowPermsModal(false)}
                className="px-6 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition cursor-pointer border-none shadow-sm"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
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

  // Group by module
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
    <div className="space-y-6">
      {sortedModules.map((mod) => {
        const label = MODULE_LABELS[mod] || mod.charAt(0).toUpperCase() + mod.slice(1)
        const iconPath = MODULE_ICONS[mod] || null
        const assigned = groups[mod].filter((p: any) => p.assigned)
        const notAssigned = groups[mod].filter((p: any) => !p.assigned)

        return (
          <div key={mod} className="border border-slate-100 dark:border-[#2a2d38] rounded-xl overflow-hidden">
            {/* Module header */}
            <div className="bg-slate-50 dark:bg-[#12141c] px-4 py-3 flex items-center gap-3">
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

            {/* Permission items — tags layout */}
            <div className="p-4 bg-white dark:bg-[#1a1d27] flex flex-wrap gap-2">
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
                  <span className="whitespace-nowrap">{p.name.split('.')[1].replace(/_/g, ' ')}</span>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
