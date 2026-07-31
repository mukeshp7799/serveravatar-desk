'use client'

/**
 * Unified tabs component — Indigo Calm theme.
 * Active tab: bg-indigo-600 + white text + shadow.
 * Inactive tab: transparent + gray-600 text, hovers to gray-100.
 *
 * Uses the SAME style across every page in the project.
 */
type Tab = {
  key: string
  label: React.ReactNode
  /** Optional visibility condition (e.g. role-gated) */
  show?: boolean
}

export default function Tabs({
  tabs,
  active,
  onChange,
  className = '',
}: {
  tabs: Tab[]
  active: string
  onChange: (key: string) => void
  className?: string
}) {
  const visible = tabs.filter((t) => t.show !== false)
  return (
    <div className={`flex flex-wrap gap-2 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-1.5 ${className}`}>
      {visible.map((tab) => {
        const isActive = tab.key === active
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className={`flex-1 min-w-[140px] px-4 py-2.5 text-sm font-bold rounded-xl transition cursor-pointer border-none ${
              isActive
                ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow'
                : 'bg-transparent text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}