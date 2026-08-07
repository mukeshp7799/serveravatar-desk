'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { resolveIcon } from './icons'
import type { ProjectMeta, QuickAction } from '@/types/project'

interface ProjectHeaderProps {
  project: ProjectMeta
  actions: QuickAction[]
  /** Optional member list to render as an overlapping avatar stack. */
  members?: Array<{ id: string | number; name: string; initials: string; avatarColor: string }>
  /** Total member count — used for the "+N" badge and the "View all" link. */
  memberCount?: number
}

/**
 * Top header shown on every /projects/[id]/* page.
 *
 * - Cover band with gradient + soft glow.
 * - Large avatar + project name + status pill.
 * - Member avatar stack (overlapping circles, max 5 + "+N" overflow).
 * - Quick "New" menu (portaled dropdown) + Settings link.
 */
export default function ProjectHeader({ project, actions, members = [], memberCount }: ProjectHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number } | null>(null)

  const totalMembers = memberCount ?? project.memberCount
  const visibleMembers = members.slice(0, 5)
  const overflow = Math.max(0, totalMembers - visibleMembers.length)

  const statusStyles: Record<string, { label: string; cls: string; dot: string }> = {
    active: {
      label: 'Active',
      cls: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800',
      dot: 'bg-emerald-500',
    },
    on_hold: {
      label: 'On hold',
      cls: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
      dot: 'bg-amber-500',
    },
    completed: {
      label: 'Completed',
      cls: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-900/30 dark:text-sky-300 dark:border-sky-800',
      dot: 'bg-sky-500',
    },
    cancelled: {
      label: 'Cancelled',
      cls: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800',
      dot: 'bg-rose-500',
    },
  }
  const status = statusStyles[project.status] || statusStyles.active

  // Recompute dropdown panel position from the trigger button's rect.
  // The panel is portaled to document.body (not nested in this card) so it
  // escapes the header's overflow-hidden and stacking context traps.
  const recomputeMenuPos = () => {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const w = 224 // matches w-56
    const left = Math.min(Math.max(8, r.right - w), window.innerWidth - w - 8)
    setMenuPos({ top: r.bottom + 4, left, width: w })
  }

  useEffect(() => {
    if (!menuOpen) return
    recomputeMenuPos()
    const onScroll = () => recomputeMenuPos()
    const onResize = () => recomputeMenuPos()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    document.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  // Outside click closes the menu
  useEffect(() => {
    if (!menuOpen) return
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node
      if (panelRef.current?.contains(t)) return
      if (triggerRef.current?.contains(t)) return
      setMenuOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [menuOpen])

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-visible card-hover">
      {/* Cover band — gradient + soft blurred blobs */}
      <div className="relative h-16 sm:h-20 bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-500 overflow-hidden">
        <div className="absolute inset-0 opacity-30">
          <div className="absolute -top-6 -left-6 w-40 h-40 rounded-full bg-white/30 blur-2xl" />
          <div className="absolute -bottom-8 right-8 w-44 h-44 rounded-full bg-white/25 blur-2xl" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 rounded-full bg-white/10 blur-3xl" />
        </div>
        {/* Subtle pattern */}
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
            backgroundSize: '24px 24px',
          }}
        />
      </div>

      {/* Body */}
      <div className="px-4 sm:px-5 pb-4 pt-3 sm:pt-4 flex flex-wrap items-start gap-3 -mt-8 sm:-mt-10 relative">
        {/* Avatar */}
        <div className="relative shrink-0">
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 border-2 border-white dark:border-gray-900 shadow-lg flex items-center justify-center text-base sm:text-lg font-bold text-white">
            {project.name.slice(0, 2).toUpperCase()}
          </div>
          {/* Status dot on avatar */}
          <span
            className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full ${status.dot} border-2 border-white dark:border-gray-900 shadow-sm`}
            title={status.label}
          />
        </div>

        {/* Name + meta */}
        <div className="flex-1 min-w-0 pt-2 sm:pt-7">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white truncate tracking-tight">
              {project.name}
            </h1>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${status.cls}`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
              {status.label}
            </span>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-2 max-w-2xl">
            {project.description}
          </p>

          {/* Owner + member avatar stack */}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="inline-flex items-center gap-1 text-[10px] text-gray-600 dark:text-gray-400">
              <span
                className={`w-5 h-5 rounded-full ${project.owner.avatarColor} text-white text-[10px] font-bold flex items-center justify-center shadow-sm`}
              >
                {project.owner.initials}
              </span>
              <span className="font-medium">{project.owner.name}</span>
            </span>

            {visibleMembers.length > 0 && (
              <>
                <span aria-hidden className="text-gray-300 dark:text-gray-600">·</span>
                <div className="flex items-center gap-2">
                  <div className="flex -space-x-2">
                    {visibleMembers
                      .filter((m) => m.id !== project.owner.id)
                      .map((m) => (
                        <span
                          key={m.id}
                          title={m.name}
                          className={`w-6 h-6 rounded-full ${m.avatarColor} text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white dark:ring-gray-900 shadow-sm`}
                        >
                          {m.initials}
                        </span>
                      ))}
                    {overflow > 0 && (
                      <span className="w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-[10px] font-bold flex items-center justify-center ring-2 ring-white dark:ring-gray-900 shadow-sm">
                        +{overflow}
                      </span>
                    )}
                  </div>
                  <Link
                    href={`/projects/${project.id}/team`}
                    className="text-xs text-gray-600 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-300 font-medium transition-colors no-underline"
                  >
                    {totalMembers} members
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Primary actions */}
        <div className="flex items-center gap-2 mt-2 sm:mt-7">
          {/* Quick "New" menu (mobile + desktop) — portal-fixed panel escapes overflow-hidden */}
          <div className="relative">
            <button
              ref={triggerRef}
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white rounded-xl text-sm font-semibold shadow-md shadow-indigo-500/25 hover:shadow-lg hover:shadow-indigo-500/30 transition cursor-pointer border-none"
            >
              {resolveIcon('Plus', 15, 2.5)}
              <span>New</span>
            </button>
            {menuOpen && menuPos && typeof document !== 'undefined' &&
              createPortal(
                <div
                  ref={panelRef}
                  role="menu"
                  style={{
                    position: 'fixed',
                    top: menuPos.top,
                    left: menuPos.left,
                    width: menuPos.width,
                    zIndex: 9999,
                  }}
                  className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 py-1.5 animate-scale-in"
                >
                  <div className="px-4 pt-2 pb-1.5 text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-bold">
                    Create new
                  </div>
                  {actions.map((a) => (
                    <Link
                      key={a.key}
                      href={a.href}
                      onClick={() => setMenuOpen(false)}
                      role="menuitem"
                      className="flex items-center gap-2.5 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-700 dark:hover:text-indigo-300 transition no-underline"
                    >
                      <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-100 to-violet-100 dark:from-indigo-900/40 dark:to-violet-900/40 text-indigo-600 dark:text-indigo-300 flex items-center justify-center">
                        {resolveIcon(a.iconName, 13, 2.25)}
                      </span>
                      <span className="font-medium">{a.label}</span>
                    </Link>
                  ))}
                </div>,
                document.body
              )}
          </div>
          <Link
            href={`/projects/${project.id}/settings`}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-300 dark:hover:border-gray-600 rounded-xl text-sm font-semibold transition no-underline"
          >
            {resolveIcon('Settings', 14, 2.25)}
            <span className="hidden sm:inline">Settings</span>
          </Link>
        </div>
      </div>
    </div>
  )
}
