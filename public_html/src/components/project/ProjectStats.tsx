'use client'

import { TrendingDown, TrendingUp, Minus } from 'lucide-react'
import { resolveIcon } from './icons'
import { fmtNumber } from './format'
import type { ProjectStat } from '@/types/project'

interface ProjectStatsProps {
  stats: ProjectStat[]
  loading?: boolean
}

/** Tone → Tailwind classes (background / text / accent ring). */
const TONE: Record<ProjectStat['tone'], { bg: string; text: string; ring: string; chip: string }> = {
  indigo:  { bg: 'bg-indigo-50 dark:bg-indigo-900/30',  text: 'text-indigo-600 dark:text-indigo-300',   ring: 'ring-indigo-200 dark:ring-indigo-800',   chip: 'bg-indigo-100 dark:bg-indigo-900/50' },
  emerald: { bg: 'bg-emerald-50 dark:bg-emerald-900/30',text: 'text-emerald-600 dark:text-emerald-300', ring: 'ring-emerald-200 dark:ring-emerald-800', chip: 'bg-emerald-100 dark:bg-emerald-900/50' },
  amber:   { bg: 'bg-amber-50 dark:bg-amber-900/30',    text: 'text-amber-600 dark:text-amber-300',     ring: 'ring-amber-200 dark:ring-amber-800',     chip: 'bg-amber-100 dark:bg-amber-900/50' },
  sky:     { bg: 'bg-sky-50 dark:bg-sky-900/30',        text: 'text-sky-600 dark:text-sky-300',         ring: 'ring-sky-200 dark:ring-sky-800',         chip: 'bg-sky-100 dark:bg-sky-900/50' },
  pink:    { bg: 'bg-pink-50 dark:bg-pink-900/30',      text: 'text-pink-600 dark:text-pink-300',       ring: 'ring-pink-200 dark:ring-pink-800',       chip: 'bg-pink-100 dark:bg-pink-900/50' },
}

/**
 * Top-of-dashboard stat row. Renders 4 tiles (responsive).
 */
export default function ProjectStats({ stats, loading }: ProjectStatsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      {loading
        ? Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4 h-24 animate-pulse"
            />
          ))
        : stats.map((s) => {
            const tone = TONE[s.tone]
            const TrendIcon = s.trend === 'up' ? TrendingUp : s.trend === 'down' ? TrendingDown : Minus
            const trendColor =
              s.trend === 'up' ? 'text-emerald-600 dark:text-emerald-300'
                : s.trend === 'down' ? 'text-rose-600 dark:text-rose-300'
                : 'text-gray-500 dark:text-gray-400'
            return (
              <div
                key={s.key}
                className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm p-4 hover-lift"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className={`w-9 h-9 rounded-xl ${tone.bg} ${tone.text} flex items-center justify-center`}>
                    {resolveIcon(s.iconName, 16, 2.25)}
                  </span>
                  {s.trendValue && (
                    <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold ${trendColor}`}>
                      <TrendIcon size={11} strokeWidth={2.75} />
                      {s.trendValue}
                    </span>
                  )}
                </div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
                  {typeof s.value === 'number' ? fmtNumber(s.value) : s.value}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 font-medium mt-0.5">{s.label}</div>
              </div>
            )
          })}
    </div>
  )
}