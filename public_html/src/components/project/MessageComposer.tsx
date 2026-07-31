'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useEffect, useState } from 'react'
import {
  Bold, Italic, List, ListOrdered, Quote, Code, Heading2, Link2, Undo2, Redo2,
} from 'lucide-react'

interface MessageComposerProps {
  initialContent?: string
  placeholder?: string
  onCancel?: () => void
  onSubmit: (bodyHtml: string) => Promise<void> | void
  submitting?: boolean
  submitLabel?: string
  showCancel?: boolean
}

/**
 * Tiptap-powered rich-text composer used by the Message Board for both
 * "New message" and "Edit message" flows. Submits sanitized HTML to the
 * parent. Server does additional sanitisation.
 */
export default function MessageComposer({
  initialContent = '',
  placeholder = 'Write your message…',
  onSubmit,
  onCancel,
  submitting = false,
  submitLabel = 'Post message',
  showCancel = true,
}: MessageComposerProps) {
  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: { levels: [2, 3] } })],
    content: initialContent || '',
    editorProps: {
      attributes: {
        class: 'h-full overflow-y-auto prose prose-sm dark:prose-invert max-w-none focus:outline-none px-3 py-2',
      },
    },
    immediatelyRender: false,
  })

  // Submit when the form's submit button is clicked via Enter or click.
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editor) return
    const html = editor.getHTML()
    if (!editor.getText().trim()) return
    await onSubmit(html)
  }

  // Force re-render whenever the editor's content changes so the submit
  // button's `disabled` prop (which depends on `editor.getText().trim()`)
  // stays in sync with the latest content.
  const [, force] = useState(0)
  useEffect(() => {
    if (!editor) return
    const onUpdate = () => force((n) => n + 1)
    editor.on('update', onUpdate)
    return () => { editor.off('update', onUpdate) }
  }, [editor])

  if (!editor) {
    return (
      <div className="h-32 bg-gray-50 dark:bg-gray-800 rounded-xl animate-pulse" />
    )
  }

  const ToolBtn = ({
    onClick, active, children, title,
  }: { onClick: () => void; active?: boolean; children: React.ReactNode; title: string }) => (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onClick() }}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={`w-8 h-8 inline-flex items-center justify-center rounded-lg transition border-none cursor-pointer ${
        active ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
      }`}
    >
      {children}
    </button>
  )

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 p-1 bg-gray-50 dark:bg-gray-800/60 rounded-xl border border-gray-200 dark:border-gray-700">
        <ToolBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Bold">
          <Bold size={15} strokeWidth={2.5} />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italic">
          <Italic size={15} strokeWidth={2.5} />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="Heading">
          <Heading2 size={15} strokeWidth={2.5} />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Bulleted list">
          <List size={15} strokeWidth={2.5} />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Numbered list">
          <ListOrdered size={15} strokeWidth={2.5} />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} title="Quote">
          <Quote size={15} strokeWidth={2.5} />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive('codeBlock')} title="Code block">
          <Code size={15} strokeWidth={2.5} />
        </ToolBtn>
        <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1" />
        <ToolBtn onClick={() => editor.chain().focus().undo().run()} title="Undo">
          <Undo2 size={15} strokeWidth={2.5} />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().redo().run()} title="Redo">
          <Redo2 size={15} strokeWidth={2.5} />
        </ToolBtn>
      </div>
      {/* Editor body — fixed initial height (250px), caps at 350px, scrolls internally */}
      <div className="h-[250px] max-h-[350px] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
        <EditorContent editor={editor} className="h-full" placeholder={placeholder} />
      </div>
      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-1">
        {showCancel && onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-xs font-semibold border-none cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={submitting || !editor.getText().trim()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow border-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  )
}