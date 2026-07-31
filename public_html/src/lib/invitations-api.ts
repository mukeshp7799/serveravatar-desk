/**
 * Invitation API for external project member invitations.
 *
 * Public (no auth):
 *   GET /api/invitations/:token  — fetch invitation details
 *
 * Authenticated:
 *   POST   /api/projects/:id/invitations    — create invitation + send email
 *   GET    /api/projects/:id/invitations     — list invitations for project
 *   PUT    /api/invitations/:id/resend       — resend invitation email
 *   DELETE /api/invitations/:id             — cancel invitation
 *   POST   /api/invitations/:token/accept   — accept invitation
 *   POST   /api/invitations/:token/decline   — decline invitation
 */

'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Invitation {
  id: number
  email: string
  roleInProject: string
  status: 'pending' | 'accepted' | 'declined' | 'cancelled'
  inviterName: string
  inviterEmail: string
  acceptedUserId?: number | null
  acceptedName?: string | null
  expiresAt: string
  isExpired: boolean
  createdAt: string
  updatedAt: string
}

export interface InvitationDetails {
  id: number
  token?: string  // invitation token — present when fetched by-email or by-token
  projectId: number
  projectName: string
  projectDescription?: string | null
  email: string
  roleInProject: string
  inviterName: string
  inviterEmail: string
  status: string
  expiresAt: string
  createdAt: string
}

// ─── API helpers (standalone, outside hooks) ───────────────────────────────────

export async function createInvitation(projectId: string | number, email: string, roleInProject?: string): Promise<any> {
  return api.post(`/projects/${projectId}/invitations`, { email, roleInProject })
}

export async function listInvitations(projectId: string | number): Promise<Invitation[]> {
  const res = await api.get(`/projects/${projectId}/invitations`)
  return res.invitations || []
}

export async function resendInvitation(invitationId: number): Promise<{ previewUrl?: string }> {
  return api.put(`/invitations/${invitationId}/resend`, {})
}

export async function cancelInvitation(invitationId: number): Promise<void> {
  return api.delete(`/invitations/${invitationId}`)
}

export async function fetchInvitationDetails(token: string): Promise<InvitationDetails> {
  const res = await api.get(`/invitations/${token}`)
  return res.invitation
}

export async function acceptInvitation(token: string): Promise<{ projectId: number; projectName: string }> {
  return api.post(`/invitations/${token}/accept`, {})
}

export async function declineInvitation(token: string): Promise<void> {
  return api.post(`/invitations/${token}/decline`, {})
}

// ─── useProjectInvitations hook ───────────────────────────────────────────────

interface UseProjectInvitationsResult {
  invitations: Invitation[]
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
  resend: (id: number) => Promise<boolean>
  cancel: (id: number) => Promise<boolean>
  refreshInvitations: () => Promise<void>
}

export function useProjectInvitations(projectId: string | number): UseProjectInvitationsResult {
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setError(null)
    try {
      const list = await listInvitations(projectId)
      setInvitations(list)
    } catch (e: any) {
      setError(e?.message || 'Failed to load invitations')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    refetch()
  }, [refetch])

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

  const resend = useCallback(async (id: number) => {
    try {
      await resendInvitation(id)
      await refetch()
      return true
    } catch (e: any) {
      setError(e?.message || 'Failed to resend invitation')
      return false
    }
  }, [refetch])

  const cancel = useCallback(async (id: number) => {
    try {
      await cancelInvitation(id)
      setInvitations((prev) => prev.filter((i) => i.id !== id))
      return true
    } catch (e: any) {
      setError(e?.message || 'Failed to cancel invitation')
      return false
    }
  }, [])

  return useMemo(
    () => ({ invitations, loading, error, refetch, resend, cancel, refreshInvitations: refetch }),
    [invitations, loading, error, refetch, resend, cancel]
  )
}

// ─── useInvitationDetails hook ────────────────────────────────────────────────

interface UseInvitationDetailsResult {
  invitation: InvitationDetails | null
  loading: boolean
  error: string | null
  notFound: boolean
}

export function useInvitationDetails(token: string): UseInvitationDetailsResult {
  const [invitation, setInvitation] = useState<InvitationDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!token) return
    let cancelled = false
    const run = async () => {
      try {
        const details = await fetchInvitationDetails(token)
        if (!cancelled) setInvitation(details)
      } catch (e: any) {
        if (!cancelled) {
          if (e?.message?.includes('not found') || e?.message?.includes('404')) {
            setNotFound(true)
          } else {
            setError(e?.message || 'Failed to load invitation')
          }
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [token])

  return { invitation, loading, error, notFound }
}

// Fetch pending invitations for the current user's email (used on the confirmation page)
export async function fetchPendingInvitationsForEmail(email: string): Promise<InvitationDetails[]> {
  const res = await api.get(`/invitations/by-email/${encodeURIComponent(email)}`)
  return res.invitations || []
}

interface UsePendingInvitationsResult {
  invitations: InvitationDetails[]
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

export function usePendingInvitations(email: string | null): UsePendingInvitationsResult {
  const [invitations, setInvitations] = useState<InvitationDetails[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    if (!email) {
      setInvitations([])
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    try {
      const list = await fetchPendingInvitationsForEmail(email)
      if (!cancelled) setInvitations(list)
    } catch (e: any) {
      if (!cancelled) setError(e?.message || 'Failed to load invitations')
    } finally {
      if (!cancelled) setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      await load()
    }
    run()
    return () => { cancelled = true }
  }, [email])

  return { invitations, loading, error, refetch: load }
}

