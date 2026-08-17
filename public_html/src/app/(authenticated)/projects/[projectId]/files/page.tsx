'use client'
import PortalModal from '@/components/PortalModal';

/**
 * /projects/[projectId]/files
 *
 * Real-API Files & Documents section. Both rich-text documents (Tiptap) and
 * uploaded files (PDF / DOCX / TXT / images / etc.) live in the same list,
 * disambiguated by `kind === 'doc' | 'file'`.
 *
 * Architecture reuses pieces from the Message Board feature:
 *   - Tiptap editor (StarterKit) for rich-text editing
 *   - emoji-picker-react + custom chip tooltips for reactions
 *   - ConfirmDialog for destructive actions
 *   - react-hot-toast for success/error feedback
 *   - All data from /api/documents; no page reloads
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import {
  Loader2, FileText, Folder, Image as ImageIcon, Upload, Video, FileSpreadsheet,
  File as FileIcon, Plus, Eye, Pencil, Trash2, MessageSquare, X, Send, Download, Smile, ChevronLeft,
} from 'lucide-react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import {
  Bold, Italic, List, ListOrdered, Quote, Code, Heading2, Undo2, Redo2,
} from 'lucide-react'
import FeaturePage from '@/components/project/FeaturePage'
import EmptyState from '@/components/project/EmptyState'
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

/* ─── Tiptap editor (rich-text) ─── */
function RichTextEditor({
  initialHtml, onChange, autoFocus = false, placeholder = 'Start writing…',
}: { initialHtml?: string; onChange?: (html: string) => void; autoFocus?: boolean; placeholder?: string }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Placeholder.configure({ placeholder, showOnlyWhenEditable: true, emptyEditorClass: 'is-editor-empty' }),
    ],
    content: initialHtml || '',
    editorProps: {
      attributes: {
        class: 'prose prose-sm dark:prose-invert max-w-none focus:outline-none px-4 py-3',
      },
    },
    immediatelyRender: false,
    autofocus: autoFocus,
    onUpdate: ({ editor }) => onChange?.(editor.getHTML()),
  })
  if (!editor) return <div className="h-32 bg-gray-50 dark:bg-gray-800 rounded-xl animate-pulse" />
  const ToolBtn = ({
    onClick, active, children, title,
  }: { onClick: () => void; active?: boolean; children: React.ReactNode; title: string }) => (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onClick() }}
      title={title} aria-label={title} aria-pressed={active}
      className={`w-7 h-7 sm:w-8 sm:h-8 inline-flex items-center justify-center rounded-lg transition border-none cursor-pointer shrink-0 ${
        active ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300'
               : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
      }`}
    >{children}</button>
  )
  return (
    <div className="flex flex-col gap-2 flex-1 min-h-0">
      <div className="flex flex-wrap items-center gap-0.5 p-1 bg-gray-50 dark:bg-gray-800/60 rounded-xl border border-gray-200 dark:border-gray-700 shrink-0">
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
      <div className="flex-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl overflow-auto min-h-[160px] md:min-h-[320px]">
        <EditorContent editor={editor} placeholder={placeholder} />
      </div>
    </div>
  )
}

