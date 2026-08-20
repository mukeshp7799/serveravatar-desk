'use client'

/**
 * Reusable truncated-cell component for activity labels.
 *
 * Props:
 *   value     — full display string
 *   maxChars  — approximate max characters before truncating (default 32)
 *   className — optional additional Tailwind classes on the outer span
 */
export function TruncatedActivity({
  value,
  maxChars = 32,
  className = '',
  showTitle = true,
}: {
  value: string
  maxChars?: number
  className?: string
  showTitle?: boolean
}) {
  if (!value) return <span className="text-gray-400 dark:text-gray-600 text-xs italic">—</span>

  const display =
    value.length > maxChars ? value.slice(0, maxChars).trimEnd() + '…' : value

  return (
    <span
      title={showTitle ? value : undefined}
      className={`inline-block max-w-full ${className}`}
    >
      <span
        className="block max-w-[240px] truncate"
        title={showTitle ? value : undefined}
      >
        {display}
      </span>
    </span>
  )
}
