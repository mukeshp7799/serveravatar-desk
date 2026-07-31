'use client'

/**
 * Archived Tasks modal.
 *
 * Opens from the Task Board toolbar ("View archived" button). Lists every
 * archived task in the project with two actions per row:
 *   • Restore  — moves the task back to its original column
 *   • Delete forever — permanently removes the task (with confirmation)
 *
 * The modal is fully self-contained:
 *   - Uses `useArchivedTasks(projectId)` to fetch + mutate the list.
 *   - On restore, the parent pass an `onRestored` callback so the live
 *     Task Board can refresh its column/tasks view. The task disappears
 *     from the archived list as soon as the API call succeeds.
 *
 * Permanent delete is always confirmed before the destructive call —
 * both the inline "Delete forever" button and the modal confirm step
 * ensure the user can't lose a task by accident.
 */

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Archive, ArchiveRestore, Trash2, X, Search, AlertTriangle,
  Calendar, MessageSquare, Paperclip, CheckSquare, Inbox,
} from 'lucide-react'
import type { ArchivedTask, Priority } from '@/lib/task-board-api'
import { useArchivedTasks } from '@/lib/task-board-api'
import { fmtRelative } from './format'

interface ArchivedTasksModalProps {
  projectId: string | number
  open: boolean
  onClose: () => void
  /** Called after a successful restore so the parent can refresh its board. */
  onRestored?: () => void
}

const PRIORITY_COLOR: Record<Priority, string> = {
  low:    'bg-sky-500',
  medium: 'bg-amber-500',
  high:   'bg-rose-500',
}
const PRIORITY_LABEL: Record<Priority, string> = { low: 'Low', medium: 'Medium', high: 'High' }

