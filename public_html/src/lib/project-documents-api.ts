/**
 * Real-API hooks for the Project Files & Documents feature.
 *
 * Replaces the mock `useFiles` hook in `lib/project-features.ts` with actual
 * REST calls against `/api/documents`. The server treats rich-text docs and
 * uploaded files as the same resource (`kind: 'doc' | 'file'`) so we surface
 * both from one list.
 *
 * Comments + reactions are per-document; we expose convenience helpers that
 * take the document id and POST/PUT/DELETE as appropriate.
 *
 * Mutations either upsert the document in the local list (so the UI updates
 * instantly without a full refetch) or refetch on demand — both are fine.
 */

'use client'

import { useCallback, useEffect, useState } from 'react'
import api from '@/lib/api'
import type { Document, DocumentComment, DocumentReaction, Reaction } from '@/types/project'

interface UseDocumentsResult {
  documents: Document[]
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
  create: (payload: { title: string; content_html: string }) => Promise<Document | null>
  update: (id: Document['id'], payload: { title?: string; content_html?: string }) => Promise<Document | null>
  remove: (id: Document['id']) => Promise<boolean>
  upload: (file: File) => Promise<Document | null>
  toggleReaction: (id: Document['id'], emoji: string, oldEmoji?: string) => Promise<DocumentReaction[] | null>
}

