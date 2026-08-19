'use client'
import PortalModal from '@/components/PortalModal';

/**
 * /projects/[projectId]/task-board
 *
 * Kanban-style Task Board with drag-and-drop task movement.
 *
 * Structure:
 *   ── Toolbar (header): task count, "Add task" button, "Add column" button
 *   ── Board: horizontally-scrollable list of columns
 *   ── Each column: header (rename / delete) + droppable task list
 *   ── Task cards: priority dot + title + (due date / assignees / subtasks)
 *   ── Click task → drawer with full details (comments, subtasks, attachments, activity)
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import {
  DndContext, DragOverlay, MouseSensor, TouchSensor, useSensor, useSensors, useDroppable, pointerWithin,
  type DragEndEvent, type DragOverEvent, type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Plus, MoreHorizontal, X, Trash2, Pencil, MessageSquare, Paperclip, Calendar as CalIcon,
  Flag, Users as UsersIcon, ChevronLeft, ChevronDown, Upload, FileIcon, CheckSquare, Square,
  Activity as ActivityIcon, AlertCircle, Archive, Filter as FilterIcon, Check,
} from 'lucide-react'
import FeaturePage from '@/components/project/FeaturePage'
import EmptyState from '@/components/project/EmptyState'
import ConfirmDialog from '@/components/project/ConfirmDialog'
import MultiSelectDropdown from '@/components/project/MultiSelectDropdown'
import ArchivedTasksModal from '@/components/project/ArchivedTasksModal'
import { fmtRelative } from '@/components/project/format'
import { buildDueLabel, isColumnCompleted, matchesDueFilter, countOverdueTasks, type DueFilter, todayYmd } from '@/lib/task-board-utils'
import {
  useTaskBoard, useTaskDetail,
  type BoardTask, type BoardColumn, type Priority, type BoardUser,
} from '@/lib/task-board-api'

const PRIORITY_COLOR: Record<Priority, string> = {
  low:    'bg-sky-500',
  medium: 'bg-amber-500',
  high:   'bg-rose-500',
}
const PRIORITY_LABEL: Record<Priority, string> = { low: 'Low', medium: 'Medium', high: 'High' }

/**
 * Styled native <select> for priority. Native element keeps keyboard / a11y
 * behavior for free (space/arrows open it, type-ahead works) while we get a
 * clean dropdown UI matching the rest of the modal.
 */
function PrioritySelect ({
  value, onChange,
}: {
  value: Priority
  onChange: (v: Priority) => void
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as Priority)}
        className="w-full appearance-none bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg pl-7 pr-8 py-1.5 text-sm font-semibold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
      >
        {(['low', 'medium', 'high'] as Priority[]).map((p) => (
          <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>
        ))}
      </select>
      <span className={`pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full ${PRIORITY_COLOR[value]}`} />
      <ChevronDown size={13} strokeWidth={2.25} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400" />
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────
 * DnD helpers
 * ────────────────────────────────────────────────────────────────── */

/** Extracts the task id from a draggable `task-{id}` string. */
function parseTaskId(id: string): string {
  return id.replace(/^task-/, '')
}

/* ──────────────────────────────────────────────────────────────────
 * Column wrapper with droppable task zone
 * ────────────────────────────────────────────────────────────────── */
