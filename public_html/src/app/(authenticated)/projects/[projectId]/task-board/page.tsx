'use client'

/**
 * /projects/[projectId]/task-board
 *
 * Kanban-style Task Board. Replaces the old /card-table mock page with
 * a real-API implementation backed by `useTaskBoard` and `useTaskDetail`.
 *
 * Structure:
 *   ── Toolbar (header): task count, "Add task" button, "Add column" button
 *   ── Board: horizontally-scrollable list of columns (drag-reorder)
 *   ── Each column: header (rename / delete) + droppable task list (drag-reorder, drag-across)
 *   ── Task cards: priority dot + title + (due date / assignees / subtasks)
 *   ── Click task → drawer with full details (comments, subtasks, attachments, activity)
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  closestCorners, useDroppable,
  type DragEndEvent, type DragOverEvent, type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext, arrayMove, useSortable, verticalListSortingStrategy, horizontalListSortingStrategy,
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
function PrioritySelect({
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
 * Sortable column wrapper
 * ────────────────────────────────────────────────────────────────── */
function SortableColumn({
  column, onRename, onDelete, onAddTask, onOpenTask, activeTaskId, filter,
}: {
  column: BoardColumn
  onRename: (id: string | number, name: string) => void
  onDelete: (id: string | number) => void
  onAddTask: (columnId: string | number) => void
  onOpenTask: (task: BoardTask) => void
  activeTaskId: string | number | null
  /** Active due-date filter — tasks that don't match are hidden. */
  filter: DueFilter
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `col-${column.id}`,
    data: { type: 'column', column },
  })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }
  const [editingName, setEditingName] = useState(false)
  const [name, setName] = useState(column.name)
  const [hovered, setHovered] = useState(false)
  useEffect(() => { setName(column.name) }, [column.name])

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group flex flex-col w-72 shrink-0 bg-gray-100 dark:bg-gray-800/60 rounded-2xl border border-gray-200 dark:border-gray-700 max-h-[calc(100vh-180px)]"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Column header (drag handle) */}
      <div
        className="flex items-center justify-between px-3 py-2.5 border-b border-gray-200/80 dark:border-gray-700/80 cursor-grab active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
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
              onPointerDown={(e) => e.stopPropagation()}
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
        {/* Action buttons — hidden by default, appear on column hover */}
        <div
          className="flex items-center gap-0.5 shrink-0 transition-opacity"
          style={{ opacity: hovered ? 1 : 0 }}
          onPointerDown={(e) => e.stopPropagation()}
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

      {/* Tasks list — scrolls internally, column stretches to full board height */}
      <DroppableColumn columnId={String(column.id)}>
        <SortableContext items={column.tasks.map((t) => `task-${t.id}`)} strategy={verticalListSortingStrategy}>
          <div className="flex-1 overflow-y-auto  px-2 py-1.5 min-h-0">
            {column.tasks.length === 0 ? (
              <p className="text-xs italic text-gray-400 dark:text-gray-500 text-center py-8 select-none">Drop tasks here</p>
            ) : (
              column.tasks
                .filter((task) => matchesDueFilter(filter, task.due_date, isColumnCompleted(column.name)))
                .map((task) => (
                  <SortableTask
                    key={task.id}
                    task={task}
                    columnName={column.name}
                    onOpen={onOpenTask}
                    active={activeTaskId === task.id}
                  />
                ))
            )}
          </div>
        </SortableContext>
      </DroppableColumn>

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

