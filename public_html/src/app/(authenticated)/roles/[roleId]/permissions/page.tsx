'use client'
import PageLoader from '@/components/PageLoader'
import RequirePermission from '@/components/RequirePermission'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { useParams, useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { ArrowLeft, Check, ChevronDown, ChevronRight, Shield } from 'lucide-react'
import api from '@/lib/api'
import { roleSchema, type RoleInput } from '@/lib/schemas'

// ---------------------------------------------------------------------------
// Format a raw permission name into a clean human-readable label.
// E.g. "projects.manage_members" → "Manage Members"
//      "attendance.break_adjustment.manage" → "Break Adjustment Manage"
// ---------------------------------------------------------------------------
function fmtPerm(permName: string): string {
  const action = String(permName).split('.')[String(permName).split('.').length - 1]
  const labels: Record<string, string> = {
    view: 'View',
    view_all: 'View All',
    view_own: 'View Own',
    view_profile: 'View Profile',
    edit_profile: 'Edit Profile',
    create: 'Create',
    edit: 'Edit',
    edit_all: 'Edit All',
    edit_own: 'Edit Own',
    delete: 'Delete',
    manage_members: 'Manage Members',
    assign: 'Assign',
    approve: 'Approve',
    apply: 'Apply',
    post: 'Post',
    upload: 'Upload',
    export: 'Export',
    manage_events: 'Manage Events',
    manage_holidays: 'Manage Holidays',
    login: 'Login',
    logout: 'Logout',
    clock_in_out: 'Clock In / Out',
    manage: 'Manage',
    manage_all: 'Manage All',
    view_team: 'View Team',
    settings: 'Settings',
    roles: 'Roles & Permissions',
    configure_types: 'Configure Types',
    departments: 'Departments',
    designations: 'Designations',
    view_directory: 'Directory',
    view_reports: 'Reports',
    view_charts: 'Charts',
  }
  // Handle compound keys like "break_adjustment.manage" → "Break Adjustment Manage"
  if (action.includes('_')) {
    const compound = action.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    return labels[action] || compound
  }
  return labels[action] || action.charAt(0).toUpperCase() + action.slice(1)
}

// ---------------------------------------------------------------------------
// Permission item in the grid
// ---------------------------------------------------------------------------
function PermItem({ label, checked, onChange, disabled }: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <label className={`flex items-center gap-2.5 group py-1.5 px-2 rounded-lg transition ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5'}`}>
      <div
        onClick={disabled ? undefined : () => onChange(!checked)}
        className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition
          ${checked
            ? 'bg-indigo-600 border-indigo-600'
            : 'bg-white dark:bg-transparent border-slate-300 dark:border-slate-600'
          } ${disabled ? '' : 'group-hover:border-indigo-400 cursor-pointer'}`}
      >
        {checked && <Check size={10} strokeWidth={3} className="text-white" />}
      </div>
      <input type="checkbox" checked={checked} onChange={() => onChange(!checked)} disabled={disabled} className="sr-only" />
      <span className={`text-sm select-none leading-none ${disabled ? 'text-slate-400 dark:text-slate-500' : checked ? 'font-semibold text-slate-800 dark:text-slate-100' : 'text-slate-600 dark:text-slate-400'}`}>
        {label}
      </span>
    </label>
  )
}

export default function RolePermissionsPage() {
  return (
    <RequirePermission permission="admin.roles">
      <RolePermissionsPageInner />
    </RequirePermission>
  )
}

function RolePermissionsPageInner() {
  const { t } = useTranslation()
  const params = useParams()
  const router = useRouter()
  const roleId = Number(params.roleId)

  // Administrator (roleId 1) is read-only — cannot edit its permissions
  const isReadOnly = roleId === 1;
  // allPerms comes from GET /roles/:id/permissions — the API returns ALL system permissions
  // (not just the role's assigned ones), so we can resolve any name → id.
  const [allPerms, setAllPerms] = useState<any[]>([])
  // selected: Set of permission NAMES (strings) — simpler to work with than ids
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [originalSelected, setOriginalSelected] = useState<Set<string>>(new Set())
  const [roleName, setRoleName] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<RoleInput>({
    resolver: zodResolver(roleSchema),
    mode: 'onBlur',
  })

  // ── Load role + permissions ────────────────────────────────────────────
  useEffect(() => {
    if (!roleId) return
    setLoading(true)
    Promise.all([
      api.get('/roles'),
      api.get(`/roles/${roleId}/permissions`),
    ]).then(([rolesRes, permsRes]) => {
      const found = (rolesRes.roles || []).find((r: any) => r.id === roleId)
      if (!found) { router.push('/roles'); return }
      // API returns ALL system permissions (not just role's assigned ones)
      setAllPerms(permsRes.permissions || [])
      // API returns ALL system permissions with an `assigned` flag per role
      const allPermsData = permsRes.permissions || []
      // Build a name→id map from ALL permissions
      const nameMap: Record<string, number> = {}
      allPermsData.forEach((p: any) => { nameMap[p.name] = p.id })
      // Only permissions with assigned=true are currently granted to this role
      const assignedNames = allPermsData.filter((p: any) => p.assigned).map((p: any) => p.name)
      setSelected(new Set(assignedNames))
      setOriginalSelected(new Set(assignedNames))
      setRoleName(found.name)
      reset({ name: found.name })
    }).catch(() => {
      toast.error('Failed to load role')
      router.push('/roles')
    }).finally(() => setLoading(false))
  }, [roleId])

  // ── Group all permissions by module (first part of "module.action" key) ──
  // Modules are derived dynamically from the actual permissions in allPerms.
  // This ensures we never reference permissions that don't exist in the DB.
  const modules: Array<{ key: string; label: string; perms: Array<{ name: string; label: string }> }> =
    (() => {
      const groups: Record<string, Array<{ name: string; label: string }>> = {}
      const moduleLabels: Record<string, string> = {
        
        projects: 'Project Management',
        
        discussions: 'Discussion Management',
        
        leaves: 'Leave Management',
        attendance: 'Attendance',
        calendar: 'Calendar',
        announcements: 'Announcements',
        notifications: 'Notifications',
        reports: 'Reports',
        
        users: 'User Management',
        activity_logs: 'Activity Logs',
        admin: 'Admin & Settings',
        
        
      }
      allPerms.forEach((p: any) => {
        const parts = String(p.name).split('.')
        if (parts.length < 2) return
        const mod = parts[0]
        if (!groups[mod]) groups[mod] = []
        groups[mod].push({ name: String(p.name), label: fmtPerm(String(p.name)) })
      })
      return Object.entries(groups)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, perms]) => ({
          key,
          label: moduleLabels[key] || key.charAt(0).toUpperCase() + key.slice(1),
          perms: perms.sort((a, b) => a.label.localeCompare(b.label)),
        }))
    })()

  // ── Permission state helpers ────────────────────────────────────────────
  function isSelected(name: string): boolean {
    return selected.has(name)
  }

  function getModuleState(modKey: string): 'checked' | 'unchecked' | 'indeterminate' {
    const mod = modules.find(m => m.key === modKey)
    if (!mod || mod.perms.length === 0) return 'unchecked'
    const modNames = mod.perms.map(p => p.name)
    const allChecked = modNames.every(n => selected.has(n))
    if (allChecked) return 'checked'
    const someChecked = modNames.some(n => selected.has(n))
    return someChecked ? 'indeterminate' : 'unchecked'
  }

  // ── Toggle handlers ─────────────────────────────────────────────────────
  function togglePerm(name: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  function toggleModule(modKey: string) {
    const mod = modules.find(m => m.key === modKey)
    if (!mod) return
    const state = getModuleState(modKey)
    setSelected(prev => {
      const next = new Set(prev)
      if (state === 'checked') {
        mod.perms.forEach(p => next.delete(p.name))
      } else {
        mod.perms.forEach(p => next.add(p.name))
      }
      return next
    })
  }

  function checkAll() {
    setSelected(new Set(allPerms.map((p: any) => p.name)))
  }

  function uncheckAll() {
    setSelected(new Set())
  }

  // ── Submit ──────────────────────────────────────────────────────────────
  const onSubmit = async (data: RoleInput) => {
    setSaving(true)
    try {
      // Update role name if changed
      if (data.name && data.name !== roleName) {
        await api.put(`/roles/${roleId}`, { name: data.name })
      }
      // Resolve selected permission NAMES → IDs
      const nameToId: Record<string, number> = {}
      allPerms.forEach((p: any) => { nameToId[p.name] = p.id })
      const permissionIds = Array.from(selected)
        .filter(n => nameToId[n] != null)
        .map(n => nameToId[n])
      await api.put(`/roles/${roleId}/permissions`, { permissionIds })
      toast.success('Role permissions updated successfully')
      router.push('/roles')
    } catch (err: any) {
      toast.error(err.message || 'Failed to save permissions')
    } finally {
      setSaving(false)
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
          <h2 className="text-white font-bold">Edit Role</h2>
        </div>

        {/* Read-only notice for Administrator */}
        {isReadOnly && (
          <div className="mx-6 mt-4 px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl flex items-start gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>
            <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
              The <strong>Administrator</strong> role has full permissions by default and cannot be modified to prevent accidental lockout.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="p-6 space-y-6">
            {/* ── Role Name ── */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-2">
                Role *
              </label>
              <input
                {...register('name')}
                onChange={(e) => setRoleName(e.target.value)}
                className={`w-full border-2 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-4 transition bg-white dark:bg-[#12141c] ${
                  errors.name
                    ? 'border-red-400 focus:border-red-500 focus:ring-red-100 text-red-900 dark:text-red-300'
                    : 'border-slate-200 dark:border-[#2a2d38] focus:border-indigo-500 focus:ring-indigo-100 text-slate-900 dark:text-slate-100'
                }`}
                placeholder="e.g. Manager"
              />
              {errors.name && <p className="mt-1 text-xs text-red-500">{String(errors.name.message)}</p>}
            </div>

            {/* ── Permissions ── */}
            <div>
              {/* Section header row */}
              <div className="flex items-center justify-between mb-4">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
                  Permissions *
                </label>
                <div className="flex items-center gap-3">
                  {isReadOnly ? (
                    <span className="text-xs text-slate-400 dark:text-slate-500 italic">Read-only</span>
                  ) : (
                    <>
                      <button type="button" onClick={checkAll} className="text-xs font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300 cursor-pointer border-none bg-transparent transition">
                        Check All
                      </button>
                      <span className="text-slate-300 dark:text-slate-600">|</span>
                      <button type="button" onClick={uncheckAll} className="text-xs font-semibold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 cursor-pointer border-none bg-transparent transition">
                        Uncheck All
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Permissions grid — always expanded, no collapse */}
              <div className="border border-slate-200 dark:border-[#2a2d38] rounded-xl overflow-hidden divide-y divide-slate-100 dark:divide-[#2a2d38]">
                {modules.map((mod) => {
                  const modState = getModuleState(mod.key)
                  return (
                    <div key={mod.key}>
                      {/* Module header row */}
                      <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 dark:bg-[#12141c]">
                        {/* Module checkbox */}
                        <div
                          onClick={isReadOnly ? undefined : () => toggleModule(mod.key)}
                          className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition ${isReadOnly ? 'cursor-not-allowed' : 'cursor-pointer'} ${
                            modState === 'checked'
                              ? 'bg-indigo-600 border-indigo-600'
                              : modState === 'indeterminate'
                                ? 'bg-indigo-400 border-indigo-400'
                                : 'bg-white dark:bg-transparent border-slate-300 dark:border-slate-500'
                          }`}
                        >
                          {modState === 'checked' && <Check size={10} strokeWidth={3} className="text-white" />}
                          {modState === 'indeterminate' && <div className="w-2 h-0.5 bg-white rounded-sm" />}
                        </div>

                        {/* Module name + count */}
                        <span className="text-sm font-bold text-indigo-700 dark:text-indigo-400 select-none">
                          {mod.label}
                        </span>
                        <span className="ml-auto text-[11px] text-slate-400 dark:text-slate-500 font-medium pr-1">
                          {mod.perms.length} permission{mod.perms.length !== 1 ? 's' : ''}
                        </span>
                      </div>

                      {/* Always-visible permission grid */}
                      <div className="px-4 py-3 bg-white dark:bg-[#1a1d27]">
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-x-6 gap-y-1">
                          {mod.perms.map((perm) => (
                            <PermItem
                              key={perm.name}
                              label={perm.label}
                              checked={isSelected(perm.name)}
                              onChange={() => togglePerm(perm.name)}
                              disabled={isReadOnly}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* ── Footer: Save + Cancel ── */}
          <div className="flex items-center gap-3 px-6 py-4 border-t border-slate-100 dark:border-[#2a2d38] bg-slate-50 dark:bg-[#12141c]">
            <button
              type="submit"
              disabled={saving || isReadOnly}
              className={`flex items-center gap-2 px-6 py-2.5 text-sm font-semibold rounded-xl transition border-none shadow-sm ${
                isReadOnly
                  ? 'bg-slate-300 dark:bg-slate-700 text-slate-500 dark:text-slate-400 cursor-not-allowed'
                  : 'text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed'
              }`}
            >
              {saving ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
              ) : (
                <Check size={14} strokeWidth={2.5} />
              )}
              {saving ? 'Saving...' : isReadOnly ? 'Saved' : 'Save'}
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
