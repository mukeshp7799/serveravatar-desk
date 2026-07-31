'use client'

/**
 * /projects/[projectId]/chat
 *
 * Real-time Project Chat Board — WhatsApp-style redesign.
 *
 * Features:
 *   • Send / edit / delete own messages
 *   • File + image attachments (drag & drop, click to pick, or Ctrl+V to paste)
 *   • Click any image to open full-screen lightbox preview
 *   • Emoji picker
 *   • Auto-update every 5s via polling
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import toast from 'react-hot-toast'
import EmojiPicker, { Theme } from 'emoji-picker-react'
import {
  Loader2, Send, Paperclip, X, Pencil, Trash2, MessageSquare,
  FileText, Download, Image as ImageIcon, Upload, Smile,
} from 'lucide-react'
import FeaturePage from '@/components/project/FeaturePage'
import ReactionBar from '@/components/project/ReactionBar'
import ConfirmDialog from '@/components/project/ConfirmDialog'
import { fmtRelative } from '@/components/project/format'
import {
  useProjectChat,
  type ChatMessage,
  type ChatAttachment,
} from '@/lib/project-chat-api'

export default function ChatPage() {
  const params = useParams<{ projectId: string }>()
  const projectId = params.projectId
  const chat = useProjectChat(projectId, { pollMs: 5000 })
  const {
    messages, loading, error, currentUserName,
    send, edit, remove, uploadAttachments, toggleReaction,
  } = chat

  const [draft, setDraft] = useState('')
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([])
  const [sending, setSending] = useState(false)
  const [uploadingFiles, setUploadingFiles] = useState<string[]>([])
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(null)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Scroll container ref
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null)
  const lastCountRef = useRef(0)
  const isInitialLoadRef = useRef(true)
  const userScrolledUpRef = useRef(false)

  /* ── Scroll to bottom on initial load ──────────────────────── */
  useEffect(() => {
    if (!scrollEl || messages.length === 0) return
    scrollEl.scrollTop = scrollEl.scrollHeight
  }, [scrollEl, messages.length])

  /* ── Auto-scroll on new messages ──────────────────────────── */
  useEffect(() => {
    if (!scrollEl || messages.length === 0) return
    const isInitial = isInitialLoadRef.current
    const wasNearBottom =
      scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight < 200
    const hasNew = messages.length !== lastCountRef.current
    if (isInitial || (wasNearBottom && hasNew && !userScrolledUpRef.current)) {
      isInitialLoadRef.current = false
      scrollEl.scrollTo({ top: scrollEl.scrollHeight, behavior: 'smooth' })
    }
    lastCountRef.current = messages.length
  }, [messages, scrollEl])

  /* ── Track user scrolled up ─────────────────────────────────── */
  useEffect(() => {
    if (!scrollEl) return
    const onScroll = () => {
      const nearBottom =
        scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight < 50
      userScrolledUpRef.current = !nearBottom
    }
    scrollEl.addEventListener('scroll', onScroll, { passive: true })
    return () => scrollEl.removeEventListener('scroll', onScroll)
  }, [scrollEl])

  /* ── Auto-resize textarea ────────────────────────────────── */
  const resizeTextarea = useCallback(() => {
    if (!textareaRef.current) return
    textareaRef.current.style.height = 'auto'
    textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px'
  }, [])

  /* ── File change ─────────────────────────────────────────── */
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files || [])
    if (list.length === 0) return
    const withPreviews = list.map((f) => buildPendingFile(f))
    setPendingFiles((p) => [...p, ...withPreviews])
    e.target.value = ''
  }

  /* ── Drag & drop ─────────────────────────────────────────── */
  const [dragging, setDragging] = useState(false)
  const dragCounterRef = useRef(0)
  const onDragEnter = (e: React.DragEvent) => { e.preventDefault(); dragCounterRef.current++; setDragging(true) }
  const onDragLeave = (e: React.DragEvent) => { e.preventDefault(); dragCounterRef.current--; if (dragCounterRef.current === 0) setDragging(false) }
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current = 0
    setDragging(false)
    const files = Array.from(e.dataTransfer.files || [])
    if (files.length > 0) setPendingFiles((p) => [...p, ...files.map((f) => buildPendingFile(f))])
  }

  /* ── Paste ───────────────────────────────────────────────── */
  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData.items || [])
    let hasFiles = false
    const newFiles: PendingFile[] = []
    for (const item of items) {
      if (item.kind === 'file') {
        const file = item.getAsFile()
        if (file) { newFiles.push(buildPendingFile(file)); hasFiles = true }
      }
    }
    if (hasFiles) { e.preventDefault(); if (newFiles.length > 0) setPendingFiles((p) => [...p, ...newFiles]) }
  }

  /* ── Send ───────────────────────────────────────────────── */
  const onSend = async () => {
    const body = draft.trim()
    if (!body && pendingFiles.length === 0) return
    if (sending) return
    setSending(true)
    try {
      const created = await send(body || '(attachment)')
      if (!created) { toast.error('Failed to send message'); return }
      if (pendingFiles.length > 0) {
        setUploadingFiles(pendingFiles.map((f) => f.name))
        const atts = await uploadAttachments(created.id, pendingFiles.map((f) => f.file))
        setUploadingFiles([])
        if (!atts) toast.error('Sent, but attachments failed to upload')
        else if (atts.length !== pendingFiles.length) toast.success(`Sent (${atts.length}/${pendingFiles.length} files)`)
        else toast.success(`Sent with ${atts.length} attachment${atts.length === 1 ? '' : 's'}`)
      } else {
        toast.success('Sent')
      }
      setDraft('')
      setPendingFiles([])
      if (textareaRef.current) { textareaRef.current.style.height = 'auto' }
    } finally {
      setSending(false)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void onSend() }
  }

  /* ── Emoji ──────────────────────────────────────────────── */
  const onEmojiClick = (emoji: string) => {
    setDraft((d) => d + emoji)
    setShowEmojiPicker(false)
    textareaRef.current?.focus()
  }

  /* ── Render ──────────────────────────────────────────────── */
  const activeMsgCount = messages.filter((m) => !m.deleted_at).length

  return (
    <FeaturePage featureKey="chat" title="Project Chat">
      <div className="bg-gray-100 dark:bg-gray-950 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden flex flex-col h-[calc(100vh-220px)] min-h-[480px]">

        {/* Header */}
        <div className="px-4 sm:px-5 py-3 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center gap-2.5 shrink-0">
          <MessageSquare size={16} strokeWidth={2.5} className="text-cyan-600 dark:text-cyan-300" />
          <h3 className="font-bold text-gray-900 dark:text-white text-sm">Project Chat</h3>
          <span className="text-xs text-gray-400 dark:text-gray-500">
            · {messages.length === 0 ? 'no messages yet' : activeMsgCount === 0 ? `${messages.length} deleted` : `${activeMsgCount} message${activeMsgCount === 1 ? '' : 's'}`}
          </span>
          {error && <span className="ml-auto text-xs text-rose-500 truncate max-w-[200px]">{error}</span>}
        </div>

        {/* Message list */}
        <div
          ref={setScrollEl}
          className="flex-1 overflow-y-auto px-3 py-3 space-y-1 scroll-slim"
        >
          {loading && messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-sm text-gray-400 gap-2">
              <Loader2 size={24} className="animate-spin" />
              Loading chat…
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-sm text-gray-400 gap-2">
              <MessageSquare size={32} strokeWidth={2} className="opacity-40" />
              No messages yet. Start the conversation below.
            </div>
          ) : (
            messages.map((m) => (
              <MessageBubble
                key={m.id}
                message={m}
                currentUserName={currentUserName}
                onEdit={async (body) => {
                  const r = await edit(m.id, body)
                  toast.success(r ? 'Updated' : 'Failed to update')
                }}
                onDelete={async () => {
                  const r = await remove(m.id)
                  toast.success(r ? 'Deleted' : 'Failed to delete')
                }}
                onReact={async (emoji, oldEmoji) => {
                  const r = await toggleReaction(m.id, emoji, oldEmoji)
                  if (!r) toast.error('Failed to react')
                }}
                onImageClick={setLightboxUrl}
              />
            ))
          )}
        </div>

        {/* ── Composer ──────────────────────────────────────── */}
        <div
          className={[
            'px-3 py-2.5 pb-3 shrink-0 transition-colors relative',
            dragging ? 'bg-cyan-50 dark:bg-cyan-950' : 'bg-gray-50 dark:bg-gray-900',
          ].join(' ')}
          onDragEnter={onDragEnter}
          onDragLeave={onDragLeave}
          onDragOver={onDragOver}
          onDrop={onDrop}
        >
          {/* Pending attachments — horizontal scroll strip */}
          {pendingFiles.length > 0 && (
            <div className="mb-2 flex gap-2 overflow-x-auto pb-1 scroll-slim">
              {pendingFiles.map((pf, i) => (
                <PendingFileCard
                  key={`${pf.name}-${pf.id}`}
                  pendingFile={pf}
                  onRemove={() => setPendingFiles((p) => p.filter((_, idx) => idx !== i))}
                  onPreview={(url) => setPendingPreviewUrl(url)}
                />
              ))}
            </div>
          )}

          {/* Upload progress */}
          {uploadingFiles.length > 0 && (
            <div className="mb-2 flex flex-col gap-1">
              {uploadingFiles.map((name) => (
                <div key={name} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-cyan-50 dark:bg-cyan-900/20 border border-cyan-200 dark:border-cyan-800">
                  <Upload size={12} className="text-cyan-500 animate-pulse shrink-0" />
                  <span className="text-xs text-cyan-700 dark:text-cyan-300 truncate flex-1">{name}</span>
                  <span className="text-[10px] text-cyan-400 animate-pulse shrink-0">Uploading…</span>
                </div>
              ))}
            </div>
          )}

          {/* Input row — emoji | text | attach | send */}
          <div className="flex items-end gap-1.5">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip"
              className="sr-only"
              onChange={handleFileChange}
              aria-label="Attach files"
            />

            {/* Emoji button */}
            <button
              type="button"
              onClick={() => setShowEmojiPicker((v) => !v)}
              aria-label="Open emoji picker"
              className="shrink-0 w-9 h-9 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-400 hover:text-amber-500 dark:hover:text-amber-400 transition cursor-pointer"
            >
              <Smile size={17} strokeWidth={2} />
            </button>

            {/* Attachment button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={sending}
              aria-label="Attach files"
              className="shrink-0 w-9 h-9 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-400 hover:text-cyan-500 dark:hover:text-cyan-400 transition disabled:opacity-40 cursor-pointer"
            >
              <Paperclip size={17} strokeWidth={2} />
            </button>

            {/* Text input */}
            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={(e) => { setDraft(e.target.value); resizeTextarea() }}
                onKeyDown={onKeyDown}
                onPaste={onPaste}
                rows={1}
                placeholder="Message…"
                className="w-full resize-none px-4 py-2 rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-cyan-400 dark:focus:border-cyan-600 focus:ring-0 text-sm leading-relaxed"
                style={{ minHeight: '36px', maxHeight: '120px' }}
              />
            </div>

            {/* Send button */}
            <button
              type="button"
              onClick={onSend}
              disabled={sending || (draft.trim() === '' && pendingFiles.length === 0)}
              aria-label="Send message"
              className="shrink-0 w-9 h-9 rounded-full bg-cyan-600 hover:bg-cyan-700 active:bg-cyan-800 text-white flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer border-none"
            >
              {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} strokeWidth={2.5} />}
            </button>
          </div>

          {/* Drop hint */}
          {dragging && (
            <div className="mt-2 text-center">
              <span className="text-xs font-semibold text-cyan-600 dark:text-cyan-300 bg-cyan-100 dark:bg-cyan-900/30 px-4 py-1.5 rounded-full border border-cyan-300 dark:border-cyan-700">
                Drop files here to attach
              </span>
            </div>
          )}

          {/* Emoji picker popover */}
          {showEmojiPicker && (
            <div className="absolute bottom-full left-0 mb-2 z-50">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowEmojiPicker(false)}
                  className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-300 flex items-center justify-center z-10 hover:bg-gray-300 dark:hover:bg-gray-600 transition cursor-pointer border-none"
                >
                  <X size={12} strokeWidth={3} />
                </button>
                <EmojiPicker
                  onEmojiClick={(e) => onEmojiClick(e.emoji)}
                  theme={Theme.LIGHT}
                  width={300}
                  height={360}
                  autoFocusSearch={false}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Lightbox — sent images */}
      {lightboxUrl && (
        <ImageLightbox src={lightboxUrl} onClose={() => setLightboxUrl(null)} />
      )}

      {/* Lightbox — pending image previews */}
      {pendingPreviewUrl && (
        <ImageLightbox src={pendingPreviewUrl} onClose={() => setPendingPreviewUrl(null)} />
      )}
    </FeaturePage>
  )
}