function DnDColumn ({
  column, onRename, onDelete, onAddTask, onOpenTask, filter, activeTaskId,
}: {
  column: BoardColumn
  onRename: (id: string | number, name: string) => void
  onDelete: (id: string | number) => void
  onAddTask: (columnId: string | number) => void
  onOpenTask: (task: BoardTask) => void
  filter: DueFilter
  activeTaskId: string | number | null
}) {
  const [editingName, setEditingName] = useState(false)
  const [name, setName] = useState(column.name)
  const [hovered, setHovered] = useState(false)
  useEffect(() => { setName(column.name) }, [column.name])

  // Droppable zone for the entire task list area
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `col-drop-${column.id}`,
    data: { type: 'column-drop', columnId: column.id },
  })

  const visibleTasks = column.tasks.filter(
    (task) => matchesDueFilter(filter, task.due_date, isColumnCompleted(column.name)),
  )

  return (
    <div
      className="group flex flex-col w-72 shrink-0 bg-gray-100 dark:bg-gray-800/60 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden max-h-[calc(100vh-180px)]"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Column header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-200/80 dark:border-gray-700/80">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {editingName ? (
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { onRename(column.id, name.trim()); setEditingName(false) }
                if (e.key === 'Escape') { setName(column.name); setEditingName(false) }
              }}
              onBlur={() => { if (name.trim() && name !== column.name) onRename(column.id, name.trim()); else setName(column.name); setEditingName(false) }}
              className="flex-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-1.5 py-0.5 text-sm font-bold"
            />
          ) : (
            <h3 className="text-[13px] font-bold text-gray-900 dark:text-white truncate flex items-center gap-2">
              {column.name}
              <span className="inline-flex items-center justify-center min-w-[22px] px-1.5 h-5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-[10px] font-semibold">
                {column.tasks.length}
              </span>
              {column.is_backlog && (
                <span className="text-[9px] font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400 border border-sky-200 dark:border-sky-800 rounded px-1.5 py-0.5">Default</span>
              )}
            </h3>
          )}
        </div>
        {/* Action buttons */}
        <div
          className="flex items-center gap-0.5 shrink-0 transition-opacity"
          style={{ opacity: hovered ? 1 : 0 }}
        >
          <button
            type="button"
            onClick={() => setEditingName(true)}
            className="w-7 h-7 inline-flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md bg-transparent border-none cursor-pointer"
            title="Rename column"
          >
            <Pencil size={12} strokeWidth={2.25} />
          </button>
          {!column.is_backlog && (
            <button
              type="button"
              onClick={() => onDelete(column.id)}
              className="w-7 h-7 inline-flex items-center justify-center text-gray-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-md bg-transparent border-none cursor-pointer"
              title="Delete column"
            >
              <Trash2 size={12} strokeWidth={2.25} />
            </button>
          )}
        </div>
      </div>

      {/* Droppable task list */}
      <div
        ref={setDropRef}
        data-droppable-id={`col-drop-${column.id}`}
        className={`flex-1 min-h-0 overflow-y-auto px-2 py-1.5 transition-colors ${
          isOver
            ? 'bg-indigo-50/60 dark:bg-indigo-950/30 ring-2 ring-inset ring-indigo-300 dark:ring-indigo-700 rounded-b-2xl'
            : ''
        }`}
      >
        <SortableContext
          items={visibleTasks.map((t) => `task-${t.id}`)}
          strategy={verticalListSortingStrategy}
        >
          {visibleTasks.length === 0 ? (
            <p className="text-xs italic text-gray-400 dark:text-gray-500 text-center py-8 select-none">
              {isOver ? 'Drop here' : ''}
            </p>
          ) : (
            visibleTasks.map((task) => (
              <DnDTask
                key={task.id}
                task={task}
                columnName={column.name}
                onOpen={onOpenTask}
                active={activeTaskId === task.id}
              />
            ))
          )}
        </SortableContext>
      </div>

      {/* Add task button */}
      <button
        type="button"
        onClick={() => onAddTask(column.id)}
        className="m-2 inline-flex items-center justify-center gap-1 px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 bg-transparent hover:bg-white dark:hover:bg-gray-900 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg border border-dashed border-gray-300 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-700 cursor-pointer transition-colors"
      >
        <Plus size={12} strokeWidth={2.5} /> Add task
      </button>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────
 * Task card — Sortable
 * ────────────────────────────────────────────────────────────────── */
const PRIORITY_BAR: Record<Priority, string> = {
  high:   'bg-rose-500',
  medium: 'bg-amber-400',
  low:    'bg-sky-400',
}
const PRIORITY_PILL: Record<Priority, string> = {
  high:   'bg-rose-50 text-rose-700 ring-1 ring-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:ring-rose-800',
  medium: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:ring-amber-800',
  low:    'bg-sky-50 text-sky-700 ring-1 ring-sky-200 dark:bg-sky-900/30 dark:text-sky-300 dark:ring-sky-800',
}

/** Strip HTML tags + collapse whitespace for plain-text preview. */
function htmlToText(html: string | null | undefined): string {
  if (!html) return ''
  return html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
}

