'use client'

/**
 * /projects/[projectId]/task-board/[taskId]
 *
 * Basecamp-inspired task detail page — redesigned.
 *
 * Layout:
 *   ┌─ Header ──────────────────────────────────────────────────┐
 *   │  ← Back   ·  Status · Priority  ·  Task title  ·  Actions  │
 *   ├─ Body ────────────────────────────────────────────────────┤
 *   │  ┌─ Main (left, 2/3) ─────┐  ┌─ Sidebar (right, 1/3) ──┐ │
 *   │  │  Description            │  │  Status / Column          │ │
 *   │  │  Subtasks (collapsible)│  │  Priority                 │ │
 *   │  │  Attachments (collaps.) │  │  Due Date                 │ │
 *   │  │  Comments (collapsible)│  │  Assignees                │ │
 *   │  └─────────────────────────┘  │                           │ │
 *   │                                │  Activity (collapsible)  │ │
 *   │                                └───────────────────────────┘ │
 *   └───────────────────────────────────────────────────────────┘
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import {
  ChevronLeft, X, Pencil, Paperclip, Calendar as CalIcon,
  Upload, FileIcon, CheckSquare, Square,
  Archive, CheckCircle2, AlertCircle,
  Clock, User2, Tag, Columns,
  Send, MessageCircle, ChevronDown, ChevronUp,
} from 'lucide-react'
import ProjectLayout from '@/components/project/ProjectLayout'
import { fmtRelative, fmtDateShort } from '@/components/project/format'
import MultiSelectDropdown from '@/components/project/MultiSelectDropdown'
import ConfirmDialog from '@/components/project/ConfirmDialog'
import ReactionBar from '@/components/project/ReactionBar'
import MentionInput from '@/components/MentionInput'
import { highlightMentions } from '@/components/MentionBadge'
import type { ActiveMember } from '@/components/MentionInput'
import api from '@/lib/api'
import {
  useTaskBoard, useTaskDetail,
  type BoardTask, type BoardColumn, type Priority,
} from '@/lib/task-board-api'
import type { Reaction } from '@/types/project'

// ── Design tokens ─────────────────────────────────────────────────────────────
const PRIORITY_COLOR: Record<Priority, string> = {
  low:    'bg-sky-400',
  medium: 'bg-amber-400',
  high:   'bg-rose-500',
}
const PRIORITY_LABEL: Record<Priority, string> = { low: 'Low', medium: 'Medium', high: 'High' }
const PRIORITY_BG: Record<Priority, string> = {
  high:   'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800',
  medium: 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800',
  low:    'bg-sky-50 dark:bg-sky-950/30 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800',
}

// ── PrioritySelect ─────────────────────────────────────────────────────────────
function PrioritySelect({ value, onChange }: { value: Priority; onChange: (v: Priority) => void }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as Priority)}
        className="w-full appearance-none bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl pl-8 pr-9 py-2 text-sm font-semibold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 cursor-pointer"
      >
        {(['low', 'medium', 'high'] as Priority[]).map((p) => (
          <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>
        ))}
      </select>
      <span className={`pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full ${PRIORITY_COLOR[value]}`} />
      <ChevronDown size={13} strokeWidth={2.5} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
    </div>
  )
}

// ── ColumnSelect ──────────────────────────────────────────────────────────────
function ColumnSelect({
  value, columns, busy, onChange,
}: {
  value: string | number
  columns: BoardColumn[]
  busy: boolean
  onChange: (columnId: string | number) => void
}) {
  return (
    <div className="relative">
      <select
        value={String(value)}
        onChange={(e) => onChange(e.target.value)}
        disabled={busy}
        className="w-full appearance-none bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl pl-8 pr-9 py-2 text-sm font-semibold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 cursor-pointer disabled:opacity-50"
      >
        {columns.map((c) => (
          <option key={c.id} value={String(c.id)}>{c.name}</option>
        ))}
      </select>
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-violet-500" />
      {busy ? (
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-gray-300 border-t-violet-500 rounded-full animate-spin" />
      ) : (
        <ChevronDown size={13} strokeWidth={2.5} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
      )}
    </div>
  )
}

// ── Avatar ────────────────────────────────────────────────────────────────────
function Avatar({ name, size = 8 }: { name: string; size?: number }) {
  const initials = name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase() || '?'
  return (
    <span className="inline-flex items-center justify-center rounded-full bg-gradient-to-br from-violet-100 to-indigo-100 dark:from-violet-900/50 dark:to-indigo-900/50 text-violet-700 dark:text-violet-300 font-bold shrink-0 select-none"
      style={{ width: size * 4, height: size * 4, fontSize: Math.max(size * 4 * 0.35, 8) }}>
      {initials}
    </span>
  )
}

// ── Collapsible section card ───────────────────────────────────────────────────
function CollapsibleCard({
  title, icon: Icon, count, children, actions,
  open, onToggle,
}: {
  title: string
  icon: React.ElementType
  count?: number | null
  children: React.ReactNode
  actions?: React.ReactNode
  open: boolean
  onToggle: () => void
}) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden transition-shadow hover:shadow-md">
      {/* Header / toggle button */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left"
      >
        <div className="inline-flex items-center gap-2.5 text-sm font-bold text-gray-800 dark:text-gray-200">
          <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center shadow-sm">
            <Icon size={14} strokeWidth={2.5} className="text-white" />
          </span>
          {title}
          {count != null && count > 0 && (
            <span className="inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-300 text-[11px] font-bold">
              {count}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {actions && <div className="flex items-center gap-1 mr-1" onClick={(e) => e.stopPropagation()}>{actions}</div>}
          <span className={`w-7 h-7 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
            <ChevronDown size={14} strokeWidth={2.5} />
          </span>
        </div>
      </button>

      {/* Body */}
      <div className={`overflow-hidden transition-all duration-300 ${open ? 'max-h-[9999px] opacity-100' : 'max-h-0 opacity-0'}`}>
        <div className="px-5 pb-5 border-t border-gray-100 dark:border-gray-800">
          {children}
        </div>
      </div>
    </div>
  )
}

// ── Property row ──────────────────────────────────────────────────────────────
function PropRow({
  icon: Icon, label, children,
}: { icon: React.ElementType; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-gray-100 dark:border-gray-800 last:border-0">
      <Icon size={14} strokeWidth={2} className="text-gray-400 dark:text-gray-500 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[11px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500 mb-1">{label}</p>
        <div className="text-sm text-gray-900 dark:text-gray-100">{children}</div>
      </div>
    </div>
  )
}

// ── Humanize activity ─────────────────────────────────────────────────────────
function humanizeAction(action: string, details: any): string {
  const truncate = (s: string, n = 28) => s.length > n ? s.slice(0, n - 1) + '…' : s
  switch (action) {
    case 'created':           return `created this task${details?.title ? ` — "${truncate(details.title)}"` : ''}`
    case 'edited':            return 'edited the task'
    case 'moved':             return `moved to "${details?.to_column_id || '?'}"`
    case 'commented':         return 'left a comment'
    case 'comment_edited':    return 'edited a comment'
    case 'comment_deleted':   return 'deleted a comment'
    case 'attached':          return `attached "${truncate(details?.name ?? 'a file')}"`
    case 'attachment_deleted': return 'removed an attachment'
    case 'subtask_added':     return `added subtask "${truncate(details?.title ?? '')}"`
    case 'subtask_done':      return 'completed a subtask'
    case 'subtask_undone':    return 'reopened a subtask'
    case 'subtask_deleted':   return 'removed a subtask'
    case 'deleted':           return 'deleted the task'
    default:                  return action
  }
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function TaskDetailPage() {
  const params = useParams<{ projectId: string; taskId: string }>()
  const router = useRouter()
  const projectId = params.projectId
  const taskIdStr = params.taskId
  const taskId = taskIdStr

  const tb = useTaskBoard(projectId)
  const detail = useTaskDetail(taskId)

  // Derived task data — declared early so hooks below can reference it
  const task: BoardTask | undefined = useMemo(() => {
    for (const col of tb.board) {
      const t = col.tasks.find((x) => String(x.id) === String(taskId))
      if (t) return t
    }
    return undefined
  }, [tb.board, taskId])

  const column = useMemo(() => {
    if (!task) return undefined
    return tb.board.find((c) => String(c.id) === String(task.column_id))
  }, [tb.board, task])

  // Section expand/collapse state
  const [showSubtasks, setShowSubtasks] = useState(true)
  const [showAttachments, setShowAttachments] = useState(true)
  const [showComments, setShowComments] = useState(true)
  const [showActivity, setShowActivity] = useState(false)

  // File input for attachments — simple ref + onChange approach
  const fileInputRef = useRef<HTMLInputElement>(null)
  const commentsEndRef = useRef<HTMLDivElement>(null)
  const subtasksEndRef  = useRef<HTMLDivElement>(null)

  // Form state
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [priority, setPriority] = useState<Priority>('medium')
  const [due, setDue] = useState('')
  const [assigneeIds, setAssigneeIds] = useState<Array<string | number>>([])
  const [editing, setEditing] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [subtaskInput, setSubtaskInput] = useState('')
  const [busyColumn, setBusyColumn] = useState(false)
  const [commentBody, setCommentBody] = useState('')
  const [commenting, setCommenting] = useState(false)
  const [uploadingFile, setUploadingFile] = useState(false)

  // Lightbox — for viewing image attachments inline
  const [lightboxAttachment, setLightboxAttachment] = useState<any>(null)

  // Comment edit modal
  const [editingComment, setEditingComment] = useState<{ id: string | number; body: string } | null>(null)
  const [editCommentBody, setEditCommentBody] = useState('')
  const [savingComment, setSavingComment] = useState(false)

  // Active project members for @mentions
  const [activeMembers, setActiveMembers] = useState<ActiveMember[]>([])

  useEffect(() => {
    if (!projectId) return
    api.get(`/projects/${projectId}/active-members`)
      .then((data: any) => setActiveMembers(Array.isArray(data?.members) ? data.members : []))
      .catch(() => setActiveMembers([]))
  }, [projectId])

  useEffect(() => {
    if (!task) return
    setTitle(task.title)
    setDesc(task.description_html)
    setPriority(task.priority)
    setDue(task.due_date || '')
    setAssigneeIds(task.assignees.map((a) => a.id))
  }, [task?.id])

  const currentUserName = useMemo(() => {
    if (typeof window === 'undefined') return ''
    try {
      const u = JSON.parse(localStorage.getItem('user') || '{}') as any
      return [u?.firstName ?? u?.first_name, u?.lastName ?? u?.last_name].filter(Boolean).join(' ').trim() || u?.email || ''
    } catch { return '' }
  }, [])
  const isProjectOwner = true
  const canEdit = !!task && (task.author?.name === currentUserName || isProjectOwner)

  const saveEdit = async () => {
    if (!task) return
    if (!title.trim()) { toast.error('Title required'); return }
    setSavingEdit(true)
    try {
      await tb.editTask(task.id, {
        title: title.trim(),
        description_html: desc,
        priority,
        due_date: due || null,
        assignee_ids: assigneeIds,
      })
      toast.success('Task updated')
      setEditing(false)
    } catch (e: any) { toast.error(e?.message || 'Save failed') }
    finally { setSavingEdit(false) }
  }

  const [confirmedColumnId, setConfirmedColumnId] = useState<string | number>(() => task?.column_id ?? '')
  useEffect(() => { setConfirmedColumnId(task?.column_id ?? '') }, [task?.column_id])

  // Auto-scroll subtasks list to bottom when items are added
  useEffect(() => {
    if (detail.subtasks.length === 0) return
    const el = document.getElementById('subtasks-list')
    if (el) el.scrollTop = el.scrollHeight
  }, [detail.subtasks.length])

  // Auto-scroll comments list to bottom when items are added
  useEffect(() => {
    if (detail.comments.length === 0) return
    const el = document.getElementById('comments-list')
    if (el) el.scrollTop = el.scrollHeight
  }, [detail.comments.length])

  const handleColumnChange = async (newColumnId: string | number) => {
    if (!task || String(newColumnId) === String(task.column_id)) return
    const originalColumnId = task.column_id
    setBusyColumn(true)
    try {
      const result = await tb.moveTaskToColumn(task.id, newColumnId)
      if (result?.ok && !result.noop && result.toColumnName) {
        toast.success(`Moved to "${result.toColumnName}"`)
        setConfirmedColumnId(String(newColumnId))
      } else {
        toast.error('Failed to move task')
        setConfirmedColumnId(String(originalColumnId))
      }
    } catch (e: any) {
      toast.error(e?.message || 'Failed to move task')
      setConfirmedColumnId(String(originalColumnId))
    } finally { setBusyColumn(false) }
  }

  const handleDelete = async () => {
    if (!task) return
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/tasks/${task.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      })
      toast.custom(() => (
        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-xl text-sm">
          <span className="w-7 h-7 inline-flex items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-300 shrink-0 shadow-sm">
            <CheckCircle2 size={14} strokeWidth={2.5} />
          </span>
          <span className="font-bold text-gray-900 dark:text-white">Task archived</span>
          <button
            type="button"
            onClick={() => { router.push(`/projects/${projectId}/task-board`); toast.dismiss() }}
            className="ml-1 px-2.5 py-1 text-xs font-bold rounded-lg bg-violet-600 hover:bg-violet-700 text-white border-none cursor-pointer transition-colors"
          >
            Back to board
          </button>
        </div>
      ), { duration: 5000 })
      setTimeout(() => router.push(`/projects/${projectId}/task-board`), 200)
    } catch (e: any) { toast.error(e?.message || 'Archive failed') }
  }

  const submitComment = async () => {
    if (!commentBody.trim() || commenting) return
    setCommenting(true)
    try { await detail.addComment(commentBody.trim()); setCommentBody('') }
    catch (e: any) { toast.error(e?.message || 'Failed to add comment') }
    finally { setCommenting(false) }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingFile(true)
    try {
      await detail.uploadAttachment(file)
      toast.success(`"${file.name}" uploaded successfully`)
    } catch (err: any) {
      toast.error(err?.message || 'Upload failed')
    } finally {
      setUploadingFile(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const saveEditComment = async () => {
    if (!editingComment || !editCommentBody.trim()) return
    setSavingComment(true)
    try {
      await detail.editComment(editingComment.id, editCommentBody.trim())
      toast.success('Comment updated')
      setEditingComment(null)
    } catch (e: any) { toast.error(e?.message || 'Failed to update comment') }
    finally { setSavingComment(false) }
  }

  const subtasksDone = detail.subtasks.filter((s) => s.done).length
  const subtaskProgress = detail.subtasks.length > 0
    ? Math.round((subtasksDone / detail.subtasks.length) * 100)
    : 0

  // ── Loading ────────────────────────────────────────────────────────────────
  if (tb.loading && !task) {
    return (
      <ProjectLayout breadcrumb={[
        { label: 'Home', href: '/projects' },
        { label: 'Task Board', href: `/projects/${projectId}/task-board` },
        { label: 'Loading…' },
      ]}>
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="relative">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center shadow-lg shadow-violet-200 dark:shadow-violet-900/30 animate-pulse">
              <CheckSquare size={22} strokeWidth={2} className="text-white" />
            </div>
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">Loading task details…</p>
          </div>
        </div>
      </ProjectLayout>
    )
  }

  // ── Not found ──────────────────────────────────────────────────────────────
  if (!task) {
    return (
      <ProjectLayout breadcrumb={[
        { label: 'Home', href: '/projects' },
        { label: 'Task Board', href: `/projects/${projectId}/task-board` },
        { label: 'Not found' },
      ]}>
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-10 text-center shadow-sm">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-400">
            <AlertCircle size={24} />
          </div>
          <h2 className="text-base font-bold text-gray-900 dark:text-white">Task not found</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">It may have been archived or deleted.</p>
          <Link href={`/projects/${projectId}/task-board`}
            className="mt-5 inline-flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-bold shadow-sm transition-colors">
            <ChevronLeft size={14} strokeWidth={2.5} /> Back to Task Board
          </Link>
        </div>
      </ProjectLayout>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <ProjectLayout breadcrumb={[
      { label: 'Home', href: '/projects' },
      { label: column?.name || 'Task Board', href: `/projects/${projectId}/task-board` },
      { label: task?.title || '' },
    ]}>
      {/* Back to Task Board */}
      <div className="mb-4">
        <button
          type="button"
          onClick={() => router.push(`/projects/${projectId}/task-board`)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-700 transition-colors cursor-pointer"
        >
          <ChevronLeft size={13} strokeWidth={2.5} />
          Back to Task Board
        </button>
      </div>


      <div className="w-full">
      {/* ── Task hero card ─────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden mb-5 relative">
        {/* Top accent bar — priority color */}
        <div className={`h-1 w-full ${PRIORITY_COLOR[task.priority]}`} />

        <div className="flex p-5 sm:p-6 gap-4">
          {/* Left: accent stripe */}
          <div className={`w-1.5 rounded-full shrink-0 ${PRIORITY_COLOR[task.priority]}`} style={{ minHeight: 60 }} />

          <div className="flex-1 min-w-0">
            {/* Meta row */}
            <div className="flex items-center gap-2 flex-wrap mb-3">
              {column && (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-violet-600 dark:text-violet-300">
                  <span className="w-2 h-2 rounded-full bg-violet-500" />{column.name}
                </span>
              )}
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${PRIORITY_BG[task.priority]}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${PRIORITY_COLOR[task.priority]}`} />
                {PRIORITY_LABEL[task.priority]}
              </span>
              <span className="text-[11px] text-gray-400">
                {task.author?.name || '?'} · {fmtRelative(task.created_at)}
              </span>
            </div>

            {/* Title */}
            {editing ? (
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
                className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-xl font-extrabold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 mb-3"
              />
            ) : (
              <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900 dark:text-white break-words leading-tight mb-3">
                {task.title}
              </h1>
            )}

            {/* Action buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              {editing ? (
                <span className="text-xs text-violet-600 dark:text-violet-300 font-medium italic">Editing task…</span>
              ) : (
                <>
                  {canEdit && (
                    <button type="button" onClick={() => setEditing(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-950/40 hover:bg-violet-100 dark:hover:bg-violet-900/40 rounded-lg border border-violet-200 dark:border-violet-800 cursor-pointer transition-colors">
                      <Pencil size={11} strokeWidth={2.5} /> Edit
                    </button>
                  )}
                  {canEdit && (
                    <button type="button" onClick={() => setConfirmDel(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-rose-600 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-900/30 rounded-lg border border-rose-200 dark:border-rose-800 cursor-pointer transition-colors">
                      <Archive size={11} strokeWidth={2.5} /> Archive
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Two-column body ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">

        {/* ── Main column (left, 2/3) ──────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-4">

          {/* Description */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2.5 text-sm font-bold text-gray-800 dark:text-gray-200">
                <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400 to-orange-400 flex items-center justify-center shadow-sm">
                  <FileIcon size={14} strokeWidth={2.5} className="text-white" />
                </span>
                Description
              </div>
            </div>
            <div className="p-5">
              {editing ? (
                <textarea
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  rows={6}
                  placeholder="Add a description — paste HTML or write freely…"
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-y min-h-[140px] transition-colors"
                />
              ) : (
                <div
                  className="prose prose-sm dark:prose-invert max-w-none text-gray-700 dark:text-gray-300 text-sm leading-relaxed"
                  dangerouslySetInnerHTML={{
                    __html: desc || '<em class="text-gray-400 dark:text-gray-500 not-prose text-xs">No description yet — click Edit above to add one.</em>'
                  }}
                />
              )}
            </div>
          </div>

          {/* Subtasks */}
          <CollapsibleCard
            title="Subtasks"
            icon={CheckSquare}
            count={detail.subtasks.length}
            open={showSubtasks}
            onToggle={() => setShowSubtasks((v) => !v)}
          >
            {detail.subtasks.length > 0 && (
              <div className="mb-4 mt-4">
                <div className="flex items-center justify-between text-[11px] font-bold text-gray-500 dark:text-gray-400 mb-2">
                  <span>{subtasksDone} of {detail.subtasks.length} done</span>
                  <span className="text-violet-600 dark:text-violet-300">{subtaskProgress}%</span>
                </div>
                <div className="h-2.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 transition-all duration-500 shadow-sm"
                    style={{ width: `${subtaskProgress}%` }}
                  />
                </div>
              </div>
            )}

            <div
              id="subtasks-list"
              ref={(el) => { subtasksEndRef.current = el }}
              className="space-y-1 max-h-64 overflow-y-auto scroll-smooth pr-1"
            >
              {detail.subtasks.map((s) => (
                <div key={s.id}
                  className="group flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => detail.updateSubtask(s.id, { done: !s.done })}
                    className="bg-transparent border-none p-0 cursor-pointer text-gray-300 dark:text-gray-600 hover:text-violet-600 dark:hover:text-violet-300 transition-colors shrink-0"
                  >
                    {s.done
                      ? <CheckSquare size={17} strokeWidth={2.5} className="text-violet-500" />
                      : <Square size={17} strokeWidth={2} />}
                  </button>
                  <span className={`flex-1 text-sm ${s.done ? 'line-through text-gray-400 dark:text-gray-600' : 'text-gray-800 dark:text-gray-200'}`}>
                    {s.title}
                  </span>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => detail.deleteSubtask(s.id)}
                      className="w-6 h-6 opacity-0 group-hover:opacity-100 inline-flex items-center justify-center text-gray-400 hover:text-rose-600 rounded bg-transparent border-none cursor-pointer transition-all"
                    >
                      <X size={11} strokeWidth={3} />
                    </button>
                  )}
                </div>
              ))}
              {detail.subtasks.length === 0 && (
                <p className="text-sm italic text-gray-400 dark:text-gray-500 text-center py-5">No subtasks yet.</p>
              )}
            </div>

            {canEdit && (
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                <div className="w-7 h-7 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center shrink-0">
                  <PlusIcon size={13} strokeWidth={2.5} className="text-gray-400" />
                </div>
                <input
                  value={subtaskInput}
                  onChange={(e) => setSubtaskInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault() }}
                  placeholder="Add a subtask…"
                  className="flex-1 bg-transparent border-none text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (subtaskInput.trim()) {
                      detail.addSubtask(subtaskInput.trim())
                      setSubtaskInput('')
                    }
                  }}
                  className="px-3 py-1.5 text-xs font-bold bg-violet-600 hover:bg-violet-700 text-white rounded-xl border-none cursor-pointer transition-colors shrink-0"
                >
                  Add
                </button>
              </div>
            )}
          </CollapsibleCard>

          {/* Attachments */}
          <CollapsibleCard
            title="Attachments"
            icon={Paperclip}
            count={detail.attachments.length}
            open={showAttachments}
            onToggle={() => setShowAttachments((v) => !v)}
          >
            {detail.attachments.length > 0 ? (
              <div className="space-y-2 mt-4">
                {detail.attachments.map((a) => {
                  const isImage = ((a.file_type || '').toLowerCase().includes('image')) ||
                    /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico|avif|webp|tiff?)$/i.test(a.name || '')
                  return (
                  <div key={a.id}
                    className="group flex items-center gap-3 px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 hover:bg-violet-50 dark:hover:bg-violet-950/20 hover:ring-1 hover:ring-violet-200 dark:hover:ring-violet-800 transition-all"
                  >
                    <span className="w-9 h-9 rounded-lg bg-white dark:bg-gray-900 shadow-sm flex items-center justify-center shrink-0">
                      <FileIcon size={14} className="text-violet-500" />
                    </span>
                    {isImage ? (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setLightboxAttachment(a) }}
                        className="flex-1 text-sm font-medium text-violet-700 dark:text-violet-300 hover:underline truncate text-left bg-transparent border-none cursor-pointer p-0"
                      >
                        {a.name}
                      </button>
                    ) : (
                      <a
                        href={a.file_url}
                        download={a.name}
                        className="flex-1 text-sm font-medium text-violet-700 dark:text-violet-300 hover:underline truncate"
                      >
                        {a.name}
                      </a>
                    )}
                    <span className="text-[11px] text-gray-400 shrink-0">
                      {a.created_at ? fmtRelative(a.created_at) : ''}
                    </span>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => detail.deleteAttachment(a.id)}
                        className="w-6 h-6 opacity-0 group-hover:opacity-100 inline-flex items-center justify-center text-gray-400 hover:text-rose-600 rounded bg-transparent border-none cursor-pointer transition-all"
                      >
                        <X size={11} strokeWidth={3} />
                      </button>
                    )}
                  </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-sm italic text-gray-400 dark:text-gray-500 text-center py-4 mt-2">No attachments yet.</p>
            )}

            {canEdit && (
              <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingFile}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-950/40 hover:bg-violet-100 dark:hover:bg-violet-900/40 rounded-xl border border-dashed border-violet-300 dark:border-violet-800 cursor-pointer disabled:opacity-50 transition-colors"
                >
                  {uploadingFile ? (
                    <span className="animate-spin">⟳</span>
                  ) : (
                    <Upload size={12} strokeWidth={2.5} />
                  )}
                  {uploadingFile ? 'Uploading…' : 'Add attachment'}
                </button>
              </div>
            )}
          </CollapsibleCard>

          {/* Comments */}
          <CollapsibleCard
            title="Comments"
            icon={MessageCircle}
            count={detail.comments.length}
            open={showComments}
            onToggle={() => setShowComments((v) => !v)}
          >
            <div
              id="comments-list"
              ref={(el) => { commentsEndRef.current = el }}
              className="space-y-4 mt-4 max-h-72 overflow-y-auto scroll-smooth pr-1"
            >
              {detail.comments.map((c) => (
                <div key={c.id} className="flex items-start gap-3">
                  <Avatar name={c.author?.name || '?'} size={8} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 mb-1.5">
                      <span className="text-sm font-bold text-gray-900 dark:text-white">{c.author?.name || '?'}</span>
                      <span className="text-[11px] text-gray-400 uppercase tracking-wider">
                        {fmtRelative(c.created_at)}
                        {c.updated_at && c.updated_at !== c.created_at ? ' · edited' : ''}
                      </span>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-xl px-4 py-3">
                      <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words leading-relaxed">
                        {highlightMentions(c.body || '', activeMembers)}
                      </p>
                    </div>
                    {(c.author?.name === currentUserName || isProjectOwner) && (
                      <div className="flex items-center gap-1 mt-1.5 ml-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingComment({ id: c.id, body: c.body })
                            setEditCommentBody(c.body)
                          }}
                          className="text-[11px] font-semibold text-gray-400 hover:text-violet-600 bg-transparent border-none cursor-pointer">Edit</button>
                        <span className="text-gray-200 dark:text-gray-700">·</span>
                        <button
                          type="button"
                          onClick={() => detail.deleteComment(c.id)}
                          className="text-[11px] font-semibold text-gray-400 hover:text-rose-600 bg-transparent border-none cursor-pointer">Delete</button>
                      </div>
                    )}
                    <ReactionBar
                      reactions={(c as any).reactions as Reaction[] || []}
                      onToggle={(emoji, oldEmoji) => detail.toggleCommentReaction(c.id, emoji, oldEmoji)}
                      currentUserName={currentUserName}
                    />
                  </div>
                </div>
              ))}
              {detail.comments.length === 0 && (
                <div className="flex flex-col items-center py-6 gap-2">
                  <div className="w-10 h-10 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                    <MessageCircle size={16} className="text-gray-400" />
                  </div>
                  <p className="text-sm italic text-gray-400 dark:text-gray-500">No comments yet — start the conversation.</p>
                </div>
              )}
            </div>

            {/* Comment composer — always visible, below the list */}
            <div className="flex items-start gap-3 px-1 pt-3 pb-1 border-t border-gray-100 dark:border-gray-800">
              <Avatar name={currentUserName || 'Me'} size={8} />
              <div className="flex-1 min-w-0">
                <MentionInput
                  projectId={projectId}
                  value={commentBody}
                  onChange={setCommentBody}
                  placeholder="Write a comment… (type @ to mention, Ctrl+Enter to send)"
                  rows={2}
                  disabled={commenting}
                />
                <div className="flex justify-end mt-2">
                  <button
                    type="button"
                    onClick={submitComment}
                    disabled={!commentBody.trim() || commenting}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-violet-600 hover:bg-violet-700 text-white rounded-xl shadow-sm border-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Send size={11} strokeWidth={2.5} /> Post comment
                  </button>
                </div>
              </div>
            </div>
          </CollapsibleCard>

        </div>

        {/* ── Sidebar (right, 1/3) ──────────────────────────────────── */}
        <div className="space-y-4">

          {/* Status / Column */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
            <div className="px-4 py-3.5 border-b border-gray-100 dark:border-gray-800">
              <p className="text-[11px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500 flex items-center gap-2">
                <Columns size={12} strokeWidth={2.5} className="text-gray-400" />
                Status
              </p>
            </div>
            <div className="p-4">
              {canEdit ? (
                <ColumnSelect value={confirmedColumnId} columns={tb.board} busy={busyColumn} onChange={handleColumnChange} />
              ) : (
                <div className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-900 dark:text-white">
                  <span className="w-2.5 h-2.5 rounded-full bg-violet-500" />
                  {column?.name || '—'}
                </div>
              )}
            </div>
          </div>

          {/* Properties */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
            <div className="px-4 py-3.5 border-b border-gray-100 dark:border-gray-800">
              <p className="text-[11px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500 flex items-center gap-2">
                <Tag size={12} strokeWidth={2.5} className="text-gray-400" />
                Properties
              </p>
            </div>
            <div className="px-4">

              <PropRow icon={Tag} label="Priority">
                {editing ? (
                  <PrioritySelect value={priority} onChange={setPriority} />
                ) : (
                  <span className={`inline-flex items-center gap-1.5 text-sm font-semibold px-2.5 py-1 rounded-full ${PRIORITY_BG[task.priority]}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${PRIORITY_COLOR[task.priority]}`} />
                    {PRIORITY_LABEL[task.priority]}
                  </span>
                )}
              </PropRow>

              <PropRow icon={CalIcon} label="Due date">
                {editing ? (
                  <input
                    type="date"
                    value={due}
                    onChange={(e) => setDue(e.target.value)}
                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-2 py-1.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 transition-colors"
                  />
                ) : (
                  <span className="text-sm text-gray-900 dark:text-gray-100">
                    {task.due_date ? fmtDateShort(task.due_date) : <span className="text-gray-400 italic">No due date</span>}
                  </span>
                )}
              </PropRow>

              <PropRow icon={User2} label="Assignees">
                {editing ? (
                  <MultiSelectDropdown
                    placeholder="Select assignees…"
                    options={tb.members.map((m) => ({ id: m.id, label: m.name, initials: m.initials, subtitle: m.email }))}
                    selected={assigneeIds}
                    onChange={setAssigneeIds}
                  />
                ) : (
                  <div className="flex flex-col gap-2">
                    {task.assignees.length === 0 && (
                      <span className="text-sm text-gray-400 italic">No assignees</span>
                    )}
                    {task.assignees.map((a) => (
                      <div key={a.id} className="inline-flex items-center gap-2">
                        <Avatar name={a.name} size={5} />
                        <span className="text-sm text-gray-900 dark:text-gray-100">{a.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </PropRow>

              <PropRow icon={User2} label="Created by">
                <div className="flex items-center gap-2">
                  <Avatar name={task.author?.name || '?'} size={5} />
                  <span className="text-sm text-gray-900 dark:text-gray-100">{task.author?.name || '?'}</span>
                </div>
              </PropRow>

            </div>
          </div>

          {/* Activity toggle */}
          <button
            type="button"
            onClick={() => setShowActivity((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3.5 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm text-sm font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-gray-400 to-gray-500 dark:from-gray-600 dark:to-gray-700 flex items-center justify-center shadow-sm">
                <Clock size={13} strokeWidth={2.5} className="text-white" />
              </span>
              Activity ({detail.activity.length})
            </div>
            <ChevronDown
              size={14}
              strokeWidth={2.5}
              className={`text-gray-400 transition-transform duration-200 ${showActivity ? 'rotate-180' : ''}`}
            />
          </button>

          {showActivity && (
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
              <div className="px-4 py-3 space-y-0.5 max-h-72 overflow-y-auto">
                {detail.activity.map((a) => (
                  <div key={a.id}
                    className="flex items-baseline gap-2 px-2 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors text-xs"
                  >
                    <span className="font-bold text-gray-800 dark:text-gray-200 shrink-0">{a.actor?.name || '?'}</span>
                    <span className="text-gray-500 dark:text-gray-400 flex-1">{humanizeAction(a.action, a.details)}</span>
                    <span className="text-gray-400 shrink-0">{fmtRelative(a.created_at)}</span>
                  </div>
                ))}
                {detail.activity.length === 0 && (
                  <p className="text-xs italic text-gray-400 dark:text-gray-500 text-center py-4">No activity yet.</p>
                )}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* ── Image Lightbox Modal ─────────────────────────────────────── */}
      {lightboxAttachment && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setLightboxAttachment(null)}
        >
          {/* Close button */}
          <button
            type="button"
            onClick={() => setLightboxAttachment(null)}
            className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white border-none cursor-pointer transition-colors"
          >
            <X size={18} strokeWidth={2.5} />
          </button>

          {/* Image */}
          <div className="relative max-w-5xl max-h-[85vh] w-full mx-4 flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}>
            <div className="relative rounded-2xl overflow-hidden shadow-2xl bg-white dark:bg-gray-900">
              <img
                src={`${typeof window !== 'undefined' ? window.location.origin : ''}${lightboxAttachment.file_url}`}
                alt={lightboxAttachment.name}
                className="max-h-[75vh] max-w-full object-contain block rounded-t-2xl"
                style={{ maxWidth: 'min(90vw, 900px)' }}
                onClick={(e) => e.stopPropagation()}
              />
              {/* Image name bar */}
              <div className="flex items-center justify-between px-5 py-3.5 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800">
                <div className="flex items-center gap-3">
                  <span className="w-9 h-9 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                    <FileIcon size={14} className="text-violet-600 dark:text-violet-300" />
                  </span>
                  <div>
                    <p className="text-sm font-bold text-gray-900 dark:text-white">{lightboxAttachment.name}</p>
                    <p className="text-[11px] text-gray-400">
                      {lightboxAttachment.created_at ? fmtRelative(lightboxAttachment.created_at) : ''}
                    </p>
                  </div>
                </div>
                <a
                  href={`${typeof window !== 'undefined' ? window.location.origin : ''}${lightboxAttachment.file_url}`}
                  download={lightboxAttachment.name}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold bg-violet-600 hover:bg-violet-700 text-white rounded-xl border-none cursor-pointer transition-colors"
                >
                  <Upload size={12} strokeWidth={2.5} /> Download
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Comment Edit Modal ───────────────────────────────────────── */}
      {editingComment && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setEditingComment(null)}
        >
          <div
            className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center">
                  <Pencil size={14} strokeWidth={2.5} className="text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white">Edit Comment</h3>
                  <p className="text-[11px] text-gray-400">Update your comment below</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingComment(null)}
                className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-center text-gray-500 border-none cursor-pointer transition-colors"
              >
                <X size={15} strokeWidth={2.5} />
              </button>
            </div>

            {/* Modal body */}
            <div className="px-6 py-5">
              <textarea
                value={editCommentBody}
                onChange={(e) => setEditCommentBody(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setEditingComment(null)
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); saveEditComment() }
                }}
                rows={4}
                autoFocus
                className="w-full resize-none bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500 transition-colors"
              />
              <p className="text-[11px] text-gray-400 mt-2 text-right">Ctrl+Enter to save · Esc to cancel</p>
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
              <button
                type="button"
                onClick={() => setEditingComment(null)}
                className="px-4 py-2 text-sm font-semibold text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl border border-gray-200 dark:border-gray-700 cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveEditComment}
                disabled={!editCommentBody.trim() || savingComment}
                className="inline-flex items-center gap-1.5 px-5 py-2 text-sm font-bold bg-violet-600 hover:bg-violet-700 text-white rounded-xl shadow-sm border-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {savingComment ? <span className="animate-spin">⟳</span> : <CheckCircle2 size={13} strokeWidth={2.5} />}
                {savingComment ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDel}
        title="Archive this task?"
        description="The task will be moved to Archived Tasks. You can restore it later or permanently delete it from there."
        confirmLabel="Archive"
        destructive
        onConfirm={async () => { setConfirmDel(false); await handleDelete() }}
        onCancel={() => setConfirmDel(false)}
      />

      {/* ── Sticky save bar (edit mode only) ── */}
      {editing && (
        <div className="sticky bottom-0 z-20 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-5 py-3 flex items-center justify-end gap-2 shadow-lg">
          <button type="button" onClick={() => setEditing(false)} disabled={savingEdit}
            className="px-4 py-2 text-sm font-semibold bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl border-none cursor-pointer disabled:opacity-50 transition-colors">
            Cancel
          </button>
          <button type="button" onClick={saveEdit} disabled={savingEdit}
            className="inline-flex items-center gap-1.5 px-5 py-2 text-sm font-bold bg-violet-600 hover:bg-violet-700 text-white rounded-xl shadow-sm border-none cursor-pointer disabled:opacity-50 transition-colors">
            {savingEdit ? <span className="animate-spin">⟳</span> : <CheckCircle2 size={13} strokeWidth={2.5} />} Save changes
          </button>
        </div>
      )}
      </div>
    </ProjectLayout>
  )
}

// ── Small inline Plus icon (no extra lucide import needed) ────────────────────
function PlusIcon({ size = 16, strokeWidth = 2, className = '' }: { size?: number; strokeWidth?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}
