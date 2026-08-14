'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Plus, Smile } from 'lucide-react'
import EmojiPicker, { Theme, EmojiStyle, SkinTones, Categories, type CategoryConfig, type EmojiClickData } from 'emoji-picker-react'
import type { Reaction } from '@/types/project'

interface ReactionBarProps {
  reactions: Reaction[]
  /** Toggle or replace a reaction.
   *  - Clicking own reaction → remove it (onToggle(emoji, emoji))
   *  - Clicking a different reaction → replace old with new (onToggle(newEmoji, oldEmoji))
   *  - First reaction → add it (onToggle(emoji))
   */
  onToggle: (emoji: string, oldEmoji?: string) => Promise<void> | void
  disabled?: boolean
  /** Shown in tooltip when hovering over chips/add-button while disabled. */
  disabledTooltipMessage?: string
  currentUserName: string
}

export default function ReactionBar({ reactions, onToggle, disabled, disabledTooltipMessage, currentUserName }: ReactionBarProps) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerTheme, setPickerTheme] = useState<Theme>(Theme.LIGHT)
  const pickerRef = useRef<HTMLDivElement>(null)
  const pickerButtonRef = useRef<HTMLButtonElement>(null)
  const [pickerPos, setPickerPos] = useState<{ left: number; top: number; width: number } | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!pickerOpen) return
    const onClick = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [pickerOpen])

  useEffect(() => {
    if (!pickerOpen) return
    const update = () => {
      const el = pickerButtonRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      setPickerPos({ left: rect.left + rect.width / 2, top: rect.top, width: rect.width })
    }
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [pickerOpen])

  useEffect(() => {
    if (typeof document === 'undefined') return
    const compute = () => {
      const attr = document.documentElement.getAttribute('data-theme')
      if (attr === 'dark') setPickerTheme(Theme.DARK)
      else if (attr === 'light') setPickerTheme(Theme.LIGHT)
      else setPickerTheme(
        typeof window !== 'undefined' &&
          window.matchMedia?.('(prefers-color-scheme: dark)').matches
          ? Theme.DARK
          : Theme.LIGHT,
      )
    }
    compute()
    const observer = new MutationObserver(compute)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  // Sort by count desc
  const sorted = [...reactions].sort((a, b) => b.count - a.count)
  const myReaction = sorted.find((r) => r.mine)?.emoji

  const tooltipFor = (r: Reaction) => {
    // Get current user's full name from localStorage to filter from the users list
    let myName = currentUserName;
    try {
      const stored = JSON.parse(window.localStorage.getItem('user') || '{}');
      if (stored.firstName || stored.lastName) {
        myName = [stored.firstName, stored.lastName].filter(Boolean).join(' ').trim();
      }
    } catch (_) { /* ignore */ }

    // Include current user's name as "You" alongside other reactors' names
    if (r.mine) {
      const others = r.users.filter(
        (u) => u.trim().toLowerCase() !== myName.trim().toLowerCase()
      )
      return others.length > 0 ? 'You, ' + others.join(', ') : 'You'
    }
    return r.users.length > 0 ? r.users.join(', ') : 'No reactions'
  }

  const handleChipClick = (emoji: string, fromPicker = false) => {
    // Add button (picker): always ADD — ignore existing reaction so user can have multiple
    if (fromPicker) {
      void onToggle(emoji)
      return
    }
    // Clicking own reaction chip → REMOVE it
    if (myReaction === emoji) {
      void onToggle(emoji, emoji)
    } else {
      void onToggle(emoji)
    }
  }

  useEffect(() => {
    try { window.localStorage?.removeItem('epr_suggested') } catch (_) { /* ignore */ }
  }, [])

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {sorted.map((r) => {
        const tooltipId = `reaction-tip-${r.emoji.codePointAt(0) ?? 0}-${Math.random().toString(36).slice(2, 8)}`
        return (
          <ChipWithTooltip
            key={`${r.emoji}-${r.count}-${r.mine ? 1 : 0}`}
            reaction={r}
            tooltipId={tooltipId}
            tooltipText={disabled ? (disabledTooltipMessage || tooltipFor(r)) : tooltipFor(r)}
            disabled={!!disabled}
            onToggle={(emoji, _oldEmoji) => {
              // _oldEmoji is from ChipWithTooltip's interface but ReactionBar
              // already knows myReaction via closure — use it for replace flow
              if (myReaction && myReaction !== emoji) {
                void onToggle(emoji, myReaction) // replace
              } else if (myReaction === emoji) {
                void onToggle(emoji, emoji) // remove own
              } else {
                void onToggle(emoji) // add first
              }
            }}
          />
        )
      })}

      {/* Add reaction picker */}
      <div className="relative" ref={pickerRef}>
        <button
          ref={pickerButtonRef}
          type="button"
          disabled={disabled}
          onClick={() => setPickerOpen((v) => !v)}
          aria-label="Add reaction"
          aria-expanded={pickerOpen}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-50 dark:bg-gray-800/50 border border-dashed border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-indigo-600 dark:hover:text-indigo-300 transition cursor-pointer disabled:opacity-50"
          data-tooltip-id="app-tooltip"
          data-tooltip-content={disabled ? (disabledTooltipMessage || '') : undefined}
        >
          <Smile size={12} strokeWidth={2.5} />
          <Plus size={11} strokeWidth={2.75} className="-ml-1" />
        </button>
        {pickerOpen && pickerPos && mounted && createPortal(
          <div
            ref={pickerRef}
            className="fixed z-[9999] shadow-2xl rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700 animate-scale-in"
            style={{
              left: Math.max(8, Math.min(window.innerWidth - 288, pickerPos.left - 140)),
              top: (pickerPos.top > 380) ? pickerPos.top - 372 : pickerPos.top + 32,
            }}
          >
            <EmojiPicker
              onEmojiClick={(data: EmojiClickData) => {
                console.log('[DEBUG] EmojiPicker onEmojiClick emoji=', JSON.stringify(String(data.emoji)), 'unified=', data.unified)
                setPickerOpen(false)
                handleChipClick(data.emoji, true) // true = fromPicker → always ADD
              }}
              theme={pickerTheme}
              emojiStyle={EmojiStyle.NATIVE}
              width={280}
              height={360}
              lazyLoadEmojis
              previewConfig={{ showPreview: false }}
              searchPlaceHolder="Search emoji…"
              defaultSkinTone={SkinTones.NEUTRAL}
              skinTonesDisabled={false}
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
          document.body
        )}
      </div>
    </div>
  )
}

function ChipWithTooltip({
  reaction: r,
  tooltipId,
  tooltipText,
  disabled,
  onToggle,
}: {
  reaction: Reaction
  tooltipId: string
  tooltipText: string
  disabled: boolean
  onToggle: (emoji: string, oldEmoji?: string) => void
}) {
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

  const tooltip =
    hovered && pos && mounted ? (
      createPortal(
        <div
          role="tooltip"
          data-tooltip-id={tooltipId}
          data-tooltip-content={tooltipText}
          className="pointer-events-none fixed z-[9999] -translate-x-1/2 -translate-y-full mb-1.5 mt-[-6px] px-2.5 py-1.5 rounded-lg bg-gray-900 dark:bg-gray-700 text-white text-[11px] font-medium whitespace-nowrap max-w-[280px] overflow-hidden text-ellipsis shadow-xl animate-fade-in-up"
          style={{ left: pos.left, top: pos.top }}
        >
          {tooltipText}
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900 dark:border-t-gray-700" />
        </div>,
        document.body,
      )
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
        disabled={disabled}
        onClick={() => onToggle(r.emoji)}
        data-tooltip-id={tooltipId}
        data-tooltip-content={tooltipText}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold transition border cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-90 hover:scale-105 ${
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
