'use client'
import PortalModal from '@/components/PortalModal';
import Scroll from '@/components/Scroll';

/**
 * /projects/[projectId]/test-cases
 *
 * Test Cases module — Basecamp-style management UI.
 *
 * Layout:
 *   ┌─ Sidebar (w-64) ─────┐  ┌─ Main ───────────────────────────────┐
 *   │  Test Suites          │  │  Header (title + New Test Case btn)   │
 *   │  + New Suite btn      │  │  Stat cards (Total, Passed, ...)     │
 *   │  List of suites       │  │  Search + filter row + My Cases btn  │
 *   │                       │  │  Test cases table (server paginated)  │
 *   │                       │  │  Pagination bar                       │
 *   └───────────────────────┘  └──────────────────────────────────────┘
 *
 * Test Case Detail slide-in panel (right, w-[700px]) with tabs:
 *   Overview | Steps | Comments | Attachments
 *
 * Changes (multiple-assignees, My TC, inline status/priority, attachment improvements):
 *   - Multiple assignees displayed as avatar stacks/chips
 *   - Inline status/priority editing in table and detail panel
 *   - "My Test Cases" filter toggle
 *   - Image lightbox, drag-and-drop, clipboard paste for attachments
 */

import ReactDOM from 'react-dom'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import {
  AlertCircle, ChevronLeft, ChevronRight, ClipboardCheck, FileIcon, Folder, MoreVertical,
  Pencil, Plus, Search, Send, Trash2, Upload, User as UserIcon, X, Paperclip,
  MessageCircle, CheckCircle2, ListChecks, Tag, Calendar as CalIcon, Hash, Image as ImageIcon,
  UserCircle, Info, Layers, SkipForward, RotateCw,
} from 'lucide-react'
import ProjectLayout from '@/components/project/ProjectLayout'
import { fmtRelative, fmtDateShort } from '@/components/project/format'
import ConfirmDialog from '@/components/project/ConfirmDialog'
import ReactionBar from '@/components/project/ReactionBar'
import PaginationBar from '@/components/project/PaginationBar'
import { useTaskBoard, type BoardUser } from '@/lib/task-board-api'
import {
  useProjectTestCases, useTestCaseDetail,
  type TestCase, type TestStatus, type TestPriority, type TestSuite, type TestStep, type SuiteUser, type ExecutionStatus,
} from '@/lib/test-cases-api'

/* ──────────────────────────────────────────────────────────────────
 * Design tokens
 * ────────────────────────────────────────────────────────────────── */
const PRIORITY_COLOR: Record<TestPriority, string> = {
  low:      'bg-emerald-500',
  medium:   'bg-amber-500',
  high:     'bg-orange-500',
  critical: 'bg-rose-500',
}
const PRIORITY_LABEL: Record<TestPriority, string> = {
  low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical',
}
const PRIORITY_BG: Record<TestPriority, string> = {
  critical: 'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800',
  high:     'bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800',
  medium:   'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800',
  low:      'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800',
}

const STATUS_COLOR: Record<TestStatus, string> = {
  draft:       'bg-gray-500',
  ready:       'bg-blue-500',
  in_progress: 'bg-indigo-500',
  passed:      'bg-emerald-500',
  failed:      'bg-rose-500',
  skipped:     'bg-yellow-500',
}
const STATUS_LABEL: Record<TestStatus, string> = {
  draft: 'Draft', ready: 'Ready', in_progress: 'In Progress', passed: 'Passed', failed: 'Failed', skipped: 'Skipped',
}
const STATUS_BG: Record<TestStatus, string> = {
  draft:       'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700',
  ready:       'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800',
  in_progress: 'bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800',
  passed:      'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800',
  failed:      'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800',
  skipped:     'bg-yellow-50 dark:bg-yellow-950/30 text-yellow-700 dark:text-yellow-300 border border-yellow-200 dark:border-yellow-800',
}
const STATUSES: TestStatus[] = ['draft', 'ready', 'in_progress', 'failed', 'skipped']
// Includes 'passed' for filter dropdown (passed is filterable but not manually settable)
const FILTER_STATUSES: TestStatus[] = ['draft', 'ready', 'in_progress', 'passed', 'failed', 'skipped']
const PRIORITIES: TestPriority[] = ['low', 'medium', 'high', 'critical']


/* ─────────────────────────────────────────────────────────────────────────────
/* ─────────────────────────────────────────────────────────────────────────────
 * FloatingMenu — portal-based dropdown rendered at document.body level.
 * Uses position:fixed anchored to the trigger button via getBoundingClientRect(),
 * so it escapes all overflow:hidden/auto ancestors (tables, sidebars, etc.).
 *
 * Uses the same mounted-delay pattern as PortalModal to ensure the portal
 * is NEVER rendered at position (0,0) — position is calculated in
 * useLayoutEffect (synchronous, before paint) and the portal is only
 * created after that calculation completes.
 * ───────────────────────────────────────────────────────────────────────────── */
