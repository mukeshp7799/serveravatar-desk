'use client'

/**
 * /projects/[projectId]/files/[docId]
 *
 * Dedicated full-page route for viewing and editing a single document or file.
 *
 * Redesigned with:
 *  - Edit mode completely separates the editor from comments (no more editor
 *    buried below comments when there are many)
 *  - When editing: editor fills the full viewport height, comments tab slides
 *    in from the bottom as a collapsible panel
 *  - Attractive card design with gradient accents and proper visual hierarchy
 *  - Smooth transitions between view and edit modes
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import {
  Loader2, FileText, Image as ImageIcon, Video, FileSpreadsheet,
  File as FileIcon, Pencil, Trash2, X, Download, ChevronLeft,
  MessageSquare, ChevronDown, ChevronUp, Smile, Eye, Save,
} from 'lucide-react'
import ReactionBar from '@/components/project/ReactionBar'
import type { Reaction } from '@/types/project'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import {
  Bold, Italic, List, ListOrdered, Quote, Code, Heading2, Undo2, Redo2,
} from 'lucide-react'
import FeaturePage from '@/components/project/FeaturePage'
import ConfirmDialog from '@/components/project/ConfirmDialog'
import DocumentReactions from '@/components/project/DocumentReactions'
import { fmtRelative } from '@/components/project/format'
import { useDocuments, useComments } from '@/lib/project-documents-api'
import type { Document, DocumentComment } from '@/types/project'

const KIND_ICON: Record<string, any> = {
  pdf: FileText, doc: FileText, sheet: FileSpreadsheet,
  image: ImageIcon, video: Video, other: FileIcon,
}
const KIND_BADGE: Record<string, string> = {
  pdf:  'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800',
  doc:  'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-900/30 dark:text-sky-300 dark:border-sky-800',
  sheet:'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800',
  image:'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/30 dark:text-violet-300 dark:border-violet-800',
  video:'bg-pink-50 text-pink-700 border-pink-200 dark:bg-pink-900/30 dark:text-pink-300 dark:border-pink-800',
  other:'bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700',
}
const KIND_GRADIENT: Record<string, string> = {
  pdf:  'from-rose-400 to-orange-400',
  doc:  'from-sky-400 to-blue-500',
  sheet:'from-emerald-400 to-teal-500',
  image:'from-violet-400 to-purple-500',
  video:'from-pink-400 to-rose-500',
  other:'from-gray-400 to-gray-500',
}
const FILE_KIND = (mime?: string | null, name?: string | null): string => {
  if (!mime && !name) return 'other'
  const m = (mime || '').toLowerCase()
  const n = (name || '').toLowerCase()
  if (m.includes('pdf') || n.endsWith('.pdf')) return 'pdf'
  if (m.includes('image') || /\.(png|jpe?g|gif|webp|svg|bmp)$/.test(n)) return 'image'
  if (m.includes('video') || /\.(mp4|mov|webm|mkv)$/.test(n)) return 'video'
  if (m.includes('sheet') || m.includes('excel') || /\.(xls|xlsx|csv)$/.test(n)) return 'sheet'
  if (m.includes('word') || m.includes('officedocument') || /\.(docx?|odt|rtf)$/.test(n)) return 'doc'
  if (m.startsWith('text/') || /\.(txt|md|json|ya?ml|xml|html?)$/.test(n)) return 'doc'
  return 'other'
}
const formatBytes = (n?: number | null) => {
  if (!n || n <= 0) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/* ─── Tiptap rich-text editor (optimised for full-height editing) ─── */
