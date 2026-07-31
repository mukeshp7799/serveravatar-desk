'use client'

import { useState } from 'react'
import { MoreVertical, Pencil, Pin, PinOff, Trash2, GripVertical } from 'lucide-react'
import toast from 'react-hot-toast'
import { fmtRelative } from '@/components/project/format'
import MessageComposer from './MessageComposer'
import ReactionBar from './ReactionBar'
import ConfirmDialog from './ConfirmDialog'
import { MESSAGE_CATEGORIES, type ProjectMessage } from '@/types/project'

interface MessageItemProps {
  message: ProjectMessage
  /** When true, render as a draggable pinned-card (no inline edit/delete menu by default). */
  pinned?: boolean
  /** Drag handle props (only attached when pinned). */
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>
  isDragging?: boolean
  onUpdate: (id: ProjectMessage['id'], payload: { title?: string | null; body_html: string; category?: ProjectMessage['category'] }) => Promise<ProjectMessage | null>
  onDelete: (id: ProjectMessage['id']) => Promise<boolean>
  onTogglePin: (id: ProjectMessage['id']) => Promise<ProjectMessage | null>
  onToggleReaction: (id: ProjectMessage['id'], emoji: string, oldEmoji?: string) => Promise<void>
  canMutate: boolean
  /** Current user's display name (used to label "You" in reaction tooltips). */
  currentUserName: string
}

/**
 * Renders a single message: author header, category badge, edited indicator,
 * rich-text body, action menu (edit / pin / delete), reaction bar.
 *
 * Used both for the regular (unpinned) timeline and the pinned-card row.
 * When `pinned` is true, a drag handle is shown and the menu stays open by
 * default (small variation).
 */
export default function MessageItem({
  message, pinned, dragHandleProps, isDragging,
  onUpdate, onDelete, onTogglePin, onToggleReaction, canMutate, currentUserName,
}: MessageItemProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)

  const cat = MESSAGE_CATEGORIES.find((c) => c.value === message.category) || MESSAGE_CATEGORIES[0]

  const handleUpdate = async (bodyHtml: string) => {
    setBusy(true)
    try {
      await onUpdate(message.id, { body_html: bodyHtml, category: message.category })
      setEditing(false)
      toast.success('Message updated')
    } catch (e: any) {
      toast.error(e?.message || 'Failed to update message')
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async () => {
    setBusy(true)
    try {
      await onDelete(message.id)
      toast.success('Message deleted')
    } catch (e: any) {
      toast.error(e?.message || 'Failed to delete message')
    } finally {
      setBusy(false)
      setConfirmDelete(false)
    }
  }

  const handlePin = async () => {
    setBusy(true)
    try {
      const m = await onTogglePin(message.id)
      toast.success(m?.is_pinned ? 'Message pinned' : 'Message unpinned')
    } catch (e: any) {
      toast.error(e?.message || 'Failed to update pin')
    } finally {
      setBusy(false)
      setMenuOpen(false)
    }
  }

  return (
    <>
      <article className={`bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm hover-lift transition ${isDragging ? 'opacity-50 scale-[0.99]' : ''} ${message.is_pinned ? 'border-amber-300 dark:border-amber-700' : ''}`}>
        {/* Header */}
        <header className="px-5 pt-4 pb-3 flex items-start gap-3">
          {pinned && dragHandleProps && (
            <button
              type="button"
              {...dragHandleProps}
              aria-label="Drag to reorder"
              className="w-7 h-7 inline-flex items-center justify-center text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg cursor-grab active:cursor-grabbing bg-transparent border-none"
            >
              <GripVertical size={16} strokeWidth={2.25} />
            </button>
          )}
          {/* Avatar */}
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 text-white text-xs font-bold flex items-center justify-center shrink-0">
            {message.author_initials || (message.author_name || '?').slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{message.author_name}</p>
              {message.is_pinned && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                  <Pin size={9} strokeWidth={2.75} />
                  Pinned
                </span>
              )}
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${cat.badgeCls}`}>
                {cat.label}
              </span>
            </div>
            <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold mt-0.5">
              {fmtRelative(message.created_at)}
              {message.edited_at && <span className="ml-1">· edited</span>}
            </p>
          </div>
          {canMutate && (
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                aria-label="Message actions"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className="w-8 h-8 inline-flex items-center justify-center text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg bg-transparent border-none cursor-pointer"
              >
                <MoreVertical size={16} strokeWidth={2.25} />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} aria-hidden />
                  <div className="absolute right-0 mt-1 w-44 bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-800 z-20 py-1 animate-scale-in">
                    <button
                      type="button"
                      onClick={() => { setEditing(true); setMenuOpen(false) }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 dark:text-gray-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-700 dark:hover:text-indigo-300 transition bg-transparent border-none cursor-pointer"
                    >
                      <Pencil size={12} strokeWidth={2.25} />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={handlePin}
                      disabled={busy}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 dark:text-gray-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-700 dark:hover:text-indigo-300 transition bg-transparent border-none cursor-pointer disabled:opacity-50"
                    >
                      {message.is_pinned ? <PinOff size={12} strokeWidth={2.25} /> : <Pin size={12} strokeWidth={2.25} />}
                      {message.is_pinned ? 'Unpin' : 'Pin to top'}
                    </button>
                    <div className="border-t border-gray-100 dark:border-gray-800 my-1" />
                    <button
                      type="button"
                      onClick={() => { setConfirmDelete(true); setMenuOpen(false) }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-rose-600 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-900/30 transition bg-transparent border-none cursor-pointer"
                    >
                      <Trash2 size={12} strokeWidth={2.25} />
                      Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </header>

        {/* Body */}
        <div className="px-5 pb-4">
          {editing ? (
            <MessageComposer
              initialContent={message.body_html}
              onSubmit={handleUpdate}
              onCancel={() => setEditing(false)}
              submitting={busy}
              submitLabel="Save changes"
              showCancel
            />
          ) : (
            <div
              className="max-h-[240px] overflow-y-auto prose prose-sm dark:prose-invert max-w-none px-3 py-2 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900"
              // Server-sanitises HTML; tiptap output is also constrained.
              dangerouslySetInnerHTML={{ __html: message.body_html }}
            />
          )}
        </div>

        {/* Reactions */}
        {!editing && (
          <div className="px-5 pb-4">
            <ReactionBar reactions={message.reactions} onToggle={(emoji, oldEmoji) => onToggleReaction(message.id, emoji, oldEmoji)} disabled={busy} currentUserName={currentUserName} />
          </div>
        )}
      </article>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this message?"
        description="This will remove the message and all its reactions. This action cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  )
}