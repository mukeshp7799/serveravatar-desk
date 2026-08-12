'use client'
import { useEffect, useState } from 'react'
import { useDebouncedCallback } from 'use-debounce'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import api from '@/lib/api'
import PageLoader from '@/components/PageLoader'
import {
  Search, X, ChevronUp, ChevronDown, ChevronsUpDown,
  User, Plus, MoreHorizontal, RefreshCw, Pencil, Trash2, Eye, UserCheck, Ban, LayoutGrid, List,
} from 'lucide-react'

const ACCENT = '#4F46E5'

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtDate(raw: string | null | undefined): string {
  if (!raw) return '—'
  const s = String(raw).trim()
  // Parse YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS as UTC to avoid timezone shift
  const hasTime = /T|\s/.test(s)
  const dateStr = hasTime ? s.split(/T|\s/)[0] : s
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return s
  const [y, m, d] = dateStr.split('-').map(Number)
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${d} ${months[m - 1]}, ${y}`
}

const statusBadge = (s: string) => {
  if (s === 'active') return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
      Active
    </span>
  )
  if (s === 'pending') return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
      Pending
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400">
      <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
      Inactive
    </span>
  )
}

const empTypeBadge = (t: string) => {
  const colors: Record<string, string> = {
    'full-time': 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    'part-time':  'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    'contract':   'bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    'intern':     'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    'freelance':  'bg-pink-50 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
  }
  const labels: Record<string, string> = {
    'full-time': 'Full Time', 'part-time': 'Part Time',
    'contract': 'Contract', 'intern': 'Intern', 'freelance': 'Freelance',
  }
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
      colors[t] || 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
    }`}>
      {labels[t] || t}
    </span>
  )
}

// ─── Pagination ─────────────────────────────────────────────────────────────

