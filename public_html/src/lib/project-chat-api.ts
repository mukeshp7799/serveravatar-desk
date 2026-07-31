/**
 * Real-API hooks for the Project Chat Board feature.
 *
 * Powers the chat at /projects/[projectId]/chat. Each project has ONE
 * chat (no channels — the message board feature covers pinned/structured
 * updates; chat is purely chronological conversation).
 *
 * Real-time updates are achieved via polling on a configurable interval
 * (default 5s). The `since=<iso>` query parameter tells the backend to
 * only return messages with `updated_at > since`, so the polling loop
 * stays cheap even on busy chats.
 *
 * Uses `api` from `@/lib/api` (shared with the rest of the app) which
 * auto-attaches the JWT bearer token from localStorage.
 */

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import api from '@/lib/api'
import type { Reaction } from '@/types/project'

/* ──────────────────────────────────────────────────────────────────
 * Types — mirror the backend `hydrateMessages` shape exactly.
 * ────────────────────────────────────────────────────────────────── */

export interface ChatAttachment {
  id: number
  file_name: string
  mime_type: string | null
  file_size: number
  is_image: boolean
  /** Backend route that streams the file. The backend re-checks membership
   *  before serving, so this URL is safe to use directly. */
  file_url: string
}

export interface ChatMessage {
  id: number
  project_id: number
  author_id: number
  author_name: string
  author_email: string
  author_avatar: string | null
  author_initials: string
  body: string
  created_at: string
  updated_at: string
  edited_at: string | null
  deleted_at: string | null
  is_mine: boolean
  attachments: ChatAttachment[]
  reactions: Reaction[]
}

export interface UseProjectChatResult {
  messages: ChatMessage[]
  loading: boolean
  error: string | null
  /** Current user display name (for "You" rendering in reaction tooltips). */
  currentUserName: string
  refetch: () => Promise<void>
  send: (body: string) => Promise<ChatMessage | null>
  edit: (id: number, body: string) => Promise<ChatMessage | null>
  remove: (id: number) => Promise<boolean>
  uploadAttachments: (id: number, files: File[]) => Promise<ChatAttachment[] | null>
  toggleReaction: (id: number, emoji: string, oldEmoji?: string) => Promise<Reaction[] | null>
}

/* ──────────────────────────────────────────────────────────────────
 * Hook
 * ────────────────────────────────────────────────────────────────── */

interface UseProjectChatOptions {
  /** Polling interval in ms. Defaults to 5s — small enough to feel
   *  real-time, large enough to keep backend load trivial. */
  pollMs?: number
}

