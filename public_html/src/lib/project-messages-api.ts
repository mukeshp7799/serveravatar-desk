/**
 * Real-API hooks for the Project Message Board feature.
 *
 * Replaces the mock `useMessages` hook in `lib/project-features.ts` with
 * actual REST calls against `/api/projects/:projectId/messages` and
 * `/api/messages/:id`. Every mutation refetches the list so the UI stays
 * in sync with the server (no stale state).
 *
 * Uses `api` from `@/lib/api` (shared with the rest of the app) which
 * auto-attaches the JWT bearer token from localStorage.
 */

'use client'

import { useCallback, useEffect, useState } from 'react'
import api from '@/lib/api'
import type { ProjectMessage } from '@/types/project'

interface UseMessagesResult {
  messages: ProjectMessage[]
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
  create: (payload: { title?: string; body_html: string; category?: ProjectMessage['category'] }) => Promise<ProjectMessage | null>
  update: (id: ProjectMessage['id'], payload: { title?: string | null; body_html: string; category?: ProjectMessage['category'] }) => Promise<ProjectMessage | null>
  remove: (id: ProjectMessage['id']) => Promise<boolean>
  togglePin: (id: ProjectMessage['id']) => Promise<ProjectMessage | null>
  reorderPinned: (ids: ProjectMessage['id'][]) => Promise<boolean>
  toggleReaction: (id: ProjectMessage['id'], emoji: string, oldEmoji?: string) => Promise<Reaction[] | null>
}

interface Reaction {
  emoji: string
  count: number
  mine: boolean
  /** Display names of all users who reacted with this emoji (for tooltip). */
  users: string[]
}

export function useMessages(projectId: string | number): UseMessagesResult {
  const [messages, setMessages] = useState<ProjectMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setError(null)
    try {
      const res = await api.get(`/projects/${projectId}/messages`)
      setMessages(res.messages || [])
    } catch (e: any) {
      setError(e?.message || 'Failed to load messages')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    refetch()
  }, [refetch])

  // Replace a single message in the list (by id) with a fresh object.
  const upsert = (m: ProjectMessage) => {
    setMessages((prev) => {
      const idx = prev.findIndex((x) => String(x.id) === String(m.id))
      if (idx === -1) return [m, ...prev]
      const next = prev.slice()
      next[idx] = m
      return next
    })
  }

  const replaceReactions = (id: ProjectMessage['id'], reactions: Reaction[]) => {
    setMessages((prev) => prev.map((m) => (String(m.id) === String(id) ? { ...m, reactions } : m)))
  }

  const create: UseMessagesResult['create'] = useCallback(async (payload) => {
    try {
      const res = await api.post(`/projects/${projectId}/messages`, payload)
      if (res?.message) {
        upsert(res.message)
        return res.message
      }
      await refetch()
      return null
    } catch (e) {
      throw e
    }
  }, [projectId, refetch])

  const update: UseMessagesResult['update'] = useCallback(async (id, payload) => {
    try {
      const res = await api.put(`/messages/${id}`, payload)
      if (res?.message) {
        upsert(res.message)
        return res.message
      }
      await refetch()
      return null
    } catch (e) { throw e }
  }, [refetch])

  const remove: UseMessagesResult['remove'] = useCallback(async (id) => {
    try {
      await api.delete(`/messages/${id}`)
      setMessages((prev) => prev.filter((m) => String(m.id) !== String(id)))
      return true
    } catch (e) { throw e }
  }, [])

  const togglePin: UseMessagesResult['togglePin'] = useCallback(async (id) => {
    const current = messages.find((m) => String(m.id) === String(id))
    if (!current) return null
    const path = current.is_pinned ? `/messages/${id}/unpin` : `/messages/${id}/pin`
    try {
      const res = await api.post(path, {})
      if (res?.message) {
        // Replace this message, then refetch to get the new sort order
        upsert(res.message)
        await refetch()
        return res.message
      }
      await refetch()
      return null
    } catch (e) { throw e }
  }, [messages, refetch])

  const reorderPinned: UseMessagesResult['reorderPinned'] = useCallback(async (ids) => {
    try {
      await api.put('/messages/pinned-order', { projectId, messageIds: ids })
      await refetch()
      return true
    } catch (e) { throw e }
  }, [projectId, refetch])

  const toggleReaction: UseMessagesResult['toggleReaction'] = useCallback(async (id, emoji, oldEmoji) => {
    try {
      const body = oldEmoji ? { emoji, old_emoji: oldEmoji } : { emoji }
      const res = await api.post(`/messages/${id}/reactions`, body)
      if (Array.isArray(res?.reactions)) {
        replaceReactions(id, res.reactions)
        return res.reactions
      }
      await refetch()
      return null
    } catch (e) { throw e }
  }, [refetch])

  return {
    messages,
    loading,
    error,
    refetch,
    create,
    update,
    remove,
    togglePin,
    reorderPinned,
    toggleReaction,
  }
}