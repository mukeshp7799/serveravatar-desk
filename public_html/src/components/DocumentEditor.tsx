'use client'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TextAlign from '@tiptap/extension-text-align'
import Color from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Image from '@tiptap/extension-image'
import { TextStyle } from '@tiptap/extension-text-style'
import { useEffect, useRef } from 'react'
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, Heading1, Heading2, Heading3,
  List, ListOrdered, ListChecks, Quote, Code, Code2,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Palette, Highlighter, Table as TableIcon, Minus, Link2, Image as ImageIcon,
  Undo2, Redo2, X as XIcon, Loader2,
} from 'lucide-react'

interface DocumentEditorProps {
  initialTitle?: string
  initialContent?: string
  onSave: (data: { title: string; content_html: string }) => Promise<void> | void
  onCancel: () => void
  saving?: boolean
}

/**
 * Full WYSIWYG editor built on TipTap. The user only sees the formatted
 * document — no HTML or Markdown is exposed in the UI.
 */
export default function DocumentEditor({
  initialTitle = '',
  initialContent = '',
  onSave,
  onCancel,
  saving = false,
}: DocumentEditorProps) {
  const titleRef = useRef<HTMLInputElement>(null)

  const editor = useEditor({
    extensions: [
      // StarterKit provides: Bold, Italic, Strike, Code, CodeBlock, Heading,
      // BulletList, OrderedList, Blockquote, HardBreak, HorizontalRule,
      // History, Link (configure it here so we don't add a duplicate extension),
      // Paragraph, Text, Document.
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, autolink: true },
        horizontalRule: {},
      }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Color,
      Highlight.configure({ multicolor: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      TaskList,
      TaskItem.configure({ nested: true }),
      Image,
      TextStyle, // required for Color extension
    ],
    content: initialContent || '',
    editorProps: {
      attributes: {
        class: 'prose prose-sm sm:prose lg:prose-lg dark:prose-invert max-w-none focus:outline-none min-h-[300px] px-4 py-3',
      },
    },
    immediatelyRender: false, // SSR-safe in Next.js App Router
  })

  // Auto-focus the title on mount
  useEffect(() => {
    setTimeout(() => titleRef.current?.focus(), 50)
  }, [])

  if (!editor) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 size={24} className="animate-spin text-gray-400" />
      </div>
    )
  }

  const handleSave = async () => {
    const title = titleRef.current?.value?.trim() || ''
    if (!title) {
      titleRef.current?.focus()
      titleRef.current?.classList.add('ring-2', 'ring-rose-300', 'border-rose-400')
      setTimeout(() => titleRef.current?.classList.remove('ring-2', 'ring-rose-300', 'border-rose-400'), 2000)
      return
    }
    await onSave({ title, content_html: editor.getHTML() })
  }

  const promptForUrl = (defaultUrl = 'https://') => {
    const url = window.prompt('Enter URL:', defaultUrl)
    return url && url.trim() ? url.trim() : null
  }

  // Toolbar button helper
  const TBtn = ({
    onClick, active, disabled, title, children,
  }: { onClick: () => void; active?: boolean; disabled?: boolean; title: string; children: React.ReactNode }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={title}
      className={`p-1.5 rounded-lg transition cursor-pointer border-none inline-flex items-center justify-center ${
        active ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300' : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
      } disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      {children}
    </button>
  )

  const TSep = () => <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-0.5" />

  return (
    <div className="flex flex-col min-h-0 flex-1">
      {/* Title input */}
      <div className="px-5 pt-4 pb-2 border-b border-gray-100 dark:border-gray-700">
        <label className="block text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Title</label>
        <input
          ref={titleRef}
          defaultValue={initialTitle}
          placeholder="Untitled document…"
          className="w-full text-xl font-extrabold bg-transparent border-2 border-transparent rounded-lg px-2 py-1 focus:outline-none focus:border-indigo-400 focus:bg-white dark:focus:bg-gray-800 dark:text-gray-100 transition"
        />
      </div>

      {/* Formatting toolbar */}
      <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex flex-wrap items-center gap-0.5 sticky top-0 z-10">
        {/* History */}
        <TBtn onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="Undo">
          <Undo2 size={15} strokeWidth={2.25} />
        </TBtn>
        <TBtn onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="Redo">
          <Redo2 size={15} strokeWidth={2.25} />
        </TBtn>
        <TSep />

        {/* Inline marks */}
        <TBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Bold">
          <Bold size={15} strokeWidth={2.5} />
        </TBtn>
        <TBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italic">
          <Italic size={15} strokeWidth={2.25} />
        </TBtn>
        <TBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="Underline">
          <UnderlineIcon size={15} strokeWidth={2.25} />
        </TBtn>
        <TBtn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="Strikethrough">
          <Strikethrough size={15} strokeWidth={2.25} />
        </TBtn>
        <TSep />

        {/* Headings */}
        <TBtn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })} title="Heading 1">
          <Heading1 size={15} strokeWidth={2.25} />
        </TBtn>
        <TBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="Heading 2">
          <Heading2 size={15} strokeWidth={2.25} />
        </TBtn>
        <TBtn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} title="Heading 3">
          <Heading3 size={15} strokeWidth={2.25} />
        </TBtn>
        <TBtn onClick={() => editor.chain().focus().setParagraph().run()} active={editor.isActive('paragraph')} title="Paragraph">
          <span className="text-[11px] font-bold px-0.5">P</span>
        </TBtn>
        <TSep />

        {/* Lists */}
        <TBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Bullet list">
          <List size={15} strokeWidth={2.25} />
        </TBtn>
        <TBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Numbered list">
          <ListOrdered size={15} strokeWidth={2.25} />
        </TBtn>
        <TBtn onClick={() => editor.chain().focus().toggleTaskList().run()} active={editor.isActive('taskList')} title="Task list">
          <ListChecks size={15} strokeWidth={2.25} />
        </TBtn>
        <TSep />

        {/* Blocks */}
        <TBtn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} title="Quote">
          <Quote size={15} strokeWidth={2.25} />
        </TBtn>
        <TBtn onClick={() => editor.chain().focus().toggleCode().run()} active={editor.isActive('code')} title="Inline code">
          <Code size={15} strokeWidth={2.25} />
        </TBtn>
        <TBtn onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive('codeBlock')} title="Code block">
          <Code2 size={15} strokeWidth={2.25} />
        </TBtn>
        <TBtn onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Horizontal rule">
          <Minus size={15} strokeWidth={2.25} />
        </TBtn>
        <TSep />

        {/* Alignment */}
        <TBtn onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })} title="Align left">
          <AlignLeft size={15} strokeWidth={2.25} />
        </TBtn>
        <TBtn onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })} title="Align center">
          <AlignCenter size={15} strokeWidth={2.25} />
        </TBtn>
        <TBtn onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })} title="Align right">
          <AlignRight size={15} strokeWidth={2.25} />
        </TBtn>
        <TBtn onClick={() => editor.chain().focus().setTextAlign('justify').run()} active={editor.isActive({ textAlign: 'justify' })} title="Justify">
          <AlignJustify size={15} strokeWidth={2.25} />
        </TBtn>
        <TSep />

        {/* Color & highlight */}
        <div className="relative inline-flex items-center">
          <input
            type="color"
            onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
            value={editor.getAttributes('textStyle').color || '#000000'}
            className="absolute inset-0 opacity-0 cursor-pointer w-7 h-7"
            aria-label="Text color"
          />
          <span className={`p-1.5 rounded-lg inline-flex items-center justify-center cursor-pointer transition ${editor.isActive('textStyle', { color: /./ }) ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'}`}>
            <Palette size={15} strokeWidth={2.25} />
          </span>
        </div>
        <TBtn onClick={() => editor.chain().focus().toggleHighlight({ color: '#fef08a' }).run()} active={editor.isActive('highlight')} title="Highlight">
          <Highlighter size={15} strokeWidth={2.25} />
        </TBtn>
        <TSep />

        {/* Table */}
        <TBtn
          onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
          title="Insert table"
        >
          <TableIcon size={15} strokeWidth={2.25} />
        </TBtn>
        <TSep />

        {/* Links & images */}
        <TBtn
          onClick={() => {
            const url = promptForUrl(editor.getAttributes('link').href)
            if (url) editor.chain().focus().setLink({ href: url }).run()
          }}
          active={editor.isActive('link')}
          title="Link"
        >
          <Link2 size={15} strokeWidth={2.25} />
        </TBtn>
        <TBtn
          onClick={() => {
            const url = promptForUrl()
            if (url) editor.chain().focus().setImage({ src: url }).run()
          }}
          title="Image"
        >
          <ImageIcon size={15} strokeWidth={2.25} />
        </TBtn>
      </div>

      {/* Editor surface */}
      <div className="flex-1 overflow-y-auto bg-white dark:bg-gray-900 min-h-[320px]">
        <EditorContent editor={editor} />
      </div>

      {/* Footer actions */}
      <div className="sticky bottom-0 border-t border-gray-100 dark:border-gray-700 px-5 py-3 bg-gray-50 dark:bg-gray-800/50 flex flex-wrap justify-end gap-2 shrink-0 z-10">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="px-4 py-2 text-sm font-bold bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 rounded-xl cursor-pointer border-none disabled:opacity-50 inline-flex items-center gap-1"
        >
          <XIcon size={14} strokeWidth={2.5} /> Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl cursor-pointer border-none disabled:opacity-50 inline-flex items-center gap-2 shadow-sm"
        >
          {saving && <Loader2 size={14} className="animate-spin" />}
          Save document
        </button>
      </div>
    </div>
  )
}
