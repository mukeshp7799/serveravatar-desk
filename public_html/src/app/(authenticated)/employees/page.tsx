'use client'
import PageLoader from '@/components/PageLoader'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Link from 'next/link'
import api from '@/lib/api'

const Search = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
const Filter = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
const ChevronLeft = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
const ChevronRight = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
const UserIcon = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>

export default function EmployeesPage() {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [employees, setEmployees] = useState<any[]>([])
  const [departments, setDepartments] = useState<any[]>([])
  const [roles, setRoles] = useState<any[]>([])
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 12, totalPages: 0 })
  
  // Filters
  const [search, setSearch] = useState('')
  const [filterDept, setFilterDept] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterRole, setFilterRole] = useState('')
  const [filterEmpType, setFilterEmpType] = useState('')

  const user = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('user') || '{}') : {}
  const canManage = Array.isArray(user.permissions) && (user.permissions.includes('hr.manage_employees') || user.permissions.includes('users.edit_all'))

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
      params.set('limit', String(pagination.limit))
      
      const data = await api.get(`/employees?${params.toString()}`)
      setEmployees(data.employees || [])
      setPagination(data.pagination || { total: 0, page: 1, limit: 12, totalPages: 0 })
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    Promise.all([
      api.get('/departments'),
      api.get('/roles'),
    ]).then(([deptsData, rolesData]) => {
      setDepartments(deptsData.departments || [])
      setRoles(rolesData.roles || [])
    }).catch(console.error)
  }, [])

  useEffect(() => {
    fetchEmployees(1)
  }, [search, filterDept, filterStatus, filterRole, filterEmpType])

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value)
  }

  const clearFilters = () => {
    setSearch('')
    setFilterDept('')
    setFilterStatus('')
    setFilterRole('')
    setFilterEmpType('')
  }

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

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Employee Directory</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{pagination.total} employees</p>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 mb-6">
        <div className="flex flex-col lg:flex-row gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search />
            <input
              type="text"
              placeholder="Search by name, email, designation..."
              value={search}
              onChange={handleSearch}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              <Search />
            </div>
          </div>
          
          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            <select value={filterDept} onChange={e => setFilterDept(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="">All Departments</option>
              {departments.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>

            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>

            <select value={filterRole} onChange={e => setFilterRole(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="">All Roles</option>
              {roles.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>

            <select value={filterEmpType} onChange={e => setFilterEmpType(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="">All Types</option>
              <option value="full-time">Full Time</option>
              <option value="part-time">Part Time</option>
              <option value="contract">Contract</option>
              <option value="intern">Intern</option>
              <option value="freelance">Freelance</option>
            </select>

            {(search || filterDept || filterStatus || filterRole || filterEmpType) && (
              <button onClick={clearFilters}
                className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 font-medium">
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Employee Grid */}
      {loading ? (
        <div className="flex justify-center py-20"><PageLoader /></div>
      ) : employees.length === 0 ? (
        <div className="text-center py-20 text-gray-500 dark:text-gray-400">
          <UserIcon />
          <p className="mt-2">No employees found</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {employees.map((emp: any) => {
              const initials = `${emp.first_name?.[0] || ''}${emp.last_name?.[0] || ''}`.toUpperCase()
              return (
                <Link key={emp.id} href={`/employees/${emp.id}`}
                  className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-600 transition no-underline block group">
                  <div className="flex items-start gap-3">
                    {emp.avatar_url ? (
                      <img src={emp.avatar_url} alt={initials}
                        className="w-12 h-12 rounded-full object-cover border-2 border-gray-200 dark:border-gray-600" />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-indigo-600 flex items-center justify-center text-white text-sm font-bold shrink-0">
                        {initials}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                        {emp.first_name} {emp.last_name}
                      </h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                        {emp.designation || emp.designation_name || '—'}
                      </p>
                      {emp.department_name && (
                        <p className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">{emp.department_name}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[emp.status] || statusColors.inactive}`}>
                      {emp.status === 'active' ? 'Active' : 'Inactive'}
                    </span>
                    {emp.employment_type && (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${empTypeColors[emp.employment_type] || 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
                        {emp.employment_type === 'full-time' ? 'FT' : emp.employment_type === 'part-time' ? 'PT' : emp.employment_type === 'contract' ? 'Cont' : emp.employment_type === 'intern' ? 'Int' : 'Fl'}
                      </span>
                    )}
                    {emp.role_name && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                        {emp.role_name}
                      </span>
                    )}
                  </div>
                  {emp.manager_first_name && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                      Reports to: {emp.manager_first_name} {emp.manager_last_name}
                    </p>
                  )}
                </Link>
              )
            })}
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <button
                onClick={() => fetchEmployees(pagination.page - 1)}
                disabled={pagination.page <= 1}
                className="p-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                <ChevronLeft />
              </button>
              <span className="text-sm text-gray-600 dark:text-gray-400 px-3">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <button
                onClick={() => fetchEmployees(pagination.page + 1)}
                disabled={pagination.page >= pagination.totalPages}
                className="p-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                <ChevronRight />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