function FloatingMenu({
  children,
  anchorRef,
  onClose,
  offsetY = 4,
}: {
  children: React.ReactNode
  anchorRef: React.RefObject<HTMLElement | null>
  onClose: () => void
  offsetY?: number
}) {
  const menuRef = useRef<HTMLDivElement>(null)
  // Track whether the menu is positioned (visible). Starts invisible.
  const [positioned, setPositioned] = useState(false)

  // Sync position synchronously before paint via direct DOM manipulation.
  // This avoids the render → setPos → re-render cycle that can cause a
  // brief portal flash at (0,0) in React 18 concurrent mode + StrictMode.
  // Runs whenever anchor changes to ensure correct positioning even on first render.
  useLayoutEffect(() => {
    const el = anchorRef.current
    const menu = menuRef.current
    if (!el || !menu) return
    // Guard: only show the menu if the anchor has actual dimensions.
    // This prevents duplicate portals from off-screen/detail-panel dropdowns.
    const rect = el.getBoundingClientRect()
    if (!rect || rect.width === 0 || rect.height === 0) return
    // Apply position directly to the DOM element — no state re-render needed.
    menu.style.top = `${rect.bottom + window.scrollY + offsetY}px`
    menu.style.left = `${rect.left + window.scrollX}px`
    menu.style.visibility = 'visible'
    setPositioned(true)
  }, [anchorRef, offsetY])

  // Keep position updated on scroll/resize (runs after paint, updates DOM directly)
  useEffect(() => {
    const el = anchorRef.current
    const menu = menuRef.current
    if (!el || !menu) return
    const update = () => {
      const rect = el.getBoundingClientRect()
      menu.style.top = `${rect.bottom + window.scrollY + offsetY}px`
      menu.style.left = `${rect.left + window.scrollX}px`
    }
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [anchorRef, offsetY])

  // Click-outside and Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node) && !anchorRef.current?.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [anchorRef, onClose])

  // Portal is ALWAYS rendered (no early return) — starts invisible at origin,
  // then useLayoutEffect makes it visible at the correct coordinates in the
  // same commit phase, so it never appears at (0,0).
  // Guard: only show the portal if the anchor has actual dimensions.
  // This prevents duplicate portals from detail-panel dropdowns that mount
  // with left=0/top=0 (off-screen) from appearing at the origin.
  const anchorRect = anchorRef.current?.getBoundingClientRect()
  const anchorHasSize = anchorRect && anchorRect.width > 0 && anchorRect.height > 0

  return ReactDOM.createPortal(
    <div
      ref={menuRef}
      className="fixed z-[9999] bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 py-1.5 min-w-[160px] focus:outline-none"
      style={{ top: 0, left: 0, visibility: positioned && anchorHasSize ? 'visible' : 'hidden', pointerEvents: positioned && anchorHasSize ? 'auto' : 'none' }}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  )
}

/* ──────────────────────────────────────────────────────────────────
 * Avatar
 * ────────────────────────────────────────────────────────────────── */
function Avatar({ user, size = 8 }: { user: BoardUser | SuiteUser | null | undefined; size?: number }) {
  if (!user) return null
  const initials = user.name?.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase() || '?'
  const hash = (typeof user.id === 'number' ? user.id : Number(user.id) || 1) * 9301 + 49297
  const hue = (hash % 233280) / 233280 * 360
  return (
    <span
      data-tooltip-id="app-tooltip"
      data-tooltip-content={user.name}
      className="inline-flex items-center justify-center rounded-full ring-2 ring-white dark:ring-gray-900 font-bold shrink-0 select-none cursor-default"
      style={{
        width: size * 4,
        height: size * 4,
        fontSize: Math.max(size * 4 * 0.35, 8),
        background: `linear-gradient(135deg, hsl(${hue}, 70%, 50%), hsl(${(hue + 40) % 360}, 70%, 40%))`,
      }}
    >
      <span className="text-white drop-shadow-sm">{initials}</span>
    </span>
  )
}

/* ──────────────────────────────────────────────────────────────────
 * Avatar stack for multiple assignees
 * Matches the avatar group styling from the Todo list and project header.
 * ────────────────────────────────────────────────────────────────── */
function AvatarStack({ users, max = 4, size = 6, showPassed = false }: { users: SuiteUser[]; max?: number; size?: number; showPassed?: boolean }) {
  if (!users.length) return <span className="text-xs text-gray-400 italic">Unassigned</span>
  const shown = users.slice(0, max)
  const extra = users.length - max

  return (
    <span className="inline-flex items-center -space-x-1">
      {shown.map((u) => (
        <span key={u.id} className="relative">
          <Avatar user={u} size={size} />
          {showPassed && 'passed' in u && (
            <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white dark:border-gray-900 ${
              u.passed ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
            }`} />
          )}
        </span>
      ))}
      {extra > 0 && (
        <span
          data-tooltip-id="app-tooltip"
          data-tooltip-content={users.slice(max).map((u) => u.name).join(', ')}
          className="w-5 h-5 inline-flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 text-slate-700 dark:text-slate-300 text-[9px] font-medium ring-1 ring-white dark:ring-gray-900 shrink-0 antialiased"
        >
          +{extra}
        </span>
      )}
    </span>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Inline status dropdown — anchored directly below the trigger button.
 * Works in two modes:
 *  - With rowId + openDropdownId/openDropdownType: controlled, shared state (table cells)
 *  - Without rowId: uncontrolled, own local state (detail panel)
 * ───────────────────────────────────────────────────────────────────────────── */
function InlineStatusSelect({
  status, onChange,
  rowId, openDropdownId, openDropdownType, onOpen, onClose,
}: {
  status: TestStatus; onChange: (s: TestStatus) => void
  rowId?: string | number; openDropdownId?: string | number | null; openDropdownType?: 'status' | 'priority' | null
  onOpen?: (id: string | number, type: 'status' | 'priority') => void; onClose?: () => void
}) {
  const [localOpen, setLocalOpen] = useState(false)
  const hasControlledState = rowId !== undefined
  const isOpen = hasControlledState
    ? openDropdownId === rowId && openDropdownType === 'status'
    : localOpen

  // Ref to detect if the document mousedown listener already closed the dropdown
  // (prevents button's own click handler from re-opening it)
  const didDocumentClose = useRef(false)

  const handleOpen = () => {
    didDocumentClose.current = false
    if (hasControlledState && onOpen) onOpen(rowId!, 'status')
    else setLocalOpen(true)
  }
  const handleClose = () => {
    // NOTE: do NOT set didDocumentClose.current = true here.
    // didDocumentClose.current is only set by the document mousedown listener
    // (to prevent trigger click from immediately reopening after outside-click close).
    // When handleClose is called (e.g., clicking an option), we want the next
    // trigger click to reopen the dropdown normally.
    if (hasControlledState && onClose) onClose()
    else setLocalOpen(false)
  }

  const triggerRef = useRef<HTMLButtonElement>(null)

  return (
    <div className="relative inline-block text-left">
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          // Reset flag at start of handler — allows dropdown to reopen on next trigger click
          // regardless of whether it was closed by document mousedown or by clicking an option
          if (didDocumentClose.current) didDocumentClose.current = false
          else isOpen ? handleClose() : handleOpen()
        }}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-bold cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-teal-500 shadow-sm hover:shadow-md ${STATUS_BG[status]}`}
      >
        <span className={`w-2 h-2 rounded-full ${STATUS_COLOR[status]} ring-1 ring-black/10`} />
        {STATUS_LABEL[status]}
        <svg className="w-3 h-3 opacity-60" viewBox="0 0 12 12" fill="none"><path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </button>
      {isOpen && (
        <FloatingMenu anchorRef={triggerRef} onClose={handleClose}>
          <div className="px-2 pb-1">
            <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400 px-2 pt-1 pb-2">Change Status</p>
            {STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                onMouseDown={(e) => { e.stopPropagation(); onChange(s); handleClose() }}
                className={`w-full text-left px-2 py-2 text-sm font-semibold flex items-center gap-3 bg-transparent border-none cursor-pointer rounded-xl mb-0.5 transition-colors ${
                  s === status ? `${STATUS_BG[s]} font-bold` : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                <span className={`w-3 h-3 rounded-full ${STATUS_COLOR[s]} ring-1 ring-black/10`} />
                {STATUS_LABEL[s]}
                {s === status && (
                  <svg className="w-4 h-4 ml-auto text-teal-600" viewBox="0 0 16 16" fill="none"><path d="M3 8l3.5 3.5L13 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                )}
              </button>
            ))}
          </div>
        </FloatingMenu>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Inline priority dropdown — anchored directly below the trigger button.
 * Works in two modes:
 *  - With rowId + openDropdownId/openDropdownType: controlled, shared state (table cells)
 *  - Without rowId: uncontrolled, own local state (detail panel)
 * ───────────────────────────────────────────────────────────────────────────── */
function InlinePrioritySelect({
  priority, onChange,
  rowId, openDropdownId, openDropdownType, onOpen, onClose,
}: {
  priority: TestPriority; onChange: (p: TestPriority) => void
  rowId?: string | number; openDropdownId?: string | number | null; openDropdownType?: 'status' | 'priority' | null
  onOpen?: (id: string | number, type: 'status' | 'priority') => void; onClose?: () => void
}) {
  const [localOpen, setLocalOpen] = useState(false)
  const hasControlledState = rowId !== undefined
  const isOpen = hasControlledState
    ? openDropdownId === rowId && openDropdownType === 'priority'
    : localOpen

  // Ref to detect if the document mousedown listener already closed the dropdown
  // (prevents button's own click handler from re-opening it)
  const didDocumentClose = useRef(false)

  const handleOpen = () => {
    didDocumentClose.current = false
    if (hasControlledState && onOpen) onOpen(rowId!, 'priority')
    else setLocalOpen(true)
  }
  const handleClose = () => {
    // NOTE: do NOT set didDocumentClose.current = true here.
    // didDocumentClose.current is only set by the document mousedown listener
    // (to prevent trigger click from immediately reopening after outside-click close).
    // When handleClose is called (e.g., clicking an option), we want the next
    // trigger click to reopen the dropdown normally.
    if (hasControlledState && onClose) onClose()
    else setLocalOpen(false)
  }

  const triggerRef = useRef<HTMLButtonElement>(null)

  return (
    <div className="relative inline-block text-left">
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          // Reset flag at start of handler — allows dropdown to reopen on next trigger click
          // regardless of whether it was closed by document mousedown or by clicking an option
          if (didDocumentClose.current) didDocumentClose.current = false
          else isOpen ? handleClose() : handleOpen()
        }}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-bold cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-teal-500 shadow-sm hover:shadow-md ${PRIORITY_BG[priority]}`}
      >
        <span className={`w-2 h-2 rounded-full ${PRIORITY_COLOR[priority]} ring-1 ring-black/10`} />
        {PRIORITY_LABEL[priority]}
        <svg className="w-3 h-3 opacity-60" viewBox="0 0 12 12" fill="none"><path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </button>
      {isOpen && (
        <FloatingMenu anchorRef={triggerRef} onClose={handleClose}>
          <div className="px-2 pb-1">
            <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400 px-2 pt-1 pb-2">Change Priority</p>
            {PRIORITIES.map((p) => (
              <button
                key={p}
                type="button"
                onMouseDown={(e) => { e.stopPropagation(); onChange(p); handleClose() }}
                className={`w-full text-left px-2 py-2 text-sm font-semibold flex items-center gap-3 bg-transparent border-none cursor-pointer rounded-xl mb-0.5 transition-colors ${
                  p === priority ? `${PRIORITY_BG[p]} font-bold` : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                <span className={`w-3 h-3 rounded-full ${PRIORITY_COLOR[p]} ring-1 ring-black/10`} />
                {PRIORITY_LABEL[p]}
                {p === priority && (
                  <svg className="w-4 h-4 ml-auto text-teal-600" viewBox="0 0 16 16" fill="none"><path d="M3 8l3.5 3.5L13 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                )}
              </button>
            ))}
          </div>
        </FloatingMenu>
      )}
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────
 * Stat card
 * ────────────────────────────────────────────────────────────────── */
function StatCard({
  label, count, dot, accent = 'teal',
}: { label: string; count: number; dot?: string; accent?: 'teal' | 'emerald' | 'rose' | 'purple' | 'yellow' | 'blue' | 'gray' | 'indigo' }) {
  const gradients: Record<string, string> = {
    teal: 'from-teal-500 to-emerald-500',
    emerald: 'from-emerald-500 to-green-500',
    rose: 'from-rose-500 to-pink-500',
    purple: 'from-purple-500 to-violet-500',
    yellow: 'from-yellow-500 to-amber-500',
    blue: 'from-blue-500 to-cyan-500',
    gray: 'from-gray-400 to-gray-500',
    indigo: 'from-indigo-500 to-violet-500',
  }
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden relative">
      <div className={`h-1 w-full bg-gradient-to-r ${gradients[accent] || gradients.teal}`} />
      <div className="px-4 py-3.5 flex items-center gap-3">
        <span className={`w-2.5 h-2.5 rounded-full ${dot || 'bg-teal-500'} shrink-0`} />
        <div className="flex-1 min-w-0">
          <p className="text-[11px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500">{label}</p>
          <p className="text-2xl font-extrabold text-gray-900 dark:text-white mt-0.5">{count}</p>
        </div>
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────
 * Badge
 * ────────────────────────────────────────────────────────────────── */
function PriorityBadge({ priority }: { priority: TestPriority }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${PRIORITY_BG[priority]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${PRIORITY_COLOR[priority]}`} />
      {PRIORITY_LABEL[priority]}
    </span>
  )
}
function StatusBadge({ status }: { status: TestStatus }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${STATUS_BG[status]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${STATUS_COLOR[status]}`} />
      {STATUS_LABEL[status]}
    </span>
  )
}

/* ──────────────────────────────────────────────────────────────────
 * Suite sidebar item
 * ────────────────────────────────────────────────────────────────── */
function SuiteItem({
  suite, active, onSelect, onRename, onDelete,
}: {
  suite: TestSuite
  active: boolean
  onSelect: () => void
  onRename: (newName: string) => Promise<void>
  onDelete: () => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(suite.name)
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const menuBtnRef = useRef<HTMLButtonElement>(null)
  useEffect(() => { setValue(suite.name) }, [suite.name])

  const save = async () => {
    const v = value.trim()
    if (!v || v === suite.name) { setEditing(false); return }
    try { await onRename(v); } catch (e: any) { toast.error(e?.message || 'Failed to rename'); setValue(suite.name) }
    setEditing(false)
  }

  return (
    <div className={`group relative rounded-xl border transition-all ${
      active
        ? 'bg-teal-50 dark:bg-teal-950/30 border-teal-200 dark:border-teal-800'
        : 'bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-800 hover:border-teal-200 dark:hover:border-teal-800'
    }`}>
      {editing ? (
        <div className="px-3 py-2.5">
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); save() }
              if (e.key === 'Escape') { setEditing(false); setValue(suite.name) }
            }}
            onBlur={save}
            className="w-full text-sm font-semibold bg-white dark:bg-gray-800 border border-teal-300 dark:border-teal-700 rounded-lg px-2 py-1 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={onSelect}
          className="w-full text-left px-3 py-2.5 flex items-center gap-2.5"
        >
          <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
            active ? 'bg-teal-500 text-white' : 'bg-teal-100 dark:bg-teal-900/40 text-teal-600 dark:text-teal-300'
          }`}>
            <Folder size={14} strokeWidth={2.5} />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{suite.name}</p>
            <p className="text-[11px] text-gray-400 dark:text-gray-500">{suite.test_case_count} test{suite.test_case_count === 1 ? '' : 's'}</p>
          </div>
        </button>
      )}

      {!editing && (
        <div className="absolute right-1.5 top-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
          <button
            ref={menuBtnRef}
            type="button"
            onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o) }}
            className="w-7 h-7 inline-flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 bg-white/80 dark:bg-gray-900/80 hover:bg-white dark:hover:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer backdrop-blur transition-colors"
            aria-label="Suite actions"
          >
            <MoreVertical size={13} />
          </button>
          {menuOpen && menuBtnRef.current && (
            <FloatingMenu anchorRef={menuBtnRef} onClose={() => setMenuOpen(false)}>
              <button
                type="button"
                onClick={() => { setMenuOpen(false); setEditing(true) }}
                className="w-full text-left px-3 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-teal-50 dark:hover:bg-teal-950/30 hover:text-teal-700 dark:hover:text-teal-300 flex items-center gap-2.5 border-none bg-transparent cursor-pointer rounded-xl mx-1 transition-colors"
              >
                <Pencil size={13} /> Rename
              </button>
              <button
                type="button"
                onClick={() => { setMenuOpen(false); setConfirmDel(true) }}
                className="w-full text-left px-3 py-2.5 text-sm font-semibold text-rose-600 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/30 flex items-center gap-2.5 border-none bg-transparent cursor-pointer rounded-xl mx-1 transition-colors"
              >
                <Trash2 size={13} /> Delete
              </button>
            </FloatingMenu>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmDel}
        title={`Delete suite "${suite.name}"?`}
        description={`This will permanently delete the suite and all ${suite.test_case_count} test case${suite.test_case_count === 1 ? '' : 's'} inside it.`}
        confirmLabel="Delete suite"
        destructive
        onConfirm={async () => { setConfirmDel(false); try { await onDelete() } catch (e: any) { toast.error(e?.message || 'Failed') } }}
        onCancel={() => setConfirmDel(false)}
      />
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────
 * New suite modal
 * ────────────────────────────────────────────────────────────────── */
function NewSuiteModal({
  open, onClose, onCreate,
}: { open: boolean; onClose: () => void; onCreate: (name: string, description?: string | null) => Promise<void> }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) { setName(''); setDescription('') } }, [open])
  if (!open) return null

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const v = name.trim()
    if (!v) return
    setBusy(true)
    try { await onCreate(v, description.trim() || null); onClose() }
    catch (err: any) { toast.error(err?.message || 'Failed') }
    finally { setBusy(false) }
  }

  return (
    <PortalModal>
            <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
              <form
                onClick={(e) => e.stopPropagation()}
                onSubmit={submit}
                className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-xl p-5 w-full max-w-md space-y-4"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-gray-900 dark:text-white">New test suite</h3>
                  <button type="button" onClick={onClose} aria-label="Close" className="w-8 h-8 inline-flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg border-none cursor-pointer">
                    <X size={16} />
                  </button>
                </div>
                <input
                  autoFocus type="text" value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="Suite name (e.g. Smoke tests)"
                  className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 dark:focus:ring-teal-900"
                />
                <textarea
                  value={description} onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional description"
                  rows={2}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 dark:focus:ring-teal-900 resize-none"
                />
                <div className="flex items-center justify-end gap-2 pt-2">
                  <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl border-none cursor-pointer">Cancel</button>
                  <button type="submit" disabled={!name.trim() || busy} className="px-4 py-2 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 rounded-xl border-none cursor-pointer shadow">
                    {busy ? 'Creating…' : 'Create suite'}
                  </button>
                </div>
              </form>
            </div>
    </PortalModal>
  )
}

/* ──────────────────────────────────────────────────────────────────
 * New test case modal (multiple assignees)
 * ────────────────────────────────────────────────────────────────── */
interface DraftStep { description: string; expected_result: string }
/* ──────────────────────────────────────────────────────────────────
 * Label with info tooltip
 * ────────────────────────────────────────────────────────────────── */
function LabelWithTooltip({ label, tooltip, htmlFor }: { label: string; tooltip: string; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500 mb-1.5 cursor-help z-[999999]">
      <span>{label}</span>
      <span
        data-tooltip-id="app-tooltip"
        data-tooltip-content={tooltip}
        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
      >
        <Info size={11} strokeWidth={2} />
      </span>
    </label>
  )
}

function NewTestCaseModal({
  open, onClose, suites, members, projectTasks, onCreate,
}: {
  open: boolean
  onClose: () => void
  suites: TestSuite[]
  members: BoardUser[]
  projectTasks: Array<{ id: number | string; title: string }>
  onCreate: (input: any) => Promise<void>
}) {
  const [title, setTitle] = useState('')
  const [suiteId, setSuiteId] = useState<string>('')
  const [taskId, setTaskId] = useState<string>('')
  const [priority, setPriority] = useState<TestPriority>('medium')
  const [status, setStatus] = useState<TestStatus>('draft')
  const [selectedAssignees, setSelectedAssignees] = useState<Set<number | string>>(new Set())
  const [preconditions, setPreconditions] = useState('')
  const [expected, setExpected] = useState('')
  const [steps, setSteps] = useState<DraftStep[]>([{ description: '', expected_result: '' }])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setTitle(''); setSuiteId(''); setTaskId(''); setPriority('medium'); setStatus('draft')
      setSelectedAssignees(new Set()); setPreconditions(''); setExpected('')
      setSteps([{ description: '', expected_result: '' }])
    }
  }, [open])

  const toggleAssignee = (id: number | string) => {
    setSelectedAssignees((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (!open) return null

  const addStep = () => setSteps((s) => [...s, { description: '', expected_result: '' }])
  const removeStep = (i: number) => setSteps((s) => s.filter((_, idx) => idx !== i))
  const updateStep = (i: number, partial: Partial<DraftStep>) =>
    setSteps((s) => s.map((x, idx) => idx === i ? { ...x, ...partial } : x))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) { toast.error('Title required'); return }
    if (!suiteId) { toast.error('Suite required'); return }
    setBusy(true)
    try {
      const validSteps = steps.filter((s) => s.description.trim()).map((s) => ({
        description: s.description.trim(),
        expected_result: s.expected_result.trim() || null,
      }))
      await onCreate({
        title: title.trim(),
        suite_id: suiteId,
        task_id: taskId ? Number(taskId) : null,
        priority, status,
        assignee_ids: Array.from(selectedAssignees),
        preconditions: preconditions.trim() || null,
        expected_result: expected.trim() || null,
        actual_result: null,
        steps: validSteps,
      })
      onClose()
    } catch (err: any) {
      toast.error(err?.message || 'Failed')
    } finally { setBusy(false) }
  }

  return (
    <PortalModal>
            <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
              <form
                onClick={(e) => e.stopPropagation()}
                onSubmit={submit}
                className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto"
              >
                <div className="sticky top-0 bg-white dark:bg-gray-900 z-10 flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-500 flex items-center justify-center">
                      <ClipboardCheck size={14} strokeWidth={2.5} className="text-white" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-gray-900 dark:text-white">New test case</h3>
                      <p className="text-[11px] text-gray-400">Define the scenario, preconditions, and steps.</p>
                    </div>
                  </div>
                  <button type="button" onClick={onClose} aria-label="Close" className="w-8 h-8 inline-flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg border-none cursor-pointer">
                    <X size={16} />
                  </button>
                </div>
        
                <div className="p-6 space-y-4">
                  {/* Title */}
                  <div>
                    <LabelWithTooltip label="Title" tooltip="A clear, descriptive name for this test case (e.g. Verify login with valid credentials)" />
                    <input
                      autoFocus type="text" value={title} onChange={(e) => setTitle(e.target.value)}
                      placeholder="e.g. Verify login with valid credentials"
                      className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 dark:focus:ring-teal-900"
                    />
                  </div>
        
                  {/* Suite + Priority + Status */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <LabelWithTooltip label="Suite" tooltip="Groups related test cases together (e.g. Smoke tests, Regression suite)" />
                      <select value={suiteId} onChange={(e) => setSuiteId(e.target.value)}
                        className="w-full appearance-none px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 dark:focus:ring-teal-900">
                        <option value="">Select a test suite</option>
                        {suites.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <LabelWithTooltip label="Priority" tooltip="Determines which test cases to run first when time is limited" />
                      <select value={priority} onChange={(e) => setPriority(e.target.value as TestPriority)}
                        className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 dark:focus:ring-teal-900">
                        {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
                      </select>
                    </div>
                    <div>
                      <LabelWithTooltip label="Status" tooltip="Current state: Draft (preparing), Ready (waiting to start), In Progress (testing underway), Passed/Failed (all done), Skipped." />
                      <select value={status} onChange={(e) => setStatus(e.target.value as TestStatus)}
                        className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 dark:focus:ring-teal-900">
                        {FILTER_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                      </select>
                    </div>
                  </div>
        
                  {/* Related task + Assignees */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <LabelWithTooltip label="Related task (optional)" tooltip="Links this test case to a task in the project board for traceability" />
                      <select value={taskId} onChange={(e) => setTaskId(e.target.value)}
                        className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 dark:focus:ring-teal-900">
                        <option value="">Select a related task (optional)</option>
                        {projectTasks.map((t) => (
                          <option key={t.id} value={t.id}>{t.title}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <LabelWithTooltip label={`Assignees (${selectedAssignees.size} selected)`} tooltip="Project members responsible for executing this test case. Each assignee sets their own execution status: Pending, Passed, or Failed." />
                      <div className="border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 overflow-hidden">
                        <div className="max-h-28 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700">
                          {members.length === 0 ? (
                            <p className="px-3 py-2 text-xs text-gray-400 italic">No project members found.</p>
                          ) : members.map((m) => {
                            const checked = selectedAssignees.has(m.id)
                            return (
                              <label key={m.id} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-teal-50/50 dark:hover:bg-teal-950/20">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleAssignee(m.id)}
                                  className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-teal-600 focus:ring-teal-500"
                                />
                                <Avatar user={m} size={5} />
                                <span className="text-sm text-gray-800 dark:text-gray-200">{m.name}</span>
                              </label>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
        
                  {/* Preconditions + Expected */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <LabelWithTooltip label="Preconditions" tooltip="Prerequisites that must be met before running this test (e.g. user account active, data set up)" />
                      <textarea rows={3} value={preconditions} onChange={(e) => setPreconditions(e.target.value)}
                        placeholder="e.g. User account exists and is active"
                        className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 dark:focus:ring-teal-900 resize-none"
                      />
                    </div>
                    <div>
                      <LabelWithTooltip label="Expected result" tooltip="The expected outcome after all test steps are executed correctly" />
                      <textarea rows={3} value={expected} onChange={(e) => setExpected(e.target.value)}
                        placeholder="e.g. User is redirected to the dashboard after successful login"
                        className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 dark:focus:ring-teal-900 resize-none"
                      />
                    </div>
                  </div>
        
                  {/* Steps */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <LabelWithTooltip label="Test steps" tooltip="Sequential actions to perform in the test. Each step should be atomic and have an expected result." />
                      <button type="button" onClick={addStep}
                        className="inline-flex items-center gap-1 text-xs font-bold text-teal-600 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/40 hover:bg-teal-100 dark:hover:bg-teal-900/40 px-2 py-1 rounded-lg border border-teal-200 dark:border-teal-800 cursor-pointer">
                        <Plus size={11} strokeWidth={2.5} /> Add step
                      </button>
                    </div>
                    <div className="space-y-2">
                      {steps.map((s, i) => (
                        <div key={i} className="flex items-start gap-2 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
                          <span className="w-7 h-7 rounded-lg bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-2">
                            <textarea rows={2} value={s.description} onChange={(e) => updateStep(i, { description: e.target.value })}
                              placeholder={`e.g. Enter a valid email and password, then click "Login"`}
                              className="px-2.5 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 resize-none" />
                            <textarea rows={2} value={s.expected_result} onChange={(e) => updateStep(i, { expected_result: e.target.value })}
                              placeholder="e.g. Login form is submitted successfully"
                              className="px-2.5 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 resize-none" />
                          </div>
                          <button type="button" onClick={() => removeStep(i)}
                            className="w-7 h-7 inline-flex items-center justify-center text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg border-none cursor-pointer shrink-0 mt-0.5"
                            aria-label="Remove step">
                            <X size={12} strokeWidth={2.5} />
                          </button>
                        </div>
                      ))}
                      {steps.length === 0 && (
                        <p className="text-xs italic text-gray-400 dark:text-gray-500 text-center py-3">No steps yet. Click "Add step" above.</p>
                      )}
                    </div>
                  </div>
                </div>
        
                <div className="sticky bottom-0 bg-white dark:bg-gray-900 px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex items-center justify-end gap-2">
                  <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl border-none cursor-pointer">Cancel</button>
                  <button type="submit" disabled={!title.trim() || !suiteId || busy} className="px-5 py-2 text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 rounded-xl border-none cursor-pointer shadow">
                    {busy ? 'Creating…' : 'Create test case'}
                  </button>
                </div>
              </form>
            </div>
    </PortalModal>
  )
}

/* ──────────────────────────────────────────────────────────────────
 * Image lightbox modal
 * ────────────────────────────────────────────────────────────────── */
function ImageLightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <PortalModal>
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4" onClick={onClose}>
              <button
                type="button"
                onClick={onClose}
                className="absolute top-4 right-4 w-10 h-10 inline-flex items-center justify-center text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full border-none cursor-pointer transition-colors"
                aria-label="Close"
              >
                <X size={18} />
              </button>
              <img
                src={src}
                alt={alt}
                onClick={(e) => e.stopPropagation()}
                className="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
              />
            </div>
    </PortalModal>
  )
}

/* ──────────────────────────────────────────────────────────────────
 * Assignees list sub-component — avoids TypeScript closure scope issues
 * ────────────────────────────────────────────────────────────────── */
function DetailAssigneesList({
  assignees, currentUserId, detail, caseId, patchTestCase,
}: {
  assignees: import('@/lib/test-cases-api').TestAssignee[]
  currentUserId: number | string | null
  detail: ReturnType<typeof useTestCaseDetail>
  caseId: string | number | null
  patchTestCase: (tcId: string | number, partial: import('@/lib/test-cases-api').TestCase) => void
}) {
  return assignees.map((assignee) => {
    const isMe = currentUserId !== null && String(assignee.user_id) === String(currentUserId)
    return (
      <div key={assignee.id} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border text-xs ${isMe ? 'cursor-pointer hover:bg-teal-50/60 dark:hover:bg-teal-950/20 border-gray-200 dark:border-gray-700' : 'cursor-default border-transparent'}`}>
        <Avatar user={assignee} size={5} />
        <span className="text-gray-800 dark:text-gray-200 flex-1">{assignee.name}</span>
        {isMe ? (
          <select
            value={assignee.execution_status}
            onChange={async (e) => {
              const newStatus = e.target.value as ExecutionStatus
              await detail.updateAssigneeStatus(assignee.user_id, newStatus)
              if (caseId != null && detail.testCase) patchTestCase(caseId, detail.testCase)
            }}
            className="text-[11px] font-semibold rounded-lg px-1.5 py-0.5 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-teal-500 cursor-pointer"
          >
            <option value="pending">Pending</option>
            <option value="passed">Passed</option>
            <option value="failed">Failed</option>
          </select>
        ) : (
          <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-lg ${
            assignee.execution_status === 'passed'
              ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
              : assignee.execution_status === 'failed'
              ? 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
          }`}>
            {assignee.execution_status === 'passed' ? 'Passed' : assignee.execution_status === 'failed' ? 'Failed' : 'Pending'}
          </span>
        )}
        {isMe && <span className="text-[10px] text-teal-500 font-semibold">You</span>}
      </div>
    )
  })
}

/* ──────────────────────────────────────────────────────────────────
 * Detail panel
 * ────────────────────────────────────────────────────────────────── */
function DetailPanel({
  open, onClose, projectId, caseId, members,
  patchTestCase,
}: {
  open: boolean
  onClose: () => void
  projectId: string | number
  caseId: string | number | null
  members: BoardUser[]
  /** Direct list-sync function from parent — avoids TypeScript closure resolution issues */
  patchTestCase: (tcId: string | number, partial: import('@/lib/test-cases-api').TestCase) => void
}) {
  const detail = useTestCaseDetail(projectId, caseId)
  const tc = detail.testCase
  const [tab, setTab] = useState<'overview' | 'steps' | 'comments' | 'attachments'>('overview')
  const [editing, setEditing] = useState(false)
  const [commentBody, setCommentBody] = useState('')
  const [commenting, setCommenting] = useState(false)
  const [editingComment, setEditingComment] = useState<{ id: string | number; body: string } | null>(null)
  const [editCommentBody, setEditCommentBody] = useState('')
  const [savingComment, setSavingComment] = useState(false)
  const [confirmDelCase, setConfirmDelCase] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadingFile, setUploadingFile] = useState(false)
  const [stepEdit, setStepEdit] = useState<{ id: string | number; description: string; expected_result: string } | null>(null)
  const [confirmDelAttachmentId, setConfirmDelAttachmentId] = useState<string | number | null>(null)
  const [confirmDelStepId, setConfirmDelStepId] = useState<string | number | null>(null)
  const [assigneeEditorOpen, setAssigneeEditorOpen] = useState(false)
  const [savingAssignees, setSavingAssignees] = useState(false)
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)

  // List-sync helper: patches the TC in the parent list after any mutation
  const doPatch = useCallback((updated: import('@/lib/test-cases-api').TestCase) => {
    if (caseId != null) patchTestCase(caseId, updated)
  }, [caseId, patchTestCase])
  const currentUserName = useMemo(() => {
    if (typeof window === 'undefined') return ''
    try {
      const u = JSON.parse(localStorage.getItem('user') || '{}') as any
      return [u?.firstName ?? u?.first_name, u?.lastName ?? u?.last_name].filter(Boolean).join(' ').trim() || u?.email || ''
    } catch { return '' }
  }, [])
  const currentUserId = useMemo(() => {
    if (typeof window === 'undefined') return null
    try {
      const u = JSON.parse(localStorage.getItem('user') || '{}') as any
      return u?.id ?? null
    } catch { return null }
  }, [])



  useEffect(() => {
    if (open) {
      setTab('overview')
      setEditing(false)
      setEditingComment(null)
      setCommentBody('')
      setAssigneeEditorOpen(false)
    }
  }, [open, caseId])

  const submitComment = async () => {
    if (!commentBody.trim() || commenting) return
    setCommenting(true)
    try { await detail.addComment(commentBody.trim()); setCommentBody('') }
    catch (e: any) { toast.error(e?.message || 'Failed to add comment') }
    finally { setCommenting(false) }
  }

  const saveEditComment = async () => {
    if (!editingComment || !editCommentBody.trim()) return
    setSavingComment(true)
    try {
      await detail.editComment(editingComment.id, editCommentBody.trim())
      toast.success('Comment updated'); setEditingComment(null)
    } catch (e: any) { toast.error(e?.message || 'Failed to update comment') }
    finally { setSavingComment(false) }
  }

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files?.length) return
    setUploadingFile(true)
    try {
      for (const file of Array.from(files)) {
        await detail.uploadAttachment(file)
        toast.success(`"${file.name}" uploaded`)
      }
    } catch (err: any) { toast.error(err?.message || 'Upload failed') }
    finally { setUploadingFile(false); if (fileInputRef.current) fileInputRef.current.value = '' }
  }

  const handleDeleteCase = async () => {
    try {
      await detail.refresh()
      if (!tc) return
      await fetch(`/api/projects/${projectId}/test-cases/${tc.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      })
      toast.success('Test case deleted')
      setConfirmDelCase(false)
      onClose()
      window.dispatchEvent(new CustomEvent('test-cases:refresh'))
    } catch (e: any) { toast.error(e?.message || 'Delete failed') }
  }

  const handleInlineStatusChange = useCallback(async (newStatus: TestStatus) => {
    if (!tc) return
    try {
      // Call API — detail.updateStatus also updates its local testCase state on success
      await detail.updateStatus(newStatus)
      toast.success(`Status updated to ${STATUS_LABEL[newStatus]}`)
      // Refetch the single case from the server to confirm the latest state for the slideover
      await detail.refresh()
      // Construct the updated object directly (avoid stale detail.testCase closure)
      const updated = { ...detail.testCase!, status: newStatus, effective_status: newStatus }
      doPatch(updated)
      // Dispatch refresh event so any other listeners (e.g. table rows) pick up the change
      window.dispatchEvent(new CustomEvent('test-cases:refresh'))
    } catch (e: any) {
      toast.error(e?.message || 'Failed to update status')
    }
  }, [detail])

  const handleAssigneeStatusChange = useCallback(async (userId: number | string, newStatus: ExecutionStatus) => {
    if (!tc) return
    try {
      await detail.updateAssigneeStatus(userId, newStatus)
      // detail.testCase now holds the freshly updated assignee state; use it for parent sync
      doPatch({ ...detail.testCase!, effective_status: detail.testCase!.effective_status ?? detail.testCase!.status })
      window.dispatchEvent(new CustomEvent('test-cases:refresh'))
    } catch { /* error toast is handled inside updateAssigneeStatus */ }
  }, [detail, tc])

  const handleInlinePriorityChange = useCallback(async (newPriority: TestPriority) => {
    if (!tc) return
    try {
      await detail.updatePriority(newPriority)
      toast.success(`Priority updated to ${PRIORITY_LABEL[newPriority]}`)
      // Refetch to confirm latest state, then build updated object from fresh detail.testCase
      await detail.refresh()
      const updated = { ...detail.testCase!, priority: newPriority }
      doPatch(updated)
      window.dispatchEvent(new CustomEvent('test-cases:refresh'))
    } catch (e: any) { toast.error(e?.message || 'Failed to update priority') }
  }, [detail])

  const handleAssigneeSave = useCallback(async (assigneeIds: (number | string)[]) => {
    setSavingAssignees(true)
    try {
      await detail.updateFields({ assignee_ids: assigneeIds })
      toast.success('Assignees updated')
      setAssigneeEditorOpen(false)
      // Refresh detail then patch parent list to ensure sync
      await detail.refresh()
      doPatch(detail.testCase!)
      window.dispatchEvent(new CustomEvent('test-cases:refresh'))
    } catch (e: any) { toast.error(String(e?.message || e?.response?.data?.message || 'Failed to update assignees')) }
    finally { setSavingAssignees(false) }
  }, [detail])

  if (!open) return null

  return (
    <>
      {lightboxSrc && (
        <ImageLightbox src={lightboxSrc} alt="Attachment preview" onClose={() => setLightboxSrc(null)} />
      )}
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      {/* Panel */}
      <aside className="fixed top-0 right-0 z-[99999] h-screen w-full md:w-[600px] max-w-full bg-white dark:bg-gray-900 shadow-2xl border-l border-gray-200 dark:border-gray-800 flex flex-col overflow-hidden animate-slide-in-right">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-teal-600 dark:text-teal-300 inline-flex items-center gap-1.5">
                <Hash size={11} strokeWidth={2.5} /> TC-{tc?.id}
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-extrabold text-gray-900 dark:text-white break-words leading-tight">
              {tc?.title || 'Loading…'}
            </h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 inline-flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl border-none cursor-pointer shrink-0">
            <X size={16} strokeWidth={2.5} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap items-center gap-2 px-5 pt-3 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 shrink-0">
          {(['overview', 'steps', 'comments', 'attachments'] as const).map((t) => {
            const label = t.charAt(0).toUpperCase() + t.slice(1)
            const count = t === 'steps' ? tc?.steps?.length
              : t === 'comments' ? tc?.comments?.length
              : t === 'attachments' ? tc?.attachments?.length
              : null
            const active = tab === t
            return (
              <button key={t} type="button" onClick={() => setTab(t)}
                className={`px-3 py-2 text-sm font-bold border-b-2 -mb-px transition-colors inline-flex items-center gap-1.5 bg-transparent cursor-pointer ${
                  active ? 'border-teal-500 text-teal-700 dark:text-teal-300' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                }`}>
                {label}
                {count != null && count > 0 && (
                  <span className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded-full text-[10px] font-bold ${
                    active ? 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300' : 'bg-gray-100 dark:bg-gray-800 text-gray-500'
                  }`}>{count}</span>
                )}
              </button>
            )
          })}
        </div>

        {/* Body — scrollable via Scroll/PerfectScrollbar */}
        <Scroll
          containerClassName="flex-1 min-h-0"
          className="h-full"
          watch={tab}
        >
          {detail.loading && !tc && (
            <div className="flex flex-col items-center justify-center py-24 gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-500 animate-pulse" />
              <p className="text-sm text-gray-500">Loading test case…</p>
            </div>
          )}
          {!tc && !detail.loading && (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <AlertCircle size={24} className="text-gray-400 mb-2" />
              <p className="text-sm text-gray-500">Couldn't load this test case.</p>
            </div>
          )}

          {tc && tab === 'overview' && (
            <OverviewTab
              tc={tc} members={members} editing={editing} setEditing={setEditing}
              detail={detail} onDelete={() => setConfirmDelCase(true)}
              assigneeEditorOpen={assigneeEditorOpen} setAssigneeEditorOpen={setAssigneeEditorOpen}
              savingAssignees={savingAssignees} onAssigneeSave={handleAssigneeSave}
              onStatusChange={handleInlineStatusChange} onPriorityChange={handleInlinePriorityChange}
              currentUserId={currentUserId}
            />
          )}
          {tc && tab === 'steps' && (
            <StepsTab
              steps={tc.steps || []}
              onAdd={(d, e) => detail.addStep(d, e)}
              onUpdate={(id, p) => detail.updateStep(id, p)}
              onDelete={(id) => detail.deleteStep(id)}
              stepEdit={stepEdit}
              setStepEdit={setStepEdit}
              confirmDelStepId={confirmDelStepId}
              setConfirmDelStepId={setConfirmDelStepId}
            />
          )}
          {tc && tab === 'comments' && (
            <CommentsTab
              comments={tc.comments || []}
              currentUserName={currentUserName}
              onAdd={submitComment}
              body={commentBody} setBody={setCommentBody} commenting={commenting}
              onEdit={(c) => { setEditingComment(c); setEditCommentBody(c.body) }}
              onDelete={(id) => detail.deleteComment(id)}
              onToggleReaction={(id, emoji, oldEmoji) => detail.toggleReaction(id, emoji, oldEmoji)}
              editingComment={editingComment} editCommentBody={editCommentBody} setEditCommentBody={setEditCommentBody}
              savingComment={savingComment} onSaveEdit={saveEditComment}
            />
          )}
          {tc && tab === 'attachments' && (
            <AttachmentsTab
              attachments={tc.attachments || []}
              onUpload={handleFile}
              fileInputRef={fileInputRef}
              uploading={uploadingFile}
              currentUserName={currentUserName}
              onDelete={(id) => detail.deleteAttachment(id)}
              confirmDelAttachmentId={confirmDelAttachmentId}
              setConfirmDelAttachmentId={setConfirmDelAttachmentId}
              onImageClick={(src) => setLightboxSrc(src)}
            />
          )}
        </Scroll>

        <ConfirmDialog
          open={confirmDelCase}
          title="Delete this test case?"
          description="This will permanently delete the test case, all its steps, comments, and attachments."
          confirmLabel="Delete test case"
          destructive
          onConfirm={handleDeleteCase}
          onCancel={() => setConfirmDelCase(false)}
        />
      </aside>
    </>
  )
}

/* ──────────────────────────────────────────────────────────────────
 * Overview tab (multi-assignees + inline status/priority)
 * ────────────────────────────────────────────────────────────────── */
function OverviewTab({
  tc, members, editing, setEditing, detail, onDelete,
  assigneeEditorOpen, setAssigneeEditorOpen, savingAssignees, onAssigneeSave,
  onStatusChange, onPriorityChange,
  currentUserId,
}: {
  tc: TestCase
  members: BoardUser[]
  editing: boolean
  setEditing: (v: boolean) => void
  detail: ReturnType<typeof useTestCaseDetail>
  onDelete: () => void
  assigneeEditorOpen: boolean
  setAssigneeEditorOpen: (v: boolean) => void
  savingAssignees: boolean
  onAssigneeSave: (ids: (number | string)[]) => void
  onStatusChange: (s: TestStatus) => void
  onPriorityChange: (p: TestPriority) => void
  currentUserId: number | string | null
}) {
  const [preconditions, setPreconditions] = useState('')
  const [expected, setExpected] = useState('')
  const [actual, setActual] = useState('')
  const [saving, setSaving] = useState(false)
  const [assigneeIds, setAssigneeIds] = useState<Set<number | string>>(new Set())

  // Sync assigneeIds from tc.assignees when editor opens
  useEffect(() => {
    if (assigneeEditorOpen && tc?.assignees) {
      setAssigneeIds(new Set(tc.assignees.map((a) => a.user_id)))
    } else if (!assigneeEditorOpen) {
      // Clear when editor closes so next open starts fresh
      setAssigneeIds(new Set())
    }
  }, [assigneeEditorOpen, tc?.assignees])

  useEffect(() => {
    if (tc) {
      setPreconditions(tc.preconditions || '')
      setExpected(tc.expected_result || '')
      setActual(tc.actual_result || '')
    }
  }, [tc])

  const save = async () => {
    setSaving(true)
    try {
      await detail.updateFields({
        preconditions: preconditions.trim() || null,
        expected_result: expected.trim() || null,
        actual_result: actual.trim() || null,
      })
      toast.success('Test case updated')
      setEditing(false)
    } catch (e: any) { toast.error(e?.message || 'Failed to save') }
    finally { setSaving(false) }
  }

  const toggleAssignee = (id: number | string) => {
    setAssigneeIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-3 p-5">
      {/* Priority + Status inline edit row */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Priority</span>
          <InlinePrioritySelect priority={tc.priority} onChange={onPriorityChange} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Status</span>
          <InlineStatusSelect status={(tc.effective_status || tc.status) as TestStatus} onChange={onStatusChange} />
        </div>
        {editing && (
          <button type="button" onClick={save} disabled={saving}
            className="ml-auto px-3 py-1 text-xs font-bold bg-teal-600 hover:bg-teal-700 text-white rounded-lg border-none cursor-pointer disabled:opacity-50">
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        )}
        {!editing && (
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={() => setEditing(true)}
              className="px-3 py-1 text-xs font-bold text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/40 hover:bg-teal-100 dark:hover:bg-teal-900/40 rounded-lg border border-teal-200 dark:border-teal-800 border-none cursor-pointer">
              <Pencil size={11} className="inline mr-1" /> Edit
            </button>
            <button type="button" onClick={onDelete}
              className="px-3 py-1 text-xs font-bold text-rose-600 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg border-none cursor-pointer">
              <Trash2 size={11} className="inline mr-1" /> Delete
            </button>
          </div>
        )}
      </div>

      {/* Props grid */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
        {/* Assignees with per-assignee execution status */}
        <PropRow icon={UserCircle} label={
          tc.total_assignees != null && tc.total_assignees > 0
            ? `Assignees  ·  ${tc.passed_count ?? 0} passed  ·  ${tc.failed_count ?? 0} failed  ·  ${tc.pending_count ?? tc.total_assignees - (tc.passed_count ?? 0) - (tc.failed_count ?? 0)} pending`
            : 'Assignees'
        }>
          {assigneeEditorOpen ? (
            <div className="w-full space-y-1.5">
              <div className="max-h-40 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700 rounded-lg border border-gray-200 dark:border-gray-700">
                {members.map((m) => {
                  const checked = assigneeIds.has(m.id)
                  return (
                    <label key={m.id} className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-teal-50/50 dark:hover:bg-teal-950/20">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleAssignee(m.id)}
                        className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-600 text-teal-600 focus:ring-teal-500"
                      />
                      <Avatar user={m} size={5} />
                      <span className="text-xs text-gray-800 dark:text-gray-200">{m.name}</span>
                    </label>
                  )
                })}
              </div>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button type="button" onClick={() => setAssigneeEditorOpen(false)}
                  className="px-3 py-1 text-xs font-semibold text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg border-none cursor-pointer">
                  Cancel
                </button>
                <button type="button" onClick={() => onAssigneeSave(Array.from(assigneeIds))}
                  disabled={savingAssignees}
                  className="px-3 py-1 text-xs font-bold bg-teal-600 hover:bg-teal-700 text-white rounded-lg border-none cursor-pointer disabled:opacity-50">
                  {savingAssignees ? 'Saving…' : 'Save assignees'}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {!tc.assignees || tc.assignees.length === 0 ? (
                <span className="text-xs text-gray-400 italic">No assignees</span>
              ) : (() => {
                // NOTE: dispatch test-cases:refresh to sync parent list after status change
                const _rows: React.ReactNode[] = []
                for (const a2 of tc.assignees!) {
                  const isMe = currentUserId !== null && String(a2.user_id) === String(currentUserId)
                  _rows.push(
                    <div key={a2.id} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border text-xs ${isMe ? 'cursor-pointer hover:bg-teal-50/60 dark:hover:bg-teal-950/20 border-gray-200 dark:border-gray-700' : 'cursor-default border-transparent'}`}>
                      <Avatar user={a2} size={5} />
                      <span className="text-gray-800 dark:text-gray-200 flex-1">{a2.name}</span>
                      {isMe ? (
                        <select
                          value={a2.execution_status}
                          onChange={async (e) => {
                            const newStatus = e.target.value as ExecutionStatus
                            await detail.updateAssigneeStatus(a2.user_id, newStatus)
                            window.dispatchEvent(new CustomEvent('test-cases:refresh'))
                          }}
                          className="text-[11px] font-semibold rounded-lg px-1.5 py-0.5 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-teal-500 cursor-pointer"
                        >
                          <option value="pending">Pending</option>
                          <option value="passed">Passed</option>
                          <option value="failed">Failed</option>
                        </select>
                      ) : (
                        <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-lg ${
                          a2.execution_status === 'passed'
                            ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                            : a2.execution_status === 'failed'
                            ? 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                        }`}>
                          {a2.execution_status === 'passed' ? 'Passed' : a2.execution_status === 'failed' ? 'Failed' : 'Pending'}
                        </span>
                      )}
                      {isMe && <span className="text-[10px] text-teal-500 font-semibold">You</span>}
                    </div>
                  )
                }
                return _rows
              })()}
              <button type="button" onClick={() => setAssigneeEditorOpen(true)}
                className="mt-1 text-[11px] font-semibold text-teal-600 dark:text-teal-300 hover:underline bg-transparent border-none cursor-pointer self-start">
                Edit assignees
              </button>
            </div>
          )}
        </PropRow>
        {tc.task_title && (
          <PropRow icon={ListChecks} label="Related task">
            <span className="text-sm text-gray-900 dark:text-gray-100">{tc.task_title}</span>
          </PropRow>
        )}
        <PropRow icon={UserIcon} label="Created by">
          {tc.author ? (
            <div className="flex items-center gap-2">
              <Avatar user={tc.author} size={6} />
              <span className="text-sm text-gray-900 dark:text-gray-100">{tc.author.name}</span>
              <span className="text-[11px] text-gray-400">{fmtRelative(tc.created_at)}</span>
            </div>
          ) : <span className="text-gray-400 italic">—</span>}
        </PropRow>
        <PropRow icon={CalIcon} label="Last updated">
          <span className="text-sm text-gray-900 dark:text-gray-100">{tc.updated_at ? fmtRelative(tc.updated_at) : '—'}</span>
        </PropRow>
      </div>

      {/* Preconditions */}
      <Section title="Preconditions" icon={ListChecks}>
        {editing ? (
          <textarea rows={3} value={preconditions} onChange={(e) => setPreconditions(e.target.value)} placeholder="e.g. User account exists and is active"
            className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 resize-none" />
        ) : (
          <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words leading-relaxed">
            {tc.preconditions || <span className="text-gray-400 italic">No preconditions.</span>}
          </p>
        )}
      </Section>

      {/* Expected result */}
      <Section title="Expected result" icon={CheckCircle2}>
        {editing ? (
          <textarea rows={3} value={expected} onChange={(e) => setExpected(e.target.value)} placeholder="What should happen after the test runs"
            className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 resize-none" />
        ) : (
          <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words leading-relaxed">
            {tc.expected_result || <span className="text-gray-400 italic">No expected result.</span>}
          </p>
        )}
      </Section>

      {/* Actual result */}
      <Section title="Actual result" icon={FileIcon}>
        {editing ? (
          <textarea rows={3} value={actual} onChange={(e) => setActual(e.target.value)} placeholder="What actually happened when this test ran"
            className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 resize-none" />
        ) : (
          <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words leading-relaxed">
            {tc.actual_result || <span className="text-gray-400 italic">No actual result yet.</span>}
          </p>
        )}
      </Section>
    </div>
  )
}

function PropRow({ icon: Icon, label, children }: { icon: React.ElementType; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 px-4 py-2.5 border-b border-gray-50 dark:border-gray-800 last:border-0">
      <Icon size={13} strokeWidth={2} className="text-gray-400 dark:text-gray-500 mt-1 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500 mb-0.5">{label}</p>
        <div className="text-sm text-gray-900 dark:text-gray-100">{children}</div>
      </div>
    </div>
  )
}
function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
        <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-teal-500 to-emerald-500 flex items-center justify-center">
          <Icon size={12} strokeWidth={2.5} className="text-white" />
        </span>
        <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200">{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

/* ─── Steps tab ────────────────────────────────────────────────── */
function StepsTab({
  steps, onAdd, onUpdate, onDelete, stepEdit, setStepEdit,
  confirmDelStepId, setConfirmDelStepId,
}: {
  steps: TestStep[]
  onAdd: (d: string, e?: string | null) => Promise<any>
  onUpdate: (id: string | number, p: Partial<TestStep>) => Promise<any>
  onDelete: (id: string | number) => Promise<any>
  stepEdit: { id: string | number; description: string; expected_result: string } | null
  setStepEdit: (v: { id: string | number; description: string; expected_result: string } | null) => void
  confirmDelStepId: string | number | null
  setConfirmDelStepId: (v: string | number | null) => void
}) {
  const [newDesc, setNewDesc] = useState('')
  const [newExp, setNewExp] = useState('')
  const [busy, setBusy] = useState(false)

  const add = async () => {
    if (!newDesc.trim()) return
    setBusy(true)
    try {
      await onAdd(newDesc.trim(), newExp.trim() || null)
      setNewDesc(''); setNewExp('')
    } catch (e: any) { toast.error(e?.message || 'Failed') }
    finally { setBusy(false) }
  }
  const saveEdit = async () => {
    if (!stepEdit || !stepEdit.description.trim()) return
    try {
      await onUpdate(stepEdit.id, { description: stepEdit.description.trim(), expected_result: stepEdit.expected_result.trim() || null })
      setStepEdit(null)
    } catch (e: any) { toast.error(e?.message || 'Failed') }
  }

  return (
    <div className="p-5 space-y-4">
      {steps.length === 0 ? (
        <div className="flex flex-col items-center py-10 text-center">
          <ListChecks size={24} className="text-gray-400 mb-2" />
          <p className="text-sm text-gray-500">No steps yet — add one below.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {steps.map((s) => (
            <div key={s.id} className="group bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-800 p-3">
              {stepEdit && String(stepEdit.id) === String(s.id) ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-lg bg-teal-500 text-white text-xs font-bold flex items-center justify-center">{s.step_number}</span>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Editing step</span>
                  </div>
                  <textarea rows={2} value={stepEdit.description} onChange={(e) => setStepEdit({ ...stepEdit, description: e.target.value })} placeholder="Description"
                    className="w-full px-2.5 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:border-teal-500 resize-none" />
                  <textarea rows={2} value={stepEdit.expected_result} onChange={(e) => setStepEdit({ ...stepEdit, expected_result: e.target.value })} placeholder="Expected result"
                    className="w-full px-2.5 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:border-teal-500 resize-none" />
                  <div className="flex items-center justify-end gap-2">
                    <button type="button" onClick={() => setStepEdit(null)} className="px-3 py-1.5 text-xs font-bold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg border-none cursor-pointer">Cancel</button>
                    <button type="button" onClick={saveEdit} className="px-3 py-1.5 text-xs font-bold bg-teal-600 hover:bg-teal-700 text-white rounded-lg border-none cursor-pointer">Save</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  <span className="w-7 h-7 rounded-lg bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{s.step_number}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap break-words">{s.description}</p>
                    {s.expected_result && (
                      <p className="text-[12px] text-emerald-700 dark:text-emerald-300 mt-1.5 inline-flex items-start gap-1.5">
                        <CheckCircle2 size={11} className="mt-0.5 shrink-0" />
                        <span className="whitespace-pre-wrap break-words">{s.expected_result}</span>
                      </p>
                    )}
                  </div>
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 shrink-0">
                    <button type="button" onClick={() => setStepEdit({ id: s.id, description: s.description, expected_result: s.expected_result || '' })}
                      className="w-7 h-7 inline-flex items-center justify-center text-gray-400 hover:text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-950/30 rounded-lg border-none cursor-pointer">
                      <Pencil size={11} strokeWidth={2.5} />
                    </button>
                    <button type="button" onClick={() => setConfirmDelStepId(s.id)}
                      className="w-7 h-7 inline-flex items-center justify-center text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg border-none cursor-pointer">
                      <Trash2 size={11} strokeWidth={2.5} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add step */}
      <div className="bg-teal-50 dark:bg-teal-950/20 border border-teal-200 dark:border-teal-800 rounded-2xl p-3 space-y-2">
        <p className="text-[11px] font-bold uppercase tracking-wider text-teal-700 dark:text-teal-300">Add a new step</p>
        <textarea rows={2} value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Step description"
          className="w-full px-2.5 py-2 text-sm rounded-lg border border-teal-200 dark:border-teal-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:border-teal-500 resize-none" />
        <textarea rows={2} value={newExp} onChange={(e) => setNewExp(e.target.value)} placeholder="e.g. Login form is submitted successfully"
          className="w-full px-2.5 py-2 text-sm rounded-lg border border-teal-200 dark:border-teal-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:border-teal-500 resize-none" />
        <div className="flex justify-end">
          <button type="button" onClick={add} disabled={!newDesc.trim() || busy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-teal-600 hover:bg-teal-700 text-white rounded-lg border-none cursor-pointer disabled:opacity-50">
            <Plus size={11} strokeWidth={2.5} /> Add step
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelStepId != null}
        title="Delete this step?"
        description="This will permanently remove the step and renumber the remaining ones."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (confirmDelStepId != null) {
            try { await onDelete(confirmDelStepId) } catch (e: any) { toast.error(e?.message || 'Failed') }
            setConfirmDelStepId(null)
          }
        }}
        onCancel={() => setConfirmDelStepId(null)}
      />
    </div>
  )
}

/* ─── Comments tab ─────────────────────────────────────────────── */
function CommentsTab({
  comments, currentUserName, onAdd, body, setBody, commenting,
  onEdit, onDelete, onToggleReaction,
  editingComment, editCommentBody, setEditCommentBody, savingComment, onSaveEdit,
}: {
  comments: any[]
  currentUserName: string
  onAdd: () => Promise<void>
  body: string; setBody: (v: string) => void; commenting: boolean
  onEdit: (c: any) => void
  onDelete: (id: string | number) => Promise<void>
  onToggleReaction: (id: string | number, emoji: string, oldEmoji?: string) => Promise<void>
  editingComment: { id: string | number; body: string } | null
  editCommentBody: string; setEditCommentBody: (v: string) => void
  savingComment: boolean; onSaveEdit: () => Promise<void>
}) {
  return (
    <div className="p-5 space-y-4">
      <div className="space-y-3">
        {comments.map((c) => (
          <div key={c.id} className="flex items-start gap-3">
            <Avatar user={c.author} size={7} />
            <div className="flex-1 min-w-0">
              {editingComment && String(editingComment.id) === String(c.id) ? (
                <div className="space-y-2">
                  <textarea rows={2} value={editCommentBody} onChange={(e) => setEditCommentBody(e.target.value)}
                    className="w-full resize-none bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500" />
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={onSaveEdit} disabled={savingComment}
                      className="px-3 py-1.5 text-xs font-bold bg-teal-600 hover:bg-teal-700 text-white rounded-lg border-none cursor-pointer disabled:opacity-50">
                      {savingComment ? 'Saving…' : 'Save'}
                    </button>
                    <button type="button" onClick={() => setEditCommentBody('')}
                      className="px-3 py-1.5 text-xs font-bold text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg border-none cursor-pointer">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-baseline gap-2 mb-1.5">
                    <span className="text-sm font-bold text-gray-900 dark:text-white">{c.author?.name || '?'}</span>
                    <span className="text-[11px] text-gray-400 uppercase tracking-wider">
                      {fmtRelative(c.created_at)}
                      {c.updated_at && c.updated_at !== c.created_at ? ' · edited' : ''}
                    </span>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-xl px-4 py-3">
                    <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words leading-relaxed">{c.body}</p>
                  </div>
                  {c.author?.name === currentUserName && (
                    <div className="flex items-center gap-1 mt-1.5 ml-1">
                      <button type="button" onClick={() => onEdit(c)} className="text-[11px] font-semibold text-gray-400 hover:text-teal-600 bg-transparent border-none cursor-pointer">Edit</button>
                      <span className="text-gray-200 dark:text-gray-700">·</span>
                      <button type="button" onClick={() => onDelete(c.id)} className="text-[11px] font-semibold text-gray-400 hover:text-rose-600 bg-transparent border-none cursor-pointer">Delete</button>
                    </div>
                  )}
                  <div className="mt-2">
                    <ReactionBar
                      reactions={c.reactions || []}
                      onToggle={(emoji, oldEmoji) => onToggleReaction(c.id, emoji, oldEmoji)}
                      currentUserName={currentUserName}
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
        {comments.length === 0 && (
          <div className="flex flex-col items-center py-8 gap-2">
            <MessageCircle size={20} className="text-gray-400" />
            <p className="text-sm italic text-gray-400">No comments yet.</p>
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="flex items-start gap-3 pt-3 border-t border-gray-100 dark:border-gray-800">
        <Avatar user={{ id: 'me', name: currentUserName || 'Me', initials: (currentUserName || 'M').slice(0, 2).toUpperCase() }} size={7} />
        <div className="flex-1 min-w-0">
          <textarea value={body} onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onAdd() } }}
            placeholder="Write a comment… (Ctrl+Enter to send)" rows={2}
            className="w-full resize-none bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
          <div className="flex justify-end mt-2">
            <button type="button" onClick={onAdd} disabled={!body.trim() || commenting}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-teal-600 hover:bg-teal-700 text-white rounded-xl shadow-sm border-none cursor-pointer disabled:opacity-50">
              <Send size={11} strokeWidth={2.5} /> Post comment
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── Attachments tab (drag-and-drop, clipboard paste, image lightbox) ─── */
function AttachmentsTab({
  attachments, onUpload, fileInputRef, uploading, currentUserName, onDelete,
  confirmDelAttachmentId, setConfirmDelAttachmentId, onImageClick,
}: {
  attachments: any[]
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>
  fileInputRef: React.RefObject<HTMLInputElement | null>
  uploading: boolean
  currentUserName: string
  onDelete: (id: string | number) => Promise<void>
  confirmDelAttachmentId: string | number | null
  setConfirmDelAttachmentId: (v: string | number | null) => void
  onImageClick: (src: string) => void
}) {
  const [dragOver, setDragOver] = useState(false)
  const dropRef = useRef<HTMLDivElement>(null)

  const isImage = (name: string, type: string) =>
    type?.toLowerCase().includes('image') || /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico|avif|tiff?)$/i.test(name)

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }
  const handleDragLeave = (e: React.DragEvent) => {
    if (!dropRef.current?.contains(e.relatedTarget as Node)) setDragOver(false)
  }
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const files = e.dataTransfer.files
    if (!files?.length) return
    const dt = new DataTransfer()
    for (const f of Array.from(files)) dt.items.add(f)
    const inputEl = fileInputRef.current
    if (inputEl) {
      Object.defineProperty(inputEl, 'files', { value: dt.files, configurable: true })
      await onUpload({ target: inputEl } as any)
    }
  }

  // Clipboard paste
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      const imageItems = Array.from(items).filter((item) => item.type.startsWith('image/'))
      if (!imageItems.length) return
      e.preventDefault()
      const dt = new DataTransfer()
      for (const item of imageItems) {
        const file = item.getAsFile()
        if (file) dt.items.add(file)
      }
      const inputEl = fileInputRef.current
      if (inputEl) {
        Object.defineProperty(inputEl, 'files', { value: dt.files, configurable: true })
        onUpload({ target: inputEl } as any)
      }
    }
    const el = dropRef.current
    if (el) el.addEventListener('paste', onPaste)
    return () => { if (el) el.removeEventListener('paste', onPaste) }
  }, [fileInputRef, onUpload])

  return (
    <div ref={dropRef} className="p-5 space-y-3">
      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-2xl p-6 text-center transition-colors ${
          dragOver
            ? 'border-teal-500 bg-teal-50 dark:bg-teal-950/20'
            : 'border-gray-200 dark:border-gray-700 hover:border-teal-400 dark:hover:border-teal-600'
        }`}
      >
        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={onUpload} />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/40 hover:bg-teal-100 dark:hover:bg-teal-900/40 rounded-xl border border-dashed border-teal-300 dark:border-teal-800 cursor-pointer disabled:opacity-50 transition-colors"
        >
          {uploading ? <span className="animate-spin">⟳</span> : <Upload size={12} strokeWidth={2.5} />}
          {uploading ? 'Uploading…' : 'Upload files'}
        </button>
        <p className="text-[11px] text-gray-400 mt-2">
          Drag &amp; drop files here · Paste images from clipboard · Click to browse
        </p>
        {dragOver && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-teal-600 dark:text-teal-300 font-bold text-sm">Drop to upload</span>
          </div>
        )}
      </div>

      {/* File list */}
      {attachments.length > 0 ? (
        <div className="space-y-2">
          {attachments.map((a) => {
            const img = isImage(a.name, a.file_type || '')
            return (
              <div key={a.id} className="group flex items-center gap-3 px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 hover:bg-teal-50 dark:hover:bg-teal-950/20 hover:ring-1 hover:ring-teal-200 dark:hover:ring-teal-800 transition-all">
                {img ? (
                  <button
                    type="button"
                    onClick={() => onImageClick(a.file_url)}
                    className="w-9 h-9 rounded-lg overflow-hidden bg-white dark:bg-gray-900 shadow-sm flex items-center justify-center shrink-0 border border-gray-200 dark:border-gray-700 hover:ring-2 hover:ring-teal-400 cursor-pointer"
                  >
                    <ImageIcon size={14} className="text-teal-500" />
                  </button>
                ) : (
                  <span className="w-9 h-9 rounded-lg bg-white dark:bg-gray-900 shadow-sm flex items-center justify-center shrink-0">
                    <Paperclip size={14} className="text-teal-500" />
                  </span>
                )}
                {img ? (
                  <button
                    type="button"
                    onClick={() => onImageClick(a.file_url)}
                    className="flex-1 text-sm font-medium text-teal-700 dark:text-teal-300 hover:underline truncate text-left bg-transparent border-none cursor-pointer"
                  >
                    {a.name}
                  </button>
                ) : (
                  <a href={a.file_url} download={a.name} className="flex-1 text-sm font-medium text-teal-700 dark:text-teal-300 hover:underline truncate">
                    {a.name}
                  </a>
                )}
                <span className="text-[11px] text-gray-400 shrink-0">{a.created_at ? fmtRelative(a.created_at) : ''}</span>
                <button type="button" onClick={() => setConfirmDelAttachmentId(a.id)}
                  className="w-6 h-6 opacity-0 group-hover:opacity-100 inline-flex items-center justify-center text-gray-400 hover:text-rose-600 rounded bg-transparent border-none cursor-pointer">
                  <X size={11} strokeWidth={3} />
                </button>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center py-8 gap-2">
          <Paperclip size={20} className="text-gray-400" />
          <p className="text-sm italic text-gray-400">No attachments yet.</p>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelAttachmentId != null}
        title="Delete this attachment?"
        description="The file will be removed from disk as well."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (confirmDelAttachmentId != null) {
            try { await onDelete(confirmDelAttachmentId) } catch (e: any) { toast.error(e?.message || 'Failed') }
            setConfirmDelAttachmentId(null)
          }
        }}
        onCancel={() => setConfirmDelAttachmentId(null)}
      />
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────
 * Main page
 * ────────────────────────────────────────────────────────────────── */
export default function TestCasesPage() {
  const params = useParams<{ projectId: string }>()
  const projectId = params.projectId
  const tc = useProjectTestCases(projectId)
  const tb = useTaskBoard(projectId) // for project members + tasks list
  const [activeSuiteId, setActiveSuiteId] = useState<string | number | null>(null)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<TestStatus | ''>('')
  const [filterPriority, setFilterPriority] = useState<TestPriority | ''>('')
  const [filterSuite, setFilterSuite] = useState<string | number | null>(null)
  const [filterAssignedToMe, setFilterAssignedToMe] = useState(false)
  const [openCaseId, setOpenCaseId] = useState<string | number | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [newSuiteOpen, setNewSuiteOpen] = useState(false)
  const [newCaseOpen, setNewCaseOpen] = useState(false)
  const [pageLimit, setPageLimit] = useState(tc.perPage)
  const [openDropdownId, setOpenDropdownId] = useState<string | number | null>(null)
  const [openDropdownType, setOpenDropdownType] = useState<'status' | 'priority' | null>(null)

  const openDropdown = (id: string | number, type: 'status' | 'priority') => {
    setOpenDropdownId(id)
    setOpenDropdownType(type)
  }
  const closeDropdown = () => {
    setOpenDropdownId(null)
    setOpenDropdownType(null)
  }

  // Close dropdown on outside click
  useEffect(() => {
    if (!openDropdownId) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Element
      if (!target.closest('[data-dropdown-cell]')) closeDropdown()
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [openDropdownId])

  // Compute filtered list (re-applies the suite sidebar filter on top of the hook's filters)
  const filteredTestCases = useMemo(() => {
    let arr = tc.testCases
    if (activeSuiteId != null) {
      arr = arr.filter((c) => String(c.suite_id) === String(activeSuiteId))
    }
    return arr
  }, [tc.testCases, activeSuiteId])

  // Stats
  const stats = useMemo(() => {
    const list = tc.testCases
    return {
      total: tc.total,
      passed:      list.filter((c) => (c.effective_status || c.status) === 'passed').length,
      failed:      list.filter((c) => (c.effective_status || c.status) === 'failed').length,
      in_progress: list.filter((c) => (c.effective_status || c.status) === 'in_progress').length,
      skipped:     list.filter((c) => (c.effective_status || c.status) === 'skipped').length,
      ready:       list.filter((c) => (c.effective_status || c.status) === 'ready').length,
      draft:       list.filter((c) => (c.effective_status || c.status) === 'draft').length,
    }
  }, [tc.testCases, tc.total])

  // Apply filters to the hook with debounce on search
  useEffect(() => {
    const t = setTimeout(() => {
      tc.setSearch(search)
    }, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])
  useEffect(() => { tc.setStatusFilter(filterStatus || null) }, [filterStatus])
  useEffect(() => { tc.setPriorityFilter(filterPriority || null) }, [filterPriority])
  useEffect(() => { tc.setSuiteFilter(filterSuite) }, [filterSuite])
  useEffect(() => { tc.setAssignedToMeFilter(filterAssignedToMe) }, [filterAssignedToMe])
  const hasFilters = search || filterSuite || filterStatus || filterPriority || filterAssignedToMe

  const projectTasks = useMemo(() => {
    return (tb.board || []).flatMap((c) => (c.tasks || []).map((t) => ({ id: t.id, title: t.title })))
  }, [tb.board])

  const totalPages = Math.max(1, Math.ceil(tc.total / tc.perPage))

  const openDetail = (caseId: string | number) => {
    setOpenCaseId(caseId)
    setPanelOpen(true)
  }

  // Inline status/priority update in table
  // Note: tc.updateStatus / tc.updatePriority already perform an in-place optimistic
  // update via setTestCases((cs) => cs.map(...)), so no full list refresh is needed.
  // Dispatching test-cases:refresh here would trigger a server refetch that re-sorts
  // the list by updatedAt, causing the edited row to jump position unnecessarily.
  const handleTableStatusChange = async (caseId: string | number, newStatus: TestStatus) => {
    try {
      await tc.updateStatus(caseId, newStatus)
      toast.success(`Status → ${STATUS_LABEL[newStatus]}`)
    } catch (e: any) { toast.error(e?.message || 'Failed') }
  }

  const handleTablePriorityChange = async (caseId: string | number, newPriority: TestPriority) => {
    try {
      await tc.updatePriority(caseId, newPriority)
      toast.success(`Priority → ${PRIORITY_LABEL[newPriority]}`)
    } catch (e: any) { toast.error(e?.message || 'Failed') }
  }

  // Listen for the refresh event dispatched from the detail panel when a case is deleted
  useEffect(() => {
    const onRefresh = () => { tc.refresh() }
    window.addEventListener('test-cases:refresh', onRefresh)
    return () => window.removeEventListener('test-cases:refresh', onRefresh)
  }, [tc])
  return (
    <ProjectLayout pageTitle="Test Cases">

      {/* ── Page Header ── */}
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
            <ClipboardCheck size={16} className="text-gray-600 dark:text-gray-300" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Test Cases</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">{tc.total} total</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setNewCaseOpen(true)}
          disabled={tc.suites.length === 0}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Plus size={15} /> New Test Case
        </button>
      </div>

      <div className="flex flex-col xl:flex-row gap-5 xl:gap-6 items-start">

        {/* ── Sidebar ── */}
        <aside className="w-full xl:w-52 shrink-0 order-2 xl:order-1">
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Suites</h3>
                <span className="text-[11px] text-gray-400 dark:text-gray-500">{tc.suites.length}</span>
              </div>
            </div>
            <div className="p-1.5 max-h-[40vh] overflow-y-auto">
              <button
                type="button"
                onClick={() => { setActiveSuiteId(null); setFilterSuite(null) }}
                className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-2.5 transition-all cursor-pointer text-sm ${
                  activeSuiteId == null && filterSuite == null
                    ? 'bg-gray-100 dark:bg-gray-800 font-medium text-gray-900 dark:text-white'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                <span className="w-6 h-6 rounded bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                  <Layers size={12} />
                </span>
                All Cases
              </button>

              {tc.suites.map((suite) => (
                <SuiteItem
                  key={suite.id}
                  suite={suite}
                  active={activeSuiteId != null && String(activeSuiteId) === String(suite.id)}
                  onSelect={() => { setActiveSuiteId(suite.id); setFilterSuite(suite.id) }}
                  onRename={(name) => tc.renameSuite(suite.id, name).then(() => undefined)}
                  onDelete={() => tc.deleteSuite(suite.id)}
                />
              ))}

              {tc.suites.length === 0 && !tc.loading && (
                <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-4 px-2">No suites yet.</p>
              )}
            </div>
            <div className="p-1.5 border-t border-gray-100 dark:border-gray-800">
              <button type="button" onClick={() => setNewSuiteOpen(true)}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg cursor-pointer transition-colors">
                <Plus size={12} /> New Suite
              </button>
            </div>
          </div>
        </aside>

        {/* ── Main ── */}
        <main className="flex-1 min-w-0 order-1 xl:order-2 w-full space-y-4">

          {/* Stats Row */}
          {tc.total > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Total', value: stats.total, cls: 'text-gray-900 dark:text-white' },
                { label: 'Passed', value: stats.passed, cls: 'text-emerald-600 dark:text-emerald-400' },
                { label: 'Failed', value: stats.failed, cls: 'text-rose-600 dark:text-rose-400' },
                { label: 'In Progress', value: stats.in_progress, cls: 'text-indigo-600 dark:text-indigo-400' },
              ].map(({ label, value, cls }) => (
                <div key={label} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 px-4 py-3">
                  <p className={`text-2xl font-bold ${cls}`}>{value}</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          )}

          {/* Filter Toolbar */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 px-3 py-2.5">
            <div className="flex items-center gap-2 flex-wrap">

              {/* Search Bar */}
              <div className="relative flex-1 min-w-[180px]">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search test cases…"
                  className="w-full pl-8 pr-3 py-1.5 text-xs sm:text-sm bg-white dark:bg-gray-800 border border-slate-200 dark:border-slate-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900 transition-colors"
                />
              </div>

              {/* Filter Group */}
              <select value={filterSuite ?? ''} onChange={(e) => { const v = e.target.value; setFilterSuite(v ? Number(v) : null); setActiveSuiteId(v ? Number(v) : null) }}
                className="appearance-none border border-slate-200 dark:border-slate-700 bg-white hover:bg-slate-50 dark:bg-gray-800 dark:hover:bg-gray-700 text-xs sm:text-sm font-medium px-3 py-1.5 rounded-lg shadow-sm cursor-pointer text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900 transition-all">
                <option value="">All Suites</option>
                {tc.suites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as TestStatus | '')}
                className="appearance-none border border-slate-200 dark:border-slate-700 bg-white hover:bg-slate-50 dark:bg-gray-800 dark:hover:bg-gray-700 text-xs sm:text-sm font-medium px-3 py-1.5 rounded-lg shadow-sm cursor-pointer text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900 transition-all">
                <option value="">All Status</option>
                {FILTER_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
              <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value as TestPriority | '')}
                className="appearance-none border border-slate-200 dark:border-slate-700 bg-white hover:bg-slate-50 dark:bg-gray-800 dark:hover:bg-gray-700 text-xs sm:text-sm font-medium px-3 py-1.5 rounded-lg shadow-sm cursor-pointer text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900 transition-all">
                <option value="">All Priority</option>
                {PRIORITIES.map((p) => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
              </select>

              {/* My Cases Toggle */}
              <button
                type="button"
                onClick={() => setFilterAssignedToMe((v) => !v)}
                className={`inline-flex items-center gap-1.5 border text-xs sm:text-sm font-medium px-3 py-1.5 rounded-lg shadow-sm transition-all cursor-pointer ${
                  filterAssignedToMe
                    ? 'bg-indigo-50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300'
                    : 'bg-white dark:bg-gray-800 border-slate-200 dark:border-slate-700 text-gray-600 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-gray-700'
                }`}
              >
                <UserCircle size={12} />
                <span className="hidden sm:inline">My Cases</span>
                <span className="sm:hidden">Mine</span>
              </button>

              {/* Clear Filters */}
              {hasFilters && (
                <button
                  type="button"
                  onClick={() => { setSearch(''); setFilterSuite(null); setFilterStatus(''); setFilterPriority(''); setFilterAssignedToMe(false); setActiveSuiteId(null) }}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg border border-slate-200 dark:border-slate-700 hover:border-gray-400 dark:hover:border-gray-600 cursor-pointer transition-all"
                >
                  <X size={10} /> Clear
                </button>
              )}

              {/* Refresh Button */}
              <button
                type="button"
                onClick={() => tc.refresh()}
                disabled={tc.loading}
                className="p-2 bg-white hover:bg-slate-50 border border-slate-200 dark:border-slate-700 dark:bg-gray-800 dark:hover:bg-gray-700 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 rounded-lg shadow-sm transition-all duration-200 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
                aria-label="Refresh test cases"
              >
                <RotateCw size={14} className={tc.fetching ? 'animate-spin' : ''} />
              </button>

            </div>
          </div>

          {/* Results Table */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">

            {tc.loading && tc.testCases.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse" />
                <p className="text-sm text-gray-400">Loading…</p>
              </div>
            ) : filteredTestCases.length === 0 ? (
              <div className="flex flex-col items-center py-14 px-6 text-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                  <ClipboardCheck size={20} className="text-gray-400" />
                </div>
                {tc.suites.length === 0 ? (
                  <>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-200">No test suites yet</p>
                    <button type="button" onClick={() => setNewSuiteOpen(true)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer transition-colors">
                      <Plus size={12} /> Create First Suite
                    </button>
                  </>
                ) : hasFilters ? (
                  <>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-200">No results found</p>
                    <button type="button" onClick={() => { setSearch(''); setFilterSuite(null); setFilterStatus(''); setFilterPriority(''); setFilterAssignedToMe(false); setActiveSuiteId(null) }}
                      className="text-xs text-gray-500 hover:text-gray-900 dark:hover:text-white underline cursor-pointer">Clear filters</button>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-200">No test cases yet</p>
                    <button type="button" onClick={() => setNewCaseOpen(true)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer transition-colors">
                      <Plus size={12} /> Add First Test Case
                    </button>
                  </>
                )}
              </div>
            ) : (
              <>
                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b border-gray-100 dark:border-gray-800">
                      <tr className="text-left">
                        <th className="px-4 py-2.5 text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-10">#</th>
                        <th className="px-4 py-2.5 text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Title</th>
                        <th className="px-4 py-2.5 text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Suite</th>
                        <th className="px-4 py-2.5 text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Priority</th>
                        <th className="px-4 py-2.5 text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                        <th className="px-4 py-2.5 text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Assigned</th>
                        <th className="px-4 py-2.5 text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Updated</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
                      {filteredTestCases.map((c, idx) => (
                        <tr key={c.id} onClick={() => openDetail(c.id)}
                          className="hover:bg-gray-50 dark:hover:bg-gray-800/60 cursor-pointer transition-colors">
                          <td className="px-4 py-3 text-[11px] text-gray-400">{idx + 1}</td>
                          <td className="px-4 py-3">
                            <p className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">TC-{c.id}</p>
                            <p className="text-sm font-medium text-gray-900 dark:text-white mt-0.5">{c.title}</p>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">{c.suite_name || '—'}</td>
                          <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                            <div data-dropdown-cell className="relative inline-block">
                              <InlinePrioritySelect
                                priority={c.priority}
                                onChange={(p) => handleTablePriorityChange(c.id, p)}
                                rowId={c.id}
                                openDropdownId={openDropdownId}
                                openDropdownType={openDropdownType}
                                onOpen={openDropdown}
                                onClose={closeDropdown}
                              />
                            </div>
                          </td>
                          <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                            <div data-dropdown-cell className="relative inline-block">
                              <InlineStatusSelect
                                status={c.status}
                                onChange={(s) => handleTableStatusChange(c.id, s)}
                                rowId={c.id}
                                openDropdownId={openDropdownId}
                                openDropdownType={openDropdownType}
                                onOpen={openDropdown}
                                onClose={closeDropdown}
                              />
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <AvatarStack users={(c as any).assignees || []} max={3} size={5} />
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-400 dark:text-gray-500">{c.updated_at ? fmtRelative(c.updated_at) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards */}
                <div className="md:hidden divide-y divide-gray-100 dark:divide-gray-800">
                  {filteredTestCases.map((c) => (
                    <div key={c.id} onClick={() => openDetail(c.id)} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800/60 cursor-pointer transition-colors">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="min-w-0">
                          <p className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">TC-{c.id}</p>
                          <p className="text-sm font-medium text-gray-900 dark:text-white mt-0.5">{c.title}</p>
                        </div>
                        <div data-dropdown-cell className="relative inline-block">
                          <InlinePrioritySelect
                            priority={c.priority}
                            onChange={(p) => handleTablePriorityChange(c.id, p)}
                            rowId={c.id}
                            openDropdownId={openDropdownId}
                            openDropdownType={openDropdownType}
                            onOpen={openDropdown}
                            onClose={closeDropdown}
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div data-dropdown-cell className="relative inline-block">
                            <InlineStatusSelect
                              status={c.status}
                              onChange={(s) => handleTableStatusChange(c.id, s)}
                              rowId={c.id}
                              openDropdownId={openDropdownId}
                              openDropdownType={openDropdownType}
                              onOpen={openDropdown}
                              onClose={closeDropdown}
                            />
                          </div>
                          <span className="text-[11px] text-gray-400 dark:text-gray-500">{c.suite_name || '—'}</span>
                        </div>
                        <AvatarStack users={(c as any).assignees || []} max={3} size={4} />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Pagination */}
            {tc.total > 0 && (
              <PaginationBar
                page={tc.page}
                total={tc.total}
                limit={pageLimit}
                onPage={(p) => tc.setPage(p)}
                onLimitChange={(l) => { setPageLimit(l); tc.setPerPage(l) }}
                pageSizeOptions={[10, 20, 30, 50]}
              />
            )}
          </div>
        </main>
      </div>

      <NewSuiteModal
        open={newSuiteOpen}
        onClose={() => setNewSuiteOpen(false)}
        onCreate={async (name, description) => { await tc.createSuite(name, description) }}
      />

      <NewTestCaseModal
        open={newCaseOpen}
        onClose={() => setNewCaseOpen(false)}
        suites={tc.suites}
        members={tb.members || []}
        projectTasks={projectTasks}
        onCreate={async (input) => { await tc.createTestCase(input) }}
      />

      <DetailPanel
        open={panelOpen && openCaseId != null}
        onClose={() => { setPanelOpen(false); setOpenCaseId(null) }}
        projectId={projectId}
        caseId={openCaseId}
        members={tb.members || []}
        patchTestCase={(id, partial) => tc.patchTestCase(id, partial)}
      />
    </ProjectLayout>
  )
}