function DnDTask ({
  task, columnName, onOpen, active,
}: {
  task: BoardTask
  columnName: string
  onOpen: (task: BoardTask) => void
  active: boolean
}) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({
    id: `task-${task.id}`,
    data: { type: 'task', task, columnName },
  })
  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
    // Required on touch devices: prevents the browser's default touch-scroll
    // handling from stealing events from dnd-kit's touch sensor.
    touchAction: 'none',
  }

  const doneSub = task.subtasks.filter((s) => s.done).length
  const totalSub = task.subtasks.length
  const descText = htmlToText(task.description_html)
  const completed = isColumnCompleted(columnName)
  const [, forceTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 60_000)
    return () => clearInterval(id)
  }, [])
  const dueLabel = buildDueLabel(task.due_date, completed)

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={() => !isDragging && onOpen(task)}
      className={`group relative bg-white dark:bg-gray-900 rounded-xl border shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:shadow-[0_4px_12px_rgba(15,23,42,0.08)] hover:-translate-y-0.5 transition-all overflow-hidden ${
        dueLabel?.isOverdue
          ? 'border-rose-300 dark:border-rose-800/60 bg-rose-50/30 dark:bg-rose-950/20'
          : 'border-gray-200/80 dark:border-gray-700/80'
      } ${active ? 'ring-2 ring-indigo-500' : ''}`}
      // Drag handle: entire card is draggable
      {...attributes}
      {...listeners}
    >
      {/* Priority accent stripe */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${PRIORITY_BAR[task.priority]}`} aria-hidden />

      <div className="pl-4 pr-3.5 pt-3 pb-3">
        {/* Title + priority pill */}
        <div className="flex items-start gap-2">
          <h4 className={`flex-1 min-w-0 text-[13.5px] font-semibold leading-snug truncate pr-1 ${dueLabel?.isOverdue ? 'text-rose-950 dark:text-rose-100' : 'text-gray-900 dark:text-white'}`}>
            {task.title}
          </h4>
          <span
            className={`shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider ${PRIORITY_PILL[task.priority]}`}
            title={`${PRIORITY_LABEL[task.priority]} priority`}
          >
            <span className={`w-1 h-1 rounded-full ${PRIORITY_BAR[task.priority]}`} />
            {PRIORITY_LABEL[task.priority]}
          </span>
        </div>

        {descText && (
          <p className="mt-1.5 text-[12px] leading-snug text-gray-500 dark:text-gray-400 break-words line-clamp-2">
            {descText}
          </p>
        )}

        {/* Footer */}
        <div className="mt-3 flex items-center justify-between gap-2 min-h-[22px]">
          <div className="flex items-center gap-3 text-[11px] text-gray-500 dark:text-gray-400 font-medium">
            {totalSub > 0 && (
              <span className={`inline-flex items-center gap-1 ${doneSub === totalSub ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>
                <CheckSquare size={11} strokeWidth={2.5} />
                {doneSub}/{totalSub}
              </span>
            )}
            {dueLabel && (
              <DueDateChip label={dueLabel.label} urgency={dueLabel.urgency} title={dueLabel.title} />
            )}
          </div>
          {task.assignees.length > 0 && (
            <div className="flex items-center -space-x-1.5 shrink-0">
              {task.assignees.slice(0, 3).map((a) => (
                <div
                  key={a.id}
                  title={a.name}
                  className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 text-white flex items-center justify-center text-[9px] font-bold border-2 border-white dark:border-gray-900 shadow-sm"
                >
                  {a.initials.slice(0, 2)}
                </div>
              ))}
              {task.assignees.length > 3 && (
                <span className="w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 flex items-center justify-center text-[9px] font-bold border-2 border-white dark:border-gray-900">
                  +{task.assignees.length - 3}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Compact pill showing a task's due-date label, colour-coded by urgency.
 */
function DueDateChip ({
  label, urgency, title,
}: { label: string; urgency: 'overdue' | 'today' | 'tomorrow' | 'soon' | 'far' | 'none'; title: string }) {
  const palette = (() => {
    switch (urgency) {
      case 'overdue':
        return 'bg-rose-100 text-rose-700 ring-1 ring-rose-300 dark:bg-rose-900/40 dark:text-rose-100 dark:ring-rose-700/60 font-bold tracking-tight'
      case 'today':
        return 'bg-amber-100 text-amber-800 ring-1 ring-amber-200 dark:bg-amber-900/40 dark:text-amber-200 dark:ring-amber-800/60 font-bold'
      case 'tomorrow':
        return 'bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:ring-amber-800/50 font-semibold'
      case 'soon':
        return 'bg-sky-50 text-sky-700 ring-1 ring-sky-200 dark:bg-sky-900/30 dark:text-sky-300 dark:ring-sky-800/50'
      case 'far':
      case 'none':
      default:
        return 'text-gray-500 dark:text-gray-400'
    }
  })()
  const ring = urgency === 'far' || urgency === 'none' ? '' : 'px-1.5 py-0.5 rounded-md whitespace-nowrap'
  return (
    <span className={`inline-flex items-center gap-1 ${ring} ${palette}`} title={title}>
      <CalIcon size={11} strokeWidth={2.25} className="shrink-0" />
      <span className="whitespace-nowrap">{label}</span>
    </span>
  )
}

/* ──────────────────────────────────────────────────────────────────
 * Task creation modal
 * ────────────────────────────────────────────────────────────────── */
function NewTaskModal ({
  columnName, members, onClose, onCreate,
}: {
  columnName: string
  members: BoardUser[]
  onClose: () => void
  onCreate: (data: { title: string; description_html: string; priority: Priority; due_date: string | null; assignee_ids: Array<string | number> }) => Promise<void>
}) {
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [priority, setPriority] = useState<Priority>('medium')
  const [due, setDue] = useState('')
  const [assignees, setAssignees] = useState<Array<string | number>>([])
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!title.trim() || busy) return
    setBusy(true)
    try {
      await onCreate({
        title: title.trim(),
        description_html: desc,
        priority,
        due_date: due || null,
        assignee_ids: assignees,
      })
      onClose()
    } finally { setBusy(false) }
  }

  return (
    <PortalModal>
            <div className="fixed inset-0 z-40 flex items-center justify-center p-4 animate-fade-in-up">
              <div className="absolute inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm" onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()} aria-hidden />
              <div className="relative bg-white dark:bg-gray-900 rounded-none sm:rounded-2xl shadow-2xl border-0 sm:border border-gray-200 dark:border-gray-800 w-full sm:max-w-xl flex flex-col max-h-screen sm:max-h-[85vh]" onClick={e => e.stopPropagation()}>
                <header className="flex items-center justify-between px-4 sm:px-5 py-3 sm:py-4 border-b border-gray-200 dark:border-gray-800">
                  <h2 className="text-base font-bold text-gray-900 dark:text-white">New task - {columnName}</h2>
                  <button type="button" onClick={onClose} className="w-9 h-9 inline-flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg bg-transparent border-none cursor-pointer" title="Close">
                    <X size={16} strokeWidth={2.25} />
                  </button>
                </header>
                <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-5 py-4 sm:py-5 space-y-3">
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Task title"
                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-base font-semibold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <textarea
                    value={desc}
                    onChange={(e) => setDesc(e.target.value)}
                    placeholder="Description (optional)..."
                    rows={8}
                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none min-h-[180px]"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Priority</label>
                      <PrioritySelect value={priority} onChange={setPriority} />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Due date</label>
                      <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    </div>
                  </div>
                  <div>
                    <MultiSelectDropdown
                      label="Assignees"
                      placeholder="Select assignees..."
                      options={members.map((m) => ({
                        id: m.id,
                        label: m.name,
                        initials: m.initials,
                        subtitle: m.email,
                      }))}
                      selected={assignees}
                      onChange={setAssignees}
                    />
                  </div>
                </div>
                <footer className="flex items-center justify-end gap-2 px-4 sm:px-5 py-3 sm:py-4 border-t border-gray-200 dark:border-gray-800">
                  <button type="button" onClick={onClose} disabled={busy} className="px-3 sm:px-4 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-semibold border-none cursor-pointer disabled:opacity-50">Cancel</button>
                  <button type="button" onClick={submit} disabled={busy || !title.trim()} className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow border-none cursor-pointer disabled:opacity-50">
                    {busy ? <span className="animate-spin">⏳</span> : <Plus size={14} strokeWidth={2.5} />}
                    Create task
                  </button>
                </footer>
              </div>
            </div>
    </PortalModal>
  )
}

/* ──────────────────────────────────────────────────────────────────
 * Add column modal
 * ────────────────────────────────────────────────────────────────── */
function AddColumnModal ({
  onClose, onCreate,
}: { onClose: () => void; onCreate: (name: string) => Promise<void> }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    if (!name.trim() || busy) return
    setBusy(true)
    try { await onCreate(name.trim()); onClose() } finally { setBusy(false) }
  }
  return (
    <PortalModal>
            <div className="fixed inset-0 z-40 flex items-stretch sm:items-start sm:justify-center sm:pt-24 justify-center p-0 sm:p-4 animate-fade-in-up">
              <div className="absolute inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm" onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()} />
              <div className="relative bg-white dark:bg-gray-900 rounded-none sm:rounded-2xl shadow-2xl border-0 sm:border border-gray-200 dark:border-gray-800 w-full sm:max-w-sm flex flex-col">
                <header className="px-5 py-4 border-b border-gray-200 dark:border-gray-800">
                  <h2 className="text-base font-bold text-gray-900 dark:text-white">New column</h2>
                </header>
                <div className="p-5">
                  <input
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
                    placeholder="Column name (e.g. Blocked)"
                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <footer className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200 dark:border-gray-800">
                  <button type="button" onClick={onClose} className="px-3 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-semibold border-none cursor-pointer">Cancel</button>
                  <button type="button" onClick={submit} disabled={busy || !name.trim()} className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow border-none cursor-pointer disabled:opacity-50">Create column</button>
                </footer>
              </div>
            </div>
    </PortalModal>
  )
}

