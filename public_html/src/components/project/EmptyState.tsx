'use client'

import { resolveIcon } from './icons'

interface EmptyStateProps {
  iconName: string
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
}

/**
 * Reusable empty state — used on every feature page when there's no
 * content yet. Centered, large icon, single CTA.
 */
export default function EmptyState({ iconName, title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6 bg-white dark:bg-gray-900 rounded-2xl border border-dashed border-gray-300 dark:border-gray-700">
      <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-500 dark:text-indigo-300 flex items-center justify-center mb-4">
        {resolveIcon(iconName, 28, 2)}
      </div>
      <h3 className="text-base font-bold text-gray-900 dark:text-white mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm mb-4">{description}</p>
      )}
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow transition border-none cursor-pointer"
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}