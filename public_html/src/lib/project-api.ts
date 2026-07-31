/**
 * Real-API hooks for the Project Dashboard.
 *
 * Each hook wraps `/api/projects/:id/...` (or top-level endpoints like
 * `/api/documents?projectId=...`) and exposes `{ data, loading, error, refetch }`.
 * The dashboard page calls all 8 hooks in parallel and shows a skeleton
 * per card while loading.
 *
 * Date returned from the API is ISO 8601 UTC; consumers render relative time
 * with `fmtRelative()`.
 */

'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'

/* ──────────────────────────────────────────────────────────────────
 *  Shared hook shape
 * ────────────────────────────────────────────────────────────────── */

interface AsyncResource<T> {
  data: T | null
  loading: boolean
  error: string | null
  /** True once at least one fetch completed (success or failure). */
  initialized: boolean
  refetch: () => Promise<void>
}

/* ──────────────────────────────────────────────────────────────────
 *  Helpers
 * ────────────────────────────────────────────────────────────────── */

function useResource<T>(fetcher: () => Promise<T>, deps: ReadonlyArray<unknown>): AsyncResource<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [initialized, setInitialized] = useState(false)

  const fetcherRef = useMemo(() => fetcher, deps)

  const refetch = useCallback(async () => {
    setError(null)
    try {
      const result = await fetcherRef()
      setData(result)
    } catch (e: any) {
      setError(e?.message || 'Request failed')
    } finally {
      setLoading(false)
      setInitialized(true)
    }
  }, [fetcherRef])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { data, loading, error, initialized, refetch }
}

/* ──────────────────────────────────────────────────────────────────
 *  1. Project + members (one round-trip)
 * ────────────────────────────────────────────────────────────────── */

export interface DashboardProject {
  id: number | string
  name: string
  description: string | null
  status: string
  manager_id: number | string
  start_date?: string | null
  end_date?: string | null
  created_at: string
  updated_at: string
  owner_name?: string | null
  owner_email?: string | null
  owner_initials?: string | null
}

export interface DashboardMember {
  id: number | string
  user_id: number | string
  first_name?: string
  last_name?: string
  email?: string
  avatar_url?: string | null
  user_status?: string
  is_external?: 0 | 1 | boolean
  is_owner?: boolean
  role_in_project?: string | null
  department?: string | null
}

export interface ProjectAndMembersResponse {
  project: DashboardProject | null
  members: DashboardMember[]
}

export function useProjectAndMembers(projectId: string | number): AsyncResource<ProjectAndMembersResponse> {
  return useResource<ProjectAndMembersResponse>(async () => {
    const res = await api.get(`/projects/${projectId}`)
    return {
      project: res?.project || null,
      members: Array.isArray(res?.members) ? res.members : [],
    }
  }, [projectId])
}

/* ──────────────────────────────────────────────────────────────────
 *  2. Messages
 * ────────────────────────────────────────────────────────────────── */

export interface DashboardMessage {
  id: number | string
  author_name: string
  author_initials?: string
  author_avatar?: string | null
  title: string | null
  body_html: string
  category: string
  is_pinned: boolean | number
  created_at: string
  updated_at: string
  edited_at: string | null
}

export function useProjectMessages(projectId: string | number): AsyncResource<DashboardMessage[]> {
  return useResource<DashboardMessage[]>(async () => {
    const res = await api.get(`/projects/${projectId}/messages`)
    return Array.isArray(res?.messages) ? res.messages : []
  }, [projectId])
}

/* ──────────────────────────────────────────────────────────────────
 *  3. To-do lists
 * ────────────────────────────────────────────────────────────────── */

export interface DashboardTodoItem {
  id: number | string
  title: string
  status?: string
  is_completed?: boolean | number
  created_at: string
  updated_at?: string
  assignee_id?: number | string | null
  assignee_name?: string | null
  due_date?: string | null
}

export interface DashboardTodoList {
  id: number | string
  name: string
  color?: string
  position?: number
  created_at: string
  updated_at: string
  items: DashboardTodoItem[]
}