export function useDocuments(projectId: string | number): UseDocumentsResult {
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setError(null)
    try {
      const res = await api.get(`/documents?projectId=${projectId}`)
      setDocuments(res.documents || [])
    } catch (e: any) {
      setError(e?.message || 'Failed to load documents')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    refetch()
  }, [refetch])

  const upsert = (d: Document) => {
    setDocuments((prev) => {
      const idx = prev.findIndex((x) => String(x.id) === String(d.id))
      if (idx === -1) return [d, ...prev]
      const next = prev.slice()
      next[idx] = d
      return next
    })
  }

  const replaceReactions = (id: Document['id'], reactions: DocumentReaction[]) => {
    setDocuments((prev) => prev.map((d) => (String(d.id) === String(id) ? { ...d, reactions } : d)))
  }

  const create: UseDocumentsResult['create'] = useCallback(async (payload) => {
    try {
      const res = await api.post('/documents', { ...payload, project_id: projectId })
      if (res?.document) {
        upsert(res.document)
        return res.document
      }
      await refetch()
      return null
    } catch (e) { throw e }
  }, [projectId, refetch])

  const update: UseDocumentsResult['update'] = useCallback(async (id, payload) => {
    try {
      const res = await api.put(`/documents/${id}`, payload)
      if (res?.document) {
        upsert(res.document)
        return res.document
      }
      await refetch()
      return null
    } catch (e) { throw e }
  }, [refetch])

  const remove: UseDocumentsResult['remove'] = useCallback(async (id) => {
    try {
      await api.delete(`/documents/${id}`)
      setDocuments((prev) => prev.filter((d) => String(d.id) !== String(id)))
      return true
    } catch (e) { throw e }
  }, [])

  /** Upload a file as multipart/form-data. Uses raw fetch because `api.ts`
   *  always sets Content-Type: application/json. */
  const upload: UseDocumentsResult['upload'] = useCallback(async (file) => {
    const fd = new FormData()
    fd.append('file', file)
    if (projectId) fd.append('projectId', String(projectId))
    try {
      const token = api.getToken()
      const lang = (typeof window !== 'undefined' && (window.localStorage.getItem('i18nextLng') || 'en').split('-')[0]) || 'en'
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || '/api'}/documents/upload?lang=${lang}`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || `Upload failed (${res.status})`)
      if (data?.document) {
        upsert(data.document)
        return data.document
      }
      await refetch()
      return null
    } catch (e) { throw e }
  }, [projectId, refetch])

  const toggleReaction: UseDocumentsResult['toggleReaction'] = useCallback(async (id, emoji, oldEmoji) => {
    try {
      const body = oldEmoji ? { emoji, old_emoji: oldEmoji } : { emoji }
      const res = await api.post(`/documents/${id}/reactions`, body)
      if (Array.isArray(res?.reactions)) {
        replaceReactions(id, res.reactions)
        return res.reactions
      }
      await refetch()
      return null
    } catch (e) { throw e }
  }, [refetch])

  return { documents, loading, error, refetch, create, update, remove, upload, toggleReaction }
}

/* ─── Per-document comments hook ─── */

interface UseCommentsResult {
  comments: DocumentComment[]
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
  add: (body: string) => Promise<DocumentComment | null>
  edit: (commentId: DocumentComment['id'], body: string) => Promise<DocumentComment | null>
  remove: (commentId: DocumentComment['id']) => Promise<boolean>
  /** Toggle (or replace) a reaction. Pass `oldEmoji` to switch from a different emoji atomically. */
  toggleReaction: (commentId: DocumentComment['id'], emoji: string, oldEmoji?: string) => Promise<void>
}

export function useComments(documentId: Document['id'] | null): UseCommentsResult {
  const [comments, setComments] = useState<DocumentComment[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    if (!documentId) { setComments([]); return }
    setLoading(true); setError(null)
    try {
      const res = await api.get(`/documents/${documentId}/comments`)
      setComments(res.comments || [])
    } catch (e: any) {
      setError(e?.message || 'Failed to load comments')
    } finally {
      setLoading(false)
    }
  }, [documentId])

  useEffect(() => { refetch() }, [refetch])

  const add: UseCommentsResult['add'] = useCallback(async (body) => {
    if (!documentId) return null
    try {
      const res = await api.post(`/documents/${documentId}/comments`, { body })
      if (res?.comment) {
        setComments((prev) => [...prev, res.comment])
        return res.comment
      }
      await refetch()
      return null
    } catch (e) { throw e }
  }, [documentId, refetch])

  const edit: UseCommentsResult['edit'] = useCallback(async (commentId, body) => {
    if (!documentId) return null
    try {
      const res = await api.put(`/documents/${documentId}/comments/${commentId}`, { body })
      if (res?.comment) {
        setComments((prev) => prev.map((c) => (String(c.id) === String(commentId) ? res.comment : c)))
        return res.comment
      }
      await refetch()
      return null
    } catch (e) { throw e }
  }, [documentId, refetch])

  const remove: UseCommentsResult['remove'] = useCallback(async (commentId) => {
    if (!documentId) return false
    try {
      await api.delete(`/documents/${documentId}/comments/${commentId}`)
      setComments((prev) => prev.filter((c) => String(c.id) !== String(commentId)))
      return true
    } catch (e) { throw e }
  }, [documentId])

  // Toggle or replace a reaction on a document comment.
  // When oldEmoji is provided the backend treats it as a replacement.
  const toggleReaction = useCallback(async (commentId: DocumentComment['id'], emoji: string, oldEmoji?: string) => {
    if (!documentId) return
    try {
      // Optimistic update.
      setComments((prev) => prev.map((c) => {
        if (String(c.id) !== String(commentId)) return c
        const reactions = [...(c.reactions || [])]

        if (oldEmoji && oldEmoji === emoji) {
          // REMOVE: user clicked their own reaction chip to remove it.
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
                  ? { ...r, count: newCount, mine: false, users: r.users.filter((u) => u !== 'You') }
                  : r
              ),
            }
          }
        } else {
          // ADD: add new emoji reaction (can have multiple reactions per user).
          const existing = reactions.find((r) => r.emoji === emoji)
          if (existing) {
            // Another user already reacted with this emoji — add our name to the group.
            return {
              ...c,
              reactions: reactions.map((r) =>
                r.emoji === emoji
                  ? { ...r, count: r.count + 1, mine: true, users: [...r.users, 'You'] }
                  : r
              ),
            }
          }
          return { ...c, reactions: [...reactions, { emoji, count: 1, mine: true, users: ['You'] }] }
        }
      }))

      // If oldEmoji === emoji → REMOVE (DELETE). Otherwise → ADD (POST).
      if (oldEmoji && oldEmoji === emoji) {
        const res = await api.delete(`/documents/${documentId}/comments/${commentId}/reactions`, { emoji })
        if (res?.reactions != null) {
          setComments((prev) => prev.map((c) => String(c.id) === String(commentId) ? { ...c, reactions: res.reactions } : c))
        }
      } else {
        const res = await api.post(`/documents/${documentId}/comments/${commentId}/reactions`, { emoji })
        if (res?.reactions != null) {
          setComments((prev) => prev.map((c) => String(c.id) === String(commentId) ? { ...c, reactions: res.reactions } : c))
        }
      }
    } catch (e: any) { throw new Error(e?.message || 'Failed to toggle reaction') }
  }, [documentId])

  return { comments, loading, error, refetch, add, edit, remove, toggleReaction }
}
