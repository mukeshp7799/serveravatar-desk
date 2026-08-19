'use client'

/**
 * Searchable multi-select dropdown.
 *
 * When opened inside a scrollable container (e.g. a modal with overflow-y-auto),
 * the panel is portal-ed to that scrollable ancestor with position:absolute so
 * it scrolls naturally with the container and is never clipped.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Search, Users, X } from 'lucide-react'

export interface MultiSelectOption {
  id: string | number
  label: string
  initials?: string
  subtitle?: string
  isDisabled?: boolean
  disabledHint?: string
}

interface MultiSelectDropdownProps {
  options: MultiSelectOption[]
  selected: Array<string | number>
  onChange: (next: Array<string | number>) => void
  label?: string
  placeholder?: string
  maxListHeight?: number
  compact?: boolean
  showSelectAll?: boolean
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
    top?: number; left: number; bottom?: number; width: number; listHeight: number
  } | null>(null)
  /** Portal target: scrollable ancestor (or document.body if none) */
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null)

  const selectedSet = useMemo(() => new Set(selected), [selected])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => {
      const hay = `${o.label} ${o.subtitle ?? ''}`.toLowerCase()
      return hay.includes(q)
    })
  }, [options, query])

  // Find nearest scrollable ancestor; falls back to document.body.
  const findScrollableParent = (el: HTMLElement | null): HTMLElement | null => {
    if (!el) return null
    let current: HTMLElement | null = el.parentElement
    while (current) {
      const style = window.getComputedStyle(current)
      if (
        (style.overflowX === 'auto' || style.overflowX === 'scroll' ||
         style.overflowY === 'auto' || style.overflowY === 'scroll') &&
        current.offsetHeight < current.scrollHeight
      ) {
        return current
      }
      current = current.parentElement
    }
    return null
  }

  // Open: find portal target, compute position, add listeners
  useEffect(() => {
    if (!open) return

    const scrollParent = findScrollableParent(triggerRef.current)
    // Use scrollParent as portal target (not document.body) so the portal
    // lives inside the scrollable container and is clipped naturally.
    setPortalTarget(scrollParent || document.body)

      const recompute = () => {
      const el = triggerRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      // If getBoundingClientRect returns empty (all values 0 or undefined),
      // fall back to offsetTop-based positioning within the scrollable container.
      if (!r || r.bottom == null) {
        // Find scrollable parent and use offsetTop as fallback
        let el2: HTMLElement | null = el
        let offsetTopSum = 0
        while (el2 && el2 !== document.body) {
          offsetTopSum += el2.offsetTop
          el2 = el2.offsetParent as HTMLElement | null
        }
        if (offsetTopSum > 0) {
          setPos({ top: offsetTopSum + el.offsetHeight + 4, left: el.offsetLeft, width: Math.max(el.offsetWidth, 240), listHeight: 200 })
        }
        return
      }

      // Use getBoundingClientRect which gives viewport-relative coordinates.
      // position:fixed anchors to viewport - unaffected by any scrollable ancestor.
      const panelWidth = Math.max(r.width, 288)
      const headerHeight = 50
      const footerHeight = 26
      const minListHeight = 140
      const viewportH = window.innerHeight

      const spaceBelow = viewportH - r.bottom - 8

      const listHeightBelow = Math.max(
        minListHeight,
        Math.min(maxListHeight, spaceBelow - headerHeight - footerHeight),
      )

      // Always try to place BELOW the trigger first.
      // Only fall back to ABOVE if the dropdown would overflow the viewport bottom.
      const listHeight = Math.max(
        minListHeight,
        Math.min(maxListHeight, spaceBelow - headerHeight - footerHeight),
      )
      const panelHeight = headerHeight + listHeight + footerHeight
      const wouldOverflow = r.bottom + panelHeight + 8 > viewportH

      const left = Math.min(Math.max(8, r.left), window.innerWidth - panelWidth - 8)
      // Place below if it fits; otherwise place above
      const top = !wouldOverflow
        ? r.bottom + 4
        : Math.max(8, r.top - panelHeight - 4)

      setPos({ top, left, width: panelWidth, listHeight })
    }


    // Use setTimeout(0) to run AFTER React commits the DOM update,
    // so getBoundingClientRect() sees the correct trigger position.
    const posTimer = window.setTimeout(recompute, 0)
    const onScroll = () => recompute()
    const onResize = () => recompute()
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
    const focusTimer = window.setTimeout(() => searchRef.current?.focus(), 60)

    return () => {
      window.cancelAnimationFrame(posTimer)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('keydown', onKey)
      window.clearTimeout(focusTimer)
      setPortalTarget(null)
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

  const allFilteredSelected = filtered.length > 0 && filtered.every((o) => selectedSet.has(o.id))

  const handleSelectAllToggle = () => {
    if (!onSelectAll) return
    onSelectAll(filtered.map((o) => o.id), !allFilteredSelected)
  }

  const selectedOptions = options.filter((o) => selectedSet.has(o.id))

  const panel = open && pos ? (
    <div
      ref={panelRef}
      role="listbox"
      aria-multiselectable
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        width: pos.width,
        zIndex: 99999,
      }}
      className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl overflow-hidden min-w-[288px]"
    >
      {/* Search header */}
      <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Search size={13} strokeWidth={2.25} className="text-gray-400 shrink-0" />
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="flex-1 bg-transparent border-none outline-none text-sm text-gray-900 dark:text-white placeholder-gray-400 min-w-0"
          />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {showSelectAll && filtered.length > 0 && (
            <button
              type="button"
              onClick={handleSelectAllToggle}
              className="text-[10px] font-bold uppercase tracking-wide text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 transition bg-transparent border-none cursor-pointer whitespace-nowrap"
            >
              {allFilteredSelected ? 'Deselect all' : 'Select all'}
            </button>
          )}
          {selected.length > 0 && (
            <button
              type="button"
              onClick={clearAll}
              className="text-[10px] font-bold uppercase tracking-wide text-gray-500 hover:text-rose-600 dark:hover:text-rose-400 transition bg-transparent border-none cursor-pointer whitespace-nowrap"
            >
              Clear
            </button>
          )}
        </div>
      </div>
      {/* Option list */}
      <div className="overflow-y-auto pr-2" style={{ maxHeight: pos.listHeight }}>
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
                className={`w-full flex items-center gap-2.5 px-3 py-2 pr-4 text-left transition border-none ${
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
        <div className="px-3 py-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 text-[11px] font-semibold text-gray-500 dark:text-gray-400">
          {selected.length} of {options.length} selected
        </div>
      )}
    </div>
  ) : null

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
          /* Avatar-only stack — mirrors project header avatar group pattern */
          <span className="flex items-center gap-2 flex-1 min-w-0">
            {/* Overlapping avatar stack, max 3 visible */}
            <span className="flex -space-x-2">
              {selectedOptions.slice(0, 3).map((o) => (
                <span
                  key={o.id}
                  data-tooltip-id="app-tooltip"
                  data-tooltip-content={o.label}
                  className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-200 text-[10px] font-bold flex items-center justify-center ring-2 ring-white dark:ring-gray-900 shadow-sm cursor-pointer hover:ring-indigo-300 transition"
                >
                  {o.initials?.slice(0, 2).toUpperCase() ?? '?'}
                </span>
              ))}
              {selectedOptions.length > 3 && (
                <button
                  type="button"
                  data-tooltip-id="app-tooltip"
                  data-tooltip-content={selectedOptions.slice(3).map((o) => o.label).join(', ')}
                  onPointerDown={(e) => { e.stopPropagation() }}
                  onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}
                  className="w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-[10px] font-bold flex items-center justify-center ring-2 ring-white dark:ring-gray-900 shadow-sm cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 transition"
                >
                  +{selectedOptions.length - 3}
                </button>
              )}
            </span>
            {/* Selected count label */}
            <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">
              {selectedOptions.length} selected
            </span>
          </span>
        )}
        <ChevronDown
          size={14}
          strokeWidth={2.25}
          className={`shrink-0 text-gray-400 transition ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Panel — portalled to scrollable ancestor (not document.body) */}
      {open && portalTarget
        ? createPortal(panel, portalTarget)
        : null}
    </div>
  )
}
