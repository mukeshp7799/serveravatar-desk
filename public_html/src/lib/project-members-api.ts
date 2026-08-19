/**
 * Real-API hooks for the Project Team Members feature.
 *
 * Project member management:
 *   - `GET    /api/projects/:id`        — project + members
 *   - `GET    /api/users?status=active` — active users, for the "add existing
 *                                          member" picker
 *   - `POST   /api/projects/:id/members`  — add a member (by userId only)
 *   - `DELETE /api/projects/:id/members/:userId` — remove a member
 *
 * External (email-only) invitations are handled via the invitations API, not here.
 */

'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'

/* ──────────────────────────────────────────────────────────────────
 *  Types — keep in sync with `GET /api/projects/:id` response shape
 * ────────────────────────────────────────────────────────────────── */

export interface ProjectMember {
  /** Row id from project_members table. */
  id: number | string
  /** Foreign key to users.id. */
  user_id: number | string
  /** Display name. Built from first_name + last_name, falls back to email. */
  first_name?: string
  last_name?: string
  email?: string
  /** Optional avatar URL uploaded by the user. */
  avatar_url?: string | null
  /** users.status — always 'active' now (external invites are pending invitations, not placeholder users). */
  user_status?: 'active' | string
  /** Set true for the project owner (matches projects.manager_id). */
  is_owner?: boolean
  /** Free-form role string from project_members.role_in_project. */
  role_in_project?: string | null
  /** Optional department name (joined for richer display). */
  department?: string | null
  /** Same id as user_id, kept for legacy callers. */
  member_user_id?: number | string
}

export interface ProjectInfo {
  id: number | string
  name: string
  description?: string | null
  status?: string
  /** Owner (project manager) user id. */
  manager_id: number | string
  created_at?: string
  updated_at?: string
  archived_at?: string | null
  /** True when the logged-in user can manage team members (project owner OR has projects.manage_members permission). */
  canManageTeam?: boolean
}

export interface ActiveUser {
  id: number | string
  first_name?: string
  last_name?: string
  email?: string
  avatar_url?: string | null
  department?: string | null
}

/* ──────────────────────────────────────────────────────────────────
 *  Helpers
 * ────────────────────────────────────────────────────────────────── */

/** Build "First Last" from the API fields, fall back to email. */
export function memberDisplayName(m: ProjectMember): string {
  const first = (m.first_name || '').trim()
  const last = (m.last_name || '').trim()
  const combined = `${first} ${last}`.trim()
  if (combined) return combined
  return m.email || 'Unknown user'
}

/** First-letter initials (max 2) for an avatar bubble. */
export function memberInitials(m: ProjectMember): string {
  const first = (m.first_name || '').trim()
  const last = (m.last_name || '').trim()
  if (first && last) return (first[0] + last[0]).toUpperCase()
  if (first) return first.slice(0, 2).toUpperCase()
  if (m.email) return m.email.slice(0, 2).toUpperCase()
  return '??'
}

/** Stable color for an avatar bubble. Hash the user id into a small palette. */
export function memberAvatarColor(m: ProjectMember): string {
  // Mirrors the palette used by mock-project-data.ts so existing screens
  // (ProjectHeader member stack, etc.) don't shift when we go live.
  const palette = [
    'bg-indigo-500',
    'bg-emerald-500',
    'bg-amber-500',
    'bg-sky-500',
    'bg-pink-500',
    'bg-violet-500',
    'bg-rose-500',
    'bg-cyan-500',
    'bg-lime-600',
    'bg-orange-500',
  ]
  const seed = Number(m.user_id) || 0
  return palette[seed % palette.length]
}

/* ──────────────────────────────────────────────────────────────────
 *  Hook
 * ────────────────────────────────────────────────────────────────── */

interface UseProjectMembersResult {
  project: ProjectInfo | null
  members: ProjectMember[]
  loading: boolean
  error: string | null
  /** True once at least one fetch completed (success or failure). */
  initialized: boolean
  refetch: () => Promise<void>
  /**
   * Add a member by userId. External invites go through createInvitation() instead.
   */
  addMember: (input: { userId: number | string; roleInProject?: string }) => Promise<ProjectMember | null>
  /** Remove a member. The backend will 400 if you try to remove the owner. */
  removeMember: (userId: number | string) => Promise<boolean>
  /** Leave the project (member removes themselves). */
  leaveProject: () => Promise<boolean>
  /** True for the member row representing the project owner. */
  isOwner: (m: ProjectMember) => boolean
  /** True when the logged-in user can add/remove members (project owner or has projects.manage_members via role). */
  canManageTeam: boolean
}