/* ──────────────────────────────────────────────────────────────────
 * PendingFile
 * ────────────────────────────────────────────────────────────────── */

interface PendingFile {
  id: string
  name: string
  size: number
  file: File
}

function buildPendingFile(file: File): PendingFile {
  return {
    id: `${file.name}-${file.size}-${Date.now()}`,
    name: file.name,
    size: file.size,
    file,
  }
}

/* ──────────────────────────────────────────────────────────────────
 * PendingFileCard — thumbnail card in composer strip
 * ────────────────────────────────────────────────────────────────── */

function PendingFileCard({
  pendingFile: pf,
  onRemove,
  onPreview,
}: {
  pendingFile: PendingFile
  onRemove: () => void
  onPreview: (url: string) => void
}) {
  const isImage = pf.file.type.startsWith('image/')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!isImage) return
    const reader = new FileReader()
    reader.onload = (e) => setPreviewUrl(e.target?.result as string | null)
    reader.readAsDataURL(pf.file)
  }, [pf.file, isImage])

  return (
    <div className="shrink-0 w-20 h-20 rounded-2xl relative group bg-gray-100 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 overflow-visible">
      {/* Thumbnail */}
      {isImage && previewUrl ? (
        <button
          type="button"
          onClick={() => onPreview(previewUrl)}
          className="w-full h-full bg-transparent border-none cursor-pointer p-0 relative"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl} alt={pf.name} className="w-full h-full object-cover" />
          {/* Hover overlay */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 flex items-center justify-center transition-all rounded-2xl">
            <ImageIcon size={18} strokeWidth={2.5} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </button>
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <FileText size={22} strokeWidth={1.75} className="text-gray-400" />
        </div>
      )}

      {/* Remove button — always visible, outside the image area */}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${pf.name}`}
        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-rose-500 text-white flex items-center justify-center z-20 transition-opacity shadow-md cursor-pointer border-none hover:bg-rose-600"
      >
        <X size={10} strokeWidth={3} />
      </button>

      {/* Filename tooltip */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-1 py-1">
        <p className="text-[9px] text-white truncate leading-tight">{pf.name}</p>
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────
 * MessageBubble — WhatsApp-style bubbles
 * ────────────────────────────────────────────────────────────────── */

function MessageBubble({
  message,
  currentUserName,
  onEdit,
  onDelete,
  onReact,
  onImageClick,
}: {
  message: ChatMessage
  currentUserName: string
  onEdit: (body: string) => Promise<void>
  onDelete: () => Promise<void>
  onReact: (emoji: string, oldEmoji?: string) => Promise<void>
  onImageClick: (url: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draftBody, setDraftBody] = useState(message.body)
  const [confirmDel, setConfirmDel] = useState(false)

  const isMine = message.is_mine
  const isDeleted = !!message.deleted_at

  useEffect(() => {
    if (!editing) setDraftBody(message.body)
  }, [message.body, editing])

  return (
    <div className={`flex ${isMine ? 'justify-end' : 'justify-start'} animate-msg-in`}>

      {/* ── My message bubble ──────────────────────────────── */}
      {isMine && !isDeleted && !editing && (
        <div className="max-w-[75%] flex flex-col items-end gap-0.5">
          {/* Bubble */}
          <div className="bg-cyan-500 text-white px-3.5 py-2 rounded-2xl rounded-br-md shadow-sm">
            {message.body && message.body !== '(attachment)' && (
              <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">{message.body}</p>
            )}
          </div>
          {/* Inline attachments */}
          {message.attachments.length > 0 && (
            <div className="mt-1 flex flex-col gap-1.5 w-full">
              {message.attachments.map((a) => (
                <SentImageCard key={a.id} attachment={a} onImageClick={onImageClick} />
              ))}
            </div>
          )}
          {/* Reactions + actions */}
          <div className={`flex items-center gap-1.5 mt-0.5 ${message.reactions.length > 0 ? '' : ''}`}>
            <ReactionBar reactions={message.reactions} onToggle={onReact} currentUserName={currentUserName} />
            {isMine && !editing && (
              <>
                <button type="button" onClick={() => setEditing(true)} aria-label="Edit"
                  className="w-6 h-6 flex items-center justify-center rounded-full text-gray-400 hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition cursor-pointer bg-transparent border-none">
                  <Pencil size={11} strokeWidth={2.5} />
                </button>
                <button type="button" onClick={() => setConfirmDel(true)} aria-label="Delete"
                  className="w-6 h-6 flex items-center justify-center rounded-full text-gray-400 hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition cursor-pointer bg-transparent border-none">
                  <Trash2 size={11} strokeWidth={2.5} />
                </button>
              </>
            )}
          </div>
          {message.edited_at && (
            <span className="text-[9px] text-gray-400">edited</span>
          )}
        </div>
      )}

      {/* ── Others' message bubble ─────────────────────────── */}
      {!isMine && !isDeleted && !editing && (
        <div className="max-w-[75%] flex flex-col items-start gap-0.5">
          <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 ml-1 mb-0.5">{message.author_name}</span>
          {/* Bubble */}
          <div className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3.5 py-2 rounded-2xl rounded-bl-md shadow-sm border border-gray-100 dark:border-gray-700">
            {message.body && message.body !== '(attachment)' && (
              <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">{message.body}</p>
            )}
          </div>
          {/* Inline attachments */}
          {message.attachments.length > 0 && (
            <div className="mt-1 flex flex-col gap-1.5 w-full">
              {message.attachments.map((a) => (
                <SentImageCard key={a.id} attachment={a} onImageClick={onImageClick} />
              ))}
            </div>
          )}
          {/* Reactions + actions */}
          <div className="flex items-center gap-1.5 mt-0.5">
            <ReactionBar reactions={message.reactions} onToggle={onReact} currentUserName={currentUserName} />
            {isMine && !editing && (
              <>
                <button type="button" onClick={() => setEditing(true)} aria-label="Edit"
                  className="w-6 h-6 flex items-center justify-center rounded-full text-gray-400 hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition cursor-pointer bg-transparent border-none">
                  <Pencil size={11} strokeWidth={2.5} />
                </button>
                <button type="button" onClick={() => setConfirmDel(true)} aria-label="Delete"
                  className="w-6 h-6 flex items-center justify-center rounded-full text-gray-400 hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition cursor-pointer bg-transparent border-none">
                  <Trash2 size={11} strokeWidth={2.5} />
                </button>
              </>
            )}
          </div>
          {message.edited_at && (
            <span className="text-[9px] text-gray-400">edited</span>
          )}
        </div>
      )}

      {/* ── Editing mode ───────────────────────────────────── */}
      {editing && (
        <div className="max-w-[75%] bg-white dark:bg-gray-800 border border-cyan-400 dark:border-cyan-600 rounded-2xl px-4 py-3 shadow-sm">
          <textarea
            value={draftBody}
            onChange={(e) => setDraftBody(e.target.value)}
            rows={2}
            autoFocus
            className="w-full resize-none bg-transparent text-sm text-gray-900 dark:text-white focus:outline-none"
          />
          <div className="flex gap-2 justify-end mt-2">
            <button type="button" onClick={() => { setEditing(false); setDraftBody(message.body) }}
              className="px-3 py-1.5 text-xs font-semibold text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 cursor-pointer bg-transparent border-none">
              Cancel
            </button>
            <button type="button" onClick={async () => {
              const b = draftBody.trim()
              if (!b || b === message.body) { setEditing(false); return }
              await onEdit(b)
              setEditing(false)
            }}
              className="px-3 py-1.5 text-xs font-bold text-white bg-cyan-600 hover:bg-cyan-700 rounded-full cursor-pointer border-none">
              Save
            </button>
          </div>
        </div>
      )}

      {/* ── Deleted message ────────────────────────────────── */}
      {isDeleted && (
        <div className="text-xs italic text-gray-400 dark:text-gray-500 px-3 py-1.5 bg-gray-100 dark:bg-gray-800/50 rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
          This message was deleted
        </div>
      )}

      <ConfirmDialog
        open={confirmDel}
        title="Delete this message?"
        description="This can't be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => { setConfirmDel(false); await onDelete() }}
        onCancel={() => setConfirmDel(false)}
      />
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────
 * SentImageCard — individual clickable image card in a message
 * ────────────────────────────────────────────────────────────────── */

function SentImageCard({
  attachment,
  onImageClick,
}: {
  attachment: ChatAttachment
  onImageClick: (url: string) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onImageClick(attachment.file_url)}
      className="w-full max-w-[240px] rounded-2xl overflow-hidden bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-cyan-400 dark:hover:border-cyan-600 transition cursor-pointer text-left"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={attachment.file_url}
        alt={attachment.file_name}
        className="w-full object-cover"
        style={{ height: '180px' }}
        loading="lazy"
      />
      <div className="px-2.5 py-1.5 flex items-center gap-1.5">
        <FileText size={11} strokeWidth={2} className="text-gray-400 shrink-0" />
        <span className="text-[10px] text-gray-500 dark:text-gray-400 truncate flex-1">{attachment.file_name}</span>
        <span className="text-[9px] text-gray-400 shrink-0">{formatBytes(attachment.file_size)}</span>
      </div>
    </button>
  )
}

/* ──────────────────────────────────────────────────────────────────
 * ImageLightbox — full-screen image viewer
 * ────────────────────────────────────────────────────────────────── */

function ImageLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[9999] bg-black/95 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Image viewer"
    >
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClose() }}
        aria-label="Close"
        className="absolute top-4 right-4 z-10 w-11 h-11 rounded-full bg-white/10 hover:bg-white/25 text-white flex items-center justify-center transition border-none cursor-pointer"
      >
        <X size={20} strokeWidth={2.5} />
      </button>
      <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/30 text-xs">Press Esc or click backdrop to close</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        onClick={(e) => e.stopPropagation()}
        alt="Full screen"
        className="max-w-[94vw] max-h-[88vh] object-contain rounded-2xl shadow-2xl"
      />
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────
 * Helpers
 * ────────────────────────────────────────────────────────────────── */

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