/* ──────────────────────────────────────────────────────────────────
 * Activity helpers
 * ────────────────────────────────────────────────────────────────── */
function humanizeAction(action: string, details: any): string {
  switch (action) {
    case 'created':            return `created the task${details?.title ? ` "${truncate(details.title)}"` : ''}`
    case 'edited':             return 'edited the task'
    case 'moved': {
      const to = details?.to_column_id
      return `moved the task${to ? ` to column ${to}` : ''}`
    }
    case 'commented':          return 'added a comment'
    case 'comment_edited':     return 'edited a comment'
    case 'comment_deleted':    return 'deleted a comment'
    case 'attached':           return `attached "${truncate(details?.name ?? 'a file')}"`
    case 'attachment_deleted': return 'deleted an attachment'
    case 'subtask_added':      return `added subtask "${truncate(details?.title ?? '')}"`
    case 'subtask_done':       return 'completed a subtask'
    case 'subtask_undone':     return 'reopened a subtask'
    case 'subtask_deleted':    return 'deleted a subtask'
    case 'deleted':            return 'deleted the task'
    default:                   return action
  }
}
function truncate(s: string, n = 30) { return s.length > n ? s.slice(0, n - 1) + '...' : s }

/* ──────────────────────────────────────────────────────────────────
 * Filter dropdown
 * ────────────────────────────────────────────────────────────────── */
