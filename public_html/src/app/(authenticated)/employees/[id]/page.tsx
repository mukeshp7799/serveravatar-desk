'use client'
import React, { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import Link from 'next/link'
import api from '@/lib/api'
import PageLoader from '@/components/PageLoader'
import toast from 'react-hot-toast'

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
const Users = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
const Upload = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>

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

  const [employee, setEmployee] = useState<any>(null)
  const [projects, setProjects] = useState<any[]>([])
  const [tasks, setTasks] = useState<any[]>([])
  const [activity, setActivity] = useState<any[]>([])
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

  const user = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('user') || '{}') : {}
  const isSelf = user.id === parseInt(id)
  const isAdmin = Array.isArray(user.permissions) && user.permissions.includes('users.edit_all')

  useEffect(() => {
    const fetchData = async () => {
      try {
        const data = await api.get(`/employees/${id}/profile`)
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

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.put(`/employees/${id}`, form)
      const updated = await api.get(`/employees/${id}/profile`)
      setEmployee(updated.employee)
      setForm(updated.employee)
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
    inactive: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
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

      {/* Profile Header Card */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden mb-6">
        <div className="h-28 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-500" />
        <div className="px-6 pb-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4 -mt-12">
            {/* Avatar */}
            <div className="relative shrink-0">
              {employee.avatar_url
                ? <img src={employee.avatar_url} alt={initials} className="w-20 h-20 rounded-xl border-4 border-white dark:border-gray-800 object-cover shadow-md" />
                : <div className="w-20 h-20 rounded-xl border-4 border-white dark:border-gray-800 bg-gradient-to-br from-indigo-600 to-purple-700 flex items-center justify-center text-white text-xl font-bold shadow-md">{initials}</div>
              }
              {canEdit && (
                <label className="absolute -bottom-1 -right-1 w-7 h-7 bg-indigo-600 hover:bg-indigo-700 rounded-full flex items-center justify-center text-white shadow cursor-pointer transition">
                  {uploadingAvatar
                    ? <span className="text-xs animate-spin">⟳</span>
                    : <Upload />
                  }
                  <input type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
                </label>
              )}
            </div>

            {/* Name & meta */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-0.5">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white truncate">
                  {employee.first_name} {employee.last_name}
                </h1>
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusColors[employee.status] || statusColors.inactive}`}>
                  {employee.status === 'active' ? 'Active' : 'Inactive'}
                </span>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {employee.designation || employee.designation_name || '—'}
                {employee.department_name ? ` · ${employee.department_name}` : ''}
              </p>
              <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-gray-400 dark:text-gray-500">
                {employee.employee_id && <span className="font-mono">ID: {employee.employee_id}</span>}
                {employee.role_name && <span>Role: {employee.role_name}</span>}
                {employee.employment_type && <span>{empTypeLabels[employee.employment_type] || employee.employment_type}</span>}
                {employee.hire_date && <span className="flex items-center gap-1"><Calendar /> Joined {fmtDateShort(employee.hire_date)}</span>}
              </div>
            </div>

            {canEdit && (
              <button onClick={() => setEditing(!editing)}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl shadow transition no-underline cursor-pointer border-0">
                <Edit2 /> {editing ? 'Cancel Editing' : 'Edit Profile'}
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
            <div className="col-span-full text-center py-14 text-gray-500 dark:text-gray-400">
              <Folder />
              <p className="mt-2 text-sm font-medium">No projects assigned</p>
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
            <div className="text-center py-14 text-gray-500 dark:text-gray-400">
              <CheckSquare />
              <p className="mt-2 text-sm font-medium">No tasks assigned</p>
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
              <div className="text-center py-10 text-gray-400 dark:text-gray-500 text-sm">No direct reports</div>
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
          {activity.length === 0 ? (
            <div className="text-center py-14 text-gray-500 dark:text-gray-400">
              <ActivityIcon />
              <p className="mt-2 text-sm font-medium">No activity recorded</p>
            </div>
          ) : (
            <div className="relative">
              <div className="absolute left-4 top-0 bottom-0 w-px bg-gray-200 dark:bg-gray-700" />
              {activity.map((item: any, idx: number) => (
                <div key={`${item.source}-${item.id}`} className="relative pl-10 pb-6 last:pb-0">
                  <div className="absolute left-2.5 top-1 w-3 h-3 rounded-full bg-indigo-600 border-2 border-white dark:border-gray-800" />
                  <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
                    <p className="text-sm text-gray-900 dark:text-white">
                      <span className="font-semibold">{item.first_name} {item.last_name}</span>{' '}
                      <span className="text-gray-600 dark:text-gray-400">{activityLabel(item)}</span>
                    </p>
                    {item.project_name && (
                      <Link href={`/projects/${item.project_id}`}
                        className="text-xs text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 no-underline mt-0.5 inline-block">
                        {item.project_name}
                      </Link>
                    )}
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{fmtDateTime(item.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Edit Modal */}
      {editing && (
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
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Reporting Manager</label>
                        <select value={form.reporting_manager_id || ''} onChange={e => setForm({ ...form, reporting_manager_id: e.target.value ? parseInt(e.target.value) : null })}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                          <option value="">— No Manager —</option>
                          {managers.filter((m: any) => m.id !== parseInt(id)).map((m: any) => (
                            <option key={m.id} value={m.id}>
                              {m.first_name} {m.last_name}{m.designation ? ` — ${m.designation}` : ''}{m.department_name ? ` (${m.department_name})` : ''}
                            </option>
                          ))}
                        </select>
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
                          <option value="inactive">Inactive</option>
                        </select>
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
              <button onClick={handleSave} disabled={saving}
                className="px-5 py-2 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition disabled:opacity-50 cursor-pointer border-0">
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  )
}