export function useProjectMembers(projectId: string | number): UseProjectMembersResult {
  const [project, setProject] = useState<ProjectInfo | null>(null)
  const [members, setMembers] = useState<ProjectMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [initialized, setInitialized] = useState(false)

  const refetch = useCallback(async () => {
    setError(null)
    try {
      const res = await api.get(`/projects/${projectId}`)
      const proj = res?.project || null
      const list = Array.isArray(res?.members) ? (res.members as ProjectMember[]) : []
      setProject(proj)
      // Sort: owner first, then alphabetically by name.
      const sorted = [...list].sort((a, b) => {
        if (!!a.is_owner && !b.is_owner) return -1
        if (!a.is_owner && !!b.is_owner) return 1
        return memberDisplayName(a).localeCompare(memberDisplayName(b))
      })
      setMembers(sorted)
    } catch (e: any) {
      setError(e?.message || 'Failed to load members')
    } finally {
      setLoading(false)
      setInitialized(true)
    }
  }, [projectId])

  useEffect(() => {
    refetch()
  }, [refetch])

  // Listen for cross-component project updates (e.g. settings save
  // dispatches a `project:updated` event). Each hook instance is independent,
  // so we use a window event to fan out the update without forcing a reload.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onUpdated = (e: Event) => {
      const ce = e as CustomEvent<{ projectId: string | number }>
      const target = ce.detail?.projectId
      if (target == null || String(target) === String(projectId)) {
        refetch()
      }
    }
    window.addEventListener('project:updated', onUpdated)
    return () => window.removeEventListener('project:updated', onUpdated)
  }, [projectId, refetch])

  const isOwner = useCallback(
    (m: ProjectMember) => {
      if (m.is_owner) return true
      if (project && String(m.user_id) === String(project.manager_id)) return true
      return false
    },
    [project]
  )

  // canManageTeam is computed on the backend (owner OR projects.manage_members global permission).
  // Return project.canManageTeam when available, falling back to false while loading.
  const canManageTeam = project?.canManageTeam ?? false

  const addMember: UseProjectMembersResult['addMember'] = useCallback(
    async ({ userId, roleInProject }) => {
      if (!userId) return null
      try {
        const body: Record<string, unknown> = { userId }
        if (roleInProject) body.roleInProject = roleInProject

        await api.post(`/projects/${projectId}/members`, body)
        await refetch()
        // Notify sibling hook instances (ProjectLayout, dashboard sidebar)
        // so the member count badge updates everywhere without a reload.
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('project:updated', { detail: { projectId: String(projectId) } }))
        }
        return { user_id: userId ?? 0 } as ProjectMember
      } catch (e: any) {
        setError(e?.message || 'Failed to add member')
        return null
      }
    },
    [projectId, refetch]
  )

  const removeMember: UseProjectMembersResult['removeMember'] = useCallback(
    async (userId) => {
      try {
        await api.delete(`/projects/${projectId}/members/${userId}`)
        setMembers((prev) => prev.filter((m) => String(m.user_id) !== String(userId)))
        // Notify sibling hook instances.
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('project:updated', { detail: { projectId: String(projectId) } }))
        }
        return true
      } catch (e: any) {
        setError(e?.message || 'Failed to remove member')
        return false
      }
    },
    [projectId]
  )

  const leaveProject: UseProjectMembersResult['leaveProject'] = useCallback(
    async () => {
      try {
        await api.post(`/projects/${projectId}/leave`)
        // NOTE: intentionally skip refetch() and project:updated dispatch here.
        // After leaving, the user will be redirected away from the project page.
        // Calling refetch() would 403 on requireProjectMember (no longer a member)
        // which triggers token revocation — logging the user out unexpectedly.
        return true
      } catch (e: any) {
        setError(e?.message || 'Failed to leave project')
        return false
      }
    },
    [projectId]
  )

  return useMemo(
    () => ({ project, members, loading, error, initialized, refetch, addMember, removeMember, leaveProject, isOwner, canManageTeam }),
    [project, members, loading, error, initialized, refetch, addMember, removeMember, leaveProject, isOwner, canManageTeam]
  )
}

/* ──────────────────────────────────────────────────────────────────
 *  Active users (for the "add existing user" picker)
 * ────────────────────────────────────────────────────────────────── */

/**
 * Fetch active users from `/api/users?status=active`. The backend's
 * `GET /api/users` already accepts a `status` filter and excludes
 * inactive users from default search results — same contract used
 * elsewhere in the project.
 */
export function useActiveUsers(): { users: ActiveUser[]; loading: boolean; error: string | null } {
  const [users, setUsers] = useState<ActiveUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        // Pass status=active so we only get active registered users.
        const res = await api.get(`/users?status=active&limit=200`)
        const list = Array.isArray(res?.users) ? res.users : Array.isArray(res) ? res : []
        if (!cancelled) setUsers(list as ActiveUser[])
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load users')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [])

  return { users, loading, error }
}