const FILTER_OPTIONS: ReadonlyArray<{ id: DueFilter; label: string; description: string }> = [
  { id: 'all',       label: 'All',           description: 'Show every task' },
  { id: 'overdue',   label: 'Overdue',       description: 'Past due, not done' },
  { id: 'today',     label: 'Due Today',     description: 'Due today' },
  { id: 'this-week', label: 'Due This Week', description: 'Due in the next 7 days' },
  { id: 'no-date',   label: 'No Due Date',   description: 'No due date set' },
]

function FilterDropdown ({
  value, overdueCount, onChange,
}: {
  value: DueFilter
  overdueCount: number
  onChange: (next: DueFilter) => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const current = FILTER_OPTIONS.find((o) => o.id === value) || FILTER_OPTIONS[0]

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold border cursor-pointer transition ${
          value === 'all'
            ? 'bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-700'
            : 'bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 text-indigo-700 dark:text-indigo-200 border-indigo-200 dark:border-indigo-800'
        }`}
        title="Filter tasks by due date"
        aria-expanded={open}
      >
        <FilterIcon size={14} strokeWidth={2.5} />
        <span>Filter</span>
        {value !== 'all' && (
          <>
            <span aria-hidden>·</span>
            <span>{current.label}</span>
          </>
        )}
        {overdueCount > 0 && (
          <span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none ${
            value === 'overdue'
              ? 'bg-rose-600 text-white'
              : 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-200'
          }`}>
            {overdueCount}
          </span>
        )}
        <ChevronDown size={12} strokeWidth={2.5} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-30 w-56 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl py-1.5 animate-fade-in-up">
          {FILTER_OPTIONS.map((opt) => {
            const active = opt.id === value
            const showOverdueBadge = opt.id === 'overdue' && overdueCount > 0
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => { onChange(opt.id); setOpen(false) }}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm cursor-pointer border-none text-left ${
                  active
                    ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-200'
                    : 'bg-transparent text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                <span className="flex flex-col items-start min-w-0">
                  <span className="font-semibold">{opt.label}</span>
                  <span className="text-[11px] text-gray-500 dark:text-gray-400 font-normal">{opt.description}</span>
                </span>
                {showOverdueBadge && (
                  <span className="shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-200">
                    {overdueCount}
                  </span>
                )}
                {active && <Check size={14} strokeWidth={2.5} className="shrink-0 text-indigo-600 dark:text-indigo-300" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────
 * useFileInput helper
 * ────────────────────────────────────────────────────────────────── */
function useFileInput(handler: (f: File) => Promise<void>) {
  const ref = useRef<HTMLInputElement>(null)
  const handlerRef = useRef(handler)
  useEffect(() => { handlerRef.current = handler }, [handler])
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onChange = async () => {
      const file = el.files?.[0]
      if (!file) return
      try {
        await handlerRef.current(file)
      } finally {
        el.value = ''
      }
    }
    el.addEventListener('change', onChange)
    return () => el.removeEventListener('change', onChange)
  }, [])
  return ref
}

/* ──────────────────────────────────────────────────────────────────
 * The page
 * ────────────────────────────────────────────────────────────────── */
export default function TaskBoardPage() {
  const params = useParams<{ projectId: string }>()
  const router = useRouter()
  const projectId = params.projectId
  const tb = useTaskBoard(projectId)

  const [newTaskCol, setNewTaskCol] = useState<string | number | null>(null)
  const [showAddColumn, setShowAddColumn] = useState(false)
  const [confirmDelCol, setConfirmDelCol] = useState<BoardColumn | null>(null)
  const [activeTaskId, setActiveTaskId] = useState<string | number | null>(null)
  const [activeTaskObj, setActiveTaskObj] = useState<BoardTask | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [archivedCount, setArchivedCount] = useState(0)
  const [dueFilter, setDueFilter] = useState<DueFilter>('all')

  // Live "today" tick
  const [, forceTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 60_000)
    return () => clearInterval(id)
  }, [])
  const overdueCount = useMemo(
    () => countOverdueTasks(tb.board),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tb.board, todayYmd()],
  )

  // DnD sensors: small distance to differentiate click from drag
  const sensors = useSensors(
    // MouseSensor: require 8px of movement to start drag (prevents accidental drags on click)
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    // TouchSensor: 150ms delay + 5px tolerance — prevents accidental drags
    // during vertical scroll but activates quickly enough for smooth UX.
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  )

  // Drag handlers
  const onDragStart = (e: DragStartEvent) => {
    const data = e.active.data.current
    if (data?.type === 'task') {
      setActiveTaskId(parseTaskId(String(e.active.id)))
      setActiveTaskObj(data.task)
    }
  }

  const onDragEnd = async (e: DragEndEvent) => {
    setActiveTaskId(null)
    setActiveTaskObj(null)
    const { active, over } = e
    if (!over) return

    const activeData = active.data.current
    const overData = over.data.current

    if (activeData?.type !== 'task') return

    const taskId = parseTaskId(String(active.id))

    let toColumnId: string | number | null = null
    let newIndex = 0

    if (overData?.type === 'task') {
      // Dropped on another task — insert before it in that column
      const overTaskId = parseTaskId(String(over.id))
      for (const c of tb.board) {
        const idx = c.tasks.findIndex((t) => String(t.id) === overTaskId)
        if (idx >= 0) { toColumnId = c.id; newIndex = idx; break }
      }
    } else if (overData?.type === 'column-drop') {
      // Dropped on empty column area or below last task
      toColumnId = overData.columnId
      const col = tb.board.find((c) => String(c.id) === String(toColumnId))
      newIndex = col ? col.tasks.length : 0
    } else {
      return
    }

    if (!toColumnId) return

    // Check if task is already in the same column at the same position
    const sourceCol = tb.board.find((c) =>
      c.tasks.some((t) => String(t.id) === String(taskId)),
    )
    if (sourceCol && String(sourceCol.id) === String(toColumnId)) {
      const sameIdx = sourceCol.tasks.findIndex((t) => String(t.id) === String(taskId))
      if (sameIdx === newIndex) return // no-op
    }

    try {
      const result = await tb.moveTask(taskId, toColumnId, newIndex)
      if (result?.ok && !result.noop && result.toColumnName) {
        const moved = String(sourceCol?.id ?? '') !== String(toColumnId)
        toast.success(moved ? `Moved to "${result.toColumnName}"` : `Reordered in "${result.toColumnName}"`)
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to move task')
    }
  }

  // Archived count polling
  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    const fetchCount = async () => {
      try {
        const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
        const res = await fetch(`/api/projects/${projectId}/tasks?status=archived&limit=1`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        if (!res.ok || cancelled) return
        const data = await res.json()
        if (!cancelled) setArchivedCount(data?.total || 0)
      } catch { /* ignore */ }
    }
    fetchCount()
    return () => { cancelled = true }
  }, [projectId, tb.board])

  /* ── Button handlers ────────────────────────────────────────── */
  const handleAddTask = (columnId: string | number) => setNewTaskCol(columnId)

  const handleCreateTask = async (data: any) => {
    if (!newTaskCol) return
    await tb.createTask({ ...data, column_id: newTaskCol })
    toast.success('Task created')
  }

  const handleCreateColumn = async (name: string) => {
    await tb.createColumn(name)
    toast.success('Column added')
  }

  const handleDeleteColumn = async (columnId: string | number) => {
    setConfirmDelCol(null)
    try {
      await tb.deleteColumn(columnId)
      toast.success('Column deleted')
    } catch (e: any) {
      toast.error(e?.message || 'Failed to delete column')
    }
  }

  const totalTasks = tb.board.reduce((acc, c) => acc + c.tasks.length, 0)

  return (
    <FeaturePage featureKey="task-board" title="Task Board">
      {/* Toolbar */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm p-4 flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <CalIcon size={16} strokeWidth={2.25} className="text-indigo-500" />
            Task Board
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {tb.board.length} column{tb.board.length === 1 ? '' : 's'} · {totalTasks} task{totalTasks === 1 ? '' : 's'}
            {overdueCount > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 text-rose-600 dark:text-rose-300 font-semibold">
                <AlertCircle size={11} strokeWidth={2.5} />
                {overdueCount} overdue
              </span>
            )}
            {tb.error && <span className="text-rose-600 dark:text-rose-300 ml-2">· {tb.error}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowArchived(true)}
            className="relative inline-flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold cursor-pointer transition"
            title="View archived tasks"
          >
            <Archive size={14} strokeWidth={2.5} />
            <span>Archived</span>
            {archivedCount > 0 && (
              <span className="ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
                {archivedCount}
              </span>
            )}
          </button>
          <button type="button" onClick={() => setShowAddColumn(true)} className="inline-flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold cursor-pointer">
            <Plus size={14} strokeWidth={2.5} /> Add column
          </button>
          <FilterDropdown
            value={dueFilter}
            overdueCount={overdueCount}
            onChange={setDueFilter}
          />
        </div>
      </div>

      {/* Board */}
      {tb.loading && tb.board.length === 0 ? (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex flex-col w-72 shrink-0 bg-gray-100 dark:bg-gray-800/60 rounded-2xl border border-gray-200 dark:border-gray-700 max-h-[calc(100vh-180px)] animate-pulse" />
          ))}
        </div>
      ) : tb.board.length === 0 ? (
        <EmptyState
          iconName="KanbanSquare"
          title="No columns yet"
          description="Add a column to start organising tasks. A Backlog column is added automatically on first visit."
          actionLabel="Add column"
          onAction={() => setShowAddColumn(true)}
        />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={pointerWithin}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          // Explicitly enable and tune dnd-kit autoScroll for both axes.
          // threshold: start scrolling when the pointer is within 15% of the
          //   container edge — works on both desktop and touch viewports.
          // acceleration: 5 gives smooth ramping without sudden jumps.
          // interval: 5ms polling gives responsive feel.
          autoScroll={{
            threshold: { x: 0.15, y: 0.15 },
            acceleration: 5,
            interval: 5,
          }}
        >
          <div className="flex gap-3 overflow-x-auto pb-4 items-stretch">
            {tb.board.map((col) => (
              <DnDColumn
                key={col.id}
                column={col}
                onRename={(id, n) => tb.renameColumn(id, n).then(() => toast.success('Renamed')).catch(() => toast.error('Rename failed'))}
                onDelete={(id) => setConfirmDelCol(tb.board.find((c) => c.id === id) || null)}
                onAddTask={handleAddTask}
                onOpenTask={(t) => router.push(`/projects/${projectId}/task-board/${t.id}`)}
                filter={dueFilter}
                activeTaskId={activeTaskId}
              />
            ))}
          </div>

          {/* DragOverlay renders a floating clone of the dragged task.
           * portal-rendered to document.body to escape position:relative /
           * overflow:hidden contexts in column containers that would
           * otherwise clip or offset the overlay. */}
          {createPortal(
            <DragOverlay dropAnimation={null} modifiers={[]}>
              {activeTaskObj ? (
                <div className="w-64 bg-white dark:bg-gray-900 rounded-xl border-2 border-indigo-400 shadow-xl p-3 opacity-95 pointer-events-none">
                  <div className="flex items-start gap-2">
                    <div className={`w-1.5 h-1.5 mt-1.5 rounded-full shrink-0 ${PRIORITY_COLOR[activeTaskObj.priority]}`} />
                    <p className="text-sm font-semibold text-gray-900 dark:text-white line-clamp-3 leading-snug">
                      {activeTaskObj.title}
                    </p>
                  </div>
                </div>
              ) : null}
            </DragOverlay>,
            document.body,
          )}
        </DndContext>
      )}

      {/* Modals */}
      {newTaskCol !== null && (
        <NewTaskModal
          columnName={tb.board.find((c) => c.id === newTaskCol)?.name || 'Column'}
          members={tb.members}
          onClose={() => setNewTaskCol(null)}
          onCreate={handleCreateTask}
        />
      )}
      {showAddColumn && (
        <AddColumnModal
          onClose={() => setShowAddColumn(false)}
          onCreate={handleCreateColumn}
        />
      )}
      <ConfirmDialog
        open={!!confirmDelCol}
        title={confirmDelCol ? `Delete "${confirmDelCol.name}"?` : ''}
        description={confirmDelCol ? `All ${confirmDelCol.tasks.length} task(s) in this column will be deleted permanently.` : ''}
        confirmLabel="Delete"
        destructive
        onConfirm={async () => { if (confirmDelCol) await handleDeleteColumn(confirmDelCol.id) }}
        onCancel={() => setConfirmDelCol(null)}
      />

      <ArchivedTasksModal
        projectId={projectId}
        open={showArchived}
        onClose={() => {
          setShowArchived(false)
          const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
          fetch(`/api/projects/${projectId}/tasks?status=archived&limit=1`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          })
            .then((r) => r.ok ? r.json() : null)
            .then((data) => { if (data) setArchivedCount(data.total || 0) })
            .catch(() => { /* ignore */ })
        }}
        onRestored={() => {
          tb.refresh()
          setArchivedCount((n) => Math.max(0, n - 1))
        }}
      />
    </FeaturePage>
  )
}
