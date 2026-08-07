'use client'

/**
 * /projects/[projectId]/chat
 *
 * Real-time Project Chat — WhatsApp Web UI Style
 *
 * WhatsApp-inspired design:
 *   • Warm beige chat background (#efeae2)
 *   • Outgoing (is_mine): right-aligned, light-green bubble (#d9fdda), dark green text
 *   • Incoming: left-aligned, white bubble, dark gray text
 *   • Very rounded bubble corners (WhatsApp-style: ~18px radius)
 *   • Compact bubble padding — bubble auto-sizes to content
 *   • Timestamp inside bubble, bottom-right, small gray
 *   • Sender name above bubble (incoming only), small gray
 *   • Small avatar circle inside bubble (incoming only)
 *   • Max bubble width 320px (auto-size to content)
 *   • Smooth styled scrollbar
 */

import { useEffect, useRef, useState } from 'react'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB per file
import { useParams } from 'next/navigation'
import toast from 'react-hot-toast'
import EmojiPicker, { Theme } from 'emoji-picker-react'
import {
  Loader2, Send, Paperclip, X, Pencil, Trash2, MessageSquare,
  FileText, Image as ImageIcon, Upload, Smile,
} from 'lucide-react'
import FeaturePage from '@/components/project/FeaturePage'
import ReactionBar from '@/components/project/ReactionBar'
import ConfirmDialog from '@/components/project/ConfirmDialog'
import {
  useProjectChat,
  type ChatMessage,
  type ChatAttachment,
} from '@/lib/project-chat-api'
import MentionInput from '@/components/MentionInput'
import type { ActiveMember } from '@/components/MentionInput'
import api from '@/lib/api'

/* ──────────────────────────────────────────────────────────────────
 * Helpers
 * ────────────────────────────────────────────────────────────────── */