function RichTextEditor({
  initialHtml, onChange, autoFocus = false, placeholder = 'Start writing your document here…',
}: { initialHtml?: string; onChange?: (html: string) => void; autoFocus?: boolean; placeholder?: string }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Placeholder.configure({ placeholder, showOnlyWhenEditable: true, emptyEditorClass: 'is-editor-empty' }),
    ],
    content: initialHtml || '',
    editorProps: {
      attributes: {
        class: 'h-full overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent prose prose-sm dark:prose-invert max-w-none focus:outline-none px-5 py-4',
      },
    },
    immediatelyRender: false,
    autofocus: autoFocus,
    onUpdate: ({ editor }) => onChange?.(editor.getHTML()),
  })
  if (!editor) return (
    <div className="flex-1 flex items-center justify-center">
      <Loader2 size={20} className="animate-spin text-gray-400" />
    </div>
  )
  const ToolBtn = ({
    onClick, active, children, title,
  }: { onClick: () => void; active?: boolean; children: React.ReactNode; title: string }) => (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onClick() }}
      title={title} aria-label={title} aria-pressed={active}
      className={`w-8 h-8 inline-flex items-center justify-center rounded-lg transition border-none cursor-pointer shrink-0 ${
        active ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300'
               : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
      }`}
    >{children}</button>
  )
  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 p-2 bg-gray-50 dark:bg-gray-800/70 rounded-t-2xl border border-b-0 border-gray-200 dark:border-gray-700 shrink-0">
        <ToolBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Bold"><Bold size={14} strokeWidth={2.5}/></ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italic"><Italic size={14} strokeWidth={2.5}/></ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="Heading"><Heading2 size={14} strokeWidth={2.5}/></ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Bulleted list"><List size={14} strokeWidth={2.5}/></ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Numbered list"><ListOrdered size={14} strokeWidth={2.5}/></ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} title="Quote"><Quote size={14} strokeWidth={2.5}/></ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive('codeBlock')} title="Code block"><Code size={14} strokeWidth={2.5}/></ToolBtn>
        <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1" />
        <ToolBtn onClick={() => editor.chain().focus().undo().run()} title="Undo"><Undo2 size={14} strokeWidth={2.5}/></ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().redo().run()} title="Redo"><Redo2 size={14} strokeWidth={2.5}/></ToolBtn>
      </div>
      {/* Editor surface — expands to fill available space */}
      <div className="flex-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-b-2xl overflow-hidden min-h-[320px]">
        <EditorContent editor={editor} className="h-full" />
      </div>
    </div>
  )
}

function DocumentReader({ html }: { html: string }) {
  return (
    <div
      className="prose prose-sm dark:prose-invert max-w-none px-1 py-2"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

/* ─── Comments ─── */
function CommentComposer({
  onSubmit, onCancel, submitting, initialValue, autoFocus,
}: {
  onSubmit: (body: string) => Promise<void> | void
  onCancel?: () => void
  submitting?: boolean
  initialValue?: string
  autoFocus?: boolean
}) {
  const [body, setBody] = useState(initialValue || '')
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  useEffect(() => { if (autoFocus) inputRef.current?.focus() }, [autoFocus])
  const submit = async () => {
    const trimmed = body.trim()
    if (!trimmed || submitting) return
    try { await onSubmit(trimmed); setBody('') } catch { /* toast surfaces */ }
  }
  return (
    <div className="flex items-start gap-2">
      <textarea
        ref={inputRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit() } }}
        placeholder="Add a comment… (Ctrl+Enter to send)"
        rows={2}
        className="flex-1 resize-none bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
      />
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={submit}
          disabled={!body.trim() || submitting}
          className="inline-flex items-center justify-center w-9 h-9 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow border-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          title="Send"
        >
          {submitting ? <Loader2 size={14} className="animate-spin" /> : <span className="text-xs">↵</span>}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="inline-flex items-center justify-center w-9 h-9 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg border-none cursor-pointer disabled:opacity-50"
            title="Cancel"
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  )
}

