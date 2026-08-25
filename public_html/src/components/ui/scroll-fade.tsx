'use client'

import { cn } from '@/lib/utils'

interface ScrollFadeProps {
  children: React.ReactNode
  className?: string
  /** Show right-edge gradient fade (default: true) */
  fadeEdge?: boolean
}

export function ScrollFade({
  children,
  className,
  fadeEdge = true,
}: ScrollFadeProps) {
  return (
    <div className={cn('relative', className)}>
      {/* Right-edge gradient fade — pure CSS, no scroll-driven animation */}
      {fadeEdge && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-0 top-0 bottom-0 z-10 w-16 bg-gradient-to-l from-white dark:from-gray-800 to-transparent"
        />
      )}

      {/* Scrollable container — mobile: one-finger horizontal swipe */}
      <div className="overflow-x-auto overflow-y-auto touch-pan-x overscroll-contain">
        {children}
      </div>
    </div>
  )
}
