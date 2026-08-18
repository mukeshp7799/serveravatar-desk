/**
 * Task Board API hooks.
 *
 * Single high-level `useTaskBoard(projectId)` hook holds columns + members
 * + all per-task sub-data. Mutations (createTask, editTask, deleteTask,
 * moveTask, addComment, toggleSubtask, etc.) call the backend, then patch
 * the local `board` state so the UI updates without a refetch.
 *
 * Why one hook for everything:
 *   - Single GET `useTaskBoard` returns the board + the project member list
 *     used by the assignee picker.
 *   - The per-task detail page makes additional HTTP calls (comments,
 *     attachments, subtasks, activity) — these are fetched lazily because
 *     they're heavy and we don't want to round-trip them every time the
 *     board renders.
 */

'use client'

import { flushSync } from 'react-dom'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api'

/* ─── Types ─────────────────────────────────────────────────────── */
export type Priority = 'low' | 'medium' | 'high'

export interface BoardMember {
  id: number | string
  name: string
  initials: string
  email?: string
  avatar?: string | null
  role: string
}

export interface BoardUser {
  id: number | string
  name: string
  initials: string
  email?: string
  avatar?: string | null
}

export interface BoardSubtask {
  id: number | string
  title: string
  done: boolean
  position: number
}

export interface BoardTask {
  id: number | string
  project_id: number | string
  column_id: number | string
  title: string
  description_html: string
  priority: Priority
  due_date: string | null
  position: number
  created_by: number | string
  created_at: string
  updated_at: string | null
  author: BoardUser
  assignees: BoardUser[]
  subtasks: BoardSubtask[]
}

export interface BoardColumn {
  id: number | string
  project_id: number | string
  name: string
  position: number
  is_backlog: boolean
  created_at: string
  tasks: BoardTask[]
}

export interface BoardState {
  board: BoardColumn[]
  members: BoardMember[]
}

export interface BoardActivityEntry {
  id: number | string
  task_id: number | string
  action: string
  details: any
  created_at: string
  actor: BoardUser
}

export interface BoardComment {
  id: number | string
  task_id: number | string
  body: string
  created_at: string
  updated_at: string | null
  author: BoardUser
  reactions: import('@/types/project').Reaction[]
}

export interface BoardAttachment {
  id: number | string
  task_id: number | string
  file_url: string
  file_type?: string | null
  file_size?: number | null
  uploaded_by: number | string
  created_at: string
  name: string
}

