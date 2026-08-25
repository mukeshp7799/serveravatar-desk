'use client'

import { ChevronUp, ChevronDown } from 'lucide-react'
import { ScrollFade } from '@/components/ui/scroll-fade'
import PaginationBar from '@/components/project/PaginationBar'

// ─── Types ────────────────────────────────────────────────────────────────────

export type SortOrder = 'ASC' | 'DESC'

export interface Column {
  /** Header label */
  label: string
  /** Row data key — used for active sort indicator */
  field?: string
  /** Show sort controls */
  sortable?: boolean
  /** Extra classes for <th> */
  thClassName?: string
}

export interface DataTableProps {
  /** Optional page title shown in the header */
  title?: string
  /** Total record count shown next to title */
  totalCount?: number
  /** Column definitions — used to generate <thead> */
  columns: Column[]
  /** Current sort field */
  sortBy?: string
  sortOrder?: SortOrder
  /** Called when a sortable column header is clicked */
  onSort?: (field: string, order: SortOrder) => void
  /** Empty state message */
  emptyMessage?: string
  /** Minimum table width (enables horizontal scroll) */
  minWidth?: string
  /** <tbody> and any extra table rows */
  children: React.ReactNode
  /** Pagination — rendered inside the rounded container below the scroll area */
  pagination?: React.ReactNode
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DataTable({
  title,
  totalCount,
  columns,
  sortBy,
  sortOrder = 'ASC',
  onSort,
  emptyMessage = 'No records found',
  minWidth = '900px',
  children,
  pagination,
}: DataTableProps) {
  const handleSort = (col: Column) => {
    if (!col.sortable || !onSort || !col.field) return
    onSort(col.field, sortBy === col.field && sortOrder === 'ASC' ? 'DESC' : 'ASC')
  }

  return (
    <div className="flex flex-col rounded-2xl border border-gray-200">
      {/* ── Page / table header ── */}
      {(title || typeof totalCount === 'number') && (
        <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
            {title}
            {typeof totalCount === 'number' && (
              <span className="ml-2 font-normal text-gray-400 dark:text-gray-500">
                ({totalCount})
              </span>
            )}
          </h2>
        </div>
      )}

      {/* ── Scrollable table ── */}
      <ScrollFade fadeEdge={false} className="relative">
        <table
          className="w-full border-collapse"
          style={{ minWidth }}
        >
          {/* ── Header ── */}
          <thead className="sticky top-0 z-10 bg-white">
            <tr className="border-b border-gray-100 dark:border-gray-700">
              {columns.map(col => (
                <th
                  key={col.label}
                  className={`px-5 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap first:pl-5 last:pr-5 select-none ${col.thClassName ?? ''}`}
                >
                  {col.sortable ? (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleSort(col) }}
                      className="flex items-center gap-1 cursor-pointer hover:text-gray-600 dark:hover:text-gray-300 transition-colors rounded px-1 -mx-1 bg-transparent border-0 p-0"
                    >
                      {col.label}
                      <span className="inline-flex flex-col">
                        <ChevronUp
                          size={10}
                          className={`-mb-1 ${
                            sortBy === col.field && sortOrder === 'ASC'
                              ? 'text-indigo-500'
                              : 'text-gray-300 dark:text-gray-600'
                          }`}
                        />
                        <ChevronDown
                          size={10}
                          className={`${
                            sortBy === col.field && sortOrder === 'DESC'
                              ? 'text-indigo-500'
                              : 'text-gray-300 dark:text-gray-600'
                          }`}
                        />
                      </span>
                    </button>
                  ) : (
                    <span className="flex items-center gap-1">{col.label}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>

          {/* ── Body — supplied by parent ── */}
          {children}
        </table>
      </ScrollFade>

      {/* ── Pagination footer ── */}
      {pagination && (
        <div className="border-t border-gray-100 dark:border-gray-700">
          {pagination}
        </div>
      )}

      {/* ── Empty state ── */}
      {!children && (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-500">
          <p className="text-sm font-medium">{emptyMessage}</p>
        </div>
      )}
    </div>
  )
}
