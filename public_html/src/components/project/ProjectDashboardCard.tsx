'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { resolveIcon } from './icons'
import { fmtRelative } from './format'
import CardErrorBanner from '@/components/dashboard/CardErrorBanner'
import type { FeatureCardConfig } from '@/types/project'

export interface CardSummaryData {
  count: number
  lastUpdatedAt: string | null
  recentTitle: string | null
  recentActivity: string
  recentActor: string | null
}

interface ProjectDashboardCardProps {
  config: FeatureCardConfig
  summary: CardSummaryData
  projectId: string | number
  loading?: boolean
  error?: string | null
  onRetry?: () => void
}

/** Accent → Tailwind classes (background + text + ring). */
const ACCENT: Record<string, { bg: string; text: string; ring: string; softBg: string }> = {
  indigo:  { bg: 'bg-indigo-500',   text: 'text-indigo-600 dark:text-indigo-300',   ring: 'ring-indigo-200 dark:ring-indigo-800',   softBg: 'bg-indigo-50 dark:bg-indigo-900/30' },
  emerald: { bg: 'bg-emerald-500',  text: 'text-emerald-600 dark:text-emerald-300', ring: 'ring-emerald-200 dark:ring-emerald-800', softBg: 'bg-emerald-50 dark:bg-emerald-900/30' },
  amber:   { bg: 'bg-amber-500',    text: 'text-amber-600 dark:text-amber-300',     ring: 'ring-amber-200 dark:ring-amber-800',     softBg: 'bg-amber-50 dark:bg-amber-900/30' },
  sky:     { bg: 'bg-sky-500',      text: 'text-sky-600 dark:text-sky-300',         ring: 'ring-sky-200 dark:ring-sky-800',         softBg: 'bg-sky-50 dark:bg-sky-900/30' },
  pink:    { bg: 'bg-pink-500',     text: 'text-pink-600 dark:text-pink-300',       ring: 'ring-pink-200 dark:ring-pink-800',       softBg: 'bg-pink-50 dark:bg-pink-900/30' },
  violet:  { bg: 'bg-violet-500',   text: 'text-violet-600 dark:text-violet-300',   ring: 'ring-violet-200 dark:ring-violet-800',   softBg: 'bg-violet-50 dark:bg-violet-900/30' },
  rose:    { bg: 'bg-rose-500',     text: 'text-rose-600 dark:text-rose-300',       ring: 'ring-rose-200 dark:ring-rose-800',       softBg: 'bg-rose-50 dark:bg-rose-900/30' },
  cyan:    { bg: 'bg-cyan-500',     text: 'text-cyan-600 dark:text-cyan-300',       ring: 'ring-cyan-200 dark:ring-cyan-800',       softBg: 'bg-cyan-50 dark:bg-cyan-900/30' },
  lime:    { bg: 'bg-lime-500',     text: 'text-lime-700 dark:text-lime-300',       ring: 'ring-lime-200 dark:ring-lime-800',       softBg: 'bg-lime-50 dark:bg-lime-900/30' },
  orange:  { bg: 'bg-orange-500',   text: 'text-orange-600 dark:text-orange-300',   ring: 'ring-orange-200 dark:ring-orange-800',   softBg: 'bg-orange-50 dark:bg-orange-900/30' },
  teal:    { bg: 'bg-teal-500',     text: 'text-teal-600 dark:text-teal-300',       ring: 'ring-teal-200 dark:ring-teal-800',       softBg: 'bg-teal-50 dark:bg-teal-900/30' },
}

export default function ProjectDashboardCard({
  config,
  summary,
  projectId,
  loading = false,
  error = null,
  onRetry,
}: ProjectDashboardCardProps) {
  const accent = ACCENT[config.accent] || ACCENT.indigo
  const href = config.href(projectId)

  // Render the activity body in three modes: loading skeleton / error / data
  const renderBody = () => {
    if (loading) {
      return (
        <>
          <div className="h-3 w-3/4 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
          <div className="h-3 w-1/2 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
        </>
      )
    }
    if (error) {
      return <CardErrorBanner message={error} onRetry={onRetry} compact />
    }
    if (summary.count === 0 || !summary.lastUpdatedAt) {
      return (
        <p className="text-xs text-gray-400 dark:text-gray-500 italic">No activity yet — get the team started.</p>
      )
    }
    return (
      <>
        <p className="text-xs text-gray-700 dark:text-gray-300 font-medium line-clamp-2">
          {summary.recentActor && (
            <span className="text-gray-500 dark:text-gray-400 font-normal">{summary.recentActor}</span>
          )}{' '}
          {summary.recentActor && !summary.recentActivity.toLowerCase().includes(summary.recentActor.toLowerCase())
            ? `— ${summary.recentActivity}`
            : summary.recentActivity}
        </p>
        <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold">
          {fmtRelative(summary.lastUpdatedAt)}
        </p>
      </>
    )
  }

  return (
    <Link
      href={href}
      className="group block bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm hover-lift card-hover p-5 no-underline focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-400 dark:focus:ring-offset-gray-900"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className={`w-11 h-11 rounded-xl ${accent.softBg} ${accent.text} flex items-center justify-center shrink-0`}>
          {resolveIcon(config.iconName, 20, 2.25)}
        </div>
        {loading ? (
          <div className="h-5 w-12 rounded-full bg-gray-200 dark:bg-gray-800 animate-pulse" />
        ) : (
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${accent.softBg} ${accent.text} border ${accent.ring}`}>
            {summary.count}
          </span>
        )}
      </div>

      {/* Title + description */}
      <div className="mb-3">
        <h3 className="font-bold text-gray-900 dark:text-white text-base leading-tight">{config.title}</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{config.description}</p>
      </div>

      {/* Recent activity / loading / error */}
      <div className="border-t border-gray-100 dark:border-gray-800 pt-3 mt-3 space-y-1.5 min-h-[60px]">
        {renderBody()}
      </div>

      {/* Open button */}
      <div className="mt-3 flex items-center justify-between">
        <span className={`text-xs font-semibold ${accent.text} inline-flex items-center gap-1 group-hover:gap-1.5 transition-all`}>
          Open
          <ArrowRight size={12} strokeWidth={2.5} />
        </span>
        <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">{config.title}</span>
      </div>
    </Link>
  )
}
