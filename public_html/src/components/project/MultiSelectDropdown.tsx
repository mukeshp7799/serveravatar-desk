'use client'

/**
 * Searchable multi-select dropdown.
 *
 * Pattern: closed state shows selected items as chips + count, open state
 * renders a search box + scrollable list of options with checkboxes. The
 * panel is portaled to document.body so it escapes any parent overflow /
 * stacking-context traps (same trick as the emoji picker).
 *
 * Used by the Task Board for assignee selection. Designed to be reusable for
 * future multi-select fields (tags, mentions, etc.).
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Search, Users, X } from 'lucide-react'

export interface MultiSelectOption {
  /** Stable id used in `selected` arrays. */
  id: string | number
  /** Primary label shown next to the checkbox. */
  label: string
  /** Optional initials (1–2 chars) for the small avatar bubble. */
  initials?: string
  /** Optional subtitle (e.g. email or role). Shown as muted text under the label. */
  subtitle?: string
  /** If true, the option is shown but non-selectable with a tooltip hint. */
  isDisabled?: boolean
  /** Tooltip text shown when isDisabled is true. */
  disabledHint?: string
}

interface MultiSelectDropdownProps {
  /** All available options. */
  options: MultiSelectOption[]
  /** Currently-selected option ids. */
  selected: Array<string | number>
  /** Called when the user toggles an option. */
  onChange: (next: Array<string | number>) => void
  /** Visible label above the trigger. */
  label?: string
  /** Trigger placeholder when nothing is selected. */
  placeholder?: string
  /** Optional max-height (px) for the option list inside the panel. Default 240. */
  maxListHeight?: number
  /** If true, hides the trigger's selected-chip row (use a counter only). */
  compact?: boolean
  /** If true, shows a "Select All" toggle in the panel header (respects current filter). */
  showSelectAll?: boolean
  /** Called when the user clicks "Select All" or "Deselect All". Receives the ids of currently filtered options. */
  onSelectAll?: (filteredIds: Array<string | number>, select: boolean) => void
}

