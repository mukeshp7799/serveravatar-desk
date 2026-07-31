/**
 * Inline error banner for dashboard cards. Shows the error message and a
 * "Retry" button. Used inside ProjectDashboardCard when its fetch failed.
 */
'use client'

import { AlertCircle, RefreshCw } from 'lucide-react'

interface CardErrorBannerProps {
  message: string
  onRetry?: () => void
  /** Compact mode hides the icon and uses smaller text — used when the
   *  banner is nested inside a card body. */
  compact?: boolean
}

export default function CardErrorBanner({ message, onRetry, compact = false }: CardErrorBannerProps) {
  if (compact) {
    return (
      <div className="flex items-center justify-between gap-2 text-xs text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-800 rounded-lg px-2.5 py-2">
        <span className="truncate">⚠️ {message}</span>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-white dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 transition cursor-pointer shrink-0"
          >
            <RefreshCw size={10} strokeWidth={2.5} />
            Retry
          </button>
        )}
      </div>
    )
  }
  return (
    <div className="flex items-start gap-3 p-3 bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-800 rounded-xl">
      <AlertCircle size={18} className="text-rose-600 dark:text-rose-300 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-rose-900 dark:text-rose-100">Couldn't load this section</p>
        <p className="text-xs text-rose-700 dark:text-rose-300 truncate">{message}</p>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 transition cursor-pointer shrink-0"
        >
          <RefreshCw size={12} strokeWidth={2.5} />
          Retry
        </button>
      )}
    </div>
  )
}
