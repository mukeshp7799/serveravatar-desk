'use client'

import Link from 'next/link'
import { ChevronRight, Home } from 'lucide-react'

export interface BreadcrumbItem {
  label: string
  href?: string
}

interface ProjectBreadcrumbProps {
  items: BreadcrumbItem[]
}

/**
 * Breadcrumb trail shown above the project header on every page.
 *
 * - Home icon for the root item (when href === '/projects').
 * - Subtle pill hover state for clickable segments.
 * - Truncates long labels with ellipsis on overflow.
 * - Last item is the current page (rendered as text, no link).
 */
export default function ProjectBreadcrumb({ items }: ProjectBreadcrumbProps) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="flex items-center flex-wrap gap-1 text-xs sm:text-sm text-gray-500 dark:text-gray-400 min-w-0"
    >
      {items.map((item, i) => {
        const isLast = i === items.length - 1
        const isHome = item.href === '/projects'
        return (
          <span key={`${item.label}-${i}`} className="flex items-center gap-1 min-w-0">
            {i > 0 && (
              <ChevronRight
                size={12}
                strokeWidth={2.5}
                className="text-gray-300 dark:text-gray-600 shrink-0 mx-0.5"
              />
            )}
            {item.href && !isLast ? (
              <Link
                href={item.href}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 -mx-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors no-underline min-w-0"
              >
                {isHome && <Home size={12} strokeWidth={2.5} className="shrink-0" />}
                <span className="truncate font-medium">{item.label}</span>
              </Link>
            ) : (
              <span
                className={[
                  'inline-flex items-center gap-1 px-1.5 py-0.5 -mx-1.5 min-w-0',
                  isLast
                    ? 'text-gray-900 dark:text-white font-semibold bg-gray-100 dark:bg-gray-800 rounded-md truncate'
                    : 'truncate',
                ].join(' ')}
              >
                {isHome && <Home size={12} strokeWidth={2.5} className="shrink-0" />}
                <span className="truncate">{item.label}</span>
              </span>
            )}
          </span>
        )
      })}
    </nav>
  )
}