export default function MultiSelectDropdown({
  options,
  selected,
  onChange,
  label,
  placeholder = 'Select…',
  maxListHeight = 240,
  compact = false,
  showSelectAll = false,
  onSelectAll,
}: MultiSelectDropdownProps) {
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [pos, setPos] = useState<{
    top: number; left: number; width: number
    listHeight: number; placement: 'down' | 'up'
  } | null>(null)

  const selectedSet = useMemo(() => new Set(selected), [selected])

  // Filter options by search query (case-insensitive on label + subtitle)
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => {
      const hay = `${o.label} ${o.subtitle ?? ''}`.toLowerCase()
      return hay.includes(q)
    })
  }, [options, query])

  // Compute panel position from trigger rect, with sensible auto-flip.
  //
  // Rule of thumb: **prefer "down" so the dropdown appears right below the
  // trigger** (where the user just clicked). Only flip "up" when the user
  // genuinely has much more room above than below, so the dropdown doesn't
  // jump across the page.
  //
  // To make the dropdown fit more often below the trigger, the option list
  // height is shrunk to whatever space is actually available (clamped by
  // `maxListHeight`). The list scrolls internally when truncated, so the
  // user never loses access to options.
  const recomputePosition = () => {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const panelWidth = Math.max(r.width, 240)
    const headerHeight = 50  // search bar (px-3 py-2 + content + border)
    const footerHeight = 26  // "N of M selected" footer (px-3 py-1.5 + content + border)
    const minListHeight = 140 // keep enough options visible to be useful
    const viewportH = window.innerHeight
    const viewportW = window.innerWidth

    const spaceBelow = viewportH - r.bottom - 8  // 8px breathing room
    const spaceAbove = r.top - 8

    // List height that actually fits below the trigger (clamped by maxListHeight)
    const listHeightBelow = Math.max(
      minListHeight,
      Math.min(maxListHeight, spaceBelow - headerHeight - footerHeight),
    )
    const panelHeightBelow = headerHeight + listHeightBelow + footerHeight

    // Decide placement: prefer below so the dropdown appears right under
    // the trigger (where the user just clicked). Only flip up when the
    // trigger is genuinely near the bottom of the viewport — i.e. there's
    // less than ~120px of room below. With 120px the search bar is still
    // visible, and the inner list scrolls for anything beyond. The panel
    // is also clamped to the viewport bottom when "below" overflows so it
    // never disappears off-screen entirely.
    const placement: 'down' | 'up' = spaceBelow >= 120 ? 'down' : 'up'

    // Compute list height for the chosen placement
    const listHeight =
      placement === 'down'
        ? listHeightBelow
        : Math.max(minListHeight, Math.min(maxListHeight, spaceAbove - headerHeight - footerHeight))

    const left = Math.min(Math.max(8, r.left), viewportW - panelWidth - 8)
    const panelHeight = headerHeight + listHeight + footerHeight
    // Place directly under the trigger (preferred) or directly above it
    // (when there's < 120px below). We don't clamp `top` because that would
    // re-introduce the "panel jumps across the page" bug the user reported.
    // The list already scrolls internally if it overflows.
    const top =
      placement === 'down'
        ? r.bottom + 4
        : Math.max(8, r.top - panelHeight - 4)
    setPos({ top, left, width: panelWidth, listHeight, placement })
  }

  // Open: compute position + add listeners + focus search
  useEffect(() => {
    if (!open) return
    recomputePosition()
    const onScroll = () => recomputePosition()
    const onResize = () => recomputePosition()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
        setQuery('')
      }
    }
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    document.addEventListener('keydown', onKey)
    // Focus search shortly after the panel mounts so keyboard users can type immediately
    const focusTimer = window.setTimeout(() => searchRef.current?.focus(), 50)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('keydown', onKey)
      window.clearTimeout(focusTimer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Outside click closes
  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node
      if (panelRef.current?.contains(t)) return
      if (triggerRef.current?.contains(t)) return
      setOpen(false)
      setQuery('')
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [open])

  const toggle = (id: string | number) => {
    if (selectedSet.has(id)) {
      onChange(selected.filter((x) => x !== id))
    } else {
      onChange([...selected, id])
    }
  }

  const clearAll = () => onChange([])

  // True when every currently-filtered option is already selected
  const allFilteredSelected = filtered.length > 0 && filtered.every((o) => selectedSet.has(o.id))

  const handleSelectAllToggle = () => {
    if (!onSelectAll) return
    // If all filtered are selected → deselect all filtered; otherwise select all filtered
    onSelectAll(filtered.map((o) => o.id), !allFilteredSelected)
  }

  const selectedOptions = options.filter((o) => selectedSet.has(o.id))

  return (
    <div className="relative">
      {label && (
        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
          {label}
        </label>
      )}
      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        onPointerDown={(e) => e.stopPropagation()}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`w-full min-h-[44px] flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-900 border-2 rounded-xl text-left transition cursor-pointer ${
          open
            ? 'border-indigo-500 ring-2 ring-indigo-100 dark:ring-indigo-900/40'
            : 'border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-700'
        }`}
      >
        {selectedOptions.length === 0 ? (
          <span className="inline-flex items-center gap-2 text-sm text-gray-400 dark:text-gray-500 flex-1">
            <Users size={14} strokeWidth={2.25} />
            {placeholder}
          </span>
        ) : compact ? (
          <span className="text-sm font-semibold text-gray-900 dark:text-white flex-1">
            {selectedOptions.length} selected
          </span>
        ) : (
          <span className="flex flex-wrap gap-1 flex-1 min-w-0">
            {selectedOptions.slice(0, 4).map((o) => (
              <span
                key={o.id}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-xs font-semibold"
              >
                {o.initials && (
                  <span className="w-3.5 h-3.5 rounded-full bg-indigo-200 dark:bg-indigo-700 text-indigo-700 dark:text-indigo-200 text-[8px] font-bold flex items-center justify-center">
                    {o.initials.slice(0, 2).toUpperCase()}
                  </span>
                )}
                {o.label}
                <button
                  type="button"
                  onPointerDown={(e) => {
                    e.stopPropagation()
                  }}
                  onClick={(e) => {
                    e.stopPropagation()
                    toggle(o.id)
                  }}
                  className="ml-0.5 -mr-0.5 w-3.5 h-3.5 rounded hover:bg-indigo-200 dark:hover:bg-indigo-800 inline-flex items-center justify-center bg-transparent border-none cursor-pointer"
                  title={`Remove ${o.label}`}
                >
                  <X size={10} strokeWidth={2.5} />
                </button>
              </span>
            ))}
            {selectedOptions.length > 4 && (
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 self-center">
                +{selectedOptions.length - 4} more
              </span>
            )}
          </span>
        )}
        <ChevronDown
          size={14}
          strokeWidth={2.25}
          className={`shrink-0 text-gray-400 transition ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Panel — portaled to body so it escapes stacking-context / overflow traps */}
      {open && pos && typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={panelRef}
            role="listbox"
            aria-multiselectable
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              width: pos.width,
              zIndex: 9999,
            }}
            className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl overflow-hidden animate-scale-in"
          >
            {/* Search header */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
              <Search size={13} strokeWidth={2.25} className="text-gray-400 shrink-0" />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search…"
                className="flex-1 bg-transparent border-none outline-none text-sm text-gray-900 dark:text-white placeholder-gray-400"
              />
              <div className="flex items-center gap-2 ml-auto">
                {showSelectAll && filtered.length > 0 && (
                  <button
                    type="button"
                    onClick={handleSelectAllToggle}
                    className="text-[10px] font-bold uppercase tracking-wide text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 transition bg-transparent border-none cursor-pointer whitespace-nowrap"
                    title={allFilteredSelected ? 'Deselect all filtered' : 'Select all filtered'}
                  >
                    {allFilteredSelected ? 'Deselect all' : 'Select all'}
                  </button>
                )}
                {selected.length > 0 && (
                  <button
                    type="button"
                    onClick={clearAll}
                    className="text-[10px] font-bold uppercase tracking-wide text-gray-500 hover:text-rose-600 dark:hover:text-rose-400 transition bg-transparent border-none cursor-pointer"
                    title="Clear all selections"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
            {/* Option list */}
            <div
              className="overflow-y-auto "
              style={{ maxHeight: pos.listHeight }}
            >
              {filtered.length === 0 ? (
                <div className="px-3 py-6 text-center text-sm text-gray-400">
                  No matches
                </div>
              ) : (
                filtered.map((o) => {
                  const on = selectedSet.has(o.id)
                  return (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => !o.isDisabled && toggle(o.id)}
                      role="option"
                      aria-selected={on}
                      disabled={!!o.isDisabled}
                      title={o.isDisabled ? (o.disabledHint || 'Unavailable') : ''}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition border-none ${
                        o.isDisabled
                          ? 'opacity-50 cursor-not-allowed bg-gray-50 dark:bg-gray-800/50 text-gray-400 dark:text-gray-500'
                          : on
                            ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 cursor-pointer hover:bg-indigo-100 dark:hover:bg-indigo-900/50'
                            : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer'
                      }`}
                    >
                      <span
                        className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition ${
                          on
                            ? 'bg-indigo-600 border-indigo-600'
                            : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900'
                        }`}
                      >
                        {on && <Check size={11} strokeWidth={3} className="text-white" />}
                      </span>
                      {o.initials && (
                        <span className="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-[10px] font-bold flex items-center justify-center shrink-0">
                          {o.initials.slice(0, 2).toUpperCase()}
                        </span>
                      )}
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium truncate">{o.label}</span>
                        {o.subtitle && (
                          <span className="block text-[11px] text-gray-500 dark:text-gray-400 truncate">
                            {o.subtitle}
                          </span>
                        )}
                      </span>
                    </button>
                  )
                })
              )}
            </div>
            {/* Footer count */}
            {selected.length > 0 && (
              <div className="px-3 py-1.5 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                {selected.length} of {options.length} selected
              </div>
            )}
          </div>,
          document.body
        )}
    </div>
  )
}