function CommentRow({
  comment, canEdit, onEdit, onDelete, onToggleReaction, currentUserName,
}: {
  comment: DocumentComment
  canEdit: boolean
  onEdit: (id: DocumentComment['id'], body: string) => Promise<void>
  onDelete: (id: DocumentComment['id']) => void
  onToggleReaction: (id: DocumentComment['id'], emoji: string, oldEmoji?: string) => Promise<void>
  currentUserName: string
}) {
  const [editing, setEditing] = useState(false)
  const [body, setBody] = useState(comment.body)
  const [saving, setSaving] = useState(false)
  if (editing) {
    return (
      <div className="bg-white dark:bg-gray-900 border border-indigo-200 dark:border-indigo-800 rounded-xl p-2">
        <CommentComposer
          initialValue={comment.body}
          autoFocus
          submitting={saving}
          onCancel={() => { setEditing(false); setBody(comment.body) }}
          onSubmit={async (newBody) => {
            setSaving(true)
            try { await onEdit(comment.id, newBody); setEditing(false) }
            finally { setSaving(false) }
          }}
        />
      </div>
    )
  }
  return (
    <div className="group flex items-start gap-3 px-3 py-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">
      {/* Avatar */}
      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 text-white text-[11px] font-bold flex items-center justify-center shrink-0 shadow-sm">
        {(comment.author_name || '?').split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()}
      </div>

      {/* Message block — left side */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap mb-1">
          <span className="text-sm font-semibold text-gray-900 dark:text-white">{comment.author_name}</span>
          <span className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wider font-semibold">
            {fmtRelative(comment.created_at)}
            {comment.updated_at && comment.updated_at !== comment.created_at ? ' · edited' : ''}
          </span>
        </div>
        <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words leading-relaxed">{comment.body}</p>

        {/* Reactions — bottom of message */}
        <div className="mt-2">
          <ReactionBar
            reactions={comment.reactions || []}
            onToggle={(emoji, oldEmoji) => onToggleReaction(comment.id, emoji, oldEmoji)}
            currentUserName={currentUserName}
          />
        </div>
      </div>

      {/* Actions — right side, at bottom */}
      {canEdit && (
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 shrink-0 self-end">
          <button type="button" onClick={() => setEditing(true)} className="w-7 h-7 inline-flex items-center justify-center text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-md bg-transparent border-none cursor-pointer" title="Edit">
            <Pencil size={12} strokeWidth={2.25} />
          </button>
          <button type="button" onClick={() => onDelete(comment.id)} className="w-7 h-7 inline-flex items-center justify-center text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-md bg-transparent border-none cursor-pointer" title="Delete">
            <Trash2 size={12} strokeWidth={2.25} />
          </button>
        </div>
      )}
    </div>
  )
}

function CommentsList({
  comments, loading, currentUserName, isProjectOwner, onEdit, onRequestDelete, onToggleReaction,
}: {
  comments: DocumentComment[]
  loading: boolean
  currentUserName: string
  isProjectOwner: boolean
  onEdit: (id: DocumentComment['id'], body: string) => Promise<void>
  onRequestDelete: (id: DocumentComment['id']) => void
  onToggleReaction: (id: DocumentComment['id'], emoji: string, oldEmoji?: string) => Promise<void>
}) {
  if (loading && comments.length === 0) {
    return <div className="space-y-2">{[1, 2].map((i) => <div key={i} className="h-14 bg-gray-50 dark:bg-gray-800/50 rounded-xl animate-pulse" />)}</div>
  }
  if (comments.length === 0) {
    return (
      <div className="text-center py-8">
        <MessageSquare size={32} className="mx-auto text-gray-300 dark:text-gray-600 mb-2" strokeWidth={1.5} />
        <p className="text-xs text-gray-400 dark:text-gray-500 italic">No comments yet — start the conversation.</p>
      </div>
    )
  }
  return (
    <div className="space-y-1">
      {comments.map((c) => (
        <CommentRow
          key={c.id}
          comment={c}
          canEdit={c.author_name === currentUserName || isProjectOwner}
          onEdit={onEdit}
          onDelete={onRequestDelete}
          onToggleReaction={onToggleReaction}
          currentUserName={currentUserName}
        />
      ))}
    </div>
  )
}

/* ─── Page ─── */
export default function DocPage() {
  const params = useParams<{ projectId: string; docId: string }>()
  const router = useRouter()
  const projectId = params.projectId
  const docId = params.docId

  const docs = useDocuments(projectId)
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState('')
  const [html, setHtml] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmDeleteCommentId, setConfirmDeleteCommentId] = useState<DocumentComment['id'] | null>(null)
  const [deleting, setDeleting] = useState(false)
  // Collapsible comments panel — collapsed by default when editing
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [imagePreview, setImagePreview] = useState<string | null>(null)

  const currentUserName = useMemo(() => {
    if (typeof window === 'undefined') return ''
    try {
      const u = JSON.parse(localStorage.getItem('user') || '{}') as any
      return [u?.firstName ?? u?.first_name, u?.lastName ?? u?.last_name].filter(Boolean).join(' ').trim() || u?.email || ''
    } catch { return '' }
  }, [])
  const isProjectOwner = useMemo(() => true, [])

  const doc = useMemo(
    () => docs.documents.find((d) => String(d.id) === String(docId)) ?? null,
    [docs.documents, docId],
  )

  useEffect(() => {
    if (doc) {
      setTitle(doc.title)
      setHtml(doc.content_html || '')
    }
  }, [doc?.id])

  const commentsApi = useComments(doc?.id ?? 0)
  const canEdit = !!doc && doc.kind === 'doc' && (doc.author_name === currentUserName || isProjectOwner)

  // When entering edit mode, collapse comments panel
  useEffect(() => {
    if (editing) setCommentsOpen(false)
  }, [editing])

  const handleClose = () => router.push(`/projects/${projectId}/files`)

  const handleSave = async () => {
    if (!doc) return
    if (!title.trim()) { toast.error('Title is required'); return }
    setSaving(true)
    try {
      await docs.update(doc.id, { title: title.trim(), content_html: html })
      toast.success('Document updated')
      setEditing(false)
    } catch (e: any) {
      toast.error(e?.message || 'Failed to update document')
    } finally { setSaving(false) }
  }
  const handleDelete = async () => {
    if (!doc) return
    setDeleting(true)
    try {
      await docs.remove(doc.id)
      toast.success('Document deleted')
      router.push(`/projects/${projectId}/files`)
    } catch (e: any) {
      toast.error(e?.message || 'Failed to delete document')
    } finally { setDeleting(false) }
  }
  // Document-level reaction toggle (for DocumentReactions component).
  const handleToggleReaction = async (emoji: string, oldEmoji?: string) => {
    if (!doc) return
    try { await docs.toggleReaction(doc.id, emoji, oldEmoji) }
    catch (e: any) { toast.error(e?.message || 'Failed to update reaction') }
  }
  const handleAddComment = async (body: string) => {
    if (!doc) return
    try { await commentsApi.add(body); toast.success('Comment added') }
    catch (e: any) { toast.error(e?.message || 'Failed to add comment'); throw e }
  }
  const handleEditComment = async (id: DocumentComment['id'], body: string) => {
    try { await commentsApi.edit(id, body); toast.success('Comment updated') }
    catch (e: any) { toast.error(e?.message || 'Failed to update comment'); throw e }
  }

  /* ─── Loading + not-found ─── */
  if (docs.loading && !doc) {
    return (
      <FeaturePage featureKey="files" title="Loading…">
        <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-24 bg-gray-50 dark:bg-gray-800/50 rounded-2xl animate-pulse" />)}</div>
      </FeaturePage>
    )
  }
  if (!doc) {
    return (
      <FeaturePage featureKey="files" title="Not found">
        <div className="text-center py-16">
          <div className="w-20 h-20 rounded-2xl bg-gray-100 dark:bg-gray-800 mx-auto mb-4 flex items-center justify-center">
            <FileIcon size={36} className="text-gray-400" strokeWidth={1.5} />
          </div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Document not found</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            This document doesn't exist, was deleted, or you don't have access.
          </p>
          <Link
            href={`/projects/${projectId}/files`}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow no-underline"
          >
            <ChevronLeft size={14} strokeWidth={2.5} /> Back to Files
          </Link>
        </div>
      </FeaturePage>
    )
  }

  const kind = doc.kind === 'file' ? FILE_KIND(doc.file_type, doc.title) : 'doc'
  const Icon = KIND_ICON[kind] || FileIcon
  const gradient = KIND_GRADIENT[kind]

  /* ─── Full-page viewer (edit mode has dedicated layout) ─── */
  return (
    <FeaturePage featureKey="files" title={doc.title}>
      <div className="w-full">
        {/* Back to Files/Documents — top of page, above everything */}
        <div className="mb-4">
          <Link
            href={`/projects/${projectId}/files`}
            className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl no-underline transition"
          >
            <ChevronLeft size={12} strokeWidth={2.5} />
            Back to {doc.kind === 'file' ? 'Files' : 'Documents'}
          </Link>
        </div>

        {/* ════════════════════════════════════════════════════════════
            EDIT MODE — Full-height editor layout, comments in slide-up panel
            ════════════════════════════════════════════════════════════ */}
        {editing && doc.kind === 'doc' ? (
          <div className="flex flex-col gap-3">
            {/* Title bar */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm p-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${gradient} text-white flex items-center justify-center shadow-sm shrink-0`}>
                  <Icon size={20} strokeWidth={2.25} />
                </div>
                <div className="flex-1">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${KIND_BADGE[kind]}`}>
                    Editing Document
                  </span>
                </div>
              </div>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full mt-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-lg font-bold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="Document title"
              />
            </div>

            {/* Full-height editor */}
            <div className="flex-1 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden flex flex-col min-h-[420px]">
              <RichTextEditor initialHtml={doc.content_html} onChange={setHtml} autoFocus />
            </div>

            {/* Bottom action bar */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm px-5 py-4 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => { setEditing(false); setTitle(doc.title); setHtml(doc.content_html || '') }}
                disabled={saving}
                className="px-5 py-2.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-semibold border-none cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                <X size={14} strokeWidth={2.5} /> Cancel
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCommentsOpen((v) => !v)}
                  className="px-4 py-2.5 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold cursor-pointer inline-flex items-center gap-1.5"
                >
                  <MessageSquare size={14} strokeWidth={2.25} />
                  Comments
                  {commentsApi.comments.length > 0 && (
                    <span className="bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                      {commentsApi.comments.length}
                    </span>
                  )}
                  {commentsOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || !title.trim()}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow border-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} strokeWidth={2.25} />}
                  Save changes
                </button>
              </div>
            </div>

            {/* Collapsible comments panel */}
            {commentsOpen && (
              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
                  <MessageSquare size={16} className="text-indigo-600" strokeWidth={2.25} />
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                    Comments ({commentsApi.comments.length})
                  </h3>
                </div>
                <div className="max-h-[300px] overflow-y-auto p-4 space-y-1">
                  <CommentsList
                    comments={commentsApi.comments}
                    loading={commentsApi.loading}
                    currentUserName={currentUserName}
                    isProjectOwner={isProjectOwner}
                    onEdit={handleEditComment}
                    onRequestDelete={(id) => setConfirmDeleteCommentId(id)}
                    onToggleReaction={(id, emoji, oldEmoji) => commentsApi.toggleReaction(id, emoji, oldEmoji)}
                  />
                </div>
                <div className="p-4 border-t border-gray-100 dark:border-gray-800">
                  <CommentComposer
                    submitting={false}
                    onSubmit={async (body) => {
                      await handleAddComment(body)
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        ) : (
          /* ════════════════════════════════════════════════════════════
             VIEW MODE — Beautiful document card with sidebar comments
             ════════════════════════════════════════════════════════════ */
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden flex flex-col">
              {/* Header with gradient accent */}
              <div className={`h-1.5 bg-gradient-to-r ${gradient}`} />
              <header className="flex items-start gap-4 p-6">
                <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${gradient} text-white flex items-center justify-center shadow-lg shrink-0`}>
                  <Icon size={26} strokeWidth={2.25} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${KIND_BADGE[kind]}`}>
                      {kind === 'file' ? 'File' : 'Document'}
                    </span>
                    <span className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold">
                      By {doc.author_name} · {fmtRelative(doc.created_at)}
                      {doc.updated_at && doc.updated_at !== doc.created_at ? ' · edited' : ''}
                    </span>
                  </div>
                  <h1 className="text-xl font-bold text-gray-900 dark:text-white break-words leading-tight">{doc.title}</h1>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {!editing && canEdit && (
                    <button
                      type="button"
                      onClick={() => setEditing(true)}
                      className="w-10 h-10 inline-flex items-center justify-center text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-xl bg-transparent border-none cursor-pointer"
                      title="Edit document"
                    >
                      <Pencil size={16} strokeWidth={2.25} />
                    </button>
                  )}
                  {(doc.author_name === currentUserName || isProjectOwner) && (
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(true)}
                      className="w-10 h-10 inline-flex items-center justify-center text-gray-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-xl bg-transparent border-none cursor-pointer"
                      title="Delete document"
                    >
                      <Trash2 size={16} strokeWidth={2.25} />
                    </button>
                  )}
                </div>
              </header>

              {/* Body content */}
              <div className="px-6 pb-6">
                {doc.kind === 'file' ? (
                  (() => {
                    const isImage = doc.file_type ? /^image\//i.test(doc.file_type) : /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(doc.title)
                    return (
                      <div className="rounded-2xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 overflow-hidden">
                        {isImage && doc.file_url ? (
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() => setImagePreview(doc.file_url)}
                              className="block w-full cursor-zoom-in"
                            >
                              <img
                                src={doc.file_url}
                                alt={doc.title}
                                className="w-full max-h-[480px] object-contain bg-gray-100 dark:bg-gray-900"
                              />
                            </button>
                            <a
                              href={doc.file_url}
                              download={doc.title}
                              className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 px-4 py-2 bg-black/60 hover:bg-black/80 text-white rounded-xl text-xs font-semibold backdrop-blur-sm no-underline"
                            >
                              <Download size={13} strokeWidth={2.5} /> Download
                            </a>
                          </div>
                        ) : (
                          <div className="text-center py-10">
                            <Icon size={56} className="mx-auto text-gray-400 mb-3" strokeWidth={1.5} />
                            <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">{doc.title}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                              {doc.file_type || 'Unknown type'} · {formatBytes(doc.file_size)}
                            </p>
                            <a
                              href={doc.file_url!}
                              download={doc.title}
                              className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow no-underline"
                            >
                              <Download size={14} strokeWidth={2.5} /> Download file
                            </a>
                          </div>
                        )}
                      </div>
                    )
                  })()
                ) : (
                  <div className="rounded-2xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 p-5 mb-5 min-h-[120px]">
                    <DocumentReader html={doc.content_html} />
                  </div>
                )}

                {/* Reactions (documents only) */}
                {doc.kind !== 'file' && (
                  <div className="mb-4">
                    <DocumentReactions
                      reactions={doc.reactions}
                      onToggle={handleToggleReaction}
                      currentUserName={currentUserName}
                    />
                  </div>
                )}

                {/* Image preview lightbox */}
                {imagePreview && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm animate-fade-in-up" role="dialog" aria-modal="true">
                    <button
                      type="button"
                      onClick={() => setImagePreview(null)}
                      className="absolute top-4 right-4 w-10 h-10 inline-flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 rounded-xl bg-transparent border-none cursor-pointer"
                      title="Close preview"
                    >
                      <X size={18} strokeWidth={2.5} />
                    </button>
                    <img
                      src={imagePreview}
                      alt="Preview"
                      className="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
                    />
                  </div>
                )}

                {/* Comments section — collapsible card */}
                <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
                  {/* Header — always visible */}
                  <button
                    type="button"
                    onClick={() => setCommentsOpen((v) => !v)}
                    className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition bg-transparent border-none cursor-pointer"
                  >
                    <div className="w-9 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center shrink-0">
                      <MessageSquare size={16} className="text-indigo-600 dark:text-indigo-400" strokeWidth={2.25} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-gray-900 dark:text-white">Comments</span>
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${commentsApi.comments.length > 0 ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'}`}>
                          {commentsApi.comments.length}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                        {commentsOpen ? 'Click to collapse' : commentsApi.comments.length > 0 ? `${commentsApi.comments.length} comment${commentsApi.comments.length === 1 ? '' : 's'} — click to view` : 'No comments yet — click to add'}
                      </p>
                    </div>
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition ${commentsOpen ? 'bg-indigo-100 dark:bg-indigo-900/40 rotate-180' : 'bg-gray-100 dark:bg-gray-800'}`}>
                      <ChevronDown size={16} className={commentsOpen ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400'} />
                    </div>
                  </button>

                  {/* Expanded content */}
                  {commentsOpen && (
                    <div className="border-t border-gray-100 dark:border-gray-800">
                      {/* Comments list */}
                      <div className="px-5 py-4 space-y-1 max-h-[400px] overflow-y-auto">
                        {commentsApi.loading ? (
                          <div className="text-center py-8 text-sm text-gray-500 dark:text-gray-400">Loading comments…</div>
                        ) : commentsApi.comments.length === 0 ? (
                          <div className="text-center py-8">
                            <MessageSquare size={28} className="mx-auto text-gray-300 dark:text-gray-600 mb-2" strokeWidth={1.5} />
                            <p className="text-sm text-gray-500 dark:text-gray-400">No comments yet. Be the first to comment!</p>
                          </div>
                        ) : (
                          <CommentsList
                            comments={commentsApi.comments}
                            loading={commentsApi.loading}
                            currentUserName={currentUserName}
                            isProjectOwner={isProjectOwner}
                            onEdit={handleEditComment}
                            onRequestDelete={(id) => setConfirmDeleteCommentId(id)}
                            onToggleReaction={(id, emoji, oldEmoji) => commentsApi.toggleReaction(id, emoji, oldEmoji)}
                          />
                        )}
                      </div>

                      {/* Comment composer */}
                      <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/30">
                        <CommentComposer
                          submitting={false}
                          onSubmit={async (body) => { await handleAddComment(body) }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

            </div>
          )}

        {/* Confirm dialogs */}
        <ConfirmDialog
          open={confirmDelete}
          title={doc.kind === 'file' ? 'Delete this file?' : 'Delete this document?'}
          description={doc.kind === 'file' ? 'The uploaded file will be permanently removed.' : 'This document and all its comments will be permanently removed.'}
          confirmLabel="Delete"
          destructive
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(false)}
        />
        <ConfirmDialog
          open={confirmDeleteCommentId !== null}
          title="Delete this comment?"
          description="This comment will be permanently removed."
          confirmLabel="Delete comment"
          destructive
          onConfirm={async () => {
            if (!confirmDeleteCommentId) return
            try {
              await commentsApi.remove(confirmDeleteCommentId)
              toast.success('Comment deleted')
              setConfirmDeleteCommentId(null)
            } catch (e: any) {
              toast.error(e?.message || 'Failed to delete comment')
            }
          }}
          onCancel={() => setConfirmDeleteCommentId(null)}
        />
      </div>
    </FeaturePage>
  )
}