export default function ArchivedTasksModal({
  projectId, open, onClose, onRestored,
}: ArchivedTasksModalProps) {
  const { tasks, total, loading, error, refresh, restore, permanentDelete } = useArchivedTasks(projectId)
  const [search, setSearch] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<ArchivedTask | null>(null)
  const [acting, setActing] = useState<string | number | null>(null)
  const mounted = useRef(false)

  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])

  // Refresh list every time the modal opens so the count is current.
  useEffect(() => {
    if (open) refresh()
  }, [open, refresh])

  // Escape closes
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !confirmDelete) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose, confirmDelete])

  const filtered = search.trim()
    ? tasks.filter((t) => t.title.toLowerCase().includes(search.trim().toLowerCase()))
    : tasks

  const handleRestore = async (taskId: string | number) => {
    setActing(taskId)
    try {
      await restore(taskId)
      onRestored?.()
    } catch (e: any) {
      // error surfaced via toast in parent
    } finally {
      setActing(null)
    }
  }

  const handlePermanentDelete = async (taskId: string | number) => {
    setActing(taskId)
    try {
      await permanentDelete(taskId)
    } finally {
      setActing(null)
      setConfirmDelete(null)
    }
  }

  if (!open) return null

  const modal = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in-up"
      onClick={(e) => { if (e.target === e.currentTarget && !confirmDelete) onClose() }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="archived-tasks-title"
        className="w-full max-w-3xl max-h-[85vh] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 flex flex-col overflow-hidden animate-scale-in"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-200 dark:border-gray-800 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-9 h-9 inline-flex items-center justify-center rounded-xl bg-gradient-to-br from-slate-500 to-slate-700 text-white shadow-md shadow-slate-500/25">
              <Archive size={16} strokeWidth={2.5} />
            </span>
            <div className="min-w-0">
              <h2 id="archived-tasks-title" className="text-base font-bold text-gray-900 dark:text-white truncate">
                Archived Tasks
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {total > 0
                  ? `${total} task${total === 1 ? '' : 's'} archived`
                  : 'Tasks you delete are kept here. You can restore them or delete them permanently.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 inline-flex items-center justify-center text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg bg-transparent border-none cursor-pointer shrink-0"
          >
            <X size={16} strokeWidth={2.5} />
          </button>
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-800 shrink-0">
          <div className="relative">
            <Search size={14} strokeWidth={2.5} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search archived tasks…"
              className="w-full pl-9 pr-3 py-2 text-sm rounded-xl bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500"
            />
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-3 py-3 scroll-slim">
          {loading && tasks.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <div className="flex flex-col items-center gap-2 text-gray-500 dark:text-gray-400">
                <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-xs font-medium">Loading archived tasks…</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-12">
              <div className="flex flex-col items-center gap-2 text-rose-600 dark:text-rose-300">
                <AlertTriangle size={28} strokeWidth={2} />
                <p className="text-sm font-semibold">{error}</p>
                <button
                  type="button"
                  onClick={refresh}
                  className="mt-2 px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-50 dark:bg-rose-900/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-200 border border-rose-200 dark:border-rose-800"
                >
                  Try again
                </button>
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <div className="flex flex-col items-center gap-2 text-gray-500 dark:text-gray-400 text-center max-w-xs">
                <span className="w-14 h-14 inline-flex items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-800 text-gray-400">
                  <Inbox size={28} strokeWidth={1.75} />
                </span>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  {search.trim() ? 'No matches' : 'No archived tasks'}
                </p>
                <p className="text-xs">
                  {search.trim()
                    ? `Nothing matches "${search.trim()}".`
                    : 'When you delete a task from the board, it will appear here so you can restore or remove it for good.'}
                </p>
              </div>
            </div>
          ) : (
            <ul className="space-y-2">
              {filtered.map((t) => (
                <ArchivedTaskRow
                  key={t.id}
                  task={t}
                  busy={acting === t.id}
                  onRestore={() => handleRestore(t.id)}
                  onRequestDelete={() => setConfirmDelete(t)}
                />
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Permanent-delete confirmation modal (nested) */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in-up"
          onClick={(e) => { if (e.target === e.currentTarget) setConfirmDelete(null) }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-rose-200 dark:border-rose-900/60 p-5 animate-scale-in"
          >
            <div className="flex items-start gap-3">
              <span className="w-10 h-10 inline-flex items-center justify-center rounded-xl bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-300 shrink-0">
                <AlertTriangle size={20} strokeWidth={2.25} />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-bold text-gray-900 dark:text-white">
                  Delete this task forever?
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  <span className="font-semibold text-gray-900 dark:text-white">{confirmDelete.title}</span> will be permanently removed along with its subtasks, comments, and attachments. This cannot be undone.
                </p>
              </div>
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                disabled={acting === confirmDelete.id}
                className="px-3.5 py-2 text-sm font-semibold rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handlePermanentDelete(confirmDelete.id)}
                disabled={acting === confirmDelete.id}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold rounded-xl bg-rose-600 hover:bg-rose-700 text-white shadow border-none cursor-pointer disabled:opacity-50"
              >
                <Trash2 size={14} strokeWidth={2.5} />
                {acting === confirmDelete.id ? 'Deleting…' : 'Delete forever'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )

  return mounted.current ? createPortal(modal, document.body) : null
}

/* ─── Row component ──────────────────────────────────────────── */

function ArchivedTaskRow({
  task, busy, onRestore, onRequestDelete,
}: {
  task: ArchivedTask
  busy: boolean
  onRestore: () => void
  onRequestDelete: () => void
}) {
  const archiver = task.archived_by_name || task.archived_by_email || 'Someone'
  return (
    <li className="group bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-3 hover:border-gray-300 dark:hover:border-gray-700 transition">
      <div className="flex items-start gap-3">
        {/* Priority dot */}
        <span
          className={`w-2 h-2 rounded-full ${PRIORITY_COLOR[task.priority]} mt-2 shrink-0`}
          title={PRIORITY_LABEL[task.priority]}
        />

        {/* Main column */}
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate" title={task.title}>
            {task.title}
          </h3>
          <div className="flex items-center gap-2 mt-1 flex-wrap text-xs text-gray-500 dark:text-gray-400">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
              {task.column_name || 'No column'}
            </span>
            <span aria-hidden>·</span>
            <span>Archived by {archiver}</span>
            <span aria-hidden>·</span>
            <span title={task.archived_at}>{fmtRelative(task.archived_at)}</span>
          </div>
          {task.assignees.length > 0 && (
            <div className="flex items-center gap-1 mt-2">
              <div className="flex -space-x-1.5">
                {task.assignees.slice(0, 5).map((u) => (
                  <span
                    key={u.id}
                    title={u.name}
                    className="w-5 h-5 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 text-white text-[9px] font-bold flex items-center justify-center ring-2 ring-white dark:ring-gray-900"
                  >
                    {u.initials}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Counters */}
        <div className="hidden sm:flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 shrink-0">
          {task.subtask_total > 0 && (
            <span className="inline-flex items-center gap-1" title="Subtasks">
              <CheckSquare size={12} strokeWidth={2.5} />
              {task.subtask_done}/{task.subtask_total}
            </span>
          )}
          {task.comment_count > 0 && (
            <span className="inline-flex items-center gap-1" title="Comments">
              <MessageSquare size={12} strokeWidth={2.5} />
              {task.comment_count}
            </span>
          )}
          {task.attachment_count > 0 && (
            <span className="inline-flex items-center gap-1" title="Attachments">
              <Paperclip size={12} strokeWidth={2.5} />
              {task.attachment_count}
            </span>
          )}
          {task.due_date && (
            <span className="inline-flex items-center gap-1" title="Due date">
              <Calendar size={12} strokeWidth={2.5} />
              {task.due_date}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onRestore}
            disabled={busy}
            title="Restore this task to its original column"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-emerald-50 dark:bg-emerald-900/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 cursor-pointer disabled:opacity-50 transition"
          >
            <ArchiveRestore size={13} strokeWidth={2.5} />
            <span className="hidden md:inline">Restore</span>
          </button>
          <button
            type="button"
            onClick={onRequestDelete}
            disabled={busy}
            title="Permanently delete this task"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-rose-50 dark:bg-rose-900/30 hover:bg-rose-100 dark:hover:bg-rose-900/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 cursor-pointer disabled:opacity-50 transition"
          >
            <Trash2 size={13} strokeWidth={2.5} />
            <span className="hidden md:inline">Delete forever</span>
          </button>
        </div>
      </div>
    </li>
  )
}
