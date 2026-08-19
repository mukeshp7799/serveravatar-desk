const ACCENT = '#4F46E5'

function PaginationBar({
  page, total, limit, onPage, onLimitChange,
  pageSizeOptions = [10, 20, 30, 50],
}: {
  page: number; total: number; limit: number
  onPage: (p: number) => void; onLimitChange: (l: number) => void
  pageSizeOptions?: number[]
}) {
  const totalPages = Math.max(1, Math.ceil(total / limit))
  const start = total === 0 ? 0 : Math.min((page - 1) * limit + 1, total)
  const end = total === 0 ? 0 : Math.min(page * limit, total)

  const getPages = (): (number | '...')[] => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
    const pages: (number | '...')[] = []
    const showLeft = page > 3
    const showRight = page < totalPages - 2
    pages.push(1, 2)
    if (showLeft) pages.push('...')
    const startPage = showLeft ? (showRight ? page - 1 : totalPages - 3) : 3
    const endPage = showRight ? (showLeft ? page + 1 : 4) : totalPages - 1
    for (let p = startPage; p <= endPage; p++) pages.push(p)
    if (showRight) pages.push('...')
    pages.push(totalPages)
    return [...new Set(pages)].sort((a, b) =>
      a === '...' || b === '...' ? 0 : (a as number) - (b as number)
    ) as (number | '...')[]
  }

  const pages = getPages()
  const prev = Math.max(1, page - 1)
  const next = Math.min(totalPages, page + 1)

  return (
    <div className="flex flex-wrap items-start xs:items-center justify-between gap-2 px-4 xs:px-5 py-3 border-t border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">

      {/* Result count — wraps naturally on small screens */}
      <p className="text-xs text-gray-500 dark:text-gray-400 leading-7 min-w-0">
        Showing{' '}
        <span className="font-medium text-gray-700 dark:text-gray-200">{start}</span>–{end}{' '}
        of{' '}
        <span className="font-medium text-gray-700 dark:text-gray-200">{total}</span>
      </p>

      {/* Controls — per-page + nav buttons, wrap together on mobile */}
      <div className="flex flex-wrap items-center justify-end gap-2 xs:gap-3">

        {/* Per-page selector */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-xs text-gray-400 whitespace-nowrap leading-7">Per page:</span>
          <div className="relative shrink-0">
            <select
              value={limit}
              onChange={e => onLimitChange(Number(e.target.value))}
              className="appearance-none pl-2 pr-6 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg cursor-pointer focus:outline-none focus:ring-2 transition"
              style={{ '--tw-ring-color': ACCENT, colorScheme: 'normal' } as React.CSSProperties}
            >
              {pageSizeOptions.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
            <span className="pointer-events-none absolute inset-y-0 right-1.5 flex items-center text-gray-400">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </span>
          </div>
        </div>

        {/* Navigation buttons */}
        <div className="flex flex-wrap items-center gap-1">
          <button
            onClick={() => onPage(prev)} disabled={page <= 1}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700 transition cursor-pointer bg-transparent shrink-0"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          {pages.map((p, i) =>
            p === '...' ? (
              <span key={`ellipsis-${i}`} className="w-8 h-8 flex items-center justify-center text-gray-400 shrink-0">…</span>
            ) : (
              <button key={p} onClick={() => onPage(p as number)}
                className={`w-8 h-8 rounded-lg text-xs font-semibold transition cursor-pointer border shrink-0 ${
                  page === p
                    ? 'text-white border-transparent'
                    : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
                style={page === p ? { backgroundColor: ACCENT } : {}}
              >{p}</button>
            )
          )}

          <button
            onClick={() => onPage(next)} disabled={page >= totalPages}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700 transition cursor-pointer bg-transparent shrink-0"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

      </div>
    </div>
  )
}

export default PaginationBar