function PaginationBar({ page, total, limit, onPage, onLimitChange }: {
  page: number; total: number; limit: number; onPage: (p: number) => void; onLimitChange: (l: number) => void
}) {
  const totalPages = Math.max(1, Math.ceil(total / limit))
  const start = Math.min((page - 1) * limit + 1, total)
  const end   = Math.min(page * limit, total)

  const getPages = (): (number | '...')[] => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
    const pages: (number | '...')[] = []
    const showLeft  = page > 3
    const showRight = page < totalPages - 2
    pages.push(1, 2)
    if (showLeft)  pages.push('...')
    const startPage = showLeft  ? (showRight ? page - 1 : totalPages - 3) : 3
    const endPage   = showRight ? (showLeft  ? page + 1 : 4)              : totalPages - 1
    for (let p = startPage; p <= endPage; p++) pages.push(p)
    if (showRight) pages.push('...')
    pages.push(totalPages)
    return [...new Set(pages)].sort((a, b) =>
      a === '...' || b === '...' ? 0 : (a as number) - (b as number)
    ) as (number | '...')[]
  }

  const pages = getPages()
  const prev  = Math.max(1, page - 1)
  const next  = Math.min(totalPages, page + 1)

  return (
    <div className="flex flex-wrap items-start sm:items-center justify-between gap-x-6 gap-y-2 px-4 sm:px-5 py-3 border-t border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-b-2xl">
      <p className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap leading-7">
        Showing <span className="font-medium text-gray-700 dark:text-gray-200">{start}</span> to{' '}
        <span className="font-medium text-gray-700 dark:text-gray-200">{end}</span> of{' '}
        <span className="font-medium text-gray-700 dark:text-gray-200">{total}</span> results
      </p>
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400 whitespace-nowrap leading-7">Per page:</span>
          <div className="relative">
            <select
              value={limit}
              onChange={e => onLimitChange(Number(e.target.value))}
              className="appearance-none pl-2 pr-6 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg cursor-pointer focus:outline-none focus:ring-2 transition"
              style={{ '--tw-ring-color': ACCENT, colorScheme: 'normal' } as any}
            >
              {[8, 12, 24, 48].map(o => <option key={o} value={o}>{o}</option>)}
            </select>
            <span className="pointer-events-none absolute inset-y-0 right-1.5 flex items-center text-gray-400">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onPage(prev)} disabled={page <= 1}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700 transition cursor-pointer bg-transparent"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          {pages.map((p, i) =>
            p === '...' ? (
              <span key={`ellipsis-${i}`} className="w-8 h-8 flex items-center justify-center text-gray-400">…</span>
            ) : (
              <button key={p} onClick={() => onPage(p as number)}
                className={`w-8 h-8 rounded-lg text-xs font-semibold transition cursor-pointer border ${
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
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700 transition cursor-pointer bg-transparent"
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

// ─── Action Menu ─────────────────────────────────────────────────────────────

function ActionMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [open])
  return (
    <div className="relative inline-block">
      <button
        onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 dark:hover:text-gray-200 transition cursor-pointer bg-transparent border-0"
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg py-1 min-w-[140px]">
          {children}
        </div>
      )}
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────

type SortOption = { value: string; label: string }

export default function EmployeesPage() {
  const [loading, setLoading] = useState(true)
  const [employees, setEmployees] = useState<any[]>([])
  const [departments, setDepartments] = useState<any[]>([])
  const [roles, setRoles] = useState<any[]>([])
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 12, totalPages: 0 })

  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [filterDept, setFilterDept] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterRole, setFilterRole] = useState('')
  const [filterEmpType, setFilterEmpType] = useState('')
  const [sortBy, setSortBy] = useState('first_name')
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('ASC')
  const [limit, setLimit] = useState(12)
  const [view, setView] = useState<'table' | 'grid'>(
    typeof window !== 'undefined'
      ? (localStorage.getItem('employees_view') as 'table' | 'grid') || 'table'
      : 'table'
  )
  const [isRefreshing, setIsRefreshing] = useState(false)
  const router = useRouter()
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deletingEmployee, setDeletingEmployee] = useState<any>(null)
  const [showStatusModal, setShowStatusModal] = useState(false)
  const [statusEmployee, setStatusEmployee] = useState<any>(null)

  const sortOptions: SortOption[] = [
    { value: 'first_name',      label: 'Name' },
    { value: 'employee_id',     label: 'Emp. ID' },
    { value: 'department_name', label: 'Department' },
    { value: 'role_name',       label: 'Role' },
    { value: 'status',          label: 'Status' },
    { value: 'employment_type', label: 'Type' },
    { value: 'hire_date',       label: 'Join Date' },
    { value: 'created_at',      label: 'Created' },
  ]

  const fetchEmployees = async (page = 1) => {
    setLoading(true)
    setIsRefreshing(true)
    try {
      const params = new URLSearchParams()
      if (search)        params.set('search', search)
      if (filterDept)    params.set('departmentId', filterDept)
      if (filterStatus)  params.set('status', filterStatus)
      if (filterRole)    params.set('roleId', filterRole)
      if (filterEmpType) params.set('employmentType', filterEmpType)
      params.set('page', String(page))
      params.set('limit', String(limit))
      params.set('sortBy', sortBy)
      params.set('sortOrder', sortOrder)
      const data = await api.get(`/employees?${params.toString()}`)
      setEmployees(data.employees || [])
      setPagination(data.pagination || { total: 0, page: 1, limit: 12, totalPages: 0 })
    } catch (e) { console.error(e) }
    finally { setLoading(false); setIsRefreshing(false) }
  }

  const openDeleteModal = (emp: any) => {
    setDeletingEmployee(emp)
    setShowDeleteModal(true)
  }

  const confirmDelete = async () => {
    if (!deletingEmployee) return
    try {
      await api.delete(`/employees/${deletingEmployee.id}`)
      fetchEmployees(pagination.page)
    } catch (e: any) { console.error(e?.message || e) }
    finally { setShowDeleteModal(false); setDeletingEmployee(null) }
  }

  const toggleStatus = (emp: any) => {
    setStatusEmployee(emp)
    setShowStatusModal(true)
  }

  const confirmToggleStatus = async () => {
    if (!statusEmployee) return
    const newStatus = statusEmployee.status === 'active' ? 'inactive' : 'active'
    try {
      await api.put(`/employees/${statusEmployee.id}`, { status: newStatus })
      fetchEmployees(pagination.page)
    } catch (e: any) { console.error(e?.message || e) }
    finally { setShowStatusModal(false); setStatusEmployee(null) }
  }

  useEffect(() => {
    Promise.all([api.get('/departments'), api.get('/roles')])
      .then(([deptsData, rolesData]) => {
        setDepartments(deptsData.departments || [])
        setRoles(rolesData.roles || [])
      }).catch(console.error)
  }, [])

  useEffect(() => { fetchEmployees(1) }, [search, filterDept, filterStatus, filterRole, filterEmpType, sortBy, sortOrder, limit])

  const clearFilters = () => {
    debouncedSearch.cancel()
    setSearch(''); setSearchInput(''); setFilterDept(''); setFilterStatus(''); setFilterRole(''); setFilterEmpType('')
  }
  const hasFilters = searchInput || filterDept || filterStatus || filterRole || filterEmpType

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'ASC' ? 'DESC' : 'ASC')
    } else {
      setSortBy(field)
      setSortOrder('ASC')
    }
  }

  const debouncedSearch = useDebouncedCallback((value: string) => {
    setSearch(value)
    fetchEmployees(1)
  }, 400)

  const handleViewChange = (v: 'table' | 'grid') => {
    setView(v)
    localStorage.setItem('employees_view', v)
  }

  return (
    <div className="w-full px-4 py-6 space-y-4">

      {/* ── Page header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Employee Directory</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {pagination.total} employee{pagination.total !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 px-5 py-4">
        {/* Row 1: Search + quick filters */}
        <div className="flex flex-wrap gap-3 items-center">

          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search by name, email, designation, or ID..."
              value={searchInput}
              onChange={e => { setSearchInput(e.target.value); debouncedSearch(e.target.value) }}
              className="w-full pl-9 pr-8 py-2 text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 transition placeholder-gray-400"
              style={{ '--tw-ring-color': ACCENT } as any}
            />
            {searchInput && (
              <button
                onClick={() => { debouncedSearch.cancel(); setSearch(''); setSearchInput('') }}
                className="absolute right-8 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer bg-transparent border-0 p-0"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Department */}
          <select
            value={filterDept}
            onChange={e => setFilterDept(e.target.value)}
            className="px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-200 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl cursor-pointer focus:outline-none focus:ring-2 transition"
            style={{ '--tw-ring-color': ACCENT } as any}
          >
            <option value="">All Departments</option>
            {departments.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>

          {/* Status */}
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-200 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl cursor-pointer focus:outline-none focus:ring-2 transition"
            style={{ '--tw-ring-color': ACCENT } as any}
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>

          {/* Role */}
          <select
            value={filterRole}
            onChange={e => setFilterRole(e.target.value)}
            className="px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-200 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl cursor-pointer focus:outline-none focus:ring-2 transition"
            style={{ '--tw-ring-color': ACCENT } as any}
          >
            <option value="">All Roles</option>
            {roles.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>

          {/* Employment Type */}
          <select
            value={filterEmpType}
            onChange={e => setFilterEmpType(e.target.value)}
            className="px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-200 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl cursor-pointer focus:outline-none focus:ring-2 transition"
            style={{ '--tw-ring-color': ACCENT } as any}
          >
            <option value="">All Types</option>
            <option value="full-time">Full Time</option>
            <option value="part-time">Part Time</option>
            <option value="contract">Contract</option>
            <option value="intern">Intern</option>
            <option value="freelance">Freelance</option>
          </select>

          {/* Clear Filters */}
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 border border-gray-200 dark:border-gray-600 rounded-xl transition cursor-pointer"
            >
              Clear Filters
            </button>
          )}

          {/* Refresh */}
          <button
            onClick={() => fetchEmployees(pagination.page)}
            className="px-3 py-2 text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 border border-gray-200 dark:border-gray-600 rounded-xl transition cursor-pointer"
            title="Refresh"
          >
            <RefreshCw size={14} className={`transition-transform ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>

          {/* View Toggle */}
          <div className="flex items-center border border-gray-200 dark:border-gray-600 rounded-xl overflow-hidden">
            <button
              onClick={() => handleViewChange('table')}
              className={`px-2.5 py-2 transition cursor-pointer border-0 ${view === 'table' ? 'text-white' : 'text-gray-400 dark:text-gray-500 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600'}`}
              style={view === 'table' ? { backgroundColor: ACCENT } : {}}
              title="Table View"
            >
              <LayoutGrid size={14} />
            </button>
            <div className="w-px h-5 bg-gray-200 dark:bg-gray-600" />
            <button
              onClick={() => handleViewChange('grid')}
              className={`px-2.5 py-2 transition cursor-pointer border-0 ${view === 'grid' ? 'text-white' : 'text-gray-400 dark:text-gray-500 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600'}`}
              style={view === 'grid' ? { backgroundColor: ACCENT } : {}}
              title="Grid View"
            >
              <List size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-20"><PageLoader /></div>
        ) : employees.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400 dark:text-gray-500">
            <User size={48} className="mb-3 opacity-40" />
            <p className="text-sm font-medium">No employees found</p>
            {hasFilters && (
              <button onClick={clearFilters} className="mt-2 text-xs text-indigo-500 hover:text-indigo-700 dark:text-indigo-400 cursor-pointer border-0 bg-transparent">
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          <>
            {view === 'table' ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px]">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-gray-700">
                      {[ { label: 'Employee',      field: 'first_name',        sortable: true  },
                      { label: 'Employee ID',   field: 'employee_id',        sortable: true  },
                      { label: 'Department',    field: 'department_name',    sortable: true  },
                      { label: 'Role',           field: 'role_name',          sortable: true  },
                      { label: 'Status',         field: 'status',             sortable: true  },
                      { label: 'Employment Type',field: 'employment_type',   sortable: true  },
                      { label: 'Join Date',      field: 'hire_date',          sortable: true  },
                      { label: '',               field: null,                 sortable: false },
                    ].map(col => (
                      <th
                        key={col.label}
                        onClick={() => col.sortable ? handleSort(col.field) : undefined}
                        className={`px-5 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap first:pl-5 last:pr-5 ${col.sortable ? 'cursor-pointer hover:text-gray-600 dark:hover:text-gray-300 select-none transition-colors' : ''}`}
                      >
                        <span className="flex items-center gap-1">
                          {col.label}
                          {col.sortable && (
                            <span className="inline-flex flex-col">
                              <ChevronUp
                                size={10}
                                className={`-mb-1 ${sortBy === col.field && sortOrder === 'ASC' ? 'text-indigo-500' : 'text-gray-300 dark:text-gray-600'}`}
                              />
                              <ChevronDown
                                size={10}
                                className={`${sortBy === col.field && sortOrder === 'DESC' ? 'text-indigo-500' : 'text-gray-300 dark:text-gray-600'}`}
                              />
                            </span>
                          )}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-700/60">
                  {employees.map((emp: any) => {
                    const initials = `${emp.first_name?.[0] || ''}${emp.last_name?.[0] || ''}`.toUpperCase()
                    return (
                      <tr key={emp.id}
                        className="hover:bg-slate-50/70 dark:hover:bg-gray-700/30 transition-colors"
                      >
                        {/* Employee */}
                        <td className="px-5 py-3.5">
                          <Link href={`/employees/${emp.id}`}
                            className="flex items-center gap-2.5 no-underline hover:opacity-80 transition-opacity">
                            {emp.avatar_url
                              ? <img src={emp.avatar_url} alt={initials}
                                  className="w-9 h-9 rounded-full object-cover border-2 border-gray-200 dark:border-gray-600 shrink-0" />
                              : <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                                  style={{ background: `linear-gradient(135deg, ${ACCENT}, #7c3aed)` }}>
                                  {initials}
                                </div>
                              }
                            <div>
                              <div className="text-sm font-semibold text-gray-900 dark:text-white">{emp.first_name} {emp.last_name}</div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">{emp.designation || '—'}</div>
                              <div className="text-xs text-gray-400 dark:text-gray-500">{emp.email}</div>
                            </div>
                          </Link>
                        </td>
                        {/* Employee ID */}
                        <td className="px-5 py-3.5">
                          <span className="text-sm font-mono text-gray-600 dark:text-gray-400">{emp.employee_id ? `#${emp.employee_id}` : '—'}</span>
                        </td>
                        {/* Department */}
                        <td className="px-5 py-3.5">
                          <span className="text-sm text-gray-700 dark:text-gray-300">{emp.department_name || '—'}</span>
                        </td>
                        {/* Role */}
                        <td className="px-5 py-3.5">
                          <span className="text-sm text-gray-700 dark:text-gray-300">{emp.role_name || '—'}</span>
                        </td>
                        {/* Status */}
                        <td className="px-5 py-3.5">
                          {statusBadge(emp.status)}
                        </td>
                        {/* Employment Type */}
                        <td className="px-5 py-3.5">
                          {emp.employment_type ? empTypeBadge(emp.employment_type) : '—'}
                        </td>
                        {/* Join Date */}
                        <td className="px-5 py-3.5">
                          <span className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">{fmtDate(emp.hire_date)}</span>
                        </td>
                        {/* Actions */}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center justify-start gap-1">
                            <Link
                              href={`/employees/${emp.id}`}
                              className="p-2 rounded-lg text-white transition cursor-pointer border-0 no-underline"
                              style={{ backgroundColor: ACCENT }}
                              title="View Details"
                            >
                              <Eye size={13} />
                            </Link>
                            <button
                              onClick={() => toggleStatus(emp)}
                              className="p-2 rounded-lg text-white transition cursor-pointer border-0"
                              style={{ backgroundColor: emp.status === 'active' ? '#d97706' : '#16a34a' }}
                              title={emp.status === 'active' ? 'Deactivate' : 'Activate'}
                            >
                              {emp.status === 'active'
                                ? <Ban size={13} />
                                : <UserCheck size={13} />
                              }
                            </button>
                            <button
                              onClick={() => openDeleteModal(emp)}
                              className="p-2 rounded-lg text-white transition cursor-pointer border-0"
                              style={{ backgroundColor: '#dc2626' }}
                              title="Delete"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-2">
                {employees.map((emp: any) => {
                  const initials = `${emp.first_name?.[0] || ''}${emp.last_name?.[0] || ''}`.toUpperCase()
                  return (
                    <div key={emp.id}
                      className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5 hover:shadow-md hover:border-indigo-100 dark:hover:border-indigo-900/40 transition-all cursor-pointer group"
                      onClick={() => router.push(`/employees/${emp.id}`)}
                    >
                      {/* Header: avatar + name */}
                      <div className="flex items-start gap-3 mb-4">
                        {emp.avatar_url
                          ? <img src={emp.avatar_url} alt={initials} className="w-12 h-12 rounded-xl object-cover border-2 border-gray-200 dark:border-gray-600 shrink-0" />
                          : <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white text-sm font-bold shrink-0"
                              style={{ background: `linear-gradient(135deg, ${ACCENT}, #7c3aed)` }}>
                              {initials}
                            </div>
                          }
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-gray-900 dark:text-white text-sm truncate">{emp.first_name} {emp.last_name}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{emp.designation || '—'}</div>
                          <div className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">{emp.email}</div>
                        </div>
                      </div>

                      {/* Info rows */}
                      <div className="space-y-1.5 mb-4">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-400 dark:text-gray-500">Department</span>
                          <span className="text-xs text-gray-700 dark:text-gray-300 truncate ml-2">{emp.department_name || '—'}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-400 dark:text-gray-500">Role</span>
                          <span className="text-xs text-gray-700 dark:text-gray-300 truncate ml-2">{emp.role_name || '—'}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-400 dark:text-gray-500">Status</span>
                          <span className="ml-2">{statusBadge(emp.status)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-400 dark:text-gray-500">Type</span>
                          <span className="ml-2">{emp.employment_type ? empTypeBadge(emp.employment_type) : '—'}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-400 dark:text-gray-500">Join Date</span>
                          <span className="text-xs text-gray-700 dark:text-gray-300 ml-2">{fmtDate(emp.hire_date)}</span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 pt-3 border-t border-gray-100 dark:border-gray-700"
                        onClick={e => e.stopPropagation()}
                      >
                        <Link
                          href={`/employees/${emp.id}`}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-white text-xs font-medium transition border-0 no-underline"
                          style={{ backgroundColor: ACCENT }}
                          title="View Details"
                        >
                          <Eye size={12} /> View
                        </Link>
                        <button
                          onClick={() => toggleStatus(emp)}
                          className="p-2 rounded-xl text-white transition cursor-pointer border-0"
                          style={{ backgroundColor: emp.status === 'active' ? '#d97706' : '#16a34a' }}
                          title={emp.status === 'active' ? 'Deactivate' : 'Activate'}
                        >
                          {emp.status === 'active' ? <Ban size={13} /> : <UserCheck size={13} />}
                        </button>
                        <button
                          onClick={() => openDeleteModal(emp)}
                          className="p-2 rounded-xl text-white transition cursor-pointer border-0"
                          style={{ backgroundColor: '#dc2626' }}
                          title="Delete"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Pagination */}
            <PaginationBar
              page={pagination.page}
              total={pagination.total}
              limit={pagination.limit}
              onPage={p => fetchEmployees(p)}
              onLimitChange={l => { setLimit(l); fetchEmployees(1) }}
            />
          </>
        )}
      </div>

      {/* ── Delete Confirmation Modal ─────────────────────── */}
      {showDeleteModal && deletingEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-sm w-full p-6">
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-red-50 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
                <Trash2 size={22} className="text-red-500" />
              </div>
              <h2 className="text-base font-bold text-gray-900 dark:text-white mb-2">Delete employee?</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                Are you sure you want to delete <strong>{deletingEmployee.first_name} {deletingEmployee.last_name}</strong>? This action cannot be undone.
              </p>
              <div className="flex gap-2.5">
                <button
                  onClick={() => { setShowDeleteModal(false); setDeletingEmployee(null) }}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-xl border border-gray-200 dark:border-gray-600 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-red-500 hover:bg-red-600 rounded-xl transition cursor-pointer border-0"
                >
                  Yes, Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Status Toggle Confirmation Modal ─────────────── */}
      {showStatusModal && statusEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-sm w-full p-6">
            <div className="text-center">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
                style={{ backgroundColor: statusEmployee.status === 'active' ? '#fef3c7' : '#dcfce7' }}
              >
                {statusEmployee.status === 'active'
                  ? <Ban size={22} className="text-amber-500" />
                  : <UserCheck size={22} className="text-green-500" />
                }
              </div>
              <h2 className="text-base font-bold text-gray-900 dark:text-white mb-2">
                {statusEmployee.status === 'active' ? 'Deactivate' : 'Activate'} employee?
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                Are you sure you want to {statusEmployee.status === 'active' ? 'deactivate' : 'activate'}{' '}
                <strong>{statusEmployee.first_name} {statusEmployee.last_name}</strong>?
              </p>
              <div className="flex gap-2.5">
                <button
                  onClick={() => { setShowStatusModal(false); setStatusEmployee(null) }}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-xl border border-gray-200 dark:border-gray-600 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmToggleStatus}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold text-white rounded-xl transition cursor-pointer border-0"
                  style={{ backgroundColor: statusEmployee.status === 'active' ? '#d97706' : '#16a34a' }}
                >
                  {statusEmployee.status === 'active' ? 'Yes, Deactivate' : 'Yes, Activate'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
