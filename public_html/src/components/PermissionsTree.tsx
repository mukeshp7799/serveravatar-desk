'use client'
import { useState } from 'react'
import { Check, ChevronDown, ChevronRight } from 'lucide-react'

// ---------------------------------------------------------------------------
// Format a raw permission name into a clean human-readable label.
// E.g. "projects.manage_members" → "Manage Members"
//      "attendance.break_adjustment.manage" → "Break Adjustment Manage"
// ---------------------------------------------------------------------------
export function fmtPerm(permName: string): string {
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
  if (action.includes('_')) {
    const compound = action.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    return labels[action] || compound
  }
  return labels[action] || action.charAt(0).toUpperCase() + action.slice(1)
}

// ---------------------------------------------------------------------------
// Single permission checkbox item
// ---------------------------------------------------------------------------
function PermItem({ label, checked, onChange }: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer group py-1.5 px-2 rounded-lg hover:bg-slate-50 dark:hover:bg-white/5 transition">
      <div
        onClick={() => onChange(!checked)}
        className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition cursor-pointer
          ${checked
            ? 'bg-indigo-600 border-indigo-600'
            : 'bg-white dark:bg-transparent border-slate-300 dark:border-slate-600 group-hover:border-indigo-400'
          }`}
      >
        {checked && <Check size={10} strokeWidth={3} className="text-white" />}
      </div>
      <input type="checkbox" checked={checked} onChange={() => onChange(!checked)} className="sr-only" />
      <span className={`text-sm select-none leading-none ${checked ? 'font-semibold text-slate-800 dark:text-slate-100' : 'text-slate-600 dark:text-slate-400'}`}>
        {label}
      </span>
    </label>
  )
}

// ---------------------------------------------------------------------------
// Module header row (chevron + module checkbox + module name + count)
// ---------------------------------------------------------------------------
function ModuleHeader({ label, count, state, isExpanded, onToggle, onExpand }: {
  label: string
  count: number
  state: 'checked' | 'unchecked' | 'indeterminate'
  isExpanded: boolean
  onToggle: () => void
  onExpand: () => void
}) {
  return (
    <div
      className="flex items-center gap-2.5 px-4 py-3 bg-slate-50 dark:bg-[#12141c] hover:bg-slate-100 dark:hover:bg-[#1a1d27] cursor-pointer transition"
      onClick={onExpand}
    >
      <div className="text-slate-400 dark:text-slate-500 shrink-0">
        {isExpanded
          ? <ChevronDown size={14} strokeWidth={2} />
          : <ChevronRight size={14} strokeWidth={2} />
        }
      </div>
      <div
        onClick={(e) => { e.stopPropagation(); onToggle() }}
        className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 cursor-pointer transition ${
          state === 'checked'
            ? 'bg-indigo-600 border-indigo-600'
            : state === 'indeterminate'
              ? 'bg-indigo-400 border-indigo-400'
              : 'bg-white dark:bg-transparent border-slate-300 dark:border-slate-500'
        }`}
      >
        {state === 'checked' && <Check size={10} strokeWidth={3} className="text-white" />}
        {state === 'indeterminate' && <div className="w-2 h-0.5 bg-white rounded-sm" />}
      </div>
      <span className="text-sm font-bold text-indigo-700 dark:text-indigo-400 select-none">{label}</span>
      <span className="ml-auto text-[11px] text-slate-400 dark:text-slate-500 font-medium pr-1">{count}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Props for PermissionsTree
// ---------------------------------------------------------------------------
export interface PermissionsTreeProps {
  allPerms: any[]                        // all system permissions from API
  selected: Set<string>                  // currently selected permission NAMES
  onChange: (next: Set<string>) => void // called with new Set on any change
  showCheckAll?: boolean                // show Check All / Uncheck All header
}