/* ─── Reading view (sanitized HTML render) ─── */
function DocumentReader({ html }: { html: string }) {
  return (
    <div
      className="prose prose-sm dark:prose-invert max-w-none px-1 py-2"
      // Server-side sanitization strips script/style/iframe/onclick/javascript:
      // before saving, so it's safe to render directly.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

/* ─── Comment composer ─── */
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
    try {
      await onSubmit(trimmed)
      setBody('')
    } catch { /* toast surfaces the error */ }
  }

  return (
    <div className="flex items-start gap-2">
      <textarea
        ref={inputRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit() }
        }}
        placeholder="Add a comment… (Cmd/Ctrl+Enter to send)"
        rows={2}
        className="flex-1 resize-none bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
      />
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={submit}
          disabled={!body.trim() || submitting}
          className="inline-flex items-center justify-center w-9 h-9 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow border-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          title="Send comment"
        >
          {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
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

/* ─── Single comment row ─── */
function CommentRow({
  comment, canEdit, onEdit, onDelete,
}: {
  comment: DocumentComment
  canEdit: boolean
  onEdit: (body: string) => Promise<void>
  onDelete: () => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)

  if (editing) {
    return (
      <CommentComposer
        autoFocus
        initialValue={comment.body}
        submitting={busy}
        onSubmit={async (body) => {
          setBusy(true)
          try { await onEdit(body); setEditing(false) }
          finally { setBusy(false) }
        }}
        onCancel={() => setEditing(false)}
      />
    )
  }

  return (
    <div className="flex items-start gap-2.5 group">
      <div className="w-8 h-8 shrink-0 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 text-white text-[10px] font-bold flex items-center justify-center">
        {comment.author_avatar
          ? <img src={comment.author_avatar} alt={comment.author_name} className="w-8 h-8 rounded-full object-cover" />
          : comment.author_initials}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-xs font-semibold text-gray-900 dark:text-white truncate">{comment.author_name}</span>
          <span className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold">
            {fmtRelative(comment.created_at)}{comment.updated_at && comment.updated_at !== comment.created_at ? ' · edited' : ''}
          </span>
        </div>
        <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words mt-0.5">{comment.body}</p>
      </div>
      {canEdit && (
        <div className="opacity-0 group-hover:opacity-100 transition flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="w-7 h-7 inline-flex items-center justify-center text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg bg-transparent border-none cursor-pointer"
            title="Edit comment"
          >
            <Pencil size={12} strokeWidth={2.25} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="w-7 h-7 inline-flex items-center justify-center text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-lg bg-transparent border-none cursor-pointer"
            title="Delete comment"
          >
            <Trash2 size={12} strokeWidth={2.25} />
          </button>
        </div>
      )}
    </div>
  )
}

/* ─── Comments list (read-only list, scrolls inside the body) ───
    NOTE: takes comments/handlers as props instead of calling useComments()
    itself. The hook is hoisted into DocumentViewer so the composer (footer)
    and list share a single source of truth — otherwise adding a comment via
    the footer updates only the footer’s hook state and the list goes stale
    until you refresh. */
function CommentsList({
  comments, loading, currentUserName, isProjectOwner, onEdit, onRequestDelete,
}: {
  comments: DocumentComment[]
  loading: boolean
  currentUserName: string
  isProjectOwner: boolean
  onEdit: (id: DocumentComment['id'], body: string) => Promise<void>
  onRequestDelete: (id: DocumentComment['id']) => void
}) {
  return (
    <div className="border-t border-gray-200 dark:border-gray-800 pt-4 mt-4">
      <div className="flex items-center gap-1.5 mb-3">
        <MessageSquare size={14} className="text-gray-500" />
        <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Comments <span className="text-gray-400 dark:text-gray-500">({comments.length})</span>
        </h4>
      </div>
      <div className="space-y-3">
        {comments.map((c) => (
          <CommentRow
            key={c.id}
            comment={c}
            canEdit={c.is_mine || isProjectOwner}
            onEdit={(body) => onEdit(c.id, body)}
            onDelete={async () => onRequestDelete(c.id)}
          />
        ))}
        {comments.length === 0 && !loading && (
          <p className="text-xs text-gray-400 dark:text-gray-500 italic text-center py-2">No comments yet — be the first.</p>
        )}
        {loading && (
          <div className="flex justify-center py-2"><Loader2 size={14} className="animate-spin text-gray-400" /></div>
        )}
      </div>
    </div>
  )
}

/* ─── Comments composer (mounted in the modal footer) ─── */
function CommentsFooter({
  onAdd,
}: {
  onAdd: (body: string) => Promise<void>
}) {
  return (
    <div className="border-t border-gray-200 dark:border-gray-800 px-4 sm:px-5 py-3 bg-white dark:bg-gray-900">
      <CommentComposer onSubmit={onAdd} />
    </div>
  )
}

/* ─── Document viewer/editor drawer ─── */
function DocumentViewer({
  doc, onClose, currentUserName, isProjectOwner, docs,
}: {
  doc: Document
  onClose: () => void
  currentUserName: string
  isProjectOwner: boolean
  // `docs` is the SAME `useDocuments` hook instance from FilesPage. Passing
  // it in instead of mounting a second `useDocuments` inside the viewer is
  // what makes reactions update in the chips immediately — the page-level
  // useEffect that syncs `openDoc` watches `docs.documents`, so it needs to
  // see the same array instance the toggle handler mutates. Previously the
  // viewer had its own `useDocuments` call; mutations went to the viewer's
  // local state but the page-level `docs.documents` stayed stale, so the
  // chips never re-rendered.
  docs: ReturnType<typeof useDocuments>
}) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(doc.title)
  const [html, setHtml] = useState(doc.content_html || '')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmDeleteCommentId, setConfirmDeleteCommentId] = useState<DocumentComment['id'] | null>(null)
  const [deleting, setDeleting] = useState(false)
  // Hoist the comments hook into the viewer so the list (in the body) and
  // the composer (sticky footer) share state. The delete-confirm dialog also
  // uses `commentsApi.remove` below.
  const commentsApi = useComments(doc.id)
  const canEdit = doc.kind === 'doc' && (doc.author_name === currentUserName || isProjectOwner)

  // ─── Auto-scroll the body to keep the comments visible ───
  // Ref to the scrollable body container. We scroll this entire container to
  // its scrollHeight on (a) initial open and (b) whenever the comment count
  // INCREASES. The doc body has the document content first, reactions next,
  // and comments last — so scrolling to the bottom reliably puts the
  // comments section + sticky composer in the viewport.
  const bodyScrollRef = useRef<HTMLDivElement>(null)
  const prevCommentsLenRef = useRef<number>(-1)   // -1 = uninitialised
  const scrollToBottom = () => {
    const el = bodyScrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }
  // (a) On initial open, wait for layout to settle (Tiptap etc.) then scroll.
  useEffect(() => {
    const id = window.setTimeout(scrollToBottom, 250)
    return () => window.clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id])
  // (b) When new comments are added, scroll the body to the bottom so the new
  // comment is in view. Trigger only on a length INCREASE so deletes / edits
  // don't yank the viewport.
  useEffect(() => {
    const len = commentsApi.comments.length
    if (prevCommentsLenRef.current === -1) {
      prevCommentsLenRef.current = len // first mount — initial load, not an add
      return
    }
    if (len > prevCommentsLenRef.current) scrollToBottom()
    prevCommentsLenRef.current = len
  }, [commentsApi.comments.length])

  const handleSave = async () => {
    if (!title.trim()) { toast.error('Title is required'); return }
    setSaving(true)
    try {
      await docs.update(doc.id, { title: title.trim(), content_html: html })
      toast.success('Document updated')
      setEditing(false)
    } catch (e: any) {
      toast.error(e?.message || 'Failed to update document')
    } finally {
      setSaving(false)
    }
  }
  const handleDelete = async () => {
    setDeleting(true)
    try {
      await docs.remove(doc.id)
      toast.success('Document deleted')
      onClose()
    } catch (e: any) {
      toast.error(e?.message || 'Failed to delete document')
    } finally {
      setDeleting(false)
    }
  }
  const handleToggleReaction = async (emoji: string, oldEmoji?: string) => {
    try {
      await docs.toggleReaction(doc.id, emoji, oldEmoji)
    } catch (e: any) {
      toast.error(e?.message || 'Failed to update reaction')
    }
  }

  // Comments handlers — use the hoisted commentsApi so the list and the
  // composer share state. Previously each child called its own useComments,
  // which caused new comments to not appear in the list until refresh.
  const handleAddComment = async (body: string) => {
    try {
      await commentsApi.add(body)
      toast.success('Comment added')
    } catch (e: any) {
      toast.error(e?.message || 'Failed to add comment')
      throw e
    }
  }
  const handleEditComment = async (id: DocumentComment['id'], body: string) => {
    try {
      await commentsApi.edit(id, body)
      toast.success('Comment updated')
    } catch (e: any) {
      toast.error(e?.message || 'Failed to update comment')
      throw e
    }
  }
  const kind = doc.kind === 'file' ? FILE_KIND(doc.file_type, doc.title) : 'doc'
  const Icon = KIND_ICON[kind] || FileIcon

  return (
    <PortalModal>
            <div className="fixed inset-0 z-40 flex items-stretch sm:items-center justify-center p-0 sm:p-4 animate-fade-in-up" role="dialog" aria-modal="true">
              <div className="absolute inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm" onClick={onClose} aria-hidden />
              <div className="relative bg-white dark:bg-gray-900 rounded-none sm:rounded-2xl shadow-2xl border-0 sm:border border-gray-200 dark:border-gray-800 w-full sm:max-w-3xl h-full sm:h-auto sm:max-h-[90vh] flex flex-col">
                {/* Header */}
                <header className="flex items-start gap-3 p-5 border-b border-gray-200 dark:border-gray-800">
                  <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 flex items-center justify-center shrink-0">
                    <Icon size={20} strokeWidth={2.25} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${KIND_BADGE[kind]}`}>
                        {kind === 'file' ? 'File' : 'Document'}
                      </span>
                      <span className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold">
                        By {doc.author_name} · {fmtRelative(doc.created_at)}
                        {doc.updated_at && doc.updated_at !== doc.created_at ? ' · edited' : ''}
                      </span>
                    </div>
                    {editing ? (
                      <input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="w-full mt-1 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-base font-bold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="Document title"
                      />
                    ) : (
                      <h2 className="text-base font-bold text-gray-900 dark:text-white truncate" title={doc.title}>{doc.title}</h2>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {!editing && canEdit && (
                      <button
                        type="button"
                        onClick={() => setEditing(true)}
                        className="w-9 h-9 inline-flex items-center justify-center text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg bg-transparent border-none cursor-pointer"
                        title="Edit document"
                      >
                        <Pencil size={15} strokeWidth={2.25} />
                      </button>
                    )}
                    {(doc.author_name === currentUserName || isProjectOwner) && (
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(true)}
                        className="w-9 h-9 inline-flex items-center justify-center text-gray-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-lg bg-transparent border-none cursor-pointer"
                        title="Delete document"
                      >
                        <Trash2 size={15} strokeWidth={2.25} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={onClose}
                      className="w-9 h-9 inline-flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg bg-transparent border-none cursor-pointer"
                      title="Close"
                    >
                      <X size={16} strokeWidth={2.25} />
                    </button>
                  </div>
                </header>
        
                {/* Body */}
                <div ref={bodyScrollRef} className="flex-1 min-h-0 flex flex-col overflow-y-auto p-5 scroll-smooth ">
                  {doc.kind === 'file' ? (
                    <div className="text-center py-8">
                      <Icon size={64} className="mx-auto text-gray-400 mb-3" strokeWidth={1.5} />
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">{doc.title}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {doc.file_type || 'Unknown type'} · {formatBytes(doc.file_size)}
                      </p>
                      <a
                        href={doc.file_url!}
                        download={doc.title}
                        className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow no-underline"
                      >
                        <Download size={14} strokeWidth={2.5} /> Download
                      </a>
                    </div>
                  ) : editing ? (
                    <RichTextEditor initialHtml={doc.content_html} onChange={setHtml} autoFocus />
                  ) : (
                    <DocumentReader html={doc.content_html} />
                  )}
        
                  {/* Reactions + Comments list */}
                  <DocumentReactions
                    reactions={doc.reactions}
                    onToggle={handleToggleReaction}
                    currentUserName={currentUserName}
                  />
                  <CommentsList
                    comments={commentsApi.comments}
                    loading={commentsApi.loading}
                    currentUserName={currentUserName}
                    isProjectOwner={isProjectOwner}
                    onEdit={handleEditComment}
                    onRequestDelete={(id) => setConfirmDeleteCommentId(id)}
                  />
                </div>
        
                {/* Footer — sticky. Comment composer always visible while scrolling.
                    In edit mode this becomes the Save/Cancel row instead. */}
                {editing ? (
                  <footer className="flex items-center justify-end gap-2 px-4 sm:px-5 py-3 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
                    <button
                      type="button"
                      onClick={() => { setEditing(false); setTitle(doc.title); setHtml(doc.content_html || '') }}
                      disabled={saving}
                      className="px-4 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-semibold border-none cursor-pointer disabled:opacity-50"
                    >Cancel</button>
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={saving || !title.trim()}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow border-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                      Save changes
                    </button>
                  </footer>
                ) : (
                  <CommentsFooter onAdd={handleAddComment} />
                )}
              </div>
        
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
    </PortalModal>
  )
}

/* ─── New-document modal ─── */
function NewDocumentModal({
  onClose, onCreate,
}: { onClose: () => void; onCreate: (title: string, html: string) => Promise<void> }) {
  const [title, setTitle] = useState('')
  const [html, setHtml] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!title.trim()) { toast.error('Title is required'); return }
    setBusy(true)
    try { await onCreate(title.trim(), html); onClose() }
    catch { /* toast surfaces */ }
    finally { setBusy(false) }
  }

  return (
    <PortalModal>
            <div className="fixed inset-0 z-40 flex items-stretch sm:items-start sm:justify-center sm:pt-12 justify-center p-0 sm:p-4 animate-fade-in-up">
              <div className="absolute inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm" onClick={onClose} aria-hidden />
              <div className="relative bg-white dark:bg-gray-900 rounded-none sm:rounded-2xl shadow-2xl border-0 sm:border border-gray-200 dark:border-gray-800 w-full sm:max-w-2xl flex flex-col max-h-screen sm:max-h-[85vh]">
                <header className="flex items-center justify-between px-4 sm:px-5 py-3 sm:py-4 border-b border-gray-200 dark:border-gray-800">
                  <h2 className="text-base font-bold text-gray-900 dark:text-white">New document</h2>
                  <button type="button" onClick={onClose} className="w-9 h-9 inline-flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg bg-transparent border-none cursor-pointer" title="Close">
                    <X size={16} strokeWidth={2.25} />
                  </button>
                </header>
                <div className="flex-1 min-h-0 flex flex-col overflow-y-auto px-4 sm:px-5 py-4 sm:py-5 gap-3">
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Document title"
                    autoFocus
                    className="shrink-0 w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-base font-semibold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <RichTextEditor onChange={setHtml} placeholder="Start writing…" />
                </div>
                <footer className="flex items-center justify-end gap-2 px-4 sm:px-5 py-3 sm:py-4 border-t border-gray-200 dark:border-gray-800">
                  <button type="button" onClick={onClose} disabled={busy} className="px-3 sm:px-4 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-semibold border-none cursor-pointer disabled:opacity-50">Cancel</button>
                  <button
                    type="button"
                    onClick={submit}
                    disabled={busy || !title.trim()}
                    className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow border-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} strokeWidth={2.5} />}
                    Create document
                  </button>
                </footer>
              </div>
            </div>
    </PortalModal>
  )
}

/* ─── Main page ─── */
export default function FilesPage() {
  const params = useParams<{ projectId: string }>()
  const router = useRouter()
  const projectId = params.projectId
  const docs = useDocuments(projectId)
  const [filter, setFilter] = useState<'all' | 'doc' | 'file'>('all')
  const [showNew, setShowNew] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = useState(false)

  const currentUserName = useMemo(() => {
    if (typeof window === 'undefined') return ''
    try {
      const u = JSON.parse(localStorage.getItem('user') || '{}') as any
      return [u?.firstName ?? u?.first_name, u?.lastName ?? u?.last_name].filter(Boolean).join(' ').trim() || u?.email || ''
    } catch { return '' }
  }, [])
  const currentUserId = useMemo(() => {
    if (typeof window === 'undefined') return null
    try { return (JSON.parse(localStorage.getItem('user') || '{}') as any)?.id ?? null } catch { return null }
  }, [])
  const isProjectOwner = useMemo(() => {
    // Best-effort: backend is the source of truth — 403s surface as toasts.
    // We optimistically allow owner-level actions; the backend will deny them.
    return true
  }, [])

  const filtered = filter === 'all' ? docs.documents : docs.documents.filter((d) => d.kind === filter)

  // After creating a doc or uploading a file, stay on the list/grid so the
  // user can immediately add more, edit other items, or filter — instead of
  // being teleported into the new item's viewer page. The `useDocuments`
  // hook already patches local state on success, so the grid updates live.
  const handleCreate = async (title: string, html: string) => {
    try {
      const created = await docs.create({ title, content_html: html })
      toast.success('Document created')
      setShowNew(false)
    } catch (e: any) {
      toast.error(e?.message || 'Failed to create document')
    }
  }

  const handleUpload = async (file: File) => {
    setUploading(true)
    try {
      const created = await docs.upload(file)
      toast.success('File uploaded')
      // Stay on the list — don't push to the new file's viewer page.
      // Reset the file input so the same filename can be re-uploaded later.
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (e: any) {
      toast.error(e?.message || 'Failed to upload file')
    } finally {
      setUploading(false)
    }
  }

  // Live sync no longer needed in the grid view — the dedicated [docId]
  // page owns its own useDocuments and refetches when the URL changes.

  return (
    <FeaturePage featureKey="files" title="Files & Documents">
      <div className="space-y-4">
        {/* Toolbar */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white">Files & documents</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {docs.documents.length} item{docs.documents.length === 1 ? '' : 's'}
              {docs.error && <span className="text-rose-600 dark:text-rose-300 ml-2">· {docs.error}</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowNew(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold cursor-pointer"
            >
              <Plus size={14} strokeWidth={2.5} /> New document
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow border-none cursor-pointer disabled:opacity-50"
            >
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} strokeWidth={2.5} />}
              Upload file
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.txt,.md,.odt,.rtf,.csv,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.webp,.svg,.mp4,.webm,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleUpload(f)
                e.target.value = ''
              }}
            />
          </div>
        </div>

        {/* Filter chips */}
        <div className="flex flex-wrap gap-2">
          {[
            { v: 'all', label: 'All' },
            { v: 'doc', label: 'Documents' },
            { v: 'file', label: 'Files' },
          ].map((k) => (
            <button
              key={k.v}
              type="button"
              onClick={() => setFilter(k.v as any)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition border ${
                filter === k.v
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >{k.label}</button>
          ))}
        </div>

        {/* Grid */}
        {docs.loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4 h-40 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            iconName="Folder"
            title={filter === 'all' ? 'No files or documents yet' : `No ${filter === 'doc' ? 'documents' : 'files'} here`}
            description={filter === 'all' ? 'Create a rich-text document or upload a file to share it with your team.' : 'Try a different filter or create something new.'}
            actionLabel={filter === 'all' ? 'Create your first document' : undefined}
            onAction={filter === 'all' ? () => setShowNew(true) : undefined}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {filtered.map((d) => {
              const kind = d.kind === 'file' ? FILE_KIND(d.file_type, d.title) : 'doc'
              const Icon = KIND_ICON[kind] || FileIcon
              const gradient = KIND_GRADIENT[kind]
              const preview = d.kind === 'file'
                ? (d.file_type || '').split('/').pop()?.toUpperCase() || 'FILE'
                : (d.content_html || '')
                    .replace(/<\/(p|h[1-6]|li|ul|ol|blockquote|pre|div)>/gi, ' ')
                    .replace(/<br\s*\/?>/gi, ' ')
                    .replace(/<[^>]*>/g, '')
                    .replace(/\s+/g, ' ')
                    .trim()
                    .slice(0, 100)
              const totalReactions = d.reactions.reduce((acc, r) => acc + r.count, 0)
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => router.push(`/projects/${projectId}/files/${d.id}`)}
                  className="text-left bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm hover:shadow-md hover:border-indigo-200 dark:hover:border-indigo-800 hover:-translate-y-0.5 transition-all duration-200 cursor-pointer overflow-hidden group"
                >
                  {/* Gradient accent bar */}
                  <div className={`h-1 bg-gradient-to-r ${gradient}`} />
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${gradient} text-white flex items-center justify-center shadow-md group-hover:shadow-lg transition-shadow`}>
                        <Icon size={22} strokeWidth={2.25} />
                      </div>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border shrink-0 ${KIND_BADGE[kind]}`}>
                        {kind}
                      </span>
                    </div>
                    <p className="text-sm font-bold text-gray-900 dark:text-white truncate mb-1.5" title={d.title}>{d.title}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 min-h-[2.5em] leading-relaxed mb-3">
                      {preview || (d.kind === 'file' ? formatBytes(d.file_size) : 'Empty document — click to add content')}
                    </p>
                    <div className="flex items-center justify-between text-[10px] text-gray-400 dark:text-gray-500 font-semibold uppercase tracking-wider pt-2 border-t border-gray-100 dark:border-gray-800">
                      <span>{fmtRelative(d.last_modified)}</span>
                      <div className="flex items-center gap-2.5">
                        {d.comment_count > 0 && (
                          <span className="inline-flex items-center gap-0.5"><MessageSquare size={10} /> {d.comment_count}</span>
                        )}
                        {totalReactions > 0 && (
                          <span className="inline-flex items-center gap-0.5"><Smile size={10} /> {totalReactions}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Modals */}
      {showNew && <NewDocumentModal onClose={() => setShowNew(false)} onCreate={handleCreate} />}
    </FeaturePage>
  )
}
