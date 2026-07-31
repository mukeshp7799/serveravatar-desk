'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { LayoutGrid, type LucideIcon } from 'lucide-react'
import { resolveIcon } from './icons'

export interface ProjectTab {
  /** Stable key for React. */
  key: string
  /** Short label shown in the tab. */
  label: string
  /** Icon name resolved via ./icons.tsx (lucide-react). */
  iconName: string
  /** Absolute path for the tab. */
  href: string
  /** Accent color used when this tab is active. */
  accent: string
}

interface ProjectTabsProps {
  /** All tabs in display order. */
  tabs: ProjectTab[]
  /** Current project id (used to render the home icon's link target). */
  projectId?: string | number
}

/**
 * Accent palette — matches the dashboard feature cards + the message-board
 * reactions palette so the tabs visually tie to the rest of the project.
 */
const ACCENT_BG: Record<string, string> = {
  indigo:  'bg-gradient-to-r from-indigo-600 to-violet-600 shadow-indigo-500/25',
  emerald: 'bg-gradient-to-r from-emerald-600 to-teal-600 shadow-emerald-500/25',
  sky:     'bg-gradient-to-r from-sky-600 to-cyan-600 shadow-sky-500/25',
  amber:   'bg-gradient-to-r from-amber-500 to-orange-600 shadow-amber-500/25',
  rose:    'bg-gradient-to-r from-rose-500 to-pink-600 shadow-rose-500/25',
  violet:  'bg-gradient-to-r from-violet-600 to-purple-600 shadow-violet-500/25',
  cyan:    'bg-gradient-to-r from-cyan-600 to-sky-600 shadow-cyan-500/25',
  lime:    'bg-gradient-to-r from-lime-500 to-green-600 shadow-lime-500/25',
  pink:    'bg-gradient-to-r from-pink-500 to-rose-600 shadow-pink-500/25',
  orange:  'bg-gradient-to-r from-orange-500 to-amber-600 shadow-orange-500/25',
  slate:   'bg-gradient-to-r from-slate-700 to-slate-900 shadow-slate-500/25',
}

const ACCENT_TEXT: Record<string, string> = {
  indigo:  'text-indigo-600 dark:text-indigo-300',
  emerald: 'text-emerald-600 dark:text-emerald-300',
  sky:     'text-sky-600 dark:text-sky-300',
  amber:   'text-amber-600 dark:text-amber-300',
  rose:    'text-rose-600 dark:text-rose-300',
  violet:  'text-violet-600 dark:text-violet-300',
  cyan:    'text-cyan-600 dark:text-cyan-300',
  lime:    'text-lime-600 dark:text-lime-300',
  pink:    'text-pink-600 dark:text-pink-300',
  orange:  'text-orange-600 dark:text-orange-300',
  slate:   'text-slate-700 dark:text-slate-300',
}

/**
 * Horizontal pill tab bar for project navigation.
 *
 * Shown on EVERY /projects/[id]/* page (dashboard + each feature page).
 * Lets the user jump between features in one click without bouncing back
 * to the dashboard. Replaces the old "Back to dashboard" link.
 *
 * - Sticky on scroll so it stays visible while working in a feature.
 * - Horizontally scrollable on small screens (no labels, just icons).
 * - Active tab gets a colored gradient + drop shadow matching its accent.
 */
export default function ProjectTabs({ tabs, projectId }: ProjectTabsProps) {
  const pathname = usePathname() || ''
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const activeTabRef = useRef<HTMLAnchorElement | null>(null)

  // When the active tab is rendered, scroll it into view inside the
  // horizontal tab strip so the user always sees which page they're on
  // (otherwise the strip can be scrolled past the active tab on load).
  useEffect(() => {
    const el = activeTabRef.current
    const scroller = scrollRef.current
    if (!el || !scroller) return
    // Use 'nearest' so tabs that are already visible don't get pushed around.
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
  }, [pathname])

  return (
    <div
      role="tablist"
      aria-label="Project navigation"
      className="sticky top-0 z-30 -mx-2 sm:mx-0"
    >
      {/* Soft fade edges on mobile so horizontal scroll is discoverable */}
      <div
        ref={scrollRef}
        className="relative bg-white/85 dark:bg-gray-900/85 backdrop-blur-md rounded-2xl border border-gray-200/80 dark:border-gray-800/80 shadow-sm px-1.5 py-1.5 overflow-x-auto scroll-slim"
      >
        <div className="flex items-center gap-1 min-w-max">
          {tabs.map((tab) => {
            // Active match: exact path OR child path (e.g. /files/123).
            const isActive =
              pathname === tab.href ||
              (pathname.startsWith(tab.href + '/') && tab.href !== `/projects/${projectId}`)

            const accentBg = ACCENT_BG[tab.accent] || ACCENT_BG.indigo
            const accentText = ACCENT_TEXT[tab.accent] || ACCENT_TEXT.indigo

            return (
              <Link
                key={tab.key}
                ref={isActive ? activeTabRef : undefined}
                href={tab.href}
                role="tab"
                aria-selected={isActive}
                className={[
                  'group inline-flex items-center gap-2 px-3 sm:px-3.5 py-2 rounded-xl text-sm font-semibold',
                  'transition-all duration-150 whitespace-nowrap no-underline select-none',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40',
                  isActive
                    ? `${accentBg} text-white shadow-md`
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white',
                ].join(' ')}
              >
                <span
                  className={[
                    'shrink-0 w-6 h-6 rounded-lg flex items-center justify-center transition-colors',
                    isActive
                      ? 'bg-white/20 text-white'
                      : `bg-gray-100 dark:bg-gray-800 ${accentText} group-hover:bg-white dark:group-hover:bg-gray-700`,
                  ].join(' ')}
                >
                  {resolveIcon(tab.iconName, 13, 2.5)}
                </span>
                <span className="hidden sm:inline">{tab.label}</span>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
