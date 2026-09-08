'use client'
import React, { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import Link from 'next/link'
import PortalModal from '@/components/PortalModal';
import api from '@/lib/api'
import { useDateSettings } from '@/contexts/CompanySettingsContext'
import PageLoader from '@/components/PageLoader'
import { DataTable } from '@/components/DataTable'
import toast from 'react-hot-toast'
import { ChevronDown, Check, X } from 'lucide-react'
import { isPasswordStrong, passwordValidation } from '@/lib/schemas'

const ArrowLeft = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
const Mail = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
const Phone = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
const MapPin = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
const Calendar = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
const Building = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
const User = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
const Briefcase = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
const Star = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
const Award = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" /></svg>
const Edit2 = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
const Folder = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
const CheckSquare = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
const ActivityIcon = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
const RefreshCw = ({ className }: { className?: string }) => <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
const Users = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
const Upload = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>

const ACCENT = '#4F46E5'

function fmtDateShort(raw: string | null | undefined): string {
  if (!raw) return '—'
  const s = String(raw).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const [y, m, d] = s.split('T')[0].split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }
  return s
}

function fmtDateTime(raw: string | null | undefined): string {
  if (!raw) return '—'
  const s = String(raw).trim()
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const [datePart, timePart] = s.split('T')
    const [y, m, d] = datePart.split('-').map(Number)
    const [hh, mm] = (timePart?.split(':') || ['0','0']).map(Number)
    const hour12 = hh % 12 || 12
    const ampm = hh < 12 ? 'AM' : 'PM'
    return `${new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at ${hour12}:${String(mm).padStart(2, '0')} ${ampm}`
  }
  const d = new Date(s)
  if (isNaN(d.getTime())) return s
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function activityLabel(item: any): string {
  if (item.source === 'project') {
    // Map project_activities action to readable label
    const featureLabel = item.feature ? item.feature.replace(/-/g, ' ') : item.entity_type
    const target = item.target_label || item.entity_type || ''
    const action = item.action || ''
    return `${action} ${target}`.trim()
  }
  // tb_activity
  if (item.entity_type === 'task') return `${item.action} task`
  if (item.entity_type === 'comment') return `${item.action} comment`
  if (item.entity_type === 'project') return `${item.action} project`
  return item.action || 'did something'
}

type Tab = 'overview' | 'projects' | 'tasks' | 'activity' | 'team'