export function useProjectTodos(projectId: string | number): AsyncResource<DashboardTodoList[]> {
  return useResource<DashboardTodoList[]>(async () => {
    const res = await api.get(`/projects/${projectId}/todos`)
    return Array.isArray(res?.lists) ? res.lists : []
  }, [projectId])
}

/* ──────────────────────────────────────────────────────────────────
 *  4. Task board (kanban)
 * ────────────────────────────────────────────────────────────────── */

export interface DashboardTask {
  id: number | string
  title: string
  status?: string
  priority?: string
  assignee_id?: number | string | null
  assignee_name?: string | null
  due_date?: string | null
  updated_at?: string
  created_at: string
}

export interface DashboardTaskColumn {
  id: number | string
  name: string
  position: number
  is_backlog?: boolean | number
  tasks: DashboardTask[]
}

export function useProjectTaskBoard(projectId: string | number): AsyncResource<DashboardTaskColumn[]> {
  return useResource<DashboardTaskColumn[]>(async () => {
    const res = await api.get(`/projects/${projectId}/task-board`)
    return Array.isArray(res?.board) ? res.board : []
  }, [projectId])
}

/* ──────────────────────────────────────────────────────────────────
 *  5. Documents
 * ────────────────────────────────────────────────────────────────── */

export interface DashboardDocument {
  id: number | string
  title: string
  content_html?: string
  kind: 'doc' | 'file'
  file_type?: string | null
  file_size?: number | null
  author_name: string
  author_initials?: string
  created_at: string
  updated_at: string | null
  last_modified: string
  comment_count?: number
}

export function useProjectDocuments(projectId: string | number): AsyncResource<DashboardDocument[]> {
  return useResource<DashboardDocument[]>(async () => {
    const res = await api.get(`/documents?projectId=${projectId}`)
    return Array.isArray(res?.documents) ? res.documents : []
  }, [projectId])
}

/* ──────────────────────────────────────────────────────────────────
 *  6. Schedule
 * ────────────────────────────────────────────────────────────────── */

export interface DashboardEvent {
  id: number | string
  title: string
  description?: string | null
  start_at: string
  end_at?: string | null
  type?: string
  created_at: string
  updated_at?: string
}

export function useProjectSchedule(projectId: string | number): AsyncResource<DashboardEvent[]> {
  return useResource<DashboardEvent[]>(async () => {
    const res = await api.get(`/projects/${projectId}/schedule`)
    return Array.isArray(res?.events) ? res.events : []
  }, [projectId])
}

/* ──────────────────────────────────────────────────────────────────
 *  7. Chat
 * ────────────────────────────────────────────────────────────────── */

export interface DashboardChatMessage {
  id: number | string
  channel: string
  body: string
  author_name: string
  author_initials?: string
  created_at: string
}

export function useProjectChat(projectId: string | number): AsyncResource<DashboardChatMessage[]> {
  return useResource<DashboardChatMessage[]>(async () => {
    const res = await api.get(`/projects/${projectId}/chat`)
    return Array.isArray(res?.messages) ? res.messages : []
  }, [projectId])
}

/* ──────────────────────────────────────────────────────────────────
 *  8. Activity
 * ────────────────────────────────────────────────────────────────── */

export interface DashboardActivity {
  id: number | string
  actor: string
  initials?: string
  avatar?: string | null
  feature: string
  featureLabel?: string
  action: string
  actionVerb?: string
  targetType?: string
  targetId?: number | string
  targetLabel?: string
  meta?: Record<string, unknown>
  timestamp: string
}

export function useProjectActivities(
  projectId: string | number,
  limit = 50,
): AsyncResource<DashboardActivity[]> {
  return useResource<DashboardActivity[]>(async () => {
    const res = await api.get(`/projects/${projectId}/activities?limit=${limit}`)
    return Array.isArray(res?.items) ? res.items : []
  }, [projectId, limit])
}
