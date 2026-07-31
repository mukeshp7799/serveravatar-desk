'use client'

/**
 * Unified page loader — used across all pages for consistent loading UI.
 * Indigo Calm theme: indigo-600 spinner on white/surface background.
 */
export default function PageLoader({
  label,
  size = 'md',
}: {
  label?: string
  size?: 'sm' | 'md' | 'lg'
}) {
  const sizeClasses = {
    sm: 'w-6 h-6 border-2',
    md: 'w-10 h-10 border-4',
    lg: 'w-14 h-14 border-[5px]',
  }[size]

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 gap-3">
      <div
        className={`${sizeClasses} border-gray-200 dark:border-gray-700 border-t-indigo-600 rounded-full animate-spin`}
        role="status"
        aria-label="Loading"
      />
      {label && (
        <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">{label}</p>
      )}
    </div>
  )
}