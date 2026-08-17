'use client'

/**
 * Document-level reactions bar. Functionally identical to the message-board
 * ReactionBar — same one-emoji-per-user model, same picker, same portal-tooltip
 * + pop animation UX — but tailored to the document shape:
 *
 *   - Tooltip shows the list of usernames only (no avatar thumbnails).
 *   - Tooltip lists up to ~5 people inline; if there are more we add
 *     "+N others" so the tooltip doesn't get absurdly wide.
 *   - Categories prop hides "Frequently Used" (matches the message-board
 *     picker config).
 *   - **Picker is portaled to document.body** — the parent viewer modal has
 *     `overflow: hidden` on its container for layout reasons, and a regular
 *     inline picker gets clipped by that overflow. Portaling escapes the
 *     clipping ancestor and renders the picker as a top-layer overlay.
 *   - Picker width is responsive: 280px on phones (fits 375px viewport with
 *     some margin), 320px on tablets+. Tracked via resize listener so the
 *     picker re-renders on orientation change.
 */

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Plus, Smile } from 'lucide-react'
import EmojiPicker, {
  Theme, EmojiStyle, Categories, type CategoryConfig, type EmojiClickData,
} from 'emoji-picker-react'
import type { DocumentReaction } from '@/types/project'

interface Props {
  reactions: DocumentReaction[]
  onToggle: (emoji: string, oldEmoji?: string) => Promise<void> | void
  currentUserName: string
}

const MAX_NAMES_INLINE = 5
const SMALL_WIDTH = 280
const LARGE_WIDTH = 320
// Pick LARGE_WIDTH on >= 640px viewports (sm+). On phones (<640px) use
// SMALL_WIDTH so the picker doesn't get clipped by the screen edge.
const BREAKPOINT = 640
const PICKER_HEIGHT = 360

