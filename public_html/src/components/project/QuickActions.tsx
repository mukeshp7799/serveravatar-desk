'use client'

import Link from 'next/link'
import { resolveIcon } from './icons'
import type { QuickAction } from '@/types/project'

interface QuickActionsProps {
  actions: QuickAction[]
}

/**
 * Horizontal row of shortcut buttons (used inside the dashboard layout).
 * Renders the same data as the header dropdown but as a visible strip,
 * which Basecamp-style UIs use to keep common actions one click away.
 */
export default function QuickActions({ actions }: QuickActionsProps) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm p-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
        {actions.map((a) => (
          <Link
            key={a.key}
            href={a.href}
            className="group flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-700 dark:hover:text-indigo-300 text-gray-700 dark:text-gray-300 transition no-underline"
          >
            <span className="w-9 h-9 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-300 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition shrink-0">
              {resolveIcon(a.iconName, 16, 2.25)}
            </span>
            <span className="text-xs font-semibold truncate">{a.label}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}