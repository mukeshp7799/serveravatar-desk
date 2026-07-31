'use client'
import { useState, useRef, useEffect } from 'react'
import { useTheme } from './ThemeProvider'
import { Sun, Moon, Monitor, Check } from 'lucide-react'

type ThemeMode = 'light' | 'dark' | 'system'

const labels: Record<ThemeMode, string> = { light: 'Light', dark: 'Dark', system: 'System' }
const IconFor: Record<ThemeMode, React.ComponentType<{ size?: number; strokeWidth?: number }>> = {
  light: Sun, dark: Moon, system: Monitor,
}

export default function ThemeSelector() {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const ActiveIcon = IconFor[theme as ThemeMode]
  const cycleOrder: ThemeMode[] = ['light', 'dark', 'system']

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Click toggles between dropdown (advanced) — left as 3-item list.
  // Right-click / shift-click cycles theme for quick switching.
  const handleClick = (e: React.MouseEvent) => {
    if (e.shiftKey) {
      const idx = cycleOrder.indexOf(theme as ThemeMode)
      const next = cycleOrder[(idx + 1) % cycleOrder.length]
      setTheme(next)
    } else {
      setOpen(!open)
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={handleClick}
        aria-label="Change theme"
        data-tooltip-id="app-tooltip"
        data-tooltip-content={`Theme: ${labels[theme as ThemeMode]} — click to choose, shift+click to cycle`}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`header-icon-btn ${open ? 'is-open' : ''}`}
      >
        <ActiveIcon size={18} strokeWidth={2.25} />
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-2 rounded-xl border shadow-xl z-50 min-w-[160px] overflow-hidden backdrop-blur-md bg-white/95 border-indigo-200 shadow-indigo-500/10
          dark:bg-slate-900/95 dark:border-slate-700 dark:shadow-black/50">
          {(['light', 'dark', 'system'] as const).map((t) => {
            const Icon = IconFor[t]
            const selected = theme === t
            const isDark = resolvedTheme === 'dark'
            return (
              <button
                key={t}
                type="button"
                onClick={() => { setTheme(t); setOpen(false) }}
                className={`flex items-center gap-2.5 w-full px-3.5 py-2.5 border-none cursor-pointer text-sm text-left transition-colors
                  ${selected
                    ? isDark
                      ? 'bg-indigo-500/20 text-indigo-300 font-semibold'
                      : 'bg-indigo-50 text-indigo-700 font-semibold'
                    : isDark
                      ? 'bg-transparent text-slate-200 hover:bg-slate-800'
                      : 'bg-transparent text-gray-700 hover:bg-gray-50'}`}
              >
                <Icon size={16} strokeWidth={2.25} />
                <span className="flex-1">{labels[t]}</span>
                {selected && (
                  <Check size={12} strokeWidth={2.5} className={isDark ? 'text-indigo-300' : 'text-indigo-600'} />
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}