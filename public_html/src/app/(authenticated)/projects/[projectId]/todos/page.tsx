'use client'

/**
 * To-do Lists — Basecamp-style collaborative checklists.
 *
 * Architecture:
 *  - Backend (server/src/routes/todos.js): project-scoped CRUD for lists + items,
 *    with reorder via bulk PATCH, complete toggle, assignee/due-date/notes.
 *  - Hook (lib/todos-api.ts): returns { lists, stats, createList, createItem, ... }
 *    merging each server response into local state (no extra fetches).
 *  - UI (this file): one card per list with inline add item, checkbox toggle,
 *    drag-drop reorder, edit modal, hide-completed toggle, progress count.
 */

import { useEffect, useMemo, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useParams } from 'next/navigation'
import toast from 'react-hot-toast'
import {
  AlertTriangle, Calendar, Check, ChevronDown, ChevronUp, Eye, EyeOff, GripVertical,
  ListChecks, MoreVertical, Pencil, Plus, Trash2, User as UserIcon, X,
} from 'lucide-react'
import {
  DndContext, closestCenter, useSensor, MouseSensor, TouchSensor,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, useSortable, arrayMove, verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import FeaturePage from '@/components/project/FeaturePage'
import EmptyState from '@/components/project/EmptyState'
import ConfirmDialog from '@/components/project/ConfirmDialog'
import MultiSelectDropdown from '@/components/project/MultiSelectDropdown'
import api from '@/lib/api'
import { useTodos, type TodoColor, type TodoList, type TodoItem, type UserSummary } from '@/lib/todos-api'

const COLOR_CLASSES: Record<TodoColor, { bg: string; bgPale: string; ring: string; bar: string }> = {
  indigo:  { bg: 'bg-indigo-500',  bgPale: 'bg-indigo-50 dark:bg-indigo-900/20',  ring: 'focus:ring-indigo-100 dark:focus:ring-indigo-900', bar: 'bg-indigo-500' },
  emerald: { bg: 'bg-emerald-500', bgPale: 'bg-emerald-50 dark:bg-emerald-900/20', ring: 'focus:ring-emerald-100 dark:focus:ring-emerald-900', bar: 'bg-emerald-500' },
  amber:   { bg: 'bg-amber-500',   bgPale: 'bg-amber-50 dark:bg-amber-900/20',   ring: 'focus:ring-amber-100 dark:focus:ring-amber-900',   bar: 'bg-amber-500' },
  sky:     { bg: 'bg-sky-500',     bgPale: 'bg-sky-50 dark:bg-sky-900/20',     ring: 'focus:ring-sky-100 dark:focus:ring-sky-900',     bar: 'bg-sky-500' },
  pink:    { bg: 'bg-pink-500',    bgPale: 'bg-pink-50 dark:bg-pink-900/20',    ring: 'focus:ring-pink-100 dark:focus:ring-pink-900',    bar: 'bg-pink-500' },
  violet:  { bg: 'bg-violet-500',  bgPale: 'bg-violet-50 dark:bg-violet-900/20',  ring: 'focus:ring-violet-100 dark:focus:ring-violet-900',  bar: 'bg-violet-500' },
}

const COLORS: TodoColor[] = ['indigo', 'emerald', 'amber', 'sky', 'pink', 'violet']

function fmtDate(d: string | null): string {
  if (!d) return ''
  // Parse YYYY-MM-DD in local time to avoid timezone offset issues
  const [y, m, day] = d.split('-').map(Number)
  const target = new Date(y, m - 1, day)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86_400_000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Tomorrow'
  if (diffDays === -1) return 'Yesterday'
  if (diffDays < -1) return `${Math.abs(diffDays)} days ago`
  if (diffDays > 0 && diffDays <= 7) return `In ${diffDays} days`
  return target.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function isOverdue(d: string | null, completed: boolean): boolean {
  if (!d || completed) return false
  const [y, m, day] = d.split('-').map(Number)
  const target = new Date(y, m - 1, day)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return target < today
}

// ─── Avatar helper ──────────────────────────────────────────────────────────

function Avatar({ user, size = 6 }: { user: UserSummary | null; size?: 5 | 6 | 7 | 8 }) {
  if (!user) return null
  const sizeCls = { 5: 'w-5 h-5 text-[9px]', 6: 'w-6 h-6 text-[10px]', 7: 'w-7 h-7 text-xs', 8: 'w-8 h-8 text-xs' }[size]
  const initials = `${user.first_name?.[0] ?? ''}${user.last_name?.[0] ?? ''}`.toUpperCase() || '?'
  const hash = (user.id * 9301 + 49297) % 233280
  const hue = hash / 233280 * 360
  return (
    <span
      data-tooltip-id="app-tooltip"
      data-tooltip-content={`${user.first_name} ${user.last_name}`.trim()}
      className={`${sizeCls} inline-flex items-center justify-center rounded-full font-bold text-white shrink-0`}
      style={{ background: `linear-gradient(135deg, hsl(${hue}, 70%, 50%), hsl(${(hue + 40) % 360}, 70%, 40%))` }}
    >
      {initials}
    </span>
  )
}

// ─── New-list modal ─────────────────────────────────────────────────────────

function NewListModal({
  open, onClose, onCreate,
}: {
  open: boolean
  onClose: () => void
  onCreate: (name: string, color: TodoColor) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [color, setColor] = useState<TodoColor>('indigo')
  const [submitting, setSubmitting] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])
  useEffect(() => {
    if (open) { setName(''); setColor('indigo') }
  }, [open])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setSubmitting(true)
    try {
      await onCreate(name.trim(), color)
    } catch (err: any) {
      toast.error(err.message || 'Failed to create list')
    } finally {
      setSubmitting(false)
      onClose()
    }
  }

  if (!mounted || !open) return null

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="relative z-50 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-xl p-5 w-full max-w-md space-y-4 animate-fade-in-up"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-gray-900 dark:text-white">New to-do list</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="w-8 h-8 inline-flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg border-none cursor-pointer">
            <X size={16} />
          </button>
        </div>
        <input
          autoFocus
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="List name (e.g. Sprint 14 tasks)"
          className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900"
        />
        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Color</p>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                onClick={() => setColor(c)}
                className={`w-8 h-8 rounded-full ${COLOR_CLASSES[c].bg} cursor-pointer border-2 transition ${color === c ? 'border-gray-900 dark:border-white scale-110' : 'border-transparent hover:scale-105'}`}
              />
            ))}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl border-none cursor-pointer">
            Cancel
          </button>
          <button type="submit" disabled={!name.trim() || submitting} className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-xl border-none cursor-pointer shadow">
            {submitting ? 'Creating…' : 'Create list'}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  )
}

