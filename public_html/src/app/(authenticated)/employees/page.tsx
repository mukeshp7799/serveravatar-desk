'use client'
import PageLoader from '@/components/PageLoader'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Link from 'next/link'
import api from '@/lib/api'

const SearchIcon = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
const ChevronLeft = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
const ChevronRight = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
const ChevronUpDown = () => <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" /></svg>
const UserIcon = () => <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>

type SortOption = { value: string; label: string }

export default function EmployeesPage() {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [employees, setEmployees] = useState<any[]>([])
  const [departments, setDepartments] = useState<any[]>([])
  const [roles, setRoles] = useState<any[]>([])
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 12, totalPages: 0 })

  const [search, setSearch] = useState('')
  const [filterDept, setFilterDept] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterRole, setFilterRole] = useState('')
  const [filterEmpType, setFilterEmpType] = useState('')
  const [sortBy, setSortBy] = useState('first_name')
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('ASC')
  const [limit, setLimit] = useState(12)

  const sortOptions: SortOption[] = [
    { value: 'first_name', label: 'Name' },
    { value: 'email', label: 'Email' },
    { value: 'employee_id', label: 'Emp. ID' },
    { value: 'department_name', label: 'Department' },
    { value: 'role_name', label: 'Role' },
    { value: 'status', label: 'Status' },
    { value: 'employment_type', label: 'Type' },
    { value: 'hire_date', label: 'Join Date' },
    { value: 'created_at', label: 'Created' },
  ]

  const fetchEmployees = async (page = 1) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (filterDept) params.set('departmentId', filterDept)
      if (filterStatus) params.set('status', filterStatus)
      if (filterRole) params.set('roleId', filterRole)
      if (filterEmpType) params.set('employmentType', filterEmpType)
      params.set('page', String(page))
      params.set('limit', String(limit))
      params.set('sortBy', sortBy)
      params.set('sortOrder', sortOrder)
      const data = await api.get(`/employees?${params.toString()}`)
      setEmployees(data.employees || [])
      setPagination(data.pagination || { total: 0, page: 1, limit: 12, totalPages: 0 })
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  useEffect(() => {
    Promise.all([api.get('/departments'), api.get('/roles')])
      .then(([deptsData, rolesData]) => {
        setDepartments(deptsData.departments || [])
        setRoles(rolesData.roles || [])
      }).catch(console.error)
  }, [])

  useEffect(() => { fetchEmployees(1) }, [search, filterDept, filterStatus, filterRole, filterEmpType, sortBy, sortOrder, limit])

  const toggleSort = (field: string) => {
    if (sortBy === field) setSortOrder(sortOrder === 'ASC' ? 'DESC' : 'ASC')
    else { setSortBy(field); setSortOrder('ASC') }
  }

  const clearFilters = () => { setSearch(''); setFilterDept(''); setFilterStatus(''); setFilterRole(''); setFilterEmpType('') }
  const hasFilters = search || filterDept || filterStatus || filterRole || filterEmpType

  const statusColors: Record<string, string> = {
    active: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    inactive: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
  }
  const empTypeColors: Record<string, string> = {
    'full-time': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    'part-time': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
    'contract': 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
    'intern': 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
    'freelance': 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300',
  }
  const empTypeAbbrev: Record<string, string> = {
    'full-time': 'FT', 'part-time': 'PT', 'contract': 'Cont', 'intern': 'Int', 'freelance': 'Fl',
  }

  const SortIndicator = ({ field }: { field: string }) => {
    if (sortBy !== field) return <span className="opacity-0 group-hover:opacity-40 transition"><ChevronUpDown /></span>
    return sortOrder === 'ASC'
      ? <span className="text-indigo-600 dark:text-indigo-400">↑</span>
      : <span className="text-indigo-600 dark:text-indigo-400">↓</span>
  }

  return (
    <div className="w-full px-4 py-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Employee Directory</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{pagination.total} employee{pagination.total !== 1 ? 's' : ''}</p>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 mb-6">
        <div className="flex flex-col gap-3">
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"><SearchIcon /></div>
            <input type="text" placeholder="Search by name, email, designation, or employee ID..."
              value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={filterDept} onChange={e => setFilterDept(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer">
              <option value="">All Departments</option>
              {departments.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer">
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <select value={filterRole} onChange={e => setFilterRole(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer">
              <option value="">All Roles</option>
              {roles.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <select value={filterEmpType} onChange={e => setFilterEmpType(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer">
              <option value="">All Types</option>
              <option value="full-time">Full Time</option>
              <option value="part-time">Part Time</option>
              <option value="contract">Contract</option>
              <option value="intern">Intern</option>
              <option value="freelance">Freelance</option>
            </select>
            {hasFilters && (
              <button onClick={clearFilters}
                className="px-3 py-2 text-sm text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 font-medium transition cursor-pointer border-0 bg-transparent">
                Clear filters
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-gray-100 dark:border-gray-700">
            <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Sort:</span>
            {sortOptions.map(opt => (
              <button key={opt.value} onClick={() => toggleSort(opt.value)}
                className={`group inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer border ${
                  sortBy === opt.value
                    ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300'
                    : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-indigo-300 dark:hover:border-indigo-600'
                }`}>
                {opt.label}<SortIndicator field={opt.value} />
              </button>
            ))}
            <div className="ml-auto flex items-center gap-2">
              <label className="text-xs text-gray-500 dark:text-gray-400">Show:</label>
              <select value={limit} onChange={e => { setLimit(parseInt(e.target.value)); fetchEmployees(1) }}
                className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer">
                <option value="8">8</option><option value="12">12</option><option value="24">24</option><option value="48">48</option>
              </select>
              <span className="text-xs text-gray-500 dark:text-gray-400">per page</span>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><PageLoader /></div>
      ) : employees.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400 dark:text-gray-500">
          <UserIcon />
          <p className="mt-3 text-sm font-medium">No employees found</p>
          {hasFilters && <button onClick={clearFilters} className="mt-2 text-xs text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 cursor-pointer border-0 bg-transparent">Clear all filters</button>}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {employees.map((emp: any) => {
              const initials = `${emp.first_name?.[0] || ''}${emp.last_name?.[0] || ''}`.toUpperCase()
              return (
                <Link key={emp.id} href={`/employees/${emp.id}`}
                  className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 card-hover no-underline block group">
                  <div className="flex items-start gap-3 mb-3">
                    {emp.avatar_url
                      ? <img src={emp.avatar_url} alt={initials} className="w-12 h-12 rounded-full object-cover border-2 border-gray-200 dark:border-gray-600 shrink-0" />
                      : <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold shrink-0 shadow-sm">{initials}</div>
                    }
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{emp.first_name} {emp.last_name}</h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{emp.designation || '—'}</p>
                      {emp.department_name && <p className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">{emp.department_name}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap mb-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[emp.status] || statusColors.inactive}`}>{emp.status === 'active' ? 'Active' : 'Inactive'}</span>
                    {emp.employment_type && <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${empTypeColors[emp.employment_type] || 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>{empTypeAbbrev[emp.employment_type] || emp.employment_type}</span>}
                    {emp.role_name && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">{emp.role_name}</span>}
                  </div>
                  <div className="pt-2 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between">
                    {emp.manager_first_name
                      ? <p className="text-xs text-gray-400 dark:text-gray-500 truncate max-w-[60%]">↳ {emp.manager_first_name} {emp.manager_last_name}</p>
                      : <p className="text-xs text-gray-400 dark:text-gray-500">No manager</p>
                    }
                    {emp.employee_id && <span className="text-xs font-mono text-gray-400 dark:text-gray-500">#{emp.employee_id}</span>}
                  </div>
                </Link>
              )
            })}
          </div>
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between mt-6 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 px-4 py-3">
              <p className="text-sm text-gray-500 dark:text-gray-400">Showing {((pagination.page - 1) * pagination.limit) + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}</p>
              <div className="flex items-center gap-2">
                <button onClick={() => fetchEmployees(pagination.page - 1)} disabled={pagination.page <= 1}
                  className="p-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-700 transition cursor-pointer bg-transparent">
                  <ChevronLeft />
                </button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(pagination.totalPages, 7) }, (_, i) => {
                    let pageNum: number
                    if (pagination.totalPages <= 7) pageNum = i + 1
                    else if (pagination.page <= 4) pageNum = i + 1
                    else if (pagination.page >= pagination.totalPages - 3) pageNum = pagination.totalPages - 6 + i
                    else pageNum = pagination.page - 3 + i
                    return (
                      <button key={pageNum} onClick={() => fetchEmployees(pageNum)}
                        className={`w-8 h-8 rounded-lg text-xs font-semibold transition cursor-pointer border ${
                          pagination.page === pageNum
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                        }`}>{pageNum}</button>
                    )
                  })}
                </div>
                <button onClick={() => fetchEmployees(pagination.page + 1)} disabled={pagination.page >= pagination.totalPages}
                  className="p-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-700 transition cursor-pointer bg-transparent">
                  <ChevronRight />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
