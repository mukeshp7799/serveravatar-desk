'use client'

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useId,
} from 'react'
import api from '@/lib/api'
import { memberAvatarColor, memberInitials } from '@/lib/project-members-api'

/* ─────────────────────────────────────────────────────────────────
 *  Types
 * ──────────────────────────────────────────────────────────────── */

export interface ActiveMember {
  id: number | string
  first_name?: string
  last_name?: string
  email?: string
  avatar_url?: string | null
}

export interface MentionToken {
  /** Unique index of this mention in the content string. */
  index: number
  /** Start position in the plain-text string. */
  start: number
  /** End position in the plain-text string. */
  end: number
  /** The username that was matched, e.g. "mukesh.prajapati" */
  username: string
  /** Full display name, e.g. "Mukesh Prajapati" */
  displayName: string
  userId: number | string
}

/** Build display name + normalised username from raw user fields. */
export function mentionDisplayName(m: ActiveMember): string {
  const first = (m.first_name || '').trim()
  const last = (m.last_name || '').trim()
  const combined = `${first} ${last}`.trim()
  if (combined) return combined
  return m.email || 'Unknown'
}

/** Normalise a user to a @-mention username (lowercase, dot-separated). */
export function mentionUsername(m: ActiveMember): string {
  const first = (m.first_name || '').trim().toLowerCase().replace(/\s+/g, '.')
  const last = (m.last_name || '').trim().toLowerCase().replace(/\s+/g, '.')
  if (first || last) return `${first}.${last}`.replace(/^\.|\.$/g, '')
  return (m.email || '').toLowerCase().split('@')[0] || ''
}

/** Extract MentionTokens from raw text. Returns token objects with positions. */
export function extractMentionTokens(text: string, members: ActiveMember[]): MentionToken[] {
  if (!text || !members.length) return []
  const tokens: MentionToken[] = []
  // Match @firstname[.lastname] patterns
  const RE = /@([a-zA-Z][a-zA-Z0-9._-]{1,49})/g
  let m: RegExpExecArray | null
  while ((m = RE.exec(text)) !== null) {
    const rawUsername = m[1].toLowerCase()
    const matched = members.find((mem) => {
      const uname = mentionUsername(mem)
      return uname === rawUsername || uname.replace(/\./g, ' ') === rawUsername
    })
    if (matched) {
      tokens.push({
        index: tokens.length,
        start: m.index,
        end: m.index + m[0].length,
        username: mentionUsername(matched),
        displayName: mentionDisplayName(matched),
        userId: matched.id,
      })
    }
  }
  return tokens
}

/* ─────────────────────────────────────────────────────────────────
 *  Props
 * ──────────────────────────────────────────────────────────────── */

export interface MentionInputProps {
  /** Current project ID — used to fetch active members for autocomplete.
   *  Pass 'all' (or any truthy non-numeric value) when `fetchAllUsers` is true. */
  projectId: number | string
  /** When true, fetch all active system users instead of project members.
   *  Uses GET /api/users/active for @mention autocomplete. */
  fetchAllUsers?: boolean
  /** Controlled value — the raw text/HTML content. */
  value: string
  /** Called when the content changes with the new raw text value. */
  onChange: (value: string) => void
  /** Placeholder text shown when empty. */
  placeholder?: string
  /** Extra CSS class for the textarea. */
  className?: string
  /** Number of rows for the textarea. Default 3. */
  rows?: number
  /** Disabled state. Default false. */
  disabled?: boolean
  /** Max character count. No limit when omitted. */
  maxLength?: number
  /** Called when Ctrl+Enter (or Cmd+Enter) is pressed in the textarea. */
  onCtrlEnter?: () => void
}

/* ─────────────────────────────────────────────────────────────────
 *  Component
 * ──────────────────────────────────────────────────────────────── */