/* ─── Main hook ────────────────────────────────────────────────── */
export function useTaskBoard(projectId: string | number) {
  const [board, setBoard] = useState<BoardColumn[]>([])
  const [members, setMembers] = useState<BoardMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const alive = useRef(true)

  const refresh = useCallback(async () => {
    try {
      setLoading(true)
      const res = await api.get(`/projects/${projectId}/task-board`)
      if (!alive.current) return
      setBoard(res.board || [])
      setMembers(res.members || [])
      setError(null)
    } catch (e: any) {
      if (!alive.current) return
      setError(e?.message || 'Failed to load board')
    } finally {
      if (alive.current) setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    alive.current = true
    refresh()
    return () => { alive.current = false }
  }, [refresh])

  /* ── Column mutations ────────────────────────────────────────── */
  const createColumn = useCallback(async (name: string) => {
    const res = await api.post(`/projects/${projectId}/task-columns`, { name })
    if (res.column) {
      setBoard((b) => [...b, { ...res.column, tasks: [] }])
    }
    return res.column as BoardColumn
  }, [projectId])

  const renameColumn = useCallback(async (columnId: string | number, name: string) => {
    const res = await api.put(`/task-columns/${columnId}`, { name })
    if (res.column) {
      setBoard((b) => b.map((c) => c.id === columnId ? { ...c, name: res.column.name } : c))
    }
  }, [])

  const deleteColumn = useCallback(async (columnId: string | number) => {
    await api.delete(`/task-columns/${columnId}`)
    setBoard((b) => b.filter((c) => c.id !== columnId))
  }, [])

  const reorderColumns = useCallback(async (columnIds: Array<string | number>) => {
    // Optimistic
    const map = new Map(board.map((c) => [c.id, c]))
    const next = columnIds.map((id, i) => ({ ...(map.get(id) || {}), position: (i + 1) * 1000 }))
    setBoard((b) => {
      // Preserve any column missing from `columnIds` after the moved ones (shouldn't happen).
      const reordered = next as BoardColumn[]
      // Spliced by id to keep stable order
      const sorted = [...b].sort((a, b2) => columnIds.indexOf(a.id) - columnIds.indexOf(b2.id))
      return sorted.length ? sorted : reordered
    })
    await api.put(`/projects/${projectId}/task-columns/reorder`, { columnIds })
  }, [projectId, board])

  /* ── Task mutations ──────────────────────────────────────────── */
  const createTask = useCallback(async (partial: Partial<BoardTask> & { title: string }) => {
    const res = await api.post(`/projects/${projectId}/tasks`, partial)
    if (res.task) {
      const t = res.task as BoardTask
      setBoard((b) => b.map((c) => c.id === t.column_id ? { ...c, tasks: [...c.tasks, t] } : c))
    }
    return res.task as BoardTask
  }, [projectId])

  const editTask = useCallback(async (taskId: string | number, partial: Partial<BoardTask> & { assignee_ids?: Array<string | number> }) => {
    const res = await api.put(`/tasks/${taskId}`, partial)
    if (res.task) {
      const t = res.task as BoardTask
      setBoard((b) => b.map((c) => ({
        ...c,
        tasks: c.tasks.map((x) => x.id === taskId ? t : x),
      })))
    }
    return res.task as BoardTask
  }, [])

  const deleteTask = useCallback(async (taskId: string | number) => {
    // The backend now interprets DELETE as soft-archive (sets archived_at).
    // The task disappears from the active board immediately because the
    // board endpoint filters `archived_at IS NULL`. The task is preserved
    // in the `tb_tasks` table and surfaced via the Archived Tasks view.
    await api.delete(`/tasks/${taskId}`)
    setBoard((b) => b.map((c) => ({ ...c, tasks: c.tasks.filter((t) => t.id !== taskId) })))
  }, [])

  // Restore an archived task back to its original column.
  // The board needs to be refetched — the task's column_id may have been
  // captured at archive time, and we want to show it in the right place
  // with the right sort order.
  const restoreTask = useCallback(async (taskId: string | number) => {
    await api.post(`/tasks/${taskId}/restore`, {})
    await refresh()
  }, [refresh])

  // Permanently delete an archived task. Reserved for the Archived Tasks
  // view — the UI must always confirm with the user before calling this.
  // Server-side it's also locked down: only already-archived tasks can be
  // permanently deleted (so an active task can't be destroyed by accident).
  const permanentDeleteTask = useCallback(async (taskId: string | number) => {
    await api.delete(`/tasks/${taskId}/permanent`)
  }, [])

  // Move a task to a new column + position (or just reorder within a column).
  // Re-computes sibling positions to avoid float drift when rebalancing many tasks.
  //
  // Returns { ok, fromColumnId, fromColumnName, toColumnName, noop } so the
  // caller can show a precise success toast and detect the "same column"
  // case (where the move is a no-op and shouldn't be persisted or toasted).
  const moveTask = useCallback(async (
    taskId: string | number,
    toColumnId: string | number,
    newIndex: number,
  ): Promise<{
    ok: boolean
    fromColumnId: string | number | null
    fromColumnName: string | null
    toColumnName: string | null
    noop?: boolean
  }> => {
    // Look up source/destination info OUTSIDE setBoard (deterministic; safe
    // across React StrictMode double-invocations of the updater).
    let fromColumnId: string | number | null = null
    let fromColumnName: string | null = null
    let toColumnName: string | null = null
    for (const c of board) {
      if (c.tasks.some((t) => String(t.id) === String(taskId))) {
        fromColumnId = c.id
        fromColumnName = c.name
        break
      }
    }
    const destCol = board.find((c) => String(c.id) === String(toColumnId))
    if (destCol) toColumnName = destCol.name

    // Same-column same-position: skip the API call entirely (no churn).
    if (fromColumnId != null && String(fromColumnId) === String(toColumnId) && destCol) {
      const sameIndex = destCol.tasks.findIndex((t) => String(t.id) === String(taskId))
      if (sameIndex === newIndex || (sameIndex >= 0 && newIndex >= destCol.tasks.length)) {
        return { ok: true, fromColumnId, fromColumnName, toColumnName, noop: true }
      }
    }

    // Optimistic: rebuild the column arrays AND capture the computed new position.
    // flushSync ensures the setBoard callback runs synchronously so computedPos
    // is available before the API call below (avoids React batching race).
    let computedPos: number | null = null
    flushSync(() => {
      setBoard((cur) => {
        const next = cur.map((c) => ({ ...c, tasks: c.tasks.map((t) => ({ ...t })) }))
        let fromIdx = -1, fromCol = -1
        for (let i = 0; i < next.length; i++) {
          const idx = next[i].tasks.findIndex((t) => String(t.id) === String(taskId))
          if (idx >= 0) { fromIdx = idx; fromCol = i; break }
        }
        if (fromCol < 0) return cur
        const moved = next[fromCol].tasks[fromIdx]
        next[fromCol].tasks.splice(fromIdx, 1)
        const toCol = next.findIndex((c) => String(c.id) === String(toColumnId))
        if (toCol < 0) return cur
        const arr = next[toCol].tasks
        const safeIndex = Math.max(0, Math.min(newIndex, arr.length))
        const prev = safeIndex > 0 ? arr[safeIndex - 1] : null
        const after = safeIndex < arr.length ? arr[safeIndex] : null
        const prevPos = prev?.position ?? null
        const afterPos = after?.position ?? null
        const newPos =
          prevPos == null && afterPos == null ? 1000 :
          prevPos == null ? (afterPos as number) - 1000 :
          afterPos == null ? prevPos + 1000 :
          (prevPos + afterPos) / 2
        computedPos = newPos
        next[toCol].tasks.splice(safeIndex, 0, { ...moved, column_id: toColumnId, position: newPos })
        if (fromCol !== toCol) {
          next[fromCol].tasks.forEach((t, i) => { t.position = (i + 1) * 1000 })
        }
        return next
      })
    })

    if (computedPos == null) {
      return { ok: false, fromColumnId, fromColumnName, toColumnName }
    }
    try {
      await api.post(`/tasks/${taskId}/move`, { columnId: toColumnId, position: computedPos })
      return { ok: true, fromColumnId, fromColumnName, toColumnName }
    } catch (e) {
      refresh()
      throw e
    }
  }, [board, refresh])

  // Move a task to a column, appending to the end. Intended for the
  // Task Details page (column dropdown change). Computes the destination
  // index correctly whether the task is moving into a different column
  // or just being "re-confirmed" in its current column (the latter is
  // detected and turned into a no-op so the server isn't pinged).
  const moveTaskToColumn = useCallback(async (
    taskId: string | number,
    toColumnId: string | number,
  ): Promise<{
    ok: boolean
    fromColumnId: string | number | null
    fromColumnName: string | null
    toColumnName: string | null
    noop?: boolean
  }> => {
    const dest = board.find((c) => String(c.id) === String(toColumnId))
    if (!dest) {
      return { ok: false, fromColumnId: null, fromColumnName: null, toColumnName: null }
    }
    const source = board.find((c) => c.tasks.some((t) => String(t.id) === String(taskId)))
    if (source && String(source.id) === String(toColumnId)) {
      return { ok: true, fromColumnId: source.id, fromColumnName: source.name, toColumnName: dest.name, noop: true }
    }
    const newIndex = dest.tasks.length
    return moveTask(taskId, toColumnId, newIndex)
  }, [board, moveTask])

  // Patch a single task in place inside the local board state. Used by
  // the Task Details page so editing a field doesn't have to refetch
  // the whole board (keeps the Task Board + Details perfectly synced).
  // Returns the patched task (from the network) so callers can react.
  const patchTaskInBoard = useCallback((updated: BoardTask) => {
    setBoard((b) => b.map((c) => ({
      ...c,
      tasks: c.tasks.map((t) => (String(t.id) === String(updated.id) ? { ...t, ...updated } : t)),
    })))
  }, [])

  // Optimistic-only task move — updates board immediately without an API call.
  // Used by onDragOver for live drag feedback. onDragEnd calls moveTask (with API)
  // to persist the final position.
  const moveTaskOptimistic = useCallback((
    taskId: string | number,
    toColumnId: string | number,
    newIndex: number,
  ) => {
    setBoard((cur) => {
      const next = cur.map((c) => ({ ...c, tasks: c.tasks.map((t) => ({ ...t })) }))
      let fromIdx = -1, fromCol = -1
      for (let i = 0; i < next.length; i++) {
        const idx = next[i].tasks.findIndex((t) => String(t.id) === String(taskId))
        if (idx >= 0) { fromIdx = idx; fromCol = i; break }
      }
      if (fromCol < 0) return cur
      const moved = next[fromCol].tasks[fromIdx]
      next[fromCol].tasks.splice(fromIdx, 1)
      const toCol = next.findIndex((c) => String(c.id) === String(toColumnId))
      if (toCol < 0) return cur
      const arr = next[toCol].tasks
      const safeIndex = Math.max(0, Math.min(newIndex, arr.length))
      const prev = safeIndex > 0 ? arr[safeIndex - 1] : null
      const after = safeIndex < arr.length ? arr[safeIndex] : null
      const prevPos = prev?.position ?? null
      const afterPos = after?.position ?? null
      const newPos =
        prevPos == null && afterPos == null ? 1000 :
        prevPos == null ? (afterPos as number) - 1000 :
        afterPos == null ? prevPos + 1000 :
        (prevPos + afterPos) / 2
      next[toCol].tasks.splice(safeIndex, 0, { ...moved, column_id: toColumnId, position: newPos })
      if (fromCol !== toCol) {
        next[fromCol].tasks.forEach((t, i) => { t.position = (i + 1) * 1000 })
      }
      return next
    })
  }, [])

  // Reorder multiple tasks at once (for intra-column reordering)
  const reorderTasks = useCallback(async (
    updates: Array<{ id: string | number; column_id: string | number; position: number }>,
  ) => {
    await api.put(`/projects/${projectId}/tasks/reorder`, { tasks: updates })
  }, [projectId])

  return {
    board, members, loading, error,
    refresh,
    createColumn, renameColumn, deleteColumn, reorderColumns,
    createTask, editTask, deleteTask, restoreTask, permanentDeleteTask,
    moveTask, moveTaskOptimistic, moveTaskToColumn, patchTaskInBoard, reorderTasks,
  }
}

/* ─── Per-task detail hook ────────────────────────────────────── */
export function useTaskDetail(taskId: string | number | null) {
  const [comments, setComments] = useState<BoardComment[]>([])
  const [subtasks, setSubtasks] = useState<BoardSubtask[]>([])
  const [attachments, setAttachments] = useState<BoardAttachment[]>([])
  const [activity, setActivity] = useState<BoardActivityEntry[]>([])
  const [loading, setLoading] = useState(false)

  const fetchAll = useCallback(async () => {
    if (!taskId) return
    setLoading(true)
    try {
      const [c, s, a, ac] = await Promise.all([
        api.get(`/tasks/${taskId}/comments`),
        api.get(`/tasks/${taskId}/subtasks`),
        api.get(`/tasks/${taskId}/attachments`),
        api.get(`/tasks/${taskId}/activity`),
      ])
      setComments(c.comments || [])
      setSubtasks(s.subtasks || [])
      setAttachments(a.attachments || [])
      setActivity(ac.activity || [])
    } catch (e) {
      // Toasts surface elsewhere
    } finally {
      setLoading(false)
    }
  }, [taskId])

  useEffect(() => { fetchAll() }, [fetchAll])

  const addComment = useCallback(async (body: string) => {
    const res = await api.post(`/tasks/${taskId}/comments`, { body })
    if (res.comment) setComments((c) => [...c, res.comment])
    return res.comment
  }, [taskId])

  const editComment = useCallback(async (commentId: string | number, body: string) => {
    const res = await api.put(`/tasks/${taskId}/comments/${commentId}`, { body })
    if (res.comment) setComments((c) => c.map((x) => x.id === commentId ? res.comment : x))
  }, [taskId])

  const deleteComment = useCallback(async (commentId: string | number) => {
    await api.delete(`/tasks/${taskId}/comments/${commentId}`)
    setComments((c) => c.filter((x) => x.id !== commentId))
  }, [taskId])

  // Toggle or replace a reaction on a task comment.
  // When oldEmoji is provided the backend treats it as a replacement (removes
  // oldEmoji first, then adds the new emoji) so there is no race condition.
  const toggleCommentReaction = useCallback(async (commentId: string | number, emoji: string, oldEmoji?: string) => {
    // Optimistic update: immediately reflect the expected result before the
    // API call resolves.  Three cases:
    //   1. oldEmoji && oldEmoji !== emoji  → replace (remove old, add new)
    //   2. oldEmoji === emoji              → toggle off
    //   3. no oldEmoji, emoji not present  → add new
    //   4. no oldEmoji, emoji present       → toggle off
    setComments((prev) => prev.map((c) => {
      if (c.id !== commentId) return c
      const reactions = [...(c.reactions || [])]

      if (oldEmoji && oldEmoji !== emoji) {
        // Replace: remove the old emoji entry, add/update the new one.
        const existingNew = reactions.find((r) => r.emoji === emoji)
        const removed = reactions.filter((r) => r.emoji !== oldEmoji)
        if (existingNew) {
          // Another user already has this emoji — increment count, add us.
          return {
            ...c,
            reactions: removed.map((r) =>
              r.emoji === emoji ? { ...r, count: r.count + 1, mine: true, users: ['You'] } : r
            ),
          }
        } else {
          return { ...c, reactions: [...removed, { emoji, count: 1, mine: true, users: ['You'] }] }
        }
      } else {
        // Toggle: if we have it, remove us; if not, add it.
        const existing = reactions.find((r) => r.emoji === emoji)
        if (existing) {
          const newCount = existing.count - 1
          if (newCount <= 0) {
            return { ...c, reactions: reactions.filter((r) => r.emoji !== emoji) }
          }
          return {
            ...c,
            reactions: reactions.map((r) =>
              r.emoji === emoji
                ? { ...r, count: newCount, mine: false, users: r.users.filter((u: string) => u !== 'You') }
                : r
            ),
          }
        } else {
          return { ...c, reactions: [...reactions, { emoji, count: 1, mine: true, users: ['You'] }] }
        }
      }
    }))

    // API call: include old_emoji only when doing a replacement.
    const body = oldEmoji && oldEmoji !== emoji ? { emoji, old_emoji: oldEmoji } : { emoji }
    const res = await api.post(`/tasks/${taskId}/comments/${commentId}/reactions`, body)
    if (res.reactions != null) {
      setComments((c) => c.map((x) => x.id === commentId ? { ...x, reactions: res.reactions } : x))
    }
  }, [taskId])

  const addSubtask = useCallback(async (title: string) => {
    const res = await api.post(`/tasks/${taskId}/subtasks`, { title })
    if (res.subtask) setSubtasks((s) => [...s, res.subtask])
    return res.subtask
  }, [taskId])

  const updateSubtask = useCallback(async (subtaskId: string | number, partial: { title?: string; done?: boolean; position?: number }) => {
    const res = await api.put(`/tasks/${taskId}/subtasks/${subtaskId}`, partial)
    if (res.subtask) setSubtasks((s) => s.map((x) => x.id === subtaskId ? res.subtask : x))
  }, [taskId])

  const deleteSubtask = useCallback(async (subtaskId: string | number) => {
    await api.delete(`/tasks/${taskId}/subtasks/${subtaskId}`)
    setSubtasks((s) => s.filter((x) => x.id !== subtaskId))
  }, [taskId])

  const uploadAttachment = useCallback(async (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    const token = (typeof window !== 'undefined') ? localStorage.getItem('token') : ''
    const res = await fetch(`/api/tasks/${taskId}/attachments`, {
      method: 'POST',
      headers: token ? { 'Authorization': 'Bearer' + ' ' + token } : {},
      body: fd,
    })
    const j = await res.json()
    if (!res.ok) throw new Error(j?.message || 'Upload failed')
    if (j.attachment) setAttachments((a) => [...a, j.attachment])
    return j.attachment
  }, [taskId])

  const deleteAttachment = useCallback(async (attachmentId: string | number) => {
    await api.delete(`/tasks/${taskId}/attachments/${attachmentId}`)
    setAttachments((a) => a.filter((x) => x.id !== attachmentId))
  }, [taskId])

  return {
    comments, subtasks, attachments, activity, loading,
    refresh: fetchAll,
    addComment, editComment, deleteComment, toggleCommentReaction,
    addSubtask, updateSubtask, deleteSubtask,
    uploadAttachment, deleteAttachment,
  }
}

/* ─── Archived tasks hook ────────────────────────────────────── */

export interface ArchivedTask {
  id: number | string
  project_id: number | string
  column_id: number | string
  column_name: string
  title: string
  priority: Priority
  due_date: string | null
  archived_at: string
  archived_by: number | string | null
  archived_by_name: string | null
  archived_by_email: string | null
  subtask_total: number
  subtask_done: number
  comment_count: number
  attachment_count: number
  assignees: BoardUser[]
  labels: Array<{ id: number | string; name: string; color: string }>
}

/**
 * Hook for the "Archived Tasks" view. Returns the list of archived tasks
 * for a project, plus `restore` and `permanentDelete` actions that the
 * caller wires up to the UI.
 *
 * The active board is NOT touched here — the caller is responsible for
 * calling `useTaskBoard(projectId).refresh()` after a restore so the
 * task reappears in the right column.
 */
export function useArchivedTasks(projectId: string | number) {
  const [tasks, setTasks] = useState<ArchivedTask[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const alive = useRef(true)

  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  const refresh = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    setError(null)
    try {
      const res = await api.get(`/projects/${projectId}/tasks?status=archived&limit=200`)
      if (!alive.current) return
      setTasks((res.tasks || []) as ArchivedTask[])
      setTotal(res.total || 0)
    } catch (e: any) {
      if (!alive.current) return
      setError(e?.message || 'Failed to load archived tasks')
    } finally {
      if (alive.current) setLoading(false)
    }
  }, [projectId])

  const restore = useCallback(async (taskId: string | number) => {
    await api.post(`/tasks/${taskId}/restore`, {})
    setTasks((t) => t.filter((x) => x.id !== taskId))
    setTotal((n) => Math.max(0, n - 1))
  }, [])

  const permanentDelete = useCallback(async (taskId: string | number) => {
    await api.delete(`/tasks/${taskId}/permanent`)
    setTasks((t) => t.filter((x) => x.id !== taskId))
    setTotal((n) => Math.max(0, n - 1))
  }, [])

  return { tasks, total, loading, error, refresh, restore, permanentDelete }
}