function DroppableColumn({
  columnId, children,
}: { columnId: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `col-list-${columnId}`, data: { type: 'column-list', columnId } })
  return (
    <div
      ref={setNodeRef}
      className={`flex-1 min-h-[80px] overflow-y-auto  p-2 space-y-2 transition ${isOver ? 'bg-indigo-50/50 dark:bg-indigo-900/20 ring-2 ring-indigo-300 dark:ring-indigo-700 ring-inset rounded-xl' : ''}`}
    >
      {children}
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────
 * Sortable task card — Basecamp-style
 *
 * Layout (top to bottom):
 *   ┌─ priority stripe (left edge, 4px) ──────────────────────────┐
 *   │ Title (medium weight, dark, 2 lines max)                    │
 *   │ Description preview (muted, 2 lines max, optional)          │
 *   │ ──────────────────────────────────────────────────────────  │
 *   │ ✓ N/M    ⏰ Jun 24                       👤👤 +N             │
 *   └──────────────────────────────────────────────────────────────┘
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

/** Strip HTML tags + collapse whitespace so we can show a plain-text preview. */
function htmlToText(html: string | null | undefined): string {
  if (!html) return ''
  return html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
}

/** True if `dueDate` (YYYY-MM-DD) is strictly before today (local time). */
function isOverdue(dueDate: string): boolean {
  const today = new Date()
  const [y, m, d] = dueDate.split('-').map(Number)
  const target = new Date(y, m - 1, d)
  today.setHours(0, 0, 0, 0)
  return target < today
}

function SortableTask({
  task, columnName, onOpen, active,
}: {
  task: BoardTask
  columnName: string
  onOpen: (task: BoardTask) => void
  active: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `task-${task.id}`,
    data: { type: 'task', task },
  })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }
  const doneSub = task.subtasks.filter((s) => s.done).length
  const totalSub = task.subtasks.length
  const descText = htmlToText(task.description_html)
  const completed = isColumnCompleted(columnName)
  const due = buildDueLabel(task.due_date, completed)
  // Tick state every minute so the "today/tomorrow/overdue" boundaries
  // roll over without a page reload.
  const [, forceTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 60_000)
    return () => clearInterval(id)
  }, [])
  // Re-compute due label after each tick so the boundary can roll over.
  const dueLabel = buildDueLabel(task.due_date, completed)

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={() => onOpen(task)}
      className={`group relative bg-white dark:bg-gray-900 rounded-xl border shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:shadow-[0_4px_12px_rgba(15,23,42,0.08)] hover:-translate-y-0.5 cursor-grab active:cursor-grabbing transition-all overflow-hidden ${
        dueLabel?.isOverdue
          ? 'border-rose-300 dark:border-rose-800/60 bg-rose-50/30 dark:bg-rose-950/20'
          : 'border-gray-200/80 dark:border-gray-700/80'
      } ${active ? 'ring-2 ring-indigo-500' : ''}`}
      {...attributes}
      {...listeners}
    >
      {/* Priority accent stripe — left edge */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${PRIORITY_BAR[task.priority]}`} aria-hidden />

      {/* Overdue badge — top-right corner, layered above the card */}
      {dueLabel?.isOverdue && (
        <span
          className="absolute top-2 right-2 z-10 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-rose-600 text-white shadow-sm"
          title={dueLabel.title}
        >
          <AlertCircle size={9} strokeWidth={3} />
          Overdue
        </span>
      )}

      <div className="pl-4 pr-3.5 pt-3 pb-3">
        {/* Title row: title + priority pill (or overdue pill when applicable) */}
        <div className="flex items-start gap-2">
          <h4 className={`flex-1 min-w-0 text-[13.5px] font-semibold leading-snug break-words line-clamp-2 ${dueLabel?.isOverdue ? 'text-rose-950 dark:text-rose-100' : 'text-gray-900 dark:text-white'}`}>
            {task.title}
          </h4>
          {dueLabel?.isOverdue ? null : (
            <span
              className={`shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider ${PRIORITY_PILL[task.priority]}`}
              title={`${PRIORITY_LABEL[task.priority]} priority`}
            >
              <span className={`w-1 h-1 rounded-full ${PRIORITY_BAR[task.priority]}`} />
              {PRIORITY_LABEL[task.priority]}
            </span>
          )}
        </div>

        {/* Description preview (only if there is one) */}
        {descText && (
          <p className="mt-1.5 text-[12px] leading-snug text-gray-500 dark:text-gray-400 break-words line-clamp-2">
            {descText}
          </p>
        )}

        {/* Footer: metadata + assignees */}
        <div className="mt-3 flex items-center justify-between gap-2 min-h-[22px]">
          <div className="flex items-center gap-3 text-[11px] text-gray-500 dark:text-gray-400 font-medium">
            {/* Subtask progress */}
            {totalSub > 0 && (
              <span
                className={`inline-flex items-center gap-1 ${doneSub === totalSub ? 'text-emerald-600 dark:text-emerald-400' : ''}`}
                title={`${doneSub} of ${totalSub} subtasks done`}
              >
                <CheckSquare size={11} strokeWidth={2.5} />
                {doneSub}/{totalSub}
              </span>
            )}
            {/* Due date — always shown when present, colour-coded by urgency */}
            {dueLabel && (
              <DueDateChip label={dueLabel.label} urgency={dueLabel.urgency} title={dueLabel.title} />
            )}
          </div>

          {/* Assignee stack (right side) */}
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
 *
 * Used inside the card footer. Kept as a separate component so the
 * colour logic is in one place and the card body stays readable.
 */
function DueDateChip({
  label, urgency, title,
}: { label: string; urgency: 'overdue' | 'today' | 'tomorrow' | 'soon' | 'far' | 'none'; title: string }) {
  const palette = (() => {
    switch (urgency) {
      case 'overdue':
        // Slightly bolder + darker rose for emphasis, plus a soft ring so the
        // chip stands out against the white card background.
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
 * Task creation modal (add to a column)
 * ────────────────────────────────────────────────────────────────── */
function NewTaskModal({
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
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4 animate-fade-in-up">
      <div className="absolute inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm" onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()} aria-hidden />
      <div className="relative bg-white dark:bg-gray-900 rounded-none sm:rounded-2xl shadow-2xl border-0 sm:border border-gray-200 dark:border-gray-800 w-full sm:max-w-xl flex flex-col max-h-screen sm:max-h-[85vh]" onClick={e => e.stopPropagation()}>
        <header className="flex items-center justify-between px-4 sm:px-5 py-3 sm:py-4 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-base font-bold text-gray-900 dark:text-white">New task — {columnName}</h2>
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
            placeholder="Description (optional)…"
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
          {/* Assignees moved up here so the multi-select dropdown has room to
              open DOWNWARD without overlapping Title/Description. */}
          <div>
            <MultiSelectDropdown
              label="Assignees"
              placeholder="Select assignees…"
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
  )
}

/* ──────────────────────────────────────────────────────────────────
 * Add column modal
 * ────────────────────────────────────────────────────────────────── */
function AddColumnModal({
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
  )
}

/* ──────────────────────────────────────────────────────────────────
 * Activity helpers (shared with the task detail page)
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
function truncate(s: string, n = 30) { return s.length > n ? s.slice(0, n - 1) + '…' : s }

/* ──────────────────────────────────────────────────────────────────
 * Filter dropdown — quick filters by due date
 *
 * Lives in the toolbar next to "Archived" and "Add column". Shows the
 * current filter (or "All") and a count badge when a non-default filter
 * is active.
 * ────────────────────────────────────────────────────────────────── */
const FILTER_OPTIONS: ReadonlyArray<{ id: DueFilter; label: string; description: string }> = [
  { id: 'all',       label: 'All',           description: 'Show every task' },
  { id: 'overdue',   label: 'Overdue',       description: 'Past due, not done' },
  { id: 'today',     label: 'Due Today',     description: 'Due today' },
  { id: 'this-week', label: 'Due This Week', description: 'Due in the next 7 days' },
  { id: 'no-date',   label: 'No Due Date',   description: 'No due date set' },
]

function FilterDropdown({
  value, overdueCount, onChange,
}: {
  value: DueFilter
  overdueCount: number
  onChange: (next: DueFilter) => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // Close on outside click + Escape.
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
        {/* Overdue count badge — always visible when there's any overdue task,
            even when the current filter isn't "Overdue". */}
        {overdueCount > 0 && (
          <span
            className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none ${
              value === 'overdue'
                ? 'bg-rose-600 text-white'
                : 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-200'
            }`}
          >
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
 * useFileInput — ref-only helper to wire a hidden <input type="file">
 * ────────────────────────────────────────────────────────────────── */
