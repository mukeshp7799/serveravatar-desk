'use client'

import { useEffect, useRef, useState } from 'react'
import { Link2, X as XIcon, Trash2, Check, Loader2 } from 'lucide-react'

interface LinkPopoverProps {
  initialUrl?: string
  onApply: (url: string) => void
  onRemove: () => void
  onClose: () => void
  hasExistingLink: boolean
}

/**
 * Inline floating panel for entering/editing a hyperlink URL.
 * Replaces the native `window.prompt()` for a much smoother UX.
 */
export default function LinkPopover({
  initialUrl = '',
  onApply,
  onRemove,
  onClose,
  hasExistingLink,
}: LinkPopoverProps) {
  const [url, setUrl] = useState(initialUrl)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  // Auto-focus the input on mount
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [])

  // Close on Escape, apply on Enter
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        handleApply()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Close on click outside
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    // Delay attaching the listener to avoid catching the click that opened the popover
    const t = setTimeout(() => document.addEventListener('mousedown', onClick), 0)
    return () => {
      clearTimeout(t)
      document.removeEventListener('mousedown', onClick)
    }
  }, [onClose])

  const isValidUrl = (s: string) => {
    try {
      new URL(s)
      return true
    } catch {
      return false
    }
  }

  const handleApply = () => {
    const trimmed = url.trim()
    if (!trimmed) {
      setError('Please enter a URL')
      inputRef.current?.focus()
      return
    }
    // Auto-prepend https:// if no protocol
    const finalUrl = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
    if (!isValidUrl(finalUrl)) {
      setError('Please enter a valid URL (e.g. https://example.com)')
      inputRef.current?.focus()
      return
    }
    onApply(finalUrl)
    onClose()
  }

  return (
    <div
      ref={popoverRef}
      className="absolute top-full left-0 mt-1 z-20 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 p-3 w-80 animate-scale-in"
      role="dialog"
      aria-label="Edit link"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-2 mb-2">
        <Link2 size={14} className="text-indigo-500" />
        <span className="text-xs font-bold uppercase tracking-wide text-gray-600 dark:text-gray-400">
          {hasExistingLink ? 'Edit link' : 'Add link'}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="ml-auto bg-transparent hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg w-6 h-6 flex items-center justify-center cursor-pointer border-none text-gray-500"
        >
          <XIcon size={14} />
        </button>
      </div>
      <input
        ref={inputRef}
        type="url"
        value={url}
        onChange={(e) => {
          setUrl(e.target.value)
          if (error) setError('')
        }}
        placeholder="https://example.com"
        className="w-full text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-900 dark:text-gray-100"
        autoComplete="off"
        spellCheck={false}
      />
      {error && <p className="mt-1.5 text-xs text-rose-600 dark:text-rose-400">{error}</p>}
      <p className="mt-1 text-[10px] text-gray-500 dark:text-gray-400">
        Tip: type <code className="px-1 bg-gray-100 dark:bg-gray-700 rounded">example.com</code> — we&apos;ll add <code className="px-1 bg-gray-100 dark:bg-gray-700 rounded">https://</code> for you.
      </p>
      <div className="mt-3 flex items-center justify-end gap-2">
        {hasExistingLink && (
          <button
            type="button"
            onClick={() => {
              onRemove()
              onClose()
            }}
            className="px-3 py-1.5 text-xs font-bold bg-rose-100 text-rose-700 hover:bg-rose-200 dark:bg-rose-900/40 dark:text-rose-300 dark:hover:bg-rose-900/60 rounded-lg cursor-pointer border-none inline-flex items-center gap-1"
          >
            <Trash2 size={12} strokeWidth={2.5} /> Remove
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 text-xs font-bold bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 rounded-lg cursor-pointer border-none"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleApply}
          className="px-3 py-1.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg cursor-pointer border-none inline-flex items-center gap-1"
        >
          <Check size={12} strokeWidth={2.5} /> Apply
        </button>
      </div>
    </div>
  )
}