// ─── Item edit modal ────────────────────────────────────────────────────────

function ItemEditModal({
  item, members, onClose, onSave,
}: {
  item: TodoItem
  members: UserSummary[]
  onClose: () => void
  onSave: (patch: { title: string; notes: string | null; assignee_ids: number[]; due_date: string | null }) => Promise<void>
}) {
  const [title, setTitle] = useState(item.title)
  const [notes, setNotes] = useState(item.notes || '')
  const [assigneeIds, setAssigneeIds] = useState<number[]>(item.assignee_ids || [])
  const [dueDate, setDueDate] = useState<string>(item.due_date ? item.due_date.slice(0, 10) : '')
  const [submitting, setSubmitting] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    setSubmitting(true)
    try {
      await onSave({
        title: title.trim(),
        notes: notes.trim() || null,
        assignee_ids: assigneeIds,
        due_date: dueDate || null,
      })
      toast.success('To-do updated')
    } catch (err: any) {
      toast.error(err.message || 'Failed to save')
    } finally {
      setSubmitting(false)
      onClose()
    }
  }

  const memberOptions = members.map((m) => ({
    id: m.id,
    label: `${m.first_name} ${m.last_name}`.trim(),
    initials: `${m.first_name?.[0] ?? ''}${m.last_name?.[0] ?? ''}`.toUpperCase() || '?',
  }))

  const modal = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm" aria-hidden />
      {/* Dialog box */}
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="relative bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-xl p-5 w-full max-w-md space-y-3 animate-fade-in-up"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-gray-900 dark:text-white">Edit to-do</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="w-8 h-8 inline-flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg border-none cursor-pointer">
            <X size={16} />
          </button>
        </div>
        <input
          autoFocus
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="To-do title"
          className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900"
        />
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          rows={3}
          className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900 resize-none"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="pl-3">
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Assignees</label>
            <MultiSelectDropdown
              options={memberOptions}
              selected={assigneeIds}
              onChange={(ids) => setAssigneeIds(ids as number[])}
              placeholder="Unassigned"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Due date</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl border-none cursor-pointer">
            Cancel
          </button>
          <button type="submit" disabled={!title.trim() || submitting} className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-xl border-none cursor-pointer shadow">
            {submitting ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  )

  return mounted ? createPortal(modal, document.body) : null
}