export function useProjectChat(
  projectId: string | number,
  opts: UseProjectChatOptions = {}
): UseProjectChatResult {
  const pollMs = opts.pollMs ?? 5000

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentUserName, setCurrentUserName] = useState('')

  // Track the latest `updated_at` we've seen — used as `since=` for
  // the polling loop so we only fetch what's actually new. This means
  // the polling payload stays tiny even on a chat with thousands of
  // historical messages.
  const lastSeenRef = useRef<string | null>(null)
  // Pause polling while the tab is hidden — saves backend traffic when
  // the user is on a different tab. A `visibilitychange` listener below
  // re-enables polling on focus.
  const visibleRef = useRef<boolean>(
    typeof document === 'undefined' ? true : !document.hidden
  )

  /* ── Fetch helpers ──────────────────────────────────────────── */

  /** Initial load (no `since=`): pulls the most recent ~200 messages. */
  const refetchAll = useCallback(async () => {
    setError(null)
    try {
      const res = await api.get(`/projects/${projectId}/chat`)
      const list: ChatMessage[] = res.messages || []
      setMessages(list)
      // Track the highest updated_at for the polling loop.
      lastSeenRef.current = list.reduce(
        (acc, m) => (acc && acc > m.updated_at ? acc : m.updated_at),
        list[0]?.updated_at || null
      )
    } catch (e: any) {
      setError(e?.message || 'Failed to load chat')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  /** Polling fetch — only messages updated since the last poll. */
  const refetchSince = useCallback(async () => {
    if (!lastSeenRef.current) return
    try {
      const res = await api.get(
        `/projects/${projectId}/chat?since=${encodeURIComponent(lastSeenRef.current)}`
      )
      const incoming: ChatMessage[] = res.messages || []
      if (incoming.length === 0) return
      setMessages((prev) => {
        // Merge by id: incoming wins. New messages go in their created_at
        // order (server returns ASC). Existing messages get their
        // reactions/attachments/body updated if the row was edited or
        // had reactions added.
        const map = new Map<number, ChatMessage>()
        prev.forEach((m) => map.set(m.id, m))
        incoming.forEach((m) => map.set(m.id, m))
        return Array.from(map.values()).sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        )
      })
      lastSeenRef.current = incoming.reduce(
        (acc, m) => (acc && acc > m.updated_at ? acc : m.updated_at),
        lastSeenRef.current!
      )
    } catch (e: any) {
      // Polling failures are non-fatal — keep prior messages, surface error.
      setError(e?.message || 'Failed to refresh chat')
    }
  }, [projectId])

  /* ── Initial load + current user ────────────────────────────── */

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    ;(async () => {
      await refetchAll()
      try {
        const userJson = typeof window !== 'undefined' ? localStorage.getItem('user') : null
        if (userJson) {
          const u = JSON.parse(userJson)
          // The API returns firstName/lastName (camelCase). Some legacy
          // localStorage entries still use first_name/last_name (snake_case)
          // — handle both so the reaction tooltip's "You" filter works.
          const name =
            `${u.firstName || u.first_name || ''} ${u.lastName || u.last_name || ''}`
              .trim() || u.email || ''
          if (!cancelled) setCurrentUserName(name)
        }
      } catch (_) { /* ignore */ }
    })()
    return () => { cancelled = true }
  }, [refetchAll])

  /* ── Polling loop + visibility ──────────────────────────────── */

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const schedule = () => {
      if (cancelled) return
      timer = setTimeout(async () => {
        if (visibleRef.current) {
          await refetchSince()
        }
        schedule()
      }, pollMs)
    }
    schedule()

    const onVis = () => {
      visibleRef.current = !document.hidden
      if (visibleRef.current) {
        // Catch up immediately on focus.
        void refetchSince()
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [pollMs, refetchSince])

  /* ── Public actions ─────────────────────────────────────────── */

  const send = useCallback(
    async (body: string): Promise<ChatMessage | null> => {
      try {
        const res = await api.post(`/projects/${projectId}/chat`, { body })
        const msg: ChatMessage = res.message
        if (msg) {
          setMessages((prev) =>
            [...prev.filter((m) => m.id !== msg.id), msg].sort(
              (a, b) =>
                new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            )
          )
          if (!lastSeenRef.current || lastSeenRef.current < msg.updated_at) {
            lastSeenRef.current = msg.updated_at
          }
        }
        return msg
      } catch (e: any) {
        setError(e?.message || 'Failed to send message')
        return null
      }
    },
    [projectId]
  )

  const edit = useCallback(
    async (id: number, body: string): Promise<ChatMessage | null> => {
      try {
        const res = await api.put(`/projects/${projectId}/chat/${id}`, { body })
        const msg: ChatMessage = res.message
        if (msg) {
          setMessages((prev) => prev.map((m) => (m.id === msg.id ? msg : m)))
          if (!lastSeenRef.current || lastSeenRef.current < msg.updated_at) {
            lastSeenRef.current = msg.updated_at
          }
        }
        return msg
      } catch (e: any) {
        setError(e?.message || 'Failed to edit message')
        return null
      }
    },
    [projectId]
  )

  const remove = useCallback(
    async (id: number): Promise<boolean> => {
      try {
        await api.delete(`/projects/${projectId}/chat/${id}`)
        // Soft-delete: server sets deleted_at; client wipes the body so the
        // user sees a tombstone ("This message was deleted") instead of the
        // original content.
        setMessages((prev) =>
          prev.map((m) =>
            m.id === id
              ? { ...m, deleted_at: new Date().toISOString(), body: '', attachments: [] }
              : m
          )
        )
        return true
      } catch (e: any) {
        setError(e?.message || 'Failed to delete message')
        return false
      }
    },
    [projectId]
  )

  const uploadAttachments = useCallback(
    async (id: number, files: File[]): Promise<ChatAttachment[] | null> => {
      try {
        const form = new FormData()
        files.forEach((f) => form.append('files', f, f.name))
        const token = api.getToken()
        const res = await fetch(`/api/projects/${projectId}/chat/${id}/attachments`, {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          body: form,
        })
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          throw new Error(j?.error || `Upload failed (${res.status})`)
        }
        const json = await res.json()
        const atts: ChatAttachment[] = (json.attachments || []).map((a: any) => ({
          id: a.id,
          file_name: a.file_name,
          mime_type: a.mime_type,
          file_size: a.file_size,
          is_image: typeof a.mime_type === 'string' && a.mime_type.startsWith('image/'),
          // Use the server-provided public URL. The backend stores files under
          // /var/www/seravavatar-hub/uploads/ and exposes them via nginx's
          // /uploads/ alias (no auth — same pattern as documents + tasks).
          file_url: a.file_url || `/uploads/${a.file_name}`,
        }))
        // Patch the message in-place with the new attachments.
        setMessages((prev) =>
          prev.map((m) =>
            m.id === id ? { ...m, attachments: [...m.attachments, ...atts] } : m
          )
        )
        return atts
      } catch (e: any) {
        setError(e?.message || 'Failed to upload attachments')
        return null
      }
    },
    [projectId]
  )

  const toggleReaction = useCallback(
    async (id: number, emoji: string, oldEmoji?: string): Promise<Reaction[] | null> => {
      try {
        const body = oldEmoji ? { emoji, old_emoji: oldEmoji } : { emoji }
        const res = await api.post(`/projects/${projectId}/chat/${id}/reactions`, body)
        const reactions: Reaction[] = res.reactions || []
        setMessages((prev) =>
          prev.map((m) => (m.id === id ? { ...m, reactions } : m))
        )
        return reactions
      } catch (e: any) {
        setError(e?.message || 'Failed to react')
        return null
      }
    },
    [projectId]
  )

  return {
    messages,
    loading,
    error,
    currentUserName,
    refetch: refetchAll,
    send,
    edit,
    remove,
    uploadAttachments,
    toggleReaction,
  }
}
