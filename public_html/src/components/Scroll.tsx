'use client'
import { useEffect, useRef } from 'react'
import PerfectScrollbar from 'react-perfect-scrollbar'
import 'perfect-scrollbar/css/perfect-scrollbar.css'

type Props = {
  children: React.ReactNode
  className?: string
  /** Wrapper class around the PerfectScrollbar (set fixed height here, e.g. "h-full" or "h-[600px]"). */
  containerClassName?: string
  options?: any
  /** Refresh scroll on data updates. */
  watch?: any
  /** Called after mount to ensure scroll initializes with proper height. */
  onReady?: () => void
}

const DEFAULT_OPTIONS = {
  wheelSpeed: 0.8,
  wheelPropagation: false,
  swipePropagation: false,
  suppressScrollX: false,
  suppressScrollY: false,
  useBothWheelAxes: false,
  minScrollbarLength: 24,
  maxScrollbarLength: Infinity,
  scrollingThreshold: 100,
  scrollXMarginOffset: 0,
  scrollYMarginOffset: 0,
}

/**
 * PerfectScrollbar wrapper. Children should be wrapped in a div so the
 * content layer has fixed dimensions. Container MUST have a definite height
 * (use containerClassName="h-full" inside a flex column, or a fixed px height).
 */
export default function Scroll({
  children,
  className = '',
  containerClassName = 'h-full',
  options = {},
  watch,
  onReady,
}: Props) {
  const ref = useRef<any>(null)

  // Re-measure when content/data updates
  useEffect(() => {
    const update = () => {
      if (ref.current && ref.current.update) {
        ref.current.update()
      }
    }
    update()
    // Also schedule an extra update after layout settles (images, fonts)
    const t = setTimeout(update, 100)
    return () => clearTimeout(t)
  }, [watch])

  // Re-measure on resize and reset scroll position to prevent white space
  useEffect(() => {
    const onResize = () => {
      if (ref.current) {
        if (ref.current.update) ref.current.update()
        // Reset scroll position to top-left when viewport changes
        if (ref.current.element) {
          ref.current.element.scrollLeft = 0
          ref.current.element.scrollTop = 0
        }
      }
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return (
    <div className={containerClassName} style={{ position: 'relative', height: '100%' }}>
      <PerfectScrollbar
        ref={ref}
        options={{ ...DEFAULT_OPTIONS, ...options }}
        className={className}
        onLoad={onReady}
      >
        {children}
      </PerfectScrollbar>
    </div>
  )
}