export default function DocumentReactions({ reactions, onToggle, currentUserName }: Props) {
  const [pickerWidth, setPickerWidth] = useState(LARGE_WIDTH)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerTheme, setPickerTheme] = useState<Theme>(Theme.LIGHT)
  const [pickerPos, setPickerPos] = useState<{ left: number; top: number } | null>(null)
  const [mounted, setMounted] = useState(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const pickerContainerRef = useRef<HTMLDivElement | null>(null)

  // We can only portal on the client — guard with a mount flag.
  useEffect(() => { setMounted(true) }, [])

  // Track viewport width so the picker adapts (280 on phones, 320 on tablet+).
  useEffect(() => {
    if (typeof window === 'undefined') return
    const update = () => setPickerWidth(window.innerWidth >= BREAKPOINT ? LARGE_WIDTH : SMALL_WIDTH)
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  // Sync picker theme with <html data-theme>
  useEffect(() => {
    if (typeof document === 'undefined') return
    const compute = () => {
      const attr = document.documentElement.getAttribute('data-theme')
      if (attr === 'dark') setPickerTheme(Theme.DARK)
      else if (attr === 'light') setPickerTheme(Theme.LIGHT)
      else setPickerTheme(
        typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
          ? Theme.DARK : Theme.LIGHT
      )
    }
    compute()
    const observer = new MutationObserver(compute)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  // Wipe stale suggested-emojis cache once on mount.
  useEffect(() => {
    try { window.localStorage?.removeItem('epr_suggested') } catch (_) {}
  }, [])

  // While the picker is open, recompute the trigger button's position so the
  // portaled picker stays anchored if the page scrolls or the modal repositions.
  useEffect(() => {
    if (!pickerOpen) return
    const update = () => {
      const el = triggerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      // Anchor below the trigger; if there's not enough room below, flip above.
      const spaceBelow = window.innerHeight - rect.bottom
      const top = spaceBelow < PICKER_HEIGHT + 16 ? Math.max(8, rect.top - PICKER_HEIGHT - 8) : rect.bottom + 8
      const left = Math.min(
        Math.max(8, rect.left + rect.width / 2 - pickerWidth / 2),
        window.innerWidth - pickerWidth - 8,
      )
      setPickerPos({ left, top })
    }
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [pickerOpen, pickerWidth])

  // Outside-click close (the picker is in document.body via portal — check both refs).
  useEffect(() => {
    if (!pickerOpen) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (
        triggerRef.current && !triggerRef.current.contains(t) &&
        pickerContainerRef.current && !pickerContainerRef.current.contains(t)
      ) {
        setPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [pickerOpen])

  // Escape closes
  useEffect(() => {
    if (!pickerOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPickerOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [pickerOpen])

  const sorted = [...reactions].sort((a, b) => b.count - a.count)

  // Tooltip builder. If the current user is in the list, replace their entry
  // with "You" and move it to the front.
  const tooltipFor = (r: DocumentReaction) => {
    const isMineUser = (u: { name: string }) =>
      u.name.trim().toLowerCase() === currentUserName.trim().toLowerCase()

    const mineEntry = r.users.find(isMineUser)
    const others = r.users.filter((u) => !isMineUser(u))

    const names: string[] = []
    if (mineEntry) names.push('You')
    for (const u of others) names.push(u.name)

    if (names.length === 0) return r.count > 0 ? 'Anonymous' : 'No reactions'
    const shown = names.slice(0, MAX_NAMES_INLINE)
    const remaining = names.length - shown.length
    return remaining > 0 ? `${shown.join(', ')} +${remaining} other${remaining === 1 ? '' : 's'}` : shown.join(', ')
  }

  // Stable React key per chip — changes when the chip first appears, which
  // triggers a remount and fires the `animate-emoji-pop` keyframe.
  const stableId = (r: DocumentReaction) => `dr-${r.emoji}-${r.users.length}-${r.mine ? 1 : 0}-${r.count}`

  // Render the portaled picker into document.body when open. Mounted guard
  // prevents SSR mismatches; pickerPos guard prevents a flash at (0,0).
  const pickerNode = pickerOpen && mounted && pickerPos ? createPortal(
    <div
      ref={pickerContainerRef}
      role="dialog"
      aria-label="Emoji picker"
      className="fixed z-[9999] animate-scale-in"
      style={{ left: pickerPos.left, top: pickerPos.top, width: pickerWidth }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <EmojiPicker
        onEmojiClick={({ emoji }: EmojiClickData) => {
          setPickerOpen(false)
          const mineEmoji = reactions.find(r => r.mine)?.emoji
          onToggle(emoji, mineEmoji)
        }}
        theme={pickerTheme}
        emojiStyle={EmojiStyle.NATIVE}
        width={pickerWidth}
        height={PICKER_HEIGHT}
        categories={[
          { category: Categories.SMILEYS_PEOPLE, name: 'Smileys & People' },
          { category: Categories.ANIMALS_NATURE, name: 'Animals & Nature' },
          { category: Categories.FOOD_DRINK, name: 'Food & Drink' },
          { category: Categories.TRAVEL_PLACES, name: 'Travel & Places' },
          { category: Categories.ACTIVITIES, name: 'Activities' },
          { category: Categories.OBJECTS, name: 'Objects' },
          { category: Categories.SYMBOLS, name: 'Symbols' },
          { category: Categories.FLAGS, name: 'Flags' },
        ] satisfies CategoryConfig[]}
      />
    </div>,
    document.body,
  ) : null

  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-2">
      {sorted.map((r) => (
        <DocChipWithTooltip
          key={stableId(r)}
          reaction={r}
          reactions={reactions}
          tooltipText={tooltipFor(r)}
          onToggle={onToggle}
        />
      ))}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setPickerOpen((v) => !v)}
        className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-semibold border bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition cursor-pointer"
        title="Add reaction"
        aria-label="Add reaction"
        aria-expanded={pickerOpen}
      >
        <Plus size={11} strokeWidth={2.5} />
        <Smile size={11} strokeWidth={2.5} />
      </button>
      {pickerNode}
    </div>
  )
}

/**
 * One reaction chip + a portal-rendered tooltip (so it floats above any
 * stacking context created by ancestor `transform`s).
 */
function DocChipWithTooltip({
  reaction: r, reactions, tooltipText, onToggle,
}: { reaction: DocumentReaction; reactions: DocumentReaction[]; tooltipText: string; onToggle: (emoji: string, oldEmoji?: string) => void }) {
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const [hovered, setHovered] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])
  useEffect(() => {
    if (!hovered) return
    const update = () => {
      const el = buttonRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      setPos({ left: rect.left + rect.width / 2, top: rect.top, width: rect.width })
    }
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [hovered])

  const tooltip = hovered && pos && mounted ? createPortal(
    <div
      role="tooltip"
      className="pointer-events-none fixed z-[9999] -translate-x-1/2 -translate-y-full mb-1.5 mt-[-6px] px-3 py-2 rounded-lg bg-gray-900 dark:bg-gray-700 text-white text-[11px] font-medium shadow-xl animate-fade-in-up"
      style={{ left: pos.left, top: pos.top }}
    >
      <div className="text-center whitespace-nowrap max-w-[280px] overflow-hidden text-ellipsis">{tooltipText}</div>
      <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900 dark:border-t-gray-700" />
    </div>,
    document.body
  ) : null

  return (
    <span
      className="relative inline-block animate-emoji-pop"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        ref={buttonRef}
        type="button"
        onClick={() => onToggle(r.emoji, reactions.find(r2 => r2.mine)?.emoji ?? undefined)}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold transition border cursor-pointer active:scale-90 hover:scale-105 ${
          r.mine
            ? 'bg-indigo-100 dark:bg-indigo-900/50 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-200 ring-2 ring-indigo-300/40 dark:ring-indigo-700/40'
            : 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
        }`}
      >
        <span className="text-xs leading-none">{r.emoji}</span>
        <span>{r.count}</span>
      </button>
      {tooltip}
    </span>
  )
}