// ─── Single item row ────────────────────────────────────────────────────────

function ItemRow({
  item, color, onToggle, onEdit, onRemove,
  listeners, style, isDragging,
}: {
  item: TodoItem
  color: TodoColor
  onToggle: () => void
  onEdit: () => void
  onRemove: () => void
  listeners?: Record<string, unknown>
  style?: React.CSSProperties
  isDragging?: boolean
}) {
  const overdue = isOverdue(item.due_date, item.completed)
  const barColor = COLOR_CLASSES[color]
  return (
    <li
      {...listeners}
      style={style}
      className={`group relative px-4 py-2.5 flex items-start gap-2.5 cursor-grab active:cursor-grabbing transition ${isDragging ? 'opacity-40 z-50' : ''}`}
    >
      {/* drag handle strip */}
      <span className={`absolute left-0 top-0 bottom-0 w-1 ${item.completed ? 'bg-emerald-500' : barColor.bar} opacity-0 group-hover:opacity-100 transition rounded-r`} />
      <button
        type="button"
        aria-label={item.completed ? 'Mark as not done' : 'Mark as done'}
        onClick={onToggle}
        className={`w-5 h-5 mt-0.5 rounded-md border-2 flex items-center justify-center transition shrink-0 cursor-pointer ${
          item.completed
            ? `${COLOR_CLASSES[color].bg} border-transparent text-white`
            : 'border-gray-300 dark:border-gray-600 hover:border-indigo-500'
        }`}
      >
        {item.completed && <Check size={12} strokeWidth={3} />}
      </button>
      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-snug antialiased ${item.completed ? 'line-through text-slate-400 dark:text-slate-500' : 'text-slate-800 dark:text-slate-200'}`}>
          {item.title}
        </p>
        {(item.notes || item.assignees.length > 0 || item.due_date) && (
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500 dark:text-gray-400">
            {item.assignees.length > 0 && (
              <span className="inline-flex items-center -space-x-1">
                {item.assignees.slice(0, 5).map((a) => <Avatar key={a.id} user={a} size={5} />)}
                {item.assignees.length > 5 && (
                  <span
                    data-tooltip-id="app-tooltip"
                    data-tooltip-content={item.assignees.slice(5).map((a) => `${a.first_name} ${a.last_name}`.trim()).join(', ')}
                    className="w-5 h-5 inline-flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 text-slate-700 dark:text-slate-300 text-[9px] font-medium ring-1 ring-white dark:ring-gray-900 shrink-0 antialiased"
                  >
                    +{item.assignees.length - 5}
                  </span>
                )}
              </span>
            )}
            {item.due_date && (
              <span className={`inline-flex items-center gap-1 ${overdue && !item.completed ? 'text-rose-600 dark:text-rose-400 font-semibold' : ''}`}>
                <Calendar size={10} /> {fmtDate(item.due_date)}{overdue && !item.completed && ' • Overdue'}
              </span>
            )}
            {item.notes && (
              <span className="inline-flex items-center gap-1 truncate max-w-[200px]" title={item.notes}>
                <Pencil size={10} /> {item.notes}
              </span>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        <button type="button" onClick={onEdit} aria-label="Edit to-do" title="Edit" className="w-7 h-7 inline-flex items-center justify-center text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-md transition bg-transparent border-none cursor-pointer">
          <Pencil size={12} />
        </button>
        <button type="button" onClick={onRemove} aria-label="Delete to-do" title="Delete" className="w-7 h-7 inline-flex items-center justify-center text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-md transition bg-transparent border-none cursor-pointer">
          <Trash2 size={12} />
        </button>
        <span aria-hidden className="w-6 h-7 inline-flex items-center justify-center text-gray-300 dark:text-gray-600 cursor-grab touch-none">
          <GripVertical size={12} />
        </span>
      </div>
    </li>
  )
}

// ─── Sortable item row ───────────────────────────────────────────────────────

function SortableItemRow({
  item, color, onToggle, onEdit, onRemove,
}: {
  item: TodoItem
  color: TodoColor
  onToggle: () => void
  onEdit: () => void
  onRemove: () => void
}) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: item.id })

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    touchAction: 'none',
  }

  return (
    <div ref={setNodeRef} {...listeners} {...attributes} style={style}>
      <ItemRow
        item={item}
        color={color}
        onToggle={onToggle}
        onEdit={onEdit}
        onRemove={onRemove}
        isDragging={isDragging}
      />
    </div>
  )
}


function ListCard({
  list, members, onCreateItem, onUpdateItem, onRemoveItem, onUpdateList, onRemoveList, onReorderItems,
}: {
  list: TodoList
  members: UserSummary[]
  onCreateItem: (input: { title: string; notes?: string | null; due_date?: string | null }) => Promise<any>
  onUpdateItem: (id: number, patch: any) => Promise<any>
  onRemoveItem: (id: number) => Promise<any>
  onUpdateList: (id: number, patch: any) => Promise<any>
  onRemoveList: (id: number) => Promise<any>
  onReorderItems: (listId: number, order: { id: number; position: number }[]) => Promise<any>
}) {
  const [newTitle, setNewTitle] = useState('')
  const [showCompleted, setShowCompleted] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const [renaming, setRenaming] = useState(false)
  const [renameVal, setRenameVal] = useState(list.name)
  const [editingItem, setEditingItem] = useState<TodoItem | null>(null)
  const [confirmDelList, setConfirmDelList] = useState(false)
  const [pendingDeleteItem, setPendingDeleteItem] = useState<TodoItem | null>(null)

  const colors = COLOR_CLASSES[list.color]
  const active = list.items.filter((i) => !i.completed)
  const done = list.items.filter((i) => i.completed)
  const total = list.items.length
  const completedCount = done.length
  const progress = total ? Math.round((completedCount / total) * 100) : 0

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    const t = newTitle.trim()
    if (!t) return
    try {
      await onCreateItem({ title: t })
      toast.success('To-do added')
      setNewTitle('')
    } catch (err: any) {
      toast.error(err.message || 'Failed to add to-do')
    }
  }

  const handleRename = async () => {
    const v = renameVal.trim()
    if (!v || v === list.name) { setRenaming(false); setRenameVal(list.name); return }
    try {
      await onUpdateList(list.id, { name: v })
      setRenaming(false)
    } catch (err: any) {
      toast.error(err.message || 'Rename failed')
      setRenameVal(list.name)
      setRenaming(false)
    }
  }

  const handleToggle = async (item: TodoItem) => {
    try {
      await onUpdateItem(item.id, { completed: !item.completed })
    } catch (err: any) {
      toast.error(err.message || 'Toggle failed')
    }
  }

  const activeItems = list.items.filter((i) => !i.completed)

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = activeItems.findIndex((i) => i.id === active.id)
    const newIndex = activeItems.findIndex((i) => i.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    const reordered = arrayMove(activeItems, oldIndex, newIndex)
    const next = reordered.map((it, idx) => ({ id: it.id, position: idx }))
    try {
      onReorderItems(list.id, next)
    } catch (err: any) {
      toast.error(err.message || 'Reorder failed')
    }
  }

  return (
    <>
      <div className={`bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden flex flex-col`}>
        {/* Header */}
        <div className={`${colors.bg} px-4 py-3`}>
          <div className="flex items-center justify-between gap-2">
            {renaming ? (
              <input
                autoFocus
                value={renameVal}
                onChange={(e) => setRenameVal(e.target.value)}
                onBlur={handleRename}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleRename() } if (e.key === 'Escape') { setRenaming(false); setRenameVal(list.name) } }}
                className="flex-1 px-2 py-1 text-sm font-bold text-white bg-white/20 placeholder-white/70 rounded-lg border border-white/30 focus:outline-none focus:ring-2 focus:ring-white/40"
              />
            ) : (
              <h3 className="font-bold text-white text-sm truncate flex-1 cursor-text" onDoubleClick={() => setRenaming(true)} title="Double-click to rename">
                {list.name}
              </h3>
            )}
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-[10px] font-bold text-white/90 bg-white/20 px-2 py-0.5 rounded-full">
                {completedCount}/{total}
              </span>
              <div className="relative">
                <button
                  ref={menuButtonRef}
                  type="button"
                  aria-label="List menu"
                  onClick={() => setMenuOpen((v) => !v)}
                  className="w-7 h-7 inline-flex items-center justify-center text-white/80 hover:text-white hover:bg-white/20 rounded-lg border-none cursor-pointer transition"
                >
                  <MoreVertical size={14} />
                </button>
                {menuOpen && (() => {
                  const rect = menuButtonRef.current?.getBoundingClientRect()
                  const top = rect ? rect.bottom + window.scrollY : 0
                  const right = rect ? window.innerWidth - rect.right : 0
                  return createPortal(
                    <>
                      <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
                      <div
                        className="fixed z-[100] w-44 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl py-1 animate-fade-in-up"
                        style={{ top: `${top}px`, right: `${right}px` }}
                      >
                        <button
                          type="button"
                          onClick={() => { setMenuOpen(false); setRenaming(true) }}
                          className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 border-none bg-transparent cursor-pointer"
                        >
                          <Pencil size={12} /> Rename
                        </button>
                        <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">Color</div>
                        <div className="px-3 pb-2 flex gap-1.5 flex-wrap">
                          {COLORS.map((c) => (
                            <button
                              key={c}
                              type="button"
                              aria-label={c}
                              onClick={async () => { setMenuOpen(false); try { await onUpdateList(list.id, { color: c }) } catch (e: any) { toast.error(e.message) } }}
                              className={`w-5 h-5 rounded-full ${COLOR_CLASSES[c].bg} border-2 cursor-pointer transition ${c === list.color ? 'border-gray-900 dark:border-white scale-110' : 'border-transparent hover:scale-105'}`}
                            />
                          ))}
                        </div>
                        <div className="border-t border-gray-100 dark:border-gray-700 my-1" />
                        <button
                          type="button"
                          onClick={() => { setMenuOpen(false); setConfirmDelList(true) }}
                          className="w-full px-3 py-2 text-left text-sm text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/30 flex items-center gap-2 border-none bg-transparent cursor-pointer"
                        >
                          <Trash2 size={12} /> Delete list
                        </button>
                      </div>
                    </>,
                    document.body
                  )
                })()}
              </div>
            </div>
          </div>
          {total > 0 && (
            <div className="mt-2 h-1 bg-white/20 rounded-full overflow-hidden">
              <div className="h-full bg-white transition-all" style={{ width: `${progress}%` }} />
            </div>
          )}
        </div>

        {/* Items */}
        <ul className="flex-1 divide-y divide-gray-100 dark:divide-gray-800">
          <DndContext
            sensors={[
              useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
              useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
            ]}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={activeItems.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              {activeItems.map((item) => (
                <SortableItemRow
                  key={item.id}
                  item={item}
                  color={list.color}
                  onToggle={() => handleToggle(item)}
                  onEdit={() => setEditingItem(item)}
                  onRemove={() => setPendingDeleteItem(item)}
                />
              ))}
            </SortableContext>
          </DndContext>
          {done.length > 0 && (
            <>
              <li className="px-4 py-2 flex items-center justify-between bg-gray-50 dark:bg-gray-800/40 border-y border-gray-100 dark:border-gray-800">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                  Completed ({done.length})
                </span>
                <button
                  type="button"
                  onClick={() => setShowCompleted((v) => !v)}
                  className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white inline-flex items-center gap-1 bg-transparent border-none cursor-pointer"
                >
                  {showCompleted ? <><EyeOff size={11} /> Hide</> : <><Eye size={11} /> Show</>}
                </button>
              </li>
              {showCompleted && done.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  color={list.color}
                  onToggle={() => handleToggle(item)}
                  onEdit={() => setEditingItem(item)}
                  onRemove={() => setPendingDeleteItem(item)}
                />
              ))}
            </>
          )}
          {/* Add row */}
          <li className="px-4 py-2.5">
            <form onSubmit={handleAdd} className="flex items-center gap-2">
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Add a to-do…"
                className={`flex-1 px-2 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-gray-50 dark:bg-gray-800 text-slate-800 dark:text-slate-100 placeholder-gray-400 antialiased focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:bg-white dark:focus:bg-gray-900`}
              />
              <button
                type="submit"
                aria-label="Add to-do"
                disabled={!newTitle.trim()}
                className={`w-8 h-8 inline-flex items-center justify-center ${colors.bg} hover:opacity-90 text-white rounded-lg border-none cursor-pointer disabled:opacity-40`}
              >
                <Plus size={14} strokeWidth={2.5} />
              </button>
            </form>
          </li>
        </ul>
      </div>

      {/* Modals */}
      {editingItem && (
        <ItemEditModal
          item={editingItem}
          members={members}
          onClose={() => setEditingItem(null)}
          onSave={async (patch) => {
            try {
              await onUpdateItem(editingItem.id, patch)
              toast.success('To-do updated')
            } catch (err: any) {
              toast.error(err.message || 'Failed to save')
              throw err
            }
          }}
        />
      )}

      <ConfirmDialog
        open={confirmDelList}
        title="Delete to-do list?"
        description={`This will permanently delete "${list.name}" and all ${total} to-do${total === 1 ? '' : 's'}.`}
        confirmLabel="Delete list"
        destructive
        onConfirm={async () => {
          try {
            await onRemoveList(list.id)
            toast.success('List deleted')
          } catch (err: any) {
            toast.error(err.message || 'Failed to delete')
          } finally {
            setConfirmDelList(false)
          }
        }}
        onCancel={() => setConfirmDelList(false)}
      />

      <ConfirmDialog
        open={!!pendingDeleteItem}
        title="Delete to-do?"
        description={`"${pendingDeleteItem?.title}" will be removed from this list.`}
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (!pendingDeleteItem) return
          try {
            await onRemoveItem(pendingDeleteItem.id)
            toast.success('To-do deleted')
          } catch (err: any) {
            toast.error(err.message || 'Failed to delete')
          } finally {
            setPendingDeleteItem(null)
          }
        }}
        onCancel={() => setPendingDeleteItem(null)}
      />
    </>
  )
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function TodosPage() {
  const params = useParams<{ projectId: string }>()
  const projectId = params.projectId
  const store = useTodos(projectId, { pollMs: 0 })
  const [members, setMembers] = useState<UserSummary[]>([])
  const [newListOpen, setNewListOpen] = useState(false)

  // Load project members for the assignee dropdown
  useEffect(() => {
    let cancelled = false
    api.get(`/projects/${projectId}`).then((r: any) => {
      if (cancelled) return
      const ms = (r.members || []).map((m: any) => ({ id: m.user_id, first_name: m.first_name, last_name: m.last_name }))
      // Include the project owner if not already in members
      const ownerId = r.owner_id
      if (ownerId && !ms.some((u: UserSummary) => u.id === ownerId)) {
        ms.unshift({ id: ownerId, first_name: 'Project', last_name: 'Owner' })
      }
      setMembers(ms)
    }).catch(() => {/* non-fatal */})
    return () => { cancelled = true }
  }, [projectId])

  // Toast on API load errors (initial or refetch)
  const prevErrorRef = useRef<string | null>(null)
  useEffect(() => {
    if (store.error && store.error !== prevErrorRef.current) {
      prevErrorRef.current = store.error
      toast.error(store.error)
    } else if (!store.error) {
      prevErrorRef.current = null
    }
  }, [store.error])

  // Memoised handlers for ListCard so each card's identity is stable
  const handlers = useMemo(() => ({
    createList: store.createList,
    updateList: store.updateList,
    removeList: store.removeList,
    createItem: store.createItem,
    updateItem: store.updateItem,
    removeItem: store.removeItem,
    reorderItems: store.reorderItems,
  }), [store])

  const handleCreateList = async (name: string, color: TodoColor) => {
    const list = await handlers.createList({ name, color })
    toast.success(`"${list.name}" created`)
  }

  return (
    <FeaturePage featureKey="todos" title="To-do Lists">
      <div className="space-y-4">
        {/* Toolbar */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white">Project to-dos</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {store.stats.completed} of {store.stats.total} complete
              {store.stats.total > 0 && (
                <span className="ml-2 text-emerald-600 dark:text-emerald-300 font-semibold">
                  ({Math.round((store.stats.completed / store.stats.total) * 100)}%)
                </span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setNewListOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow border-none cursor-pointer"
          >
            <Plus size={14} strokeWidth={2.5} />
            New list
          </button>
        </div>

        {/* Body */}
        {store.loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 h-64 animate-shimmer" />
            ))}
          </div>
        ) : store.lists.length === 0 ? (
          <EmptyState
            iconName="ListChecks"
            title="No to-do lists yet"
            description="Create your first list to start tracking what needs to get done."
            actionLabel="Create first list"
            onAction={() => setNewListOpen(true)}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {store.lists.map((list) => (
              <ListCard
                key={list.id}
                list={list}
                members={members}
                onCreateItem={(input) => handlers.createItem(list.id, input)}
                onUpdateItem={handlers.updateItem}
                onRemoveItem={handlers.removeItem}
                onUpdateList={handlers.updateList}
                onRemoveList={handlers.removeList}
                onReorderItems={handlers.reorderItems}
              />
            ))}
          </div>
        )}
      </div>

      <NewListModal
        open={newListOpen}
        onClose={() => setNewListOpen(false)}
        onCreate={handleCreateList}
      />
    </FeaturePage>
  )
}