export default function EmployeeProfilePage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string


  const { timezone, date_format } = useDateSettings();
  const fmtDateCtx = (raw: string | null | undefined): string => {
    if (!raw) return '';
    const parts = String(raw).split('T')[0].split('-');
    const [y, m, d] = parts.map(Number);
    if (parts.length < 3 || isNaN(y)) return String(raw);
    const pattern = date_format || 'YYYY-MM-DD';
    return pattern
      .replace('YYYY', String(y)).replace('YY', String(y).slice(-2))
      .replace('MM', String(m).padStart(2,'0')).replace('M', String(m))
      .replace('DD', String(d).padStart(2,'0')).replace('D', String(d));
  };
  const fmtDateShort = fmtDateCtx;
  const [employee, setEmployee] = useState<any>(null)
  const [projects, setProjects] = useState<any[]>([])
  const [tasks, setTasks] = useState<any[]>([])
  const [activity, setActivity] = useState<any[]>([])
  const [activityPagination, setActivityPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 0 })
  const [activityRefreshing, setActivityRefreshing] = useState(false)
  const [directReports, setDirectReports] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<any>({})
  const [departments, setDepartments] = useState<any[]>([])
  const [roles, setRoles] = useState<any[]>([])
  const [managers, setManagers] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [mgrOpen, setMgrOpen] = useState(false)
  const [mgrSearch, setMgrSearch] = useState('')

  const filteredManagers = managers.filter((m: any) =>
    m.id !== parseInt(id) && (
      `${m.first_name} ${m.last_name}`.toLowerCase().includes(mgrSearch.toLowerCase()) ||
      (m.designation || '').toLowerCase().includes(mgrSearch.toLowerCase()) ||
      (m.department_name || '').toLowerCase().includes(mgrSearch.toLowerCase())
    )
  )

  const user = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('user') || '{}') : {}
  const isSelf = user.id === parseInt(id)
  const isAdmin = Array.isArray(user.permissions) && user.permissions.includes('users.edit_all')

  useEffect(() => {
    const fetchData = async () => {
      try {
        const data = await api.get(`/employees/${id}/profile?activity_page=1&activity_limit=${activityPagination.limit}`)
        setActivity(data.activity || [])
        if (data.activity_pagination) setActivityPagination(data.activity_pagination)
        setEmployee(data.employee)
        setProjects(data.projects || [])
        setTasks(data.tasks || [])
        setActivity(data.activity || [])
        setDirectReports(data.directReports || [])
        setForm(data.employee || {})
      } catch {
        toast.error('Failed to load profile')
        router.push('/employees')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [id, router])

  useEffect(() => {
    if (editing || isAdmin) {
      Promise.all([
        api.get('/departments'),
        api.get('/roles'),
        api.get('/employees/managers'),
      ]).then(([deptsData, rolesData, managersData]) => {
        setDepartments(deptsData.departments || [])
        setRoles(rolesData.roles || [])
        setManagers(managersData.managers || [])
      }).catch(console.error)
    }
  }, [editing, isAdmin])

  const fetchActivityPage = async (page: number, limit?: number) => {
    setActivityRefreshing(true)
    try {
      const activeLimit = limit ?? activityPagination.limit
      const data = await api.get(`/employees/${id}/profile?activity_page=${page}&activity_limit=${activeLimit}`)
      setActivity(data.activity || [])
      if (data.activity_pagination) {
        setActivityPagination(prev => ({
          ...prev,
          page: data.activity_pagination.page,
          limit: prev.limit,
          total: data.activity_pagination.total,
          totalPages: data.activity_pagination.totalPages,
        }))
      }
    } catch { toast.error('Failed to load more activity') }
    finally { setActivityRefreshing(false) }
  }

  const handleSave = async () => {
    if (newPassword && !isPasswordStrong(newPassword)) {
      toast.error('Password must contain at least 8 characters, 1 uppercase, 1 lowercase, 1 number, and 1 special character (@#$&!*^~)')
      return
    }
    setSaving(true)
    try {
      const payload: any = { ...form }
      if (newPassword) payload.password = newPassword
      await api.put(`/employees/${id}`, payload)
      const updated = await api.get(`/employees/${id}/profile`)
      setEmployee(updated.employee)
      setForm(updated.employee)
      setNewPassword('')
      setEditing(false)
      toast.success('Profile updated successfully')
    } catch (e: any) {
      toast.error(e.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingAvatar(true)
    try {
      const formData = new FormData()
      formData.append('avatar', file)
      const data = await api.post(`/users/avatar`, formData)
      const avatarUrl = data.avatar_url
      setForm((f: any) => ({ ...f, avatar_url: avatarUrl }))
      await api.put(`/employees/${id}`, { avatar_url: avatarUrl })
      const updated = await api.get(`/employees/${id}/profile`)
      setEmployee(updated.employee)
      setForm(updated.employee)
      toast.success('Avatar updated')
    } catch (e: any) {
      toast.error(e.message || 'Upload failed')
    } finally {
      setUploadingAvatar(false)
    }
  }

  const handleCancel = () => { setForm(employee || {}); setEditing(false) }
  const canEdit = isSelf || isAdmin

  const statusColors: Record<string, string> = {
    active: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    inactive: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
  }
  const statusLabels: Record<string, string> = {
    active: 'Active',
    pending: 'Pending',
    inactive: 'Inactive',
  }
  const empTypeLabels: Record<string, string> = {
    'full-time': 'Full Time', 'part-time': 'Part Time', 'contract': 'Contract',
    'intern': 'Intern', 'freelance': 'Freelance',
  }

  if (loading) return <PageLoader />
  if (!employee) return null

  const initials = `${employee.first_name?.[0] || ''}${employee.last_name?.[0] || ''}`.toUpperCase()

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <User /> },
    { id: 'projects', label: 'Projects', icon: <Folder /> },
    { id: 'tasks', label: 'Tasks', icon: <CheckSquare /> },
    { id: 'team', label: 'Team', icon: <Users /> },
    { id: 'activity', label: 'Activity', icon: <ActivityIcon /> },
  ]

  const projectRoleBadge = (role: string) => {
    const colors: Record<string, string> = {
      manager: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
      member: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    }
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[role] || colors.member}`}>
        {role === 'manager' ? 'Manager' : 'Member'}
      </span>
    )
  }

  return (
    <div className="w-full px-4 py-6">
      <Link href="/employees" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 mb-4 no-underline">
        <ArrowLeft /> Back to Employees
      </Link>

      {/* Profile Header Card — white, compact */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden mb-6">
        <div className="px-6 py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            {/* Avatar */}
            <div className="relative shrink-0">
              {employee.avatar_url
                ? <img src={employee.avatar_url} alt={initials} className="w-16 h-16 rounded-xl border-2 border-gray-200 dark:border-gray-700 object-cover shadow-sm" />
                : <div className="w-16 h-16 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-gradient-to-br from-indigo-600 to-purple-700 flex items-center justify-center text-white text-lg font-bold shadow-sm">{initials}</div>
              }
              {canEdit && (
                <label className="absolute -bottom-1 -right-1 w-6 h-6 bg-indigo-600 hover:bg-indigo-700 rounded-full flex items-center justify-center text-white shadow cursor-pointer transition">
                  {uploadingAvatar
                    ? <span className="text-[10px] animate-spin">⟳</span>
                    : <Upload />
                  }
                  <input type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
                </label>
              )}
            </div>

            {/* Name, email & details */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-0.5">
                <h1 className="text-xl font-bold text-gray-900 dark:text-white truncate">
                  {employee.first_name} {employee.last_name}
                </h1>
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusColors[employee.status] || statusColors.inactive}`}>
                  {statusLabels[employee.status] || 'Inactive'}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 mt-1 text-sm text-gray-500 dark:text-gray-400">
                <span className="flex items-center gap-1"><Mail /> {employee.email}</span>
                {employee.phone && <span className="flex items-center gap-1"><Phone /> {employee.phone}</span>}
                {employee.department_name && <span className="flex items-center gap-1"><Building /> {employee.department_name}</span>}
              </div>
            </div>

            {/* Right meta */}
            <div className="flex flex-wrap gap-3 text-xs text-gray-400 dark:text-gray-500 shrink-0">
              {employee.employee_id && <span className="font-mono bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded-lg">ID: {employee.employee_id}</span>}
              {employee.designation || employee.designation_name ? (
                <span className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded-lg">{employee.designation || employee.designation_name}</span>
              ) : null}
              {employee.hire_date && <span className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded-lg"><Calendar /> {fmtDateShort(employee.hire_date)}</span>}
            </div>

            {canEdit && (
              <button onClick={() => setEditing(!editing)}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl shadow transition no-underline cursor-pointer border-0 shrink-0">
                <Edit2 /> {editing ? 'Cancel' : 'Edit'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700 mb-6 overflow-x-auto">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition whitespace-nowrap cursor-pointer ${
              activeTab === tab.id
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 bg-transparent'
            }`}>
            {tab.icon}{tab.label}
          </button>
        ))}
      </div>

      {/* Tab: Overview */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-5">
            {/* Contact Info */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Contact Information</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex items-start gap-3">
                  <Mail />
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Email</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{employee.email}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Phone />
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Phone</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{employee.phone || '—'}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 sm:col-span-2">
                  <MapPin />
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Address</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{employee.address || '—'}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Skills & Certs */}
            {(employee.skills || employee.certifications) && (
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5">
                <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Skills & Certifications</h2>
                {employee.skills && (
                  <div className="mb-3">
                    <div className="flex items-center gap-1.5 mb-2"><Star /><span className="text-sm font-medium text-gray-700 dark:text-gray-300">Skills</span></div>
                    <div className="flex flex-wrap gap-2">
                      {employee.skills.split(',').map((s: string, i: number) => (
                        <span key={i} className="px-3 py-1 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-xs font-medium rounded-full">{s.trim()}</span>
                      ))}
                    </div>
                  </div>
                )}
                {employee.certifications && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-2"><Award /><span className="text-sm font-medium text-gray-700 dark:text-gray-300">Certifications</span></div>
                    <div className="flex flex-wrap gap-2">
                      {employee.certifications.split(',').map((c: string, i: number) => (
                        <span key={i} className="px-3 py-1 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-xs font-medium rounded-full">{c.trim()}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Emergency Contact */}
            {(employee.emergency_contact_name || employee.emergency_contact_phone) && (
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5">
                <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Emergency Contact</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex items-start gap-3">
                    <User />
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Contact Name</p>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{employee.emergency_contact_name || '—'}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Phone />
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Contact Phone</p>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{employee.emergency_contact_phone || '—'}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Sidebar: Employment Details */}
          <div className="space-y-5">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Employment Details</h2>
              <dl className="space-y-3">
                {[
                  { icon: <Building />, label: 'Department', value: employee.department_name || '—' },
                  { icon: <Briefcase />, label: 'Designation', value: employee.designation || employee.designation_name || '—' },
                  { icon: null, label: 'Role', value: employee.role_name || '—' },
                  { icon: null, label: 'Employment Type', value: employee.employment_type ? empTypeLabels[employee.employment_type] || employee.employment_type : '—' },
                  { icon: <Calendar />, label: 'Joining Date', value: fmtDateShort(employee.hire_date) },
                ].map((item, i) => (
                  <div key={i}>
                    <dt className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">{item.icon}{item.label}</dt>
                    <dd className="text-sm font-medium text-gray-900 dark:text-white mt-0.5">{item.value}</dd>
                  </div>
                ))}
                {employee.manager_first_name && (
                  <div>
                    <dt className="text-xs text-gray-500 dark:text-gray-400">Reporting Manager</dt>
                    <dd className="text-sm font-medium text-gray-900 dark:text-white mt-0.5">
                      <Link href={`/employees/${employee.reporting_manager_id}`}
                        className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 no-underline">
                        {employee.manager_first_name} {employee.manager_last_name}
                      </Link>
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            {/* Quick stats */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Quick Stats</h2>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{projects.length}</p>
                  <p className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">Projects</p>
                </div>
                <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{tasks.filter((t: any) => t.status !== 'completed').length}</p>
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Open Tasks</p>
                </div>
                {directReports.length > 0 && (
                  <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 text-center col-span-2">
                    <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{directReports.length}</p>
                    <p className="text-xs text-purple-600 dark:text-purple-400 font-medium">Direct Reports</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Projects */}
      {activeTab === 'projects' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.length === 0 ? (
            <div className="col-span-full">
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 py-14 px-6 text-center">
                <div className="w-14 h-14 rounded-2xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center mx-auto mb-4 text-gray-400"><Folder /></div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1">No Projects Yet</h3>
                <p className="text-xs text-gray-400 dark:text-gray-500">This employee has no projects assigned.</p>
              </div>
            </div>
          ) : projects.map((p: any) => (
            <Link key={p.id} href={`/projects/${p.id}`}
              className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-600 transition no-underline block group">
              <div className="flex items-start gap-3">
                <div className="w-3 h-3 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: p.color || '#6366f1' }} />
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400">{p.name}</h3>
                  <div className="flex items-center gap-2 mt-1.5">{projectRoleBadge(p.role)}</div>
                </div>
              </div>
              <div className="mt-3 pt-2 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${p.status === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>{p.status}</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Tab: Tasks */}
      {activeTab === 'tasks' && (
        <div className="space-y-3">
          {tasks.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 py-14 px-6 text-center">
              <div className="w-14 h-14 rounded-2xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center mx-auto mb-4 text-gray-400"><CheckSquare /></div>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1">No Tasks Assigned</h3>
              <p className="text-xs text-gray-400 dark:text-gray-500">This employee has no tasks assigned yet.</p>
            </div>
          ) : tasks.map((task: any) => (
            <div key={task.id}
              className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-3 hover:shadow-md transition">
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: task.column_color || '#6366f1' }} />
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-medium text-gray-900 dark:text-white truncate">{task.title}</h4>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  <Link href={`/projects/${task.project_id}/task-board`}
                    className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 no-underline">
                    {task.project_name}
                  </Link>
                  {task.column_name ? ` · ${task.column_name}` : ''}
                </p>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${task.status === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
                {task.status}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Tab: Team */}
      {activeTab === 'team' && (
        <div className="space-y-5">
          {employee.reporting_manager_id && (
            <div>
              <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Reports To</h2>
              <Link href={`/employees/${employee.reporting_manager_id}`}
                className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-600 transition no-underline block">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 text-sm font-bold shrink-0">
                    {`${employee.manager_first_name?.[0] || ''}${employee.manager_last_name?.[0] || ''}`.toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{employee.manager_first_name} {employee.manager_last_name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Manager</p>
                  </div>
                </div>
              </Link>
            </div>
          )}
          <div>
            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
              Direct Reports {directReports.length > 0 && <span className="bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded text-xs font-bold ml-1">{directReports.length}</span>}
            </h2>
            {directReports.length === 0 ? (
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 py-14 px-6 text-center">
                <div className="w-14 h-14 rounded-2xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center mx-auto mb-4 text-gray-400"><Users /></div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1">No Direct Reports</h3>
                <p className="text-xs text-gray-400 dark:text-gray-500">This employee has no direct reports.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {directReports.map((dr: any) => {
                  const ri = `${dr.first_name?.[0] || ''}${dr.last_name?.[0] || ''}`.toUpperCase()
                  return (
                    <Link key={dr.id} href={`/employees/${dr.id}`}
                      className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-3 hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-600 transition no-underline block">
                      <div className="flex items-center gap-2.5">
                        {dr.avatar_url
                          ? <img src={dr.avatar_url} alt={ri} className="w-9 h-9 rounded-full object-cover shrink-0" />
                          : <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center text-white text-xs font-bold shrink-0">{ri}</div>
                        }
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{dr.first_name} {dr.last_name}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{dr.designation || dr.role_name || '—'}</p>
                        </div>
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab: Activity */}
      {activeTab === 'activity' && (
        <div className="space-y-3">

          {/* Header — outside the table card */}
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Activity</h2>
            <button
              onClick={() => fetchActivityPage(activityPagination.page)}
              disabled={activityRefreshing}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-200 dark:hover:border-indigo-600 transition cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${activityRefreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Table card */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            {activity.length === 0 ? (
              <div className="py-14 px-6 text-center">
                <div className="w-14 h-14 rounded-2xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center mx-auto mb-4 text-gray-400"><ActivityIcon /></div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1">No Activity Yet</h3>
                <p className="text-xs text-gray-400 dark:text-gray-500">No activity has been recorded for this employee.</p>
              </div>
            ) : (
              <DataTable
                columns={[
                  { label: 'Date & Time' },
                  { label: 'Activity' },
                  { label: 'Project' },
                ]}
                minWidth="600px"
                pagination={
                  <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Showing{' '}
                      <span className="font-semibold text-gray-700 dark:text-gray-200">
                        {Math.min((activityPagination.page - 1) * activityPagination.limit + 1, activityPagination.total)}
                      </span>{' '}
                      to{' '}
                      <span className="font-semibold text-gray-700 dark:text-gray-200">
                        {Math.min(activityPagination.page * activityPagination.limit, activityPagination.total)}
                      </span>{' '}
                      of{' '}
                      <span className="font-semibold text-gray-700 dark:text-gray-200">
                        {activityPagination.total}
                      </span>{' '}
                      results
                    </p>
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-gray-500 dark:text-gray-400">Per page:</span>
                        <div className="relative">
                          <select
                            value={activityPagination.limit}
                            onChange={e => {
                              const newLimit = Number(e.target.value)
                              setActivityPagination(prev => ({ ...prev, limit: newLimit, page: 1 }))
                              fetchActivityPage(1, newLimit)
                            }}
                            className="appearance-none pl-2 pr-6 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg cursor-pointer focus:outline-none focus:ring-2 transition"
                            style={{ '--tw-ring-color': ACCENT, colorScheme: 'normal' } as any}
                          >
                            {[10, 20, 30, 50].map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                          <span className="pointer-events-none absolute inset-y-0 right-1 flex items-center text-gray-400">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </span>
                        </div>
                      </div>
                      {activityPagination.totalPages > 1 && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => fetchActivityPage(activityPagination.page - 1)}
                            disabled={activityPagination.page <= 1}
                            className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700 transition cursor-pointer bg-transparent"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                          </button>
                          {Array.from({ length: activityPagination.totalPages }, (_, i) => i + 1)
                            .filter(p => p === 1 || p === activityPagination.totalPages || Math.abs(p - activityPagination.page) <= 1)
                            .reduce<(number | string)[]>((acc, p, idx, arr) => {
                              if (idx > 0 && Number(p) - Number(arr[idx - 1]) > 1) acc.push('...')
                              acc.push(p)
                              return acc
                            }, [])
                            .map((p, i) =>
                              p === '...' ? (
                                <span key={`e-${i}`} className="w-8 h-8 flex items-center justify-center text-xs text-gray-400">…</span>
                              ) : (
                                <button key={p} onClick={() => fetchActivityPage(Number(p))}
                                  className={`w-8 h-8 flex items-center justify-center rounded-lg text-xs font-semibold transition cursor-pointer border ${
                                    p === activityPagination.page
                                      ? 'text-white border-transparent'
                                      : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                                  }`}
                                  style={p === activityPagination.page ? { backgroundColor: ACCENT } : {}}
                                >{p}</button>
                              )
                            )}
                          <button
                            onClick={() => fetchActivityPage(activityPagination.page + 1)}
                            disabled={activityPagination.page >= activityPagination.totalPages}
                            className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700 transition cursor-pointer bg-transparent"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                }
              >
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {activity.map((item: any) => (
                    <tr key={`${item.source}-${item.id}`} className="hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors">
                      <td className="px-5 py-3.5 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">{fmtDateTime(item.created_at)}</td>
                      <td className="px-5 py-3.5 text-sm text-gray-900 dark:text-white">
                        <span className="font-medium">{item.first_name} {item.last_name}</span>{' '}
                        <span className="text-gray-500 dark:text-gray-400">{activityLabel(item)}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        {item.project_name ? (
                          <Link href={`/projects/${item.project_id}`}
                            className="text-sm text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 no-underline">
                            {item.project_name}
                          </Link>
                        ) : (
                          <span className="text-sm text-gray-400 dark:text-gray-500">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            )}
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editing && (
        <PortalModal>
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">Edit Profile</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Update employee information</p>
              </div>
              <button onClick={handleCancel} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition cursor-pointer bg-transparent border-0">
                ✕
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

              {isAdmin && (
                <>
                  {/* Section: Employment */}
                  <div>
                    <h3 className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wide mb-3">Employment</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">First Name</label>
                        <input value={form.first_name || ''} onChange={e => setForm({ ...form, first_name: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Last Name</label>
                        <input value={form.last_name || ''} onChange={e => setForm({ ...form, last_name: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Employee ID</label>
                        <input value={form.employee_id || ''} onChange={e => setForm({ ...form, employee_id: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Department</label>
                        <select value={form.department_id || ''} onChange={e => setForm({ ...form, department_id: e.target.value ? parseInt(e.target.value) : null })}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                          <option value="">— Not set —</option>
                          {departments.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Designation</label>
                        <input value={form.designation || ''} onChange={e => setForm({ ...form, designation: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          placeholder="e.g. Senior Engineer" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Employment Type</label>
                        <select value={form.employment_type || 'full-time'} onChange={e => setForm({ ...form, employment_type: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                          <option value="full-time">Full Time</option>
                          <option value="part-time">Part Time</option>
                          <option value="contract">Contract</option>
                          <option value="intern">Intern</option>
                          <option value="freelance">Freelance</option>
                        </select>
                      </div>
                      <div className="relative">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Reporting Manager</label>
                        <button
                          type="button"
                          onClick={() => setMgrOpen(v => !v)}
                          className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm text-left focus:outline-none focus:ring-2 focus:ring-indigo-500 flex items-center justify-between cursor-pointer"
                        >
                          <span className={form.reporting_manager_id ? 'text-gray-900 dark:text-white' : 'text-gray-400'}>
                            {form.reporting_manager_id
                              ? (() => {
                                  const m = managers.find((m: any) => m.id === form.reporting_manager_id)
                                  return m ? `${m.first_name} ${m.last_name}${m.designation ? ` — ${m.designation}` : ''}${m.department_name ? ` (${m.department_name})` : ''}` : '— No Manager —'
                                })()
                              : '— No Manager —'}
                          </span>
                          <ChevronDown size={14} className={`text-gray-400 shrink-0 transition-transform ${mgrOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {mgrOpen && (
                          <div className="absolute z-20 w-full mt-1 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg overflow-hidden">
                            <div className="p-2 border-b border-gray-100 dark:border-gray-600">
                              <input
                                autoFocus
                                placeholder="Search employee..."
                                value={mgrSearch}
                                onChange={e => setMgrSearch(e.target.value)}
                                className="w-full px-2.5 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                            </div>
                            <ul className="max-h-48 overflow-y-auto">
                              <li>
                                <button
                                  type="button"
                                  onClick={() => { setForm({ ...form, reporting_manager_id: null }); setMgrOpen(false); setMgrSearch('') }}
                                  className={`w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 dark:hover:bg-indigo-900/20 cursor-pointer border-0 bg-transparent ${!form.reporting_manager_id ? 'text-indigo-600 dark:text-indigo-400 font-medium' : 'text-gray-600 dark:text-gray-300'}`}
                                >
                                  — No Manager —
                                </button>
                              </li>
                              {filteredManagers.length === 0 ? (
                                <li className="px-3 py-2 text-xs text-gray-400">No results</li>
                              ) : (
                                filteredManagers.map((m: any) => (
                                  <li key={m.id}>
                                    <button
                                      type="button"
                                      onClick={() => { setForm({ ...form, reporting_manager_id: m.id }); setMgrOpen(false); setMgrSearch('') }}
                                      className={`w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 dark:hover:bg-indigo-900/20 cursor-pointer border-0 bg-transparent ${form.reporting_manager_id === m.id ? 'text-indigo-600 dark:text-indigo-400 font-medium' : 'text-gray-600 dark:text-gray-300'}`}
                                    >
                                      {m.first_name} {m.last_name}
                                      {m.designation ? <span className="text-gray-400 text-xs ml-1">— {m.designation}</span> : ''}
                                      {m.department_name ? <span className="text-gray-400 text-xs ml-1">({m.department_name})</span> : ''}
                                    </button>
                                  </li>
                                ))
                              )}
                            </ul>
                          </div>
                        )}
                        {mgrOpen && <div className="fixed inset-0 z-10" onClick={() => setMgrOpen(false)} />}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Role</label>
                        <select value={form.role_id || ''} onChange={e => setForm({ ...form, role_id: e.target.value ? parseInt(e.target.value) : null })}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                          <option value="">— Select —</option>
                          {roles.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Status</label>
                        <select value={form.status || 'active'} onChange={e => setForm({ ...form, status: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                          <option value="active">Active</option>
                          <option value="pending">Pending</option>
                          <option value="inactive">Inactive</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Email Verified</label>
                        <label className="flex items-center gap-2.5 mt-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={!!form.email_verified_at}
                            onChange={e => setForm({
                              ...form,
                              email_verified_at: e.target.checked ? true : null,
                              status: e.target.checked ? 'active' : form.status,
                            })}
                            className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                          />
                          <span className="text-sm text-gray-600 dark:text-gray-400">Verified</span>
                        </label>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Joining Date</label>
                        <input type="date" value={form.hire_date ? String(form.hire_date).slice(0, 10) : ''} onChange={e => setForm({ ...form, hire_date: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Section: Security */}
              <div>
                <h3 className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wide mb-3">Security</h3>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Change Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      placeholder="Leave blank to keep current password"
                      className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 cursor-pointer border-0 bg-transparent"
                    >
                      {showPassword ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.543 7-1.275 4.057-5.065 7-9.543 7-4.477 0-8.268-2.943-9.543-7z" /></svg>
                      )}
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Leave blank to keep the current password unchanged.</p>
                  {newPassword && (
                    <div className="mt-2 p-2.5 rounded-lg bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700">
                      <p className="text-xs font-semibold text-gray-500 mb-1.5">Password must contain:</p>
                      <div className="grid grid-cols-1 gap-0.5">
                        {[
                          { label: 'At least 8 characters', met: newPassword.length >= 8 },
                          { label: '1 uppercase letter (A-Z)', met: /[A-Z]/.test(newPassword) },
                          { label: '1 lowercase letter (a-z)', met: /[a-z]/.test(newPassword) },
                          { label: '1 number (0-9)', met: /\d/.test(newPassword) },
                          { label: '1 special character (@#$&!*^~)', met: /[@#$&!*^~]/.test(newPassword) },

                        ].map((req, i) => (
                          <div key={i} className={`flex items-center gap-1.5 text-xs ${req.met ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400 dark:text-gray-500'}`}>
                            {req.met ? <Check size={11} strokeWidth={3} /> : <X size={11} strokeWidth={3} />}
                            {req.label}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Section: Personal */}
              <div>
                <h3 className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wide mb-3">Personal</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Phone</label>
                    <input value={form.phone || ''} onChange={e => setForm({ ...form, phone: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Date of Birth</label>
                    <input type="date" value={form.date_of_birth ? String(form.date_of_birth).slice(0, 10) : ''} onChange={e => setForm({ ...form, date_of_birth: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Address</label>
                    <textarea value={form.address || ''} onChange={e => setForm({ ...form, address: e.target.value })} rows={2}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                </div>
              </div>

              {/* Section: Emergency */}
              <div>
                <h3 className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wide mb-3">Emergency Contact</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Contact Name</label>
                    <input value={form.emergency_contact_name || ''} onChange={e => setForm({ ...form, emergency_contact_name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Contact Phone</label>
                    <input value={form.emergency_contact_phone || ''} onChange={e => setForm({ ...form, emergency_contact_phone: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                </div>
              </div>

              {/* Section: Skills */}
              <div>
                <h3 className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wide mb-3">Skills &amp; Certifications</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Skills</label>
                    <input value={form.skills || ''} onChange={e => setForm({ ...form, skills: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="React, TypeScript, Node.js" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Certifications</label>
                    <input value={form.certifications || ''} onChange={e => setForm({ ...form, certifications: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="AWS, PMP, Scrum" />
                  </div>
                </div>
              </div>

            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3 shrink-0">
              <button onClick={handleCancel}
                className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition cursor-pointer border border-gray-300 dark:border-gray-600 bg-transparent">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving || (newPassword.length > 0 && !isPasswordStrong(newPassword))}
                className="px-5 py-2 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition disabled:opacity-50 cursor-pointer border-0">
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>

          </div>
        </div>
        </PortalModal>
      )}
    </div>
  )
}