/**
 * Wires a hidden `<input type="file">` to a handler.
 *
 * The hook attaches a `change` listener to the input once it's mounted
 * and forwards the selected file to `handler`. After the handler settles
 * (success or failure), the input is reset so the same file can be picked
 * again later.
 *
 * Returns a ref to put on the input.
 */
function useFileInput(handler: (f: File) => Promise<void>) {
  const ref = useRef<HTMLInputElement>(null)
  // Keep the latest handler in a ref so we don't have to re-bind the
  // listener every time the parent re-renders with a new closure.
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
        // Reset so the same file can be selected again
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

  // Optional debug hook for E2E tests (?debug=1 in URL). Exposes the
  // mutation callbacks on window so tests can drive the same code paths
  // the drag handler invokes, without depending on @dnd-kit's pointer
  // capture in headless mode. Production users hit the drag handlers
  // directly, so this is a no-op unless ?debug=1 is present.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('debug') !== '1') return
    ;(window as any).__tb_moveTask = (taskId: string | number, toColumnId: string | number, newIndex: number) =>
      tb.moveTask(taskId, toColumnId, newIndex)
    ;(window as any).__tb_moveTaskToColumn = (taskId: string | number, toColumnId: string | number) =>
      tb.moveTaskToColumn(taskId, toColumnId)
    return () => {
      delete (window as any).__tb_moveTask
      delete (window as any).__tb_moveTaskToColumn
    }
  }, [tb])

  const [newTaskCol, setNewTaskCol] = useState<string | number | null>(null)
  const [showAddColumn, setShowAddColumn] = useState(false)
  const [confirmDelCol, setConfirmDelCol] = useState<BoardColumn | null>(null)
  const [activeDragType, setActiveDragType] = useState<'column' | 'task' | null>(null)
  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [archivedCount, setArchivedCount] = useState(0)
  const [dueFilter, setDueFilter] = useState<DueFilter>('all')
  // Live "today" — re-computed every minute so the overdue boundary
  // rolls over without a page reload.
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

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const currentUserName = useMemo(() => {
    if (typeof window === 'undefined') return ''
    try {
      const u = JSON.parse(localStorage.getItem('user') || '{}') as any
      return [u?.firstName ?? u?.first_name, u?.lastName ?? u?.last_name].filter(Boolean).join(' ').trim() || u?.email || ''
    } catch { return '' }
  }, [])
  const isProjectOwner = true

  // Poll the archived count for the toolbar badge. Cheap server call
  // (single COUNT query) \u2014 refreshes whenever the board data changes
  // (e.g. after a task is archived or restored) so the number stays current.
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
      } catch {
        /* ignore \u2014 count is decorative */
      }
    }
    fetchCount()
    return () => { cancelled = true }
  }, [projectId, tb.board])

  // Active task object for drag overlay
  const activeTaskObj = useMemo(() => {
    if (activeDragType !== 'task' || !activeDragId) return null
    const id = activeDragId.replace(/^task-/, '')
    for (const c of tb.board) {
      const t = c.tasks.find((t) => String(t.id) === id)
      if (t) return t
    }
    return null
  }, [activeDragId, activeDragType, tb.board])
  const activeColObj = useMemo(() => {
    if (activeDragType !== 'column' || !activeDragId) return null
    const id = activeDragId.replace(/^col-/, '')
    return tb.board.find((c) => String(c.id) === id) || null
  }, [activeDragId, activeDragType, tb.board])

  /* ── DnD handlers ───────────────────────────────────────────── */
  const onDragStart = (e: DragStartEvent) => {
    const data = e.active.data.current
    if (data?.type === 'task') {
      setActiveDragType('task')
      setActiveDragId(String(e.active.id))
    } else if (data?.type === 'column') {
      setActiveDragType('column')
      setActiveDragId(String(e.active.id))
    }
  }

  const onDragOver = (e: DragOverEvent) => {
    // We handle moves at onDragEnd for simplicity
  }

  const onDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e
    setActiveDragType(null)
    setActiveDragId(null)
    if (!over) return
    const activeId = String(active.id)
    const overId = String(over.id)
    const activeData = active.data.current
    const overData = over.data.current

    // ─── Column reorder ─────────────────────────────────
    if (activeData?.type === 'column' && activeId !== overId) {
      const ids = tb.board.map((c) => String(c.id))
      const from = ids.indexOf(activeId.replace(/^col-/, ''))
      const to = ids.indexOf(overId.replace(/^col-/, ''))
      if (from < 0 || to < 0) return
      const next = arrayMove(ids, from, to)
      try {
        await tb.reorderColumns(next as Array<string | number>)
      } catch (e: any) {
        toast.error('Failed to reorder columns')
      }
      return
    }

    // ─── Task move ──────────────────────────────────────
    if (activeData?.type === 'task') {
      const taskId = String(activeId.replace(/^task-/, ''))
      // Determine destination column + index
      let toColumnId: string | null = null
      let toIndex = 0
      if (overData?.type === 'task') {
        // Drop over another task — same column as that task, at the position of `over`
        const overTaskId = String(overId.replace(/^task-/, ''))
        for (const c of tb.board) {
          const idx = c.tasks.findIndex((t) => String(t.id) === overTaskId)
          if (idx >= 0) { toColumnId = String(c.id); toIndex = idx; break }
        }
      } else if (overData?.type === 'column-list') {
        toColumnId = String(overData.columnId)
        const col = tb.board.find((c) => String(c.id) === toColumnId)
        toIndex = col ? col.tasks.length : 0
      } else {
        return
      }
      if (!toColumnId) return
      try {

        const result = await tb.moveTask(taskId, toColumnId, toIndex)
        // Show a success toast only on real cross-column / new-position moves.
        // Re-dropping in the same spot returns { noop: true } and shouldn't
        // clutter the UI with a toast.
        if (result?.ok && !result.noop && result.toColumnName) {
          if (
            result.fromColumnId != null &&
            String(result.fromColumnId) !== String(toColumnId)
          ) {
            toast.success(`Moved to “${result.toColumnName}”`)
          } else {
            toast.success(`Reordered in “${result.toColumnName}”`)
          }
        }
      } catch (e: any) {
        toast.error(e?.message || 'Failed to move task')
      }
    }
  }

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
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd}>
          <SortableContext items={tb.board.map((c) => `col-${c.id}`)} strategy={horizontalListSortingStrategy}>
            <div className="flex gap-3 overflow-x-auto pb-4 items-stretch">
              {tb.board.map((col) => (
                <SortableColumn
                  key={col.id}
                  column={col}
                  onRename={(id, n) => tb.renameColumn(id, n).then(() => toast.success('Renamed')).catch(() => toast.error('Rename failed'))}
                  onDelete={(id) => setConfirmDelCol(tb.board.find((c) => c.id === id) || null)}
                  onAddTask={handleAddTask}
                  onOpenTask={(t) => router.push(`/projects/${projectId}/task-board/${t.id}`)}
                  activeTaskId={activeDragType === 'task' ? String(activeDragId || '').replace(/^task-/, '') || null : null}
                  filter={dueFilter}
                />
              ))}
            </div>
          </SortableContext>

          <DragOverlay>
            {activeColObj ? (
              <div className="w-72 flex flex-col bg-gray-100 dark:bg-gray-800/60 rounded-2xl border border-indigo-400 shadow-xl max-h-[80vh] overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-700">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white truncate">{activeColObj.name}</h3>
                  <span className="text-[10px] text-gray-400">{activeColObj.tasks.length}</span>
                </div>
                <div className="p-2 space-y-2 overflow-hidden">
                  {activeColObj.tasks.slice(0, 4).map((t) => (
                    <div key={t.id} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-2 shadow-sm">
                      <p className="text-xs font-semibold text-gray-900 dark:text-white line-clamp-2">{t.title}</p>
                    </div>
                  ))}
                  {activeColObj.tasks.length > 4 && <p className="text-[10px] text-gray-500 text-center">+{activeColObj.tasks.length - 4} more</p>}
                </div>
              </div>
            ) : activeTaskObj ? (
              <div className="w-64 bg-white dark:bg-gray-900 rounded-xl border border-indigo-400 shadow-xl p-3">
                <div className="flex items-start gap-2">
                  <div className={`w-1.5 h-1.5 mt-1.5 rounded-full ${PRIORITY_COLOR[activeTaskObj.priority]}`} />
                  <p className="text-sm font-semibold text-gray-900 dark:text-white line-clamp-3">{activeTaskObj.title}</p>
                </div>
              </div>
            ) : null}
          </DragOverlay>
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
          // The modal may have changed the archive count (restored or
          // permanently-deleted tasks). Re-fetch so the toolbar badge is
          // always accurate when the modal closes.
          const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
          fetch(`/api/projects/${projectId}/tasks?status=archived&limit=1`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          })
            .then((r) => r.ok ? r.json() : null)
            .then((data) => { if (data) setArchivedCount(data.total || 0) })
            .catch(() => { /* ignore */ })
        }}
        onRestored={() => {
          // The hook already filtered the task out of the archive list;
          // refresh the live board so the restored task reappears in its
          // original column.
          tb.refresh()
          setArchivedCount((n) => Math.max(0, n - 1))
        }}
      />
    </FeaturePage>
  )
}