// ---------------------------------------------------------------------------
// PermissionsTree — full accordion permission editor
// ---------------------------------------------------------------------------
export default function PermissionsTree({ allPerms, selected, onChange, showCheckAll = true }: PermissionsTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(
    new Set() // all collapsed by default; user expands what they need
  )

  // ── Group permissions by module ──────────────────────────────────────────
  const moduleLabels: Record<string, string> = {
    employees:     'Employee Management',
    projects:      'Project Management',
    tasks:         'Task Management',
    discussions:   'Discussion Management',
    hr:            'HR Management',
    leave:         'Leave Management',
    attendance:    'Attendance',
    calendar:      'Calendar',
    announcements: 'Announcements',
    notifications: 'Notifications',
    reports:       'Reports',
    documents:     'Documents',
    users:         'User Management',
    activity_logs: 'Activity Logs',
    admin:         'Admin & Settings',
    auth:          'Auth',
    timelog:       'Timelog',
  }

  const modules: Array<{ key: string; label: string; perms: Array<{ name: string; label: string }> }> =
    (() => {
      const groups: Record<string, Array<{ name: string; label: string }>> = {}
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

  // ── State helpers ────────────────────────────────────────────────────────
  function isSelected(name: string): boolean {
    return selected.has(name)
  }

  function getModuleState(modKey: string): 'checked' | 'unchecked' | 'indeterminate' {
    const mod = modules.find(m => m.key === modKey)
    if (!mod || mod.perms.length === 0) return 'unchecked'
    const allChecked  = mod.perms.every(p => selected.has(p.name))
    const someChecked = mod.perms.some(p => selected.has(p.name))
    if (allChecked) return 'checked'
    if (someChecked) return 'indeterminate'
    return 'unchecked'
  }

  // ── Toggle handlers ──────────────────────────────────────────────────────
  function togglePerm(name: string) {
    onChange(new Set(selected))
    const next = new Set(selected)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    onChange(next)
  }

  function toggleModule(modKey: string) {
    const mod = modules.find(m => m.key === modKey)
    if (!mod) return
    const state = getModuleState(modKey)
    const next = new Set(selected)
    if (state === 'checked') {
      mod.perms.forEach(p => next.delete(p.name))
    } else {
      mod.perms.forEach(p => next.add(p.name))
    }
    onChange(next)
  }

  function checkAll() {
    onChange(new Set(allPerms.map((p: any) => p.name)))
  }

  function uncheckAll() {
    onChange(new Set())
  }

  function expandAll() {
    setExpanded(new Set(modules.map(m => m.key)))
  }

  return (
    <div>
      {/* Check All / Uncheck All row */}
      {showCheckAll && (
        <div className="flex items-center gap-3 mb-4">
          <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
            Permissions *
          </span>
          <div className="ml-auto flex items-center gap-3">
            <button type="button" onClick={() => { checkAll(); expandAll() }} className="text-xs font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300 cursor-pointer border-none bg-transparent transition">
              Check All
            </button>
            <span className="text-slate-300 dark:text-slate-600">|</span>
            <button type="button" onClick={uncheckAll} className="text-xs font-semibold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 cursor-pointer border-none bg-transparent transition">
              Uncheck All
            </button>
          </div>
        </div>
      )}

      {/* Accordion */}
      <div className="border border-slate-200 dark:border-[#2a2d38] rounded-xl overflow-hidden divide-y divide-slate-100 dark:divide-[#2a2d38]">
        {modules.map((mod) => {
          const modState = getModuleState(mod.key)
          const isExpanded = expanded.has(mod.key)
          return (
            <div key={mod.key}>
              <ModuleHeader
                label={mod.label}
                count={mod.perms.length}
                state={modState}
                isExpanded={isExpanded}
                onToggle={() => toggleModule(mod.key)}
                onExpand={() => setExpanded(prev => {
                  const next = new Set(prev)
                  if (next.has(mod.key)) next.delete(mod.key)
                  else next.add(mod.key)
                  return next
                })}
              />
              {isExpanded && (
                <div className="px-4 py-3 bg-white dark:bg-[#1a1d27]">
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-x-6 gap-y-1">
                    {mod.perms.map((perm) => (
                      <PermItem
                        key={perm.name}
                        label={perm.label}
                        checked={isSelected(perm.name)}
                        onChange={() => togglePerm(perm.name)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