export default function MentionInput({
  projectId,
  fetchAllUsers = false,
  value,
  onChange,
  placeholder = 'Write something… (type @ to mention)',
  className = '',
  rows = 3,
  disabled = false,
  maxLength,
  onCtrlEnter,
}: MentionInputProps) {
  const uid = useId()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const [members, setMembers] = useState<ActiveMember[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  /** Position of the @ that triggered the dropdown, in textarea char coords. */
  const [triggerAt, setTriggerAt] = useState<number | null>(null)
  const [cursorPos, setCursorPos] = useState(0)

  /* ── Fetch members: project-scoped or all active system users ─── */
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const endpoint = fetchAllUsers ? '/users/active' : `/projects/${projectId}/active-members`
    api
      .get(endpoint)
      .then((data: any) => {
        if (cancelled) return
        // Both endpoints return { users: [...] } or { members: [...] }
        const list = fetchAllUsers
          ? (Array.isArray(data?.users) ? data.users : [])
          : (Array.isArray(data?.members) ? data.members : [])
        setMembers(list)
      })
      .catch(() => {
        if (!cancelled) setMembers([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [projectId, fetchAllUsers])

  /* ── Filtered dropdown list ────────────────────────────────── */
  const filtered = query
    ? members.filter((mem) => {
        const dn = mentionDisplayName(mem).toLowerCase()
        const un = mentionUsername(mem).toLowerCase()
        return dn.includes(query.toLowerCase()) || un.includes(query.toLowerCase())
      })
    : members

  /* ── Detect @ trigger ────────────────────────────────────── */
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const text = e.target.value
      const pos = e.target.selectionStart ?? 0
      onChange(text)
      setCursorPos(pos)

      // Look for an unclosed @ before the cursor.
      const textBefore = text.slice(0, pos)
      const lastAt = textBefore.lastIndexOf('@')
      if (lastAt !== -1) {
        const afterAt = textBefore.slice(lastAt + 1)
        // If there's no whitespace between @ and cursor, treat as an active query.
        const hasSpace = /[\s]/.test(afterAt)
        if (!hasSpace && afterAt.length < 50) {
          setTriggerAt(lastAt)
          setQuery(afterAt)
          setOpen(true)
          setSelectedIndex(0)
          return
        }
      }
      // Otherwise close dropdown.
      setOpen(false)
      setQuery('')
      setTriggerAt(null)
    },
    [onChange]
  )

  /* ── Sync cursor position on keyup/click ───────────────────── */
  const handleSelect = useCallback(
    (e: React.MouseEvent | React.KeyboardEvent) => {
      const pos = (e.target as HTMLTextAreaElement).selectionStart ?? cursorPos
      setCursorPos(pos)
      const text = (e.target as HTMLTextAreaElement).value || value
      const textBefore = text.slice(0, pos)
      const lastAt = textBefore.lastIndexOf('@')
      if (lastAt !== -1) {
        const afterAt = textBefore.slice(lastAt + 1)
        if (!/[\s]/.test(afterAt)) {
          setTriggerAt(lastAt)
          setQuery(afterAt)
          setOpen(true)
          setSelectedIndex(0)
          return
        }
      }
      setOpen(false)
      setQuery('')
      setTriggerAt(null)
    },
    [value, cursorPos]
  )

  /* ── Keyboard navigation in dropdown ──────────────────────── */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Ctrl+Enter / Cmd+Enter → send (outside dropdown)
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        if (onCtrlEnter) onCtrlEnter()
        return
      }
      if (!open) return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        if (filtered[selectedIndex]) {
          e.preventDefault()
          insertMention(filtered[selectedIndex])
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
        setQuery('')
        setTriggerAt(null)
      }
    },
    [open, filtered, selectedIndex, onCtrlEnter]
  )

  /* ── Insert a selected mention into the textarea ───────────── */
  const insertMention = useCallback(
    (mem: ActiveMember) => {
      if (triggerAt === null) return
      const username = `@${mentionUsername(mem)}`
      const newText =
        value.slice(0, triggerAt) + username + value.slice(cursorPos)
      onChange(newText)
      setOpen(false)
      setQuery('')
      setTriggerAt(null)
      // Move cursor after the inserted mention.
      setTimeout(() => {
        const ta = textareaRef.current
        if (!ta) return
        const newPos = triggerAt + username.length
        ta.setSelectionRange(newPos, newPos)
        ta.focus()
      }, 0)
    },
    [triggerAt, value, cursorPos, onChange]
  )

  /* ── Close dropdown on outside click ──────────────────────── */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        textareaRef.current &&
        !textareaRef.current.contains(e.target as Node) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
        setQuery('')
        setTriggerAt(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onSelect={handleSelect as any}
        onKeyUp={handleSelect as any}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        maxLength={maxLength}
        id={`mention-${uid}`}
        className={`w-full resize-y rounded-xl border border-gray-200 dark:border-gray-700
          bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100
          placeholder:text-gray-400 dark:placeholder:text-gray-500
          focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
          disabled:opacity-60 disabled:cursor-not-allowed ${className}`}
      />

      {/* Autocomplete dropdown */}
      {open && (
        <div
          ref={dropdownRef}
          className="absolute z-50 mt-1 w-64 rounded-xl border border-gray-200 dark:border-gray-700
            bg-white dark:bg-gray-900 shadow-xl overflow-hidden"
          role="listbox"
          aria-label="Mention a team member"
        >
          {loading && (
            <div className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500">
              Loading members…
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500">
              No members found
            </div>
          )}
          {!loading &&
            filtered.slice(0, 8).map((mem, i) => (
              <button
                key={mem.id}
                type="button"
                role="option"
                aria-selected={i === selectedIndex}
                onMouseDown={(e) => {
                  e.preventDefault() // don't blur textarea
                  insertMention(mem)
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm transition
                  ${i === selectedIndex
                    ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
              >
                {/* Avatar */}
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px]
                    font-bold text-white shrink-0 ${memberAvatarColor(mem as any)}`}
                >
                  {mem.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={mem.avatar_url}
                      alt=""
                      className="w-full h-full rounded-full object-cover"
                    />
                  ) : (
                    memberInitials(mem as any)
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-medium text-xs">
                    {mentionDisplayName(mem)}
                  </p>
                  <p className="truncate text-[10px] text-gray-400 dark:text-gray-500">
                    {mem.email}
                  </p>
                </div>
              </button>
            ))}
        </div>
      )}
    </div>
  )
}
