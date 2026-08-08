'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import toast from 'react-hot-toast'
import { Loader2, MessageSquare, Pin, Plus } from 'lucide-react'
import FeaturePage from '@/components/project/FeaturePage'
import EmptyState from '@/components/project/EmptyState'
import MessageComposer from '@/components/project/MessageComposer'
import MessageItem from '@/components/project/MessageItem'
import PinnedSortableList from '@/components/project/PinnedSortableList'
import { useMessages } from '@/lib/project-messages-api'
import type { ProjectMessage } from '@/types/project'

/**
 * /projects/[projectId]/message-board
 *
 * Real API-backed message board:
 *   - List: GET /api/projects/:projectId/messages (pinned first)
 *   - Create / Edit / Delete / Pin / Unpin / Reorder pinned / React
 *   - Lenient membership: anyone authed can read; only project members can write
 *     (project owner is always allowed too — mirrors the backend isProjectMember check)
 *
 * UI contract:
 *   - Pinned section at the top with drag-and-drop reorder (dnd-kit)
 *   - Unpinned list below in newest-first order
 *   - No page reloads; list refetches after each mutation; toast on success/error
 */
export default function MessageBoardPage() {
  const params = useParams<{ projectId: string }>()
  const projectId = params.projectId
  const api = useMessages(projectId)

  const [showCompose, setShowCompose] = useState(false)
  const [creating, setCreating] = useState(false)
  const [category, setCategory] = useState<ProjectMessage['category']>('update')
  const [title, setTitle] = useState('')

  // Derive current user + is-member from localStorage (set by auth layout)
  const currentUserId = (() => {
    if (typeof window === 'undefined') return null
    try { return (JSON.parse(localStorage.getItem('user') || '{}') as any)?.id ?? null } catch { return null }
  })()
  // Same source as currentUserId — we just need the display name so the
  // reaction tooltip can replace the current user's name with "You".
  // Falls back to email or "You" if localStorage hasn't been populated yet.
  // The auth layout stores the user with camelCase keys (firstName, lastName)
  // — NOT the snake_case used by the API. Match both for safety.
  const currentUserName = (() => {
    if (typeof window === 'undefined') return 'You'
    try {
      const u = JSON.parse(localStorage.getItem('user') || '{}') as any
      const name = [u?.firstName ?? u?.first_name, u?.lastName ?? u?.last_name]
        .filter(Boolean)
        .join(' ')
        .trim()
      return name || u?.email || 'You'
    } catch { return 'You' }
  })()
  // Lenient membership: owner is always allowed; everyone else can read.
  // For write actions the backend enforces membership; here we optimistically
  // allow writes for the project owner (we don't fetch the membership list).
  const isOwner = (() => {
    if (typeof window === 'undefined') return false
    // ownerId lives in the project summary; we don't have it here, so default true.
    // The backend will reject unauthorised writes with 403, surfaced as a toast.
    return false
  })()
  const canMutate = true // The backend enforces — we always show UI; 403s surface as toasts.

  const pinned = api.messages.filter((m) => m.is_pinned).sort((a, b) => (a.pin_order ?? 0) - (b.pin_order ?? 0))
  const unpinned = api.messages.filter((m) => !m.is_pinned)

  const handleCreate = async (bodyHtml: string) => {
    setCreating(true)
    try {
      await api.create({
        title: title.trim() || undefined,
        body_html: bodyHtml,
        category,
      })
      setShowCompose(false)
      setTitle('')
      setCategory('update')
      toast.success('Message posted')
    } catch (e: any) {
      toast.error(e?.message || 'Failed to post message')
    } finally {
      setCreating(false)
    }
  }

  const handleToggleReaction = async (id: ProjectMessage['id'], emoji: string, oldEmoji?: string) => {
    try {
      await api.toggleReaction(id, emoji, oldEmoji)
    } catch (e: any) {
      toast.error(e?.message || 'Failed to update reaction')
    }
  }

  const handleUpdate = async (id: ProjectMessage['id'], payload: Parameters<typeof api.update>[1]) => {
    return api.update(id, payload)
  }

  const handleDelete = async (id: ProjectMessage['id']) => {
    return api.remove(id)
  }

  const handleTogglePin = async (id: ProjectMessage['id']) => {
    return api.togglePin(id)
  }

  const handleReorder = async (ids: (string | number)[]) => {
    return api.reorderPinned(ids)
  }

  return (
    <FeaturePage featureKey="message-board" title="Message Board">
      <div className="space-y-4">
        {/* Toolbar */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white">Project messages</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {api.messages.length} total · {pinned.length} pinned
              {api.error && <span className="ml-2 text-rose-600 dark:text-rose-300 font-semibold">· {api.error}</span>}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCompose((v) => !v)}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow border-none cursor-pointer"
          >
            {showCompose ? 'Close' : <><Plus size={14} strokeWidth={2.5} /> New message</>}
          </button>
        </div>

        {/* Composer */}
        {showCompose && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-indigo-200 dark:border-indigo-800 shadow-sm p-4 space-y-3 animate-fade-in-up">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Title (optional)"
                className="flex-1 min-w-[200px] px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900"
              />
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ProjectMessage['category'])}
                className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:border-indigo-500"
              >
                <option value="update">Update</option>
                <option value="discussion">Discussion</option>
                <option value="question">Question</option>
                <option value="announcement">Announcement</option>
              </select>
            </div>
            <MessageComposer
              onSubmit={handleCreate}
              submitting={creating}
              onCancel={() => setShowCompose(false)}
            />
          </div>
        )}

        {/* List */}
        {api.loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 space-y-3 animate-pulse">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full bg-gray-200 dark:bg-gray-800" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-1/3 bg-gray-200 dark:bg-gray-800 rounded" />
                    <div className="h-2.5 w-1/4 bg-gray-200 dark:bg-gray-800 rounded" />
                  </div>
                </div>
                <div className="h-3 w-full bg-gray-200 dark:bg-gray-800 rounded" />
                <div className="h-3 w-2/3 bg-gray-200 dark:bg-gray-800 rounded" />
              </div>
            ))}
          </div>
        ) : api.messages.length === 0 ? (
          <EmptyState
            iconName="MessageSquare"
            title="No messages yet"
            description="Start a thread — post an update, ask a question, or announce something to the team."
            actionLabel="Write the first message"
            onAction={() => setShowCompose(true)}
          />
        ) : (
          <>
            {/* Pinned (draggable) */}
            <PinnedSortableList
              messages={pinned}
              onReorder={handleReorder}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
              onTogglePin={handleTogglePin}
              onToggleReaction={handleToggleReaction}
              canMutate={canMutate}
              currentUserName={currentUserName}
            />

            {/* Unpinned (chronological) */}
            {unpinned.length > 0 && (
              <section>
                {pinned.length > 0 && (
                  <div className="flex items-center gap-2 mb-3 mt-6">
                    <span className="text-xs uppercase tracking-wider font-bold text-gray-500 dark:text-gray-400">All messages</span>
                    <span className="text-xs text-gray-400 dark:text-gray-500">· {unpinned.length}</span>
                  </div>
                )}
                <div className="space-y-3">
                  {unpinned.map((m) => (
                    <MessageItem
                      key={String(m.id)}
                      message={m}
                      onUpdate={handleUpdate}
                      onDelete={handleDelete}
                      onTogglePin={handleTogglePin}
                      onToggleReaction={handleToggleReaction}
                      canMutate={canMutate}
                      currentUserName={currentUserName}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </FeaturePage>
  )
}