function msgTime(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function isSameGroup(a: ChatMessage, b: ChatMessage): boolean {
  return a.is_mine === b.is_mine && a.author_id === b.author_id
}

const AVATAR_COLORS = [
  'bg-indigo-500', 'bg-emerald-500', 'bg-amber-500',
  'bg-sky-500', 'bg-pink-500', 'bg-violet-500',
  'bg-rose-500', 'bg-cyan-500', 'bg-lime-600', 'bg-orange-500',
]
function msgAvatarColor(msg: ChatMessage): string {
  const seed = msg.author_id ?? msg.author_name?.charCodeAt(0) ?? 0
  return AVATAR_COLORS[Number(seed) % AVATAR_COLORS.length]
}
function msgInitials(msg: ChatMessage): string {
  const parts = (msg.author_name ?? '??').split(' ')
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return parts[0].slice(0, 2).toUpperCase()
}

/* ──────────────────────────────────────────────────────────────────
 * IncomingBubble — white bubble, left-aligned, WhatsApp-style
 * Structure: [avatar] [name]
 *            [bubble with text+timestamp]
 * ────────────────────────────────────────────────────────────────── */

function IncomingBubble({
  msg,
  currentUserName,
  onEdit,
  onDelete,
  onReact,
  onImageClick,
}: {
  msg: ChatMessage; currentUserName: string
  onEdit: (id: number, body: string) => Promise<void>
  onDelete: (id: number) => Promise<void>
  onReact: (id: number, emoji: string, oldEmoji?: string) => Promise<void>
  onImageClick: (url: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draftBody, setDraftBody] = useState(msg.body)
  const [confirmDel, setConfirmDel] = useState(false)
  const isDeleted = !!msg.deleted_at

  useEffect(() => {
    if (!editing) setDraftBody(msg.body)
  }, [msg.body, editing])

  if (isDeleted) {
    return (
      <div className="max-w-[70%] text-xs italic text-gray-400 dark:text-gray-500 px-3 py-2 bg-white/60 dark:bg-gray-800/60 rounded-[18px] rounded-bl-sm">
        This message was deleted
      </div>
    )
  }

  if (editing) {
    return (
      <div className="max-w-[70%] bg-white dark:bg-gray-800 border-2 border-cyan-400 dark:border-cyan-600 rounded-[18px] px-4 py-3 shadow-sm">
        <textarea value={draftBody} onChange={(e) => setDraftBody(e.target.value)}
          rows={2} autoFocus
          className="w-full resize-none bg-transparent text-sm text-gray-900 dark:text-gray-100 focus:outline-none" />
        <div className="flex gap-2 justify-end mt-2">
          <button type="button" onClick={() => { setEditing(false); setDraftBody(msg.body) }}
            className="px-3 py-1 text-xs font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 cursor-pointer bg-transparent border-none">
            Cancel
          </button>
          <button type="button"
            onClick={async () => { const b = draftBody.trim(); if (!b || b === msg.body) { setEditing(false); return }; await onEdit(msg.id, b); setEditing(false) }}
            className="px-3 py-1 text-xs font-bold text-white bg-cyan-600 hover:bg-cyan-700 rounded-full cursor-pointer border-none">
            Save
          </button>
        </div>
      </div>
    )
  }

  const colorCls = msgAvatarColor(msg)
  const initials = msgInitials(msg)

  return (
    <div className="group relative w-full max-w-[70%]">
      {/* Row: avatar + name side-by-side */}
      <div className="flex items-center gap-2 mb-1">
        {/* Avatar — small circle */}
        <div className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-sm overflow-hidden">
          {msg.author_avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={msg.author_avatar} alt={msg.author_name} className="w-full h-full object-cover rounded-full" />
          ) : (
            <span className={`${colorCls} w-full h-full flex items-center justify-center rounded-full`}>{initials}</span>
          )}
        </div>
        {/* Name inline with avatar */}
        <p className="text-[12px] font-semibold text-gray-600 dark:text-gray-300 leading-none">{msg.author_name}</p>
      </div>

      {/* WhatsApp-style white bubble — inline-block so short msgs are narrow */}
      <div className="bg-white dark:bg-[#1f2c33] rounded-[18px] rounded-bl-sm px-3 py-2 shadow-sm inline-block">
        {msg.body && msg.body !== '(attachment)' && (
          <p className="text-[13.5px] leading-[1.45] text-gray-800 dark:text-gray-100 break-words whitespace-pre-wrap">
            {msg.body}
          </p>
        )}
        {msg.attachments.length > 0 && (
          <div className="mt-1 flex flex-col gap-1">
            {msg.attachments.map((a) => (
              <SentImageCard key={a.id} attachment={a} onImageClick={onImageClick} />
            ))}
          </div>
        )}
        {/* Timestamp inside bubble, bottom-right */}
        <div className="flex items-center justify-end gap-1 mt-0.5">
          <span className="text-[10px] text-gray-400 dark:text-gray-500">{msgTime(msg.created_at)}</span>
          {msg.edited_at && <span className="text-[9px] text-gray-400 dark:text-gray-500">· edited</span>}
        </div>
      </div>

      {/* Reaction bar — OUTSIDE bubble, below it, always visible, LEFT side for incoming */}
      <div className="flex items-center gap-1 mt-1 z-10">
        <ReactionBar
          reactions={msg.reactions}
          onToggle={(emoji, oldEmoji) => onReact(msg.id, emoji, oldEmoji)}
          currentUserName={currentUserName}
        />
      </div>

      <ConfirmDialog open={confirmDel} title="Delete this message?" description="This can't be undone."
        confirmLabel="Delete" destructive onConfirm={async () => { setConfirmDel(false); await onDelete(msg.id) }}
        onCancel={() => setConfirmDel(false)} />
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────
 * OutgoingBubble — light-green WhatsApp bubble, right-aligned
 * WhatsApp sent: #d9fdda background, dark green text, auto-size
 * ────────────────────────────────────────────────────────────────── */

function OutgoingBubble({
  msg,
  currentUserName,
  onEdit,
  onDelete,
  onReact,
  onImageClick,
}: {
  msg: ChatMessage; currentUserName: string
  onEdit: (id: number, body: string) => Promise<void>
  onDelete: (id: number) => Promise<void>
  onReact: (id: number, emoji: string, oldEmoji?: string) => Promise<void>
  onImageClick: (url: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draftBody, setDraftBody] = useState(msg.body)
  const [confirmDel, setConfirmDel] = useState(false)
  const isDeleted = !!msg.deleted_at

  useEffect(() => {
    if (!editing) setDraftBody(msg.body)
  }, [msg.body, editing])

  if (isDeleted) {
    return (
      <div className="max-w-[70%] text-xs italic text-green-700 dark:text-green-400 px-3 py-2 bg-[#d9fdda]/70 dark:bg-[#1f3a2d]/70 rounded-[18px] rounded-br-sm ml-auto">
        This message was deleted
      </div>
    )
  }

  if (editing) {
    return (
      <div className="max-w-[70%] bg-[#bcf0c0] dark:bg-[#1f3a2d] border-2 border-green-500 dark:border-green-700 rounded-[18px] px-4 py-3 shadow-sm ml-auto">
        <textarea value={draftBody} onChange={(e) => setDraftBody(e.target.value)}
          rows={2} autoFocus
          className="w-full resize-none bg-transparent text-sm text-gray-900 dark:text-gray-100 focus:outline-none" />
        <div className="flex gap-2 justify-end mt-2">
          <button type="button" onClick={() => { setEditing(false); setDraftBody(msg.body) }}
            className="px-3 py-1 text-xs font-semibold text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 cursor-pointer bg-transparent border-none">
            Cancel
          </button>
          <button type="button"
            onClick={async () => { const b = draftBody.trim(); if (!b || b === msg.body) { setEditing(false); return }; await onEdit(msg.id, b); setEditing(false) }}
            className="px-3 py-1 text-xs font-bold text-white bg-green-600 hover:bg-green-700 rounded-full cursor-pointer border-none">
            Save
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="group relative">
      {/* WhatsApp light-green bubble — max 70%, auto height */}
      <div className="bg-[#d9fdda] dark:bg-[#1f3a2d] rounded-[18px] rounded-br-sm px-3 py-2 shadow-sm max-w-[70%]" style={{ display: 'block', width: '100%', marginLeft: 'auto' }}>
        {msg.body && msg.body !== '(attachment)' && (
          <p className="text-[13.5px] leading-[1.45] text-gray-800 break-words whitespace-pre-wrap">
            {msg.body}
          </p>
        )}
        {msg.attachments.length > 0 && (
          <div className="mt-1 flex flex-col gap-1">
            {msg.attachments.map((a) => (
              <SentImageCard key={a.id} attachment={a} onImageClick={onImageClick} />
            ))}
          </div>
        )}
        {/* Timestamp — right-aligned inside bubble */}
        <div className="flex items-center justify-end gap-1 mt-0.5">
          <span className="text-[10px] text-green-700/70 dark:text-green-600">{msgTime(msg.created_at)}</span>
          {msg.edited_at && <span className="text-[9px] text-green-700/50 dark:text-green-600">· edited</span>}
        </div>
      </div>

      {/* Edit/Delete + ReactionBar — ONE row, RIGHT side, always visible */}
      <div className="flex items-center justify-end gap-2 mt-1 z-10">
        <ReactionBar
          reactions={msg.reactions}
          onToggle={(emoji, oldEmoji) => onReact(msg.id, emoji, oldEmoji)}
          currentUserName={currentUserName}
        />
        <button type="button" onClick={() => setEditing(true)} aria-label="Edit"
          className="px-2 py-0.5 rounded-full bg-[#d9fdda] dark:bg-[#1f3a2d] border border-green-300 dark:border-green-700 text-[11px] text-gray-500 dark:text-gray-400 hover:text-amber-500 flex items-center gap-1 shadow-sm cursor-pointer">
          <Pencil size={10} strokeWidth={2.5} /> Edit
        </button>
        <button type="button" onClick={() => setConfirmDel(true)} aria-label="Delete"
          className="px-2 py-0.5 rounded-full bg-[#d9fdda] dark:bg-[#1f3a2d] border border-green-300 dark:border-green-700 text-[11px] text-gray-500 dark:text-gray-400 hover:text-rose-500 flex items-center gap-1 shadow-sm cursor-pointer">
          <Trash2 size={10} strokeWidth={2.5} /> Delete
        </button>
      </div>

      <ConfirmDialog open={confirmDel} title="Delete this message?" description="This can't be undone."
        confirmLabel="Delete" destructive onConfirm={async () => { setConfirmDel(false); await onDelete(msg.id) }}
        onCancel={() => setConfirmDel(false)} />
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────
 * MessageGroup — grouped consecutive messages (WhatsApp-style)
 * ────────────────────────────────────────────────────────────────── */

function MessageGroup({
  messages,
  currentUserName,
  onEdit,
  onDelete,
  onReact,
  onImageClick,
}: {
  messages: ChatMessage[]; currentUserName: string
  onEdit: (id: number, body: string) => Promise<void>
  onDelete: (id: number) => Promise<void>
  onReact: (id: number, emoji: string, oldEmoji?: string) => Promise<void>
  onImageClick: (url: string) => void
}) {
  if (messages.length === 0) return null
  const first = messages[0]
  const isMine = first.is_mine

  return (
    <div className={`flex ${isMine ? 'justify-end' : 'justify-start'} animate-msg-in w-full`}>
      <div className={`flex flex-col gap-0.5 flex-shrink-0 ${isMine ? 'items-end' : 'items-start'} w-full`}>
        {messages.map((msg) =>
          isMine ? (
            <OutgoingBubble key={msg.id} msg={msg} currentUserName={currentUserName}
              onEdit={onEdit} onDelete={onDelete} onReact={onReact} onImageClick={onImageClick} />
          ) : (
            <IncomingBubble key={msg.id} msg={msg} currentUserName={currentUserName}
              onEdit={onEdit} onDelete={onDelete} onReact={onReact} onImageClick={onImageClick} />
          )
        )}
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────
 * SentImageCard — inside bubble (WhatsApp-style attachment)
 * ────────────────────────────────────────────────────────────────── */

function SentImageCard({ attachment, onImageClick }: {
  attachment: ChatAttachment; onImageClick: (url: string) => void
}) {
  return (
    <button type="button" onClick={() => onImageClick(attachment.file_url)}
      className="w-full rounded-[14px] overflow-hidden bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition cursor-pointer text-left">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={attachment.file_url} alt={attachment.file_name} className="w-full object-cover" style={{ height: '140px' }} loading="lazy" />
      <div className="px-2.5 py-1.5 flex items-center gap-1.5">
        <FileText size={10} strokeWidth={2} className="text-gray-400 shrink-0" />
        <span className="text-[10px] text-gray-600 truncate flex-1">{attachment.file_name}</span>
        <span className="text-[9px] text-gray-400 shrink-0">{formatBytes(attachment.file_size)}</span>
      </div>
    </button>
  )
}

/* ──────────────────────────────────────────────────────────────────
 * PendingFile helpers
 * ────────────────────────────────────────────────────────────────── */

interface PendingFile { id: string; name: string; size: number; file: File; isPasted?: boolean }

function buildPendingFile(file: File, isPasted = false): PendingFile {
  return { id: `${file.name}-${file.size}-${Date.now()}`, name: file.name, size: file.size, file, isPasted }
}

function PendingFileCard({ pendingFile: pf, onRemove, onPreview }: {
  pendingFile: PendingFile; onRemove: () => void; onPreview: (url: string) => void
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
    <div className="shrink-0 w-20 h-20 rounded-2xl relative group bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 overflow-visible">
      {isImage && previewUrl ? (
        <button type="button" onClick={() => onPreview(previewUrl)} className="w-full h-full bg-transparent border-none cursor-pointer p-0 relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl} alt={pf.name} className="w-full h-full object-cover rounded-2xl" />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 flex items-center justify-center transition-all rounded-2xl">
            <ImageIcon size={18} strokeWidth={2.5} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </button>
      ) : (
        <div className="w-full h-full flex items-center justify-center rounded-2xl">
          <FileText size={22} strokeWidth={1.75} className="text-gray-400" />
        </div>
      )}
      <button type="button" onClick={onRemove} aria-label={`Remove ${pf.name}`}
        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-rose-500 text-white flex items-center justify-center z-20 shadow-md cursor-pointer border-none hover:bg-rose-600">
        <X size={10} strokeWidth={3} />
      </button>
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-1 py-1 rounded-b-2xl">
        <p className="text-[9px] text-white truncate leading-tight">{pf.name}</p>
      </div>
      {pf.isPasted && (
        <div className="absolute top-1 left-1 z-10">
          <span className="text-[8px] font-bold text-white bg-cyan-500 px-1.5 py-0.5 rounded-full shadow">Pasted</span>
        </div>
      )}
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────
 * ImageLightbox
 * ────────────────────────────────────────────────────────────────── */

function ImageLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div onClick={onClose}
      className="fixed inset-0 z-[9999] bg-black/95 flex items-center justify-center"
      role="dialog" aria-modal="true" aria-label="Image viewer">
      <button type="button" onClick={(e) => { e.stopPropagation(); onClose() }} aria-label="Close"
        className="absolute top-4 right-4 z-10 w-11 h-11 rounded-full bg-white/10 hover:bg-white/25 text-white flex items-center justify-center transition border-none cursor-pointer">
        <X size={20} strokeWidth={2.5} />
      </button>
      <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/30 text-xs">Press Esc or click backdrop to close</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} onClick={(e) => e.stopPropagation()} alt="Full screen"
        className="max-w-[94vw] max-h-[88vh] object-contain rounded-2xl shadow-2xl" />
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────
 * formatBytes
 * ────────────────────────────────────────────────────────────────── */

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/* ──────────────────────────────────────────────────────────────────
 * ChatPage
 * ────────────────────────────────────────────────────────────────── */

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

  /* ── File size validation ── */
  const addFilesWithValidation = (newFiles: File[], isPasted = false) => {
    const validFiles: File[] = []
    const overLimit: string[] = []
    for (const f of newFiles) {
      if (f.size > MAX_FILE_SIZE) {
        overLimit.push(`${f.name} (${(f.size / 1024 / 1024).toFixed(1)}MB)`)
      } else {
        validFiles.push(f)
      }
    }
    if (overLimit.length > 0) {
      toast.error(`File too large (max 10MB): ${overLimit.join(', ')}`)
    }
    if (validFiles.length > 0) {
      setPendingFiles((p) => [...p, ...validFiles.map((f) => buildPendingFile(f, isPasted))])
    }
  }

  const [uploadingFiles, setUploadingFiles] = useState<string[]>([])
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(null)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null)
  const lastCountRef = useRef(0)
  const isInitialLoadRef = useRef(true)
  const userScrolledUpRef = useRef(false)

  /* ── Scroll to bottom on initial load ── */
  useEffect(() => {
    if (!scrollEl || messages.length === 0) return
    scrollEl.scrollTop = scrollEl.scrollHeight
  }, [scrollEl, messages.length])

  /* ── Auto-scroll on new messages ── */
  useEffect(() => {
    if (!scrollEl || messages.length === 0) return
    const isInitial = isInitialLoadRef.current
    const wasNearBottom = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight < 200
    const hasNew = messages.length !== lastCountRef.current
    if (isInitial || (wasNearBottom && hasNew && !userScrolledUpRef.current)) {
      isInitialLoadRef.current = false
      scrollEl.scrollTo({ top: scrollEl.scrollHeight, behavior: 'smooth' })
    }
    lastCountRef.current = messages.length
  }, [messages, scrollEl])

  /* ── Track user scrolled up ── */
  useEffect(() => {
    if (!scrollEl) return
    const onScroll = () => {
      const nearBottom = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight < 50
      userScrolledUpRef.current = !nearBottom
    }
    scrollEl.addEventListener('scroll', onScroll, { passive: true })
    return () => scrollEl.removeEventListener('scroll', onScroll)
  }, [scrollEl])

  /* ── File change ── */
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files || [])
    if (list.length === 0) return
    const overLimit = list.filter((f) => f.size > MAX_FILE_SIZE)
    if (overLimit.length > 0) {
      toast.error(`File too large (max 10MB): ${overLimit.map((f) => `${f.name} (${(f.size / 1024 / 1024).toFixed(1)}MB)`).join(', ')}`)
      e.target.value = ''
      return
    }
    addFilesWithValidation(list, false)
    e.target.value = ''
  }

  /* ── Drag & drop ── */
  const [dragging, setDragging] = useState(false)
  const composerRef = useRef<HTMLDivElement>(null)
  const dragCounterRef = useRef(0)
  const onDragEnter = (e: React.DragEvent) => { e.preventDefault(); dragCounterRef.current++; setDragging(true) }
  const onDragLeave = (e: React.DragEvent) => { e.preventDefault(); dragCounterRef.current--; if (dragCounterRef.current === 0) setDragging(false) }
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current = 0
    setDragging(false)
    const files = Array.from(e.dataTransfer.files || [])
    if (files.length === 0) return
    const overLimit = files.filter((f) => f.size > MAX_FILE_SIZE)
    if (overLimit.length > 0) {
      toast.error(`File too large (max 10MB): ${overLimit.map((f) => `${f.name} (${(f.size / 1024 / 1024).toFixed(1)}MB)`).join(', ')}`)
      return
    }
    addFilesWithValidation(files, false)
  }

  /* ── Paste — document-level listener ── */
  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      if (!composerRef.current) return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag && !['TEXTAREA', 'INPUT', 'SELECT'].includes(tag)) return
      if (!composerRef.current.contains(e.target as Node)) return
      const items = Array.from(e.clipboardData?.items || [])
      const imageItems = items.filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
      if (imageItems.length === 0) return
      e.preventDefault()
      const rawFiles = imageItems.map((item) => item.getAsFile()).filter(Boolean) as File[]
      // Direct size check — fail fast before even calling addFilesWithValidation
      const overLimit = rawFiles.filter((f) => f.size > MAX_FILE_SIZE)
      if (overLimit.length > 0) {
        toast.error(`Image too large (max 10MB): ${overLimit.map((f) => `${f.name} (${(f.size / 1024 / 1024).toFixed(1)}MB)`).join(', ')}`)
        return
      }
      addFilesWithValidation(rawFiles, true)
    }
    document.addEventListener('paste', handler)
    return () => document.removeEventListener('paste', handler)
  }, [])

  /* ── Send ── */
  const onSend = async () => {
    const body = draft.trim()
    if (!body && pendingFiles.length === 0) return
    if (sending) return
    // Final size check before sending — reject oversized files
    const overSize = pendingFiles.filter((f) => f.file.size > MAX_FILE_SIZE)
    if (overSize.length > 0) {
      toast.error(`File too large (max 10MB): ${overSize.map((f) => `${f.name} (${(f.file.size / 1024 / 1024).toFixed(1)}MB)`).join(', ')}`)
      return
    }
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
      if (textareaRef.current) textareaRef.current.style.height = 'auto'
    } finally {
      setSending(false)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void onSend() }
  }

  const onEmojiClick = (emoji: string) => {
    setDraft((d) => d + emoji)
    setShowEmojiPicker(false)
    textareaRef.current?.focus()
  }

  /* ── Grouped messages ── */
  const activeMsgCount = messages.filter((m) => !m.deleted_at).length

  const groupedMessages: ChatMessage[][] = []
  for (const msg of messages) {
    const last = groupedMessages[groupedMessages.length - 1]
    if (last && isSameGroup(last[0], msg)) {
      last.push(msg)
    } else {
      groupedMessages.push([msg])
    }
  }

  /* ── Render ── */
  return (
    <FeaturePage featureKey="chat" title="Project Chat">
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden flex flex-col h-[calc(100vh-220px)] min-h-[480px] bg-chat-bg dark:bg-chat-bg-dark">

        {/* ── WhatsApp-style Header ── */}
        <div className="px-4 py-3 bg-[#008069] flex items-center gap-3 shrink-0">
          <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-white text-sm font-bold shrink-0">
            <MessageSquare size={18} strokeWidth={2} />
          </div>
          <div>
            <h3 className="font-bold text-white text-sm">Project Chat</h3>
            <p className="text-[11px] text-white/70">
              {messages.length === 0 ? 'No messages yet' : activeMsgCount === 0 ? `${messages.length} deleted` : `${activeMsgCount} message${activeMsgCount === 1 ? '' : 's'}`}
              {error && <span className="text-rose-200 ml-1">· error</span>}
            </p>
          </div>
        </div>

        {/* ── Message list — WhatsApp warm beige background ── */}
        <div
          ref={setScrollEl}
          className="flex-1 overflow-y-auto px-4 py-4 space-y-1 chat-scrollbar bg-chat-bg dark:bg-chat-bg-dark"
        >
          {loading && messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-sm text-gray-500 gap-2">
              <Loader2 size={24} className="animate-spin text-[#008069]" />
              Loading chat…
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-sm text-gray-500 gap-2">
              <MessageSquare size={36} strokeWidth={1.5} className="text-[#008069]/40" />
              <p className="text-[#008069]/60 font-medium">No messages yet</p>
              <p className="text-xs text-gray-400">Start the conversation below</p>
            </div>
          ) : (
            groupedMessages.map((group) => (
              <MessageGroup
                key={group[0].id}
                messages={group}
                currentUserName={currentUserName}
                onEdit={async (id, body) => { const r = await edit(id, body); toast.success(r ? 'Updated' : 'Failed to update') }}
                onDelete={async (id) => { const r = await remove(id); toast.success(r ? 'Deleted' : 'Failed to delete') }}
                onReact={async (id, emoji, oldEmoji) => { const r = await toggleReaction(id, emoji, oldEmoji); if (!r) toast.error('Failed to react') }}
                onImageClick={setLightboxUrl}
              />
            ))
          )}
        </div>

        {/* ── Composer — WhatsApp-style input bar ── */}
        <div
          ref={composerRef}
          className={['px-3 py-2.5 pb-3 shrink-0 transition-colors relative', dragging ? 'bg-[#d9f7d0] dark:bg-[#d9f7d0]' : 'bg-[#f0f2f5] dark:bg-[#222f3e]'].join(' ')}
          onDragEnter={onDragEnter}
          onDragLeave={onDragLeave}
          onDragOver={onDragOver}
          onDrop={onDrop}
        >
          {/* Pending attachments */}
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
                <div key={name} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#d9fdda] dark:bg-[#d9f7d0] border border-green-200 dark:border-green-900">
                  <Upload size={12} className="text-green-600 animate-pulse shrink-0" />
                  <span className="text-xs text-green-700 truncate flex-1">{name}</span>
                  <span className="text-[10px] text-green-500 animate-pulse shrink-0">Uploading…</span>
                </div>
              ))}
            </div>
          )}

          {/* Input row */}
          <div className="flex items-end gap-1.5">
            <input ref={fileInputRef} type="file" multiple
              accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip"
              className="sr-only" onChange={handleFileChange} aria-label="Attach files" />

            {/* Emoji */}
            <button type="button" onClick={() => setShowEmojiPicker((v) => !v)} aria-label="Open emoji picker"
              className="shrink-0 w-9 h-9 rounded-full bg-transparent flex items-center justify-center text-gray-500 hover:text-amber-500 transition cursor-pointer border-none">
              <Smile size={19} strokeWidth={2} />
            </button>

            {/* Attach */}
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={sending} aria-label="Attach files"
              className="shrink-0 w-9 h-9 rounded-full bg-transparent flex items-center justify-center text-gray-500 hover:text-[#008069] transition disabled:opacity-40 cursor-pointer border-none">
              <Paperclip size={19} strokeWidth={2} />
            </button>

            {/* Text input */}
            <div className="flex-1">
              <MentionInput
                projectId={projectId}
                value={draft}
                onChange={(v) => setDraft(v)}
                placeholder="Message… (Ctrl+Enter to send)"
                rows={1}
                disabled={sending}
                onCtrlEnter={onSend}
              />
            </div>

            {/* Send */}
            <button type="button" onClick={onSend}
              disabled={sending || (draft.trim() === '' && pendingFiles.length === 0)} aria-label="Send message"
              className="shrink-0 w-9 h-9 rounded-full bg-[#008069] hover:bg-[#006b56] active:bg-[#005545] text-white flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer border-none shadow-sm">
              {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} strokeWidth={2.5} />}
            </button>
          </div>

          {/* Drop hint */}
          {dragging && (
            <div className="mt-2 text-center">
              <span className="text-xs font-semibold text-green-700 dark:text-green-400 bg-[#d9fdda] dark:bg-[#1f3a2d] px-4 py-1.5 rounded-full border border-green-300 dark:border-green-700">
                Drop files here to attach
              </span>
            </div>
          )}

          {/* Emoji picker */}
          {showEmojiPicker && (
            <div className="absolute bottom-full left-0 mb-2 z-50">
              <div className="relative">
                <button type="button" onClick={() => setShowEmojiPicker(false)}
                  className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-300 flex items-center justify-center z-10 hover:bg-gray-300 dark:hover:bg-gray-600 transition cursor-pointer border-none">
                  <X size={12} strokeWidth={3} />
                </button>
                <EmojiPicker onEmojiClick={(e) => onEmojiClick(e.emoji)} theme={Theme.LIGHT} width={300} height={360} autoFocusSearch={false} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Lightboxes */}
      {lightboxUrl && <ImageLightbox src={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
      {pendingPreviewUrl && <ImageLightbox src={pendingPreviewUrl} onClose={() => setPendingPreviewUrl(null)} />}
    </FeaturePage>
  )
}
