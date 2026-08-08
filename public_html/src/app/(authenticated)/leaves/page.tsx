'use client'
import PortalModal from '@/components/PortalModal';
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { useDateSettings } from '@/contexts/CompanySettingsContext'
import Tabs from '@/components/Tabs'
import PageLoader from '@/components/PageLoader'
import { Calendar, Check, Clock, Plus, Search, Settings, ThumbsDown, ThumbsUp, Trash2, X } from 'lucide-react'

function fmtDateDefault(raw: string | null | undefined): string {
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

const BALANCE_ICONS: Record<string, any> = {
  'Annual Leave':        '🏖️',
  'Sick Leave':          '🩺',
  'Casual Leave':        '🌴',
  'Maternity Leave':    '🤱',
  'Paternity Leave':     '👔',
  'Bereavement Leave':   '🕯️',
}

type Tab = 'my' | 'team' | 'types' | 'allocations'

export default function LeavesPage() {
  const { t } = useTranslation()
  const user = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('user') || '{}') : {}
  const isHRAdmin = Array.isArray(user.permissions) && (user.permissions.includes('leave.manage_all') || user.permissions.includes('users.edit_all'))
  const isManager = Array.isArray(user.permissions) && (user.permissions.includes('leave.view_team') || isHRAdmin)


  const { timezone, date_format } = useDateSettings();
  const fmtDateCtx = (raw: string | null | undefined): string => {
    if (!raw) return '';
    const parts = String(raw).split('T')[0].split('-');
    const [y, m, d] = parts.map(Number);
    if (parts.length !== 3 || isNaN(y)) return String(raw);
    const pattern = date_format || 'YYYY-MM-DD';
    return pattern
      .replace('YYYY', String(y)).replace('YY', String(y).slice(-2))
      .replace('MM', String(m).padStart(2,'0')).replace('M', String(m))
      .replace('DD', String(d).padStart(2,'0')).replace('D', String(d));
  };
  const fmtDate = fmtDateCtx;
  const [tab, setTab] = useState<Tab>('my')
  const [loading, setLoading] = useState(true)

  // Data
  const [allocations, setAllocations] = useState<any[]>([])
  const [leaveTypes, setLeaveTypes] = useState<any[]>([])
  const [requests, setRequests] = useState<any[]>([])
  const [allAllocations, setAllAllocations] = useState<any[]>([])
  const [departments, setDepartments] = useState<any[]>([])

  // Apply modal
  const [showApply, setShowApply] = useState(false)
  const [applyForm, setApplyForm] = useState({ leave_type_id: '', start_date: '', end_date: '', reason: '' })
  const [applying, setApplying] = useState(false)

  // Reject modal
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [rejectingId, setRejectingId] = useState<number | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  // Cancel confirmation modal
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancellingId, setCancellingId] = useState<number | null>(null)

  // Reseed confirmation modal
  const [showReseedModal, setShowReseedModal] = useState(false)

  // Type modal
  const [showTypeModal, setShowTypeModal] = useState(false)
  const [editType, setEditType] = useState<any>(null)
  const [typeForm, setTypeForm] = useState({ name: '', code: '', description: '', is_paid: true, default_days: '', max_allowed: '', status: 'active' })
  const [savingType, setSavingType] = useState(false)

  // Allocation modal
  const [showAllocModal, setShowAllocModal] = useState(false)
  const [editAlloc, setEditAlloc] = useState<any>(null)
  const [allocForm, setAllocForm] = useState({ allocated_days: '', remark: '' })
  const [savingAlloc, setSavingAlloc] = useState(false)

  // Request filter
  const [reqFilter, setReqFilter] = useState<'pending' | 'approved' | 'rejected' | 'cancelled' | ''>('')
  const [teamSearch, setTeamSearch] = useState('')
  const [allocSearch, setAllocSearch] = useState('')
  const [allocDept, setAllocDept] = useState('')
  const [allocLeaveType, setAllocLeaveType] = useState('')
  const [allocPage, setAllocPage] = useState(1)
  const [allocTotal, setAllocTotal] = useState(0)
  const ALLOC_LIMIT = 10

  // Pagination: My Requests
  const [myReqPage, setMyReqPage] = useState(1)
  const [myReqTotal, setMyReqTotal] = useState(0)
  const MY_LIMIT = 10

  // Pagination: Team Requests
  const [teamReqPage, setTeamReqPage] = useState(1)
  const [teamReqTotal, setTeamReqTotal] = useState(0)
  const [teamFilter, setTeamFilter] = useState<'pending' | 'approved' | 'rejected' | 'cancelled' | ''>('')
  const TEAM_LIMIT = 10

  // Pagination: Leave Types
  const [typesPage, setTypesPage] = useState(1)
  const [typesTotal, setTypesTotal] = useState(0)
  const TYPES_LIMIT = 10

  const loadAll = () => {
    setLoading(true)
    Promise.all([
      api.get('/leaves/balance'),
      api.get('/leaves/types?page=1&limit=50'),
    ]).then(([balData, typesData]) => {
      setAllocations(balData.allocations || [])
      setLeaveTypes(typesData.leaveTypes || [])
      setTypesTotal(typesData.pagination?.total || 0)
    }).catch(() => {}).finally(() => setLoading(false))
  }

  const loadMyRequests = (page = 1) => {
    const params = new URLSearchParams({ page: String(page), limit: String(MY_LIMIT) })
    params.set('userId', String(user.id))
    api.get(`/leaves?${params.toString()}`).then(d => {
      setRequests(d.leaveRequests || [])
      setMyReqTotal(d.pagination?.total || 0)
      setMyReqPage(page)
    }).catch(() => {})
  }

  const loadTeamRequests = (page = 1, filter = teamFilter) => {
    const params = new URLSearchParams({ page: String(page), limit: String(TEAM_LIMIT) })
    if (filter) params.set('status', filter)
    if (teamSearch) params.set('search', teamSearch)
    Promise.all([
      api.get(`/leaves?${params.toString()}`),
      api.get('/departments'),
    ]).then(([d, deptsData]) => {
      setRequests(d.leaveRequests || [])
      setTeamReqTotal(d.pagination?.total || 0)
      setTeamReqPage(page)
      setDepartments(deptsData.departments || [])
    }).catch(() => {})
  }

  const loadLeaveTypes = (page = 1) => {
    const params = new URLSearchParams({ page: String(page), limit: String(TYPES_LIMIT) })
    api.get(`/leaves/types?${params.toString()}`).then(d => {
      setLeaveTypes(d.leaveTypes || [])
      setTypesTotal(d.pagination?.total || 0)
      setTypesPage(page)
    }).catch(() => {})
  }

  // Reload the current tab's data after a mutation
  const reloadCurrentTab = () => {
    if (tab === 'my') {
      loadMyRequests(myReqPage)
    } else if (tab === 'team') {
      loadTeamRequests(teamReqPage, teamFilter)
    } else if (tab === 'types') {
      loadLeaveTypes(typesPage)
    } else if (tab === 'allocations') {
      fetchAllAllocs(allocPage)
    }
    loadAll()
  }

  useEffect(() => { loadAll() }, [tab])

  useEffect(() => {
    if (tab === 'my') {
      loadMyRequests(1)
    } else if (tab === 'team') {
      setTeamFilter('')
      loadTeamRequests(1, '')
    } else if (tab === 'types') {
      loadLeaveTypes(1)
      api.get('/departments').then(d => setDepartments(d.departments || [])).catch(() => {})
    } else if (tab === 'allocations') {
      Promise.all([
        api.get('/leaves/types?page=1&limit=50'),
        api.get('/departments'),
      ]).then(([typesData, deptsData]) => {
        setLeaveTypes(typesData.leaveTypes || [])
        setDepartments(deptsData.departments || [])
        fetchAllAllocs(1)
      }).catch(() => {})
    }
  }, [tab])

  useEffect(() => {
    if (tab === 'allocations') {
      fetchAllAllocs(allocPage)
    }
  }, [tab, allocSearch, allocDept, allocLeaveType, allocPage])

  const fetchAllAllocs = (page = 1) => {
    const params = new URLSearchParams({ page: String(page), limit: String(ALLOC_LIMIT) })
    if (allocSearch) params.set('search', allocSearch)
    if (allocDept) params.set('departmentId', allocDept)
    if (allocLeaveType) params.set('leaveTypeId', allocLeaveType)
    api.get(`/leaves/allocations?${params.toString()}`).then(d => {
      setAllAllocations(d.allocations || [])
      setAllocTotal(d.pagination?.total || 0)
    }).catch(() => {})
  }

  // ── Apply for leave ─────────────────────────────────────────
  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!applyForm.leave_type_id || !applyForm.start_date || !applyForm.end_date) {
      toast.error('Please fill in all required fields')
      return
    }
    setApplying(true)
    try {
      const res = await api.post('/leaves', {
        leave_type_id: parseInt(applyForm.leave_type_id),
        start_date: applyForm.start_date,
        end_date: applyForm.end_date,
        reason: applyForm.reason,
      })
      toast.success(res.message || 'Leave request submitted')
      setShowApply(false)
      setApplyForm({ leave_type_id: '', start_date: '', end_date: '', reason: '' })
      loadAll()
      loadMyRequests(1)
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit')
    } finally {
      setApplying(false)
    }
  }

  // ── Leave type management ───────────────────────────────────
  const openAddType = () => {
    setEditType(null)
    setTypeForm({ name: '', code: '', description: '', is_paid: true, default_days: '', max_allowed: '', status: 'active' })
    setShowTypeModal(true)
  }
  const openEditType = (lt: any) => {
    setEditType(lt)
    setTypeForm({
      name: lt.name || '', code: lt.code || '', description: lt.description || '',
      is_paid: Boolean(lt.is_paid), default_days: String(lt.default_days || ''),
      max_allowed: String(lt.max_allowed || ''), status: lt.status || 'active',
    })
    setShowTypeModal(true)
  }
  const handleTypeSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!typeForm.name.trim()) { toast.error('Name is required'); return }
    setSavingType(true)
    try {
      const payload = {
        name: typeForm.name,
        code: typeForm.code || null,
        description: typeForm.description || null,
        is_paid: typeForm.is_paid,
        default_days: parseInt(typeForm.default_days) || 0,
        max_allowed: parseInt(typeForm.max_allowed) || 0,
        status: typeForm.status,
      }
      if (editType) {
        await api.put(`/leaves/types/${editType.id}`, payload)
        toast.success('Leave type updated')
      } else {
        await api.post('/leaves/types', payload)
        toast.success('Leave type created')
      }
      setShowTypeModal(false)
      loadAll()
    } catch (err: any) { toast.error(err.message || 'Failed') }
    finally { setSavingType(false) }
  }
  const handleDeleteType = async (id: number) => {
    if (!confirm('Delete this leave type?')) return
    try {
      await api.delete(`/leaves/types/${id}`)
      toast.success('Deleted')
      loadAll()
    } catch (err: any) { toast.error(err.message || 'Failed') }
  }
  const handleSeedAll = () => {
    setShowReseedModal(true)
  }

  const confirmReseed = async () => {
    setShowReseedModal(false)
    try {
      const res = await api.post('/leaves/allocations/seed', {})
      toast.success(res.message || 'Seeded')
      loadAll()
      if (tab === 'allocations') fetchAllAllocs()
    } catch (err: any) { toast.error(err.message || 'Failed') }
  }

  // ── Allocation management ───────────────────────────────────
  const openAllocModal = (alloc: any) => {
    setEditAlloc(alloc)
    setAllocForm({ allocated_days: String(alloc.allocated_days), remark: alloc.remark || '' })
    setShowAllocModal(true)
  }
  const handleAllocSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!allocForm.allocated_days) { toast.error('Allocated days required'); return }
    setSavingAlloc(true)
    try {
      await api.put(`/leaves/allocations/${editAlloc.id}`, {
        allocated_days: parseFloat(allocForm.allocated_days),
        remark: allocForm.remark || null,
      })
      toast.success('Allocation updated')
      setShowAllocModal(false)
      fetchAllAllocs(allocPage)
      loadAll()
    } catch (err: any) { toast.error(err.message || 'Failed') }
    finally { setSavingAlloc(false) }
  }

  // ── Request actions ──────────────────────────────────────────
  const handleApprove = async (id: number, action: 'approved' | 'rejected') => {
    if (action === 'rejected') {
      setRejectingId(id)
      setRejectReason('')
      setShowRejectModal(true)
      return
    }
    try {
      await api.put(`/leaves/${id}/approve`, { action })
      toast.success(`Leave request ${action}`)
      loadAll()
      reloadCurrentTab()
    } catch (err: any) { toast.error(err.message || 'Failed') }
  }

  const handleRejectConfirm = async () => {
    if (rejectingId === null) return
    try {
      await api.put(`/leaves/${rejectingId}/approve`, { action: 'rejected', rejection_reason: rejectReason })
      toast.success('Leave request rejected')
      setShowRejectModal(false)
      setRejectingId(null)
      setRejectReason('')
      loadAll()
      reloadCurrentTab()
    } catch (err: any) { toast.error(err.message || 'Failed') }
  }

  // Confirm cancel from modal
  const confirmCancel = async () => {
    if (cancellingId === null) return
    try {
      await api.put(`/leaves/${cancellingId}/cancel`, {})
      toast.success('Request cancelled')
      setShowCancelModal(false)
      setCancellingId(null)
      loadAll()
      reloadCurrentTab()
    } catch (err: any) { toast.error(err.message || 'Failed') }
  }

  const handleCancel = async (id: number) => {
    // Confirmation is handled by the cancel modal
    try {
      await api.put(`/leaves/${id}/cancel`, {})
      toast.success('Request cancelled')
      loadAll()
      reloadCurrentTab()
    } catch (err: any) { toast.error(err.message || 'Failed') }
  }

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      approved: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700',
      rejected: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700',
      pending: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700',
      cancelled: 'bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:border-gray-600',
    }
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${map[s] || map.pending}`}>
        {s.charAt(0).toUpperCase() + s.slice(1)}
      </span>
    )
  }

  const filteredRequests = requests.filter(r => !reqFilter || r.status === reqFilter)

  // Tabs
  const tabs: { key: Tab; label: string }[] = [
    { key: 'my', label: 'My Leave' },
    ...(isManager ? [{ key: 'team' as Tab, label: 'Team Requests' }] : []),
    ...(isHRAdmin ? [
      { key: 'types' as Tab, label: 'Leave Types' },
      { key: 'allocations' as Tab, label: 'Allocations' },
    ] : []),
  ]

  const activeTab = tabs.find(x => x.key === tab) ? tab : 'my'

  
  // ── Unified Pagination Bar ──────────────────────────────────
  const PaginationBar = ({ page, total, limit, onPage }: { page: number; total: number; limit: number; onPage: (p: number) => void }) => {
    const totalPages = Math.ceil(total / limit) || 1
    const start = Math.min((page - 1) * limit + 1, total)
    const end = Math.min(page * limit, total)
    const pages = Array.from({ length: totalPages }, (_, i) => i + 1)

    return (
      <div className="flex items-center justify-between px-4 py-3 bg-gray-100 dark:bg-gray-700/50 rounded-b-xl">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Showing {start}–{end} of {total}
        </p>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onPage(page - 1)}
            disabled={page <= 1}
            className="flex items-center justify-center w-7 h-7 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer text-xs"
          >
            ‹
          </button>
          {pages.map(p => (
            <button
              key={p}
              onClick={() => onPage(p)}
              className={`flex items-center justify-center w-7 h-7 rounded-lg text-xs font-semibold cursor-pointer border ${
                p === page
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
              }`}
            >
              {p}
            </button>
          ))}
          <button
            onClick={() => onPage(page + 1)}
            disabled={page >= totalPages}
            className="flex items-center justify-center w-7 h-7 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer text-xs"
          >
            ›
          </button>
        </div>
      </div>
    )
  }

return (
    <div className="w-full px-4 py-6 space-y-5 animate-fade-in-up">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Leave Management</h1>
        <div className="flex items-center gap-2">
          {isHRAdmin && (
            <button onClick={handleSeedAll}
              className="px-4 py-2 text-sm font-medium bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-xl transition cursor-pointer border border-gray-200 dark:border-gray-600">
              🔄 Re-seed All Allocations
            </button>
          )}
          <button onClick={() => setShowApply(true)}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition cursor-pointer border-none flex items-center gap-2">
            <Plus size={14} /> Apply for Leave
          </button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        active={activeTab}
        onChange={k => setTab(k as Tab)}
        tabs={tabs}
      />

      {/* ── MY LEAVE TAB ─────────────────────────────────────── */}
      {tab === 'my' && (
        <>
          {/* Balance cards */}
          {loading ? <PageLoader /> : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {allocations.length === 0 && (
                <div className="col-span-full bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-10 text-center text-gray-400 dark:text-gray-500">
                  No leave allocations found. Contact HR.
                </div>
              )}
              {allocations.map((a: any) => (
                <div key={a.id}
                  className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 hover:shadow-md transition">
                  <div className="flex items-start justify-between mb-3">
                    <div className="text-2xl">{BALANCE_ICONS[a.leave_type_name] || '📋'}</div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${a.is_paid ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
                      {a.is_paid ? 'Paid' : 'Unpaid'}
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">{a.leave_type_name}</h3>
                  {a.leave_type_code && <p className="text-xs text-gray-400 mb-4">{a.leave_type_code}</p>}

                  {/* 3-column stat */}
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="text-center bg-gray-50 dark:bg-gray-700/50 rounded-lg py-2">
                      <div className="text-lg font-bold text-gray-900 dark:text-white">{a.allocated_days}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Allocated</div>
                    </div>
                    <div className="text-center bg-red-50 dark:bg-red-900/20 rounded-lg py-2">
                      <div className="text-lg font-bold text-red-600 dark:text-red-400">{a.used}</div>
                      <div className="text-xs text-red-500 dark:text-red-400">Used</div>
                    </div>
                    <div className="text-center bg-emerald-50 dark:bg-emerald-900/20 rounded-lg py-2">
                      <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{a.available}</div>
                      <div className="text-xs text-emerald-600 dark:text-emerald-400">Available</div>
                    </div>
                  </div>

                  {a.max_allowed > 0 && (
                    <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5 mt-2">
                      <div className="h-full rounded-full bg-indigo-500"
                        style={{ width: `${Math.min(100, (a.used / a.allocated_days) * 100)}%` }} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* My requests */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">My Leave Requests</h2>
            </div>
            {filteredRequests.filter(r => r.user_id === user.id).length === 0 ? (
              <div className="p-10 text-center text-gray-400 dark:text-gray-500 text-sm">No leave requests yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-700/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Type</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Period</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Days</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Applied</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {filteredRequests.filter(r => r.user_id === user.id).map((r: any) => {
                      const days = r.days
                      return (
                        <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                          <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{r.leave_type_name}</td>
                          <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{fmtDate(r.start_date)} → {fmtDate(r.end_date)}</td>
                          <td className="px-4 py-3 font-semibold text-indigo-600 dark:text-indigo-400">{days}d</td>
                          <td className="px-4 py-3">{statusBadge(r.status)}</td>
                          <td className="px-4 py-3 text-gray-400 dark:text-gray-500 text-xs">{fmtDate(r.created_at)}</td>
                          <td className="px-4 py-3">
                            {r.status === 'pending' && (
                              <button onClick={() => { setCancellingId(r.id); setShowCancelModal(true) }}
                                className="text-xs text-red-500 hover:text-red-700 font-medium bg-transparent border-0 cursor-pointer">
                                Cancel
                              </button>
                            )}
                            {r.status === 'cancelled' && (
                              <span className="text-xs text-gray-400 font-medium border border-dashed border-gray-300 px-2 py-0.5 rounded">
                                Cancelled
                              </span>
                            )}
                            {(r.status === 'approved' || r.status === 'rejected') && (
                              <span className="text-xs text-gray-400 font-medium border border-dashed border-gray-300 px-2 py-0.5 rounded">
                                —
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
              <PaginationBar
                page={myReqPage}
                total={myReqTotal}
                limit={MY_LIMIT}
                onPage={(p) => loadMyRequests(p)}
              />
          </div>
        </>
      )}

      {/* ── TEAM REQUESTS TAB ─────────────────────────────────── */}
      {tab === 'team' && (
        <>
          {/* Search + Filters Card */}
          <div className="bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-gray-800 dark:to-indigo-900/20 rounded-2xl border border-indigo-100 dark:border-indigo-800/30 p-4 mb-4">
            {/* Search Row */}
            <div className="flex items-center gap-3 mb-3">
              <div className="relative flex-1">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                  <Search size={16} />
                </div>
                <input
                  type="text"
                  placeholder="Search by name or email..."
                  value={teamSearch}
                  onChange={e => { setTeamSearch(e.target.value); setTeamReqPage(1) }}
                  onKeyDown={e => e.key === 'Enter' && loadTeamRequests(1, teamFilter)}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-300 shadow-sm"
                />
              </div>
              <button
                onClick={() => loadTeamRequests(1, teamFilter)}
                className="px-5 py-2.5 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition cursor-pointer border-none shadow-sm whitespace-nowrap"
              >
                Search
              </button>
            </div>
            {/* Filter Tabs */}
            <div className="flex flex-wrap gap-2">
              {['', 'pending', 'approved', 'rejected', 'cancelled'].map(s => (
                <button key={s} onClick={() => { setTeamFilter(s as any); loadTeamRequests(1, s as any) }}
                  className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer border ${
                    teamFilter === s
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                      : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:border-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30'
                  }`}>
                  {s ? s.charAt(0).toUpperCase() + s.slice(1) : 'All'}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Employee</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Period</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Days</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Reason</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {filteredRequests.map((r: any) => {
                    const days = r.days
                    const isOwn = r.user_id === user.id
                    return (
                      <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900 dark:text-white">{r.first_name} {r.last_name}</div>
                          <div className="text-xs text-gray-400">{r.email}</div>
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{r.leave_type_name}</td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{fmtDate(r.start_date)} → {fmtDate(r.end_date)}</td>
                        <td className="px-4 py-3 font-semibold text-indigo-600 dark:text-indigo-400">{days}d</td>
                        <td className="px-4 py-3 text-gray-500 dark:text-gray-400 max-w-[200px] truncate">{r.reason || '—'}</td>
                        <td className="px-4 py-3">{statusBadge(r.status)}</td>
                        <td className="px-4 py-3">
                          {r.status === 'pending' && (
                            <div className="flex items-center gap-2">
                              <button onClick={() => handleApprove(r.id, 'approved')}
                                className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg transition cursor-pointer border border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700">
                                <ThumbsUp size={11} /> Approve
                              </button>
                              <button onClick={() => handleApprove(r.id, 'rejected')}
                                className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-red-50 hover:bg-red-100 text-red-700 rounded-lg transition cursor-pointer border border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700">
                                <ThumbsDown size={11} /> Reject
                              </button>
                              {!isOwn && (
                                <button onClick={() => { setCancellingId(r.id); setShowCancelModal(true) }}
                                  className="text-xs text-gray-500 hover:text-red-600 font-medium bg-transparent border-0 cursor-pointer ml-1">
                                  Cancel
                                </button>
                              )}
                            </div>
                          )}
                          {r.status === 'cancelled' && (
                            <span className="text-xs text-gray-400 font-medium border border-dashed border-gray-300 px-2 py-0.5 rounded">
                              Cancelled
                            </span>
                          )}
                          {r.status === 'approved' && !isOwn && (
                            <button onClick={() => { setCancellingId(r.id); setShowCancelModal(true) }}
                              className="text-xs text-red-500 hover:text-red-700 font-medium bg-transparent border-0 cursor-pointer">
                              Cancel
                            </button>
                          )}
                          {(r.status === 'approved' && isOwn) || r.status === 'rejected' ? (
                            <span className="text-xs text-gray-400 font-medium border border-dashed border-gray-300 px-2 py-0.5 rounded">
                              —
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    )
                  })}
                  {filteredRequests.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400 dark:text-gray-500">No requests found.</td></tr>
                  )}
                </tbody>
              </table>
              <PaginationBar
                page={teamReqPage}
                total={teamReqTotal}
                limit={TEAM_LIMIT}
                onPage={(p) => loadTeamRequests(p, teamFilter)}
              />
            </div>
          </div>
        </>
      )}

      {/* ── LEAVE TYPES TAB (HR Admin) ──────────────────────── */}
      {tab === 'types' && isHRAdmin && (
        <>
          <div className="flex justify-end">
            <button onClick={openAddType}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition cursor-pointer border-none flex items-center gap-2">
              <Plus size={14} /> Add Leave Type
            </button>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Code</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Default Days</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Max Allowed</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Description</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {leaveTypes.map((lt: any) => (
                    <tr key={lt.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                      <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white">{lt.name}</td>
                      <td className="px-4 py-3 font-mono text-gray-600 dark:text-gray-400">{lt.code || '—'}</td>
                      <td className="px-4 py-3 font-semibold text-indigo-600 dark:text-indigo-400">{lt.default_days}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{lt.max_allowed || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${lt.is_paid ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
                          {lt.is_paid ? 'Paid' : 'Unpaid'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${lt.status === 'active' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>
                          {lt.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400 max-w-[200px] truncate">{lt.description || '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => openEditType(lt)}
                            className="p-1.5 text-gray-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition cursor-pointer bg-transparent border-0">
                            <Settings size={14} />
                          </button>
                          <button onClick={() => handleDeleteType(lt.id)}
                            className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 transition cursor-pointer bg-transparent border-0">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {leaveTypes.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400 dark:text-gray-500">No leave types defined.</td></tr>
                  )}
                </tbody>
              </table>
              <PaginationBar
                page={typesPage}
                total={typesTotal}
                limit={TYPES_LIMIT}
                onPage={(p) => loadLeaveTypes(p)}
              />
            </div>
          </div>
        </>
      )}

      {/* ── ALLOCATIONS TAB (HR Admin) ────────────────────────── */}
      {tab === 'allocations' && isHRAdmin && (
        <>
          {/* Filters */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"><Search size={14} /></div>
              <input type="text" placeholder="Search employee..."
                value={allocSearch} onChange={e => { setAllocSearch(e.target.value); setAllocPage(1) }}
                className="w-full pl-9 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <select value={allocDept} onChange={e => { setAllocDept(e.target.value); setAllocPage(1) }}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer">
              <option value="">All Departments</option>
              {departments.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <select value={allocLeaveType} onChange={e => { setAllocLeaveType(e.target.value); setAllocPage(1) }}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer">
              <option value="">All Leave Types</option>
              {leaveTypes.map((lt: any) => <option key={lt.id} value={lt.id}>{lt.name}</option>)}
            </select>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Employee</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Department</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Leave Type</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Allocated</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Used</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Available</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Remark</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {allAllocations.map((a: any) => (
                    <tr key={a.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 dark:text-white">{a.first_name} {a.last_name}</div>
                        <div className="text-xs text-gray-400">{a.email}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{a.department_name || '—'}</td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-gray-900 dark:text-white">{a.leave_type_name}</span>
                        {a.leave_type_code && <span className="ml-1 text-xs text-gray-400">{a.leave_type_code}</span>}
                      </td>
                      <td className="px-4 py-3 text-center font-semibold text-indigo-600 dark:text-indigo-400">{a.allocated_days}</td>
                      <td className="px-4 py-3 text-center font-semibold text-red-500 dark:text-red-400">{a.used}</td>
                      <td className="px-4 py-3 text-center font-semibold text-emerald-600 dark:text-emerald-400">{a.available}</td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs max-w-[150px] truncate">{a.remark || '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => openAllocModal(a)}
                          className="px-3 py-1 text-xs font-medium bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 dark:hover:bg-indigo-900/50 rounded-lg transition cursor-pointer border border-indigo-200 dark:border-indigo-700">
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                  {allAllocations.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400 dark:text-gray-500">No allocations found.</td></tr>
                  )}
                </tbody>
              </table>
              <PaginationBar
                page={allocPage}
                total={allocTotal}
                limit={ALLOC_LIMIT}
                onPage={(p) => { setAllocPage(p); fetchAllAllocs(p) }}
              />
            </div>
          </div>
        </>
      )}

      {/* ── APPLY FOR LEAVE MODAL ──────────────────────────────── */}
      {showApply && (
        <PortalModal>
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
                      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full">
                        <div className="flex justify-between items-center p-6 border-b border-gray-200 dark:border-gray-700">
                          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Apply for Leave</h2>
                          <button onClick={() => setShowApply(false)} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-2xl leading-none bg-transparent border-0 cursor-pointer">×</button>
                        </div>
                        <form onSubmit={handleApply} className="p-6 space-y-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Leave Type <span className="text-red-500">*</span></label>
                            <select value={applyForm.leave_type_id} onChange={e => setApplyForm({ ...applyForm, leave_type_id: e.target.value })}
                              required
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer">
                              <option value="">— Select leave type —</option>
                              {allocations.map((a: any) => (
                                <option key={a.leave_type_id} value={a.leave_type_id}
                                  disabled={a.available <= 0}>
                                  {a.leave_type_name} ({a.available} days available)
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Start Date <span className="text-red-500">*</span></label>
                              <input type="date" value={applyForm.start_date} onChange={e => setApplyForm({ ...applyForm, start_date: e.target.value })} required
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">End Date <span className="text-red-500">*</span></label>
                              <input type="date" value={applyForm.end_date} onChange={e => setApplyForm({ ...applyForm, end_date: e.target.value })} required
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                            </div>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Reason</label>
                            <textarea value={applyForm.reason} onChange={e => setApplyForm({ ...applyForm, reason: e.target.value })} rows={3}
                              placeholder="Brief reason for leave..."
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                          </div>
                          <div className="flex justify-end gap-3 pt-2">
                            <button type="button" onClick={() => setShowApply(false)}
                              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition cursor-pointer border border-gray-300 dark:border-gray-600 bg-transparent">
                              Cancel
                            </button>
                            <button type="submit" disabled={applying}
                              className="px-5 py-2 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition disabled:opacity-50 cursor-pointer border-0">
                              {applying ? 'Submitting...' : 'Submit Request'}
                            </button>
                          </div>
                        </form>
                      </div>
                    </div>
        </PortalModal>
      )}


      {/* ── REJECT LEAVE MODAL ─────────────────────────────── */}
      {showRejectModal && (
        <PortalModal>
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
                      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full">
                        <div className="flex justify-between items-center p-6 border-b border-gray-200 dark:border-gray-700">
                          <h2 className="text-lg font-bold text-red-600 dark:text-red-400">Reject Leave Request</h2>
                          <button onClick={() => setShowRejectModal(false)} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-2xl leading-none bg-transparent border-0 cursor-pointer">×</button>
                        </div>
                        <div className="p-6 space-y-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                              Reason <span className="text-gray-400 font-normal">(optional)</span>
                            </label>
                            <textarea
                              value={rejectReason}
                              onChange={e => setRejectReason(e.target.value)}
                              rows={3}
                              placeholder="Why is this leave request being rejected?"
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                            />
                          </div>
                        </div>
                        <div className="flex justify-end gap-3 px-6 pb-6">
                          <button onClick={() => setShowRejectModal(false)}
                            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition cursor-pointer border border-gray-300 dark:border-gray-600 bg-transparent">
                            Cancel
                          </button>
                          <button onClick={handleRejectConfirm}
                            className="px-5 py-2 text-sm font-semibold bg-red-600 hover:bg-red-700 text-white rounded-lg transition cursor-pointer border-0">
                            Confirm Rejection
                          </button>
                        </div>
                      </div>
                    </div>
        </PortalModal>
      )}

      {/* ── RESEED CONFIRMATION MODAL ───────────────────────── */}
      {showReseedModal && (
        <PortalModal>
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
                      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full">
                        <div className="p-6 text-center">
                          <div className="w-14 h-14 mx-auto mb-4 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center">
                            <span className="text-2xl">🔄</span>
                          </div>
                          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Re-seed All Allocations?</h2>
                          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                            This will reset <strong>all custom allocations</strong> for every employee based on their leave type default days. This action cannot be undone.
                          </p>
                          <div className="flex items-center justify-center gap-3">
                            <button
                              onClick={() => setShowReseedModal(false)}
                              className="px-5 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition cursor-pointer border border-gray-300 dark:border-gray-600 bg-transparent"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={confirmReseed}
                              className="px-5 py-2 text-sm font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-xl transition cursor-pointer border-0 shadow-sm"
                            >
                              Yes, Re-seed
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
        </PortalModal>
      )}

      {/* ── CANCEL CONFIRMATION MODAL ───────────────────────── */}
      {showCancelModal && (
        <PortalModal>
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
                      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-sm w-full">
                        <div className="p-6 text-center">
                          <div className="w-14 h-14 mx-auto mb-4 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                            <span className="text-2xl">⚠️</span>
                          </div>
                          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Cancel Leave Request?</h2>
                          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                            Are you sure you want to cancel this leave request? This action cannot be undone.
                          </p>
                          <div className="flex items-center justify-center gap-3">
                            <button
                              onClick={() => { setShowCancelModal(false); setCancellingId(null) }}
                              className="px-5 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition cursor-pointer border border-gray-300 dark:border-gray-600 bg-transparent"
                            >
                              Keep It
                            </button>
                            <button
                              onClick={confirmCancel}
                              className="px-5 py-2 text-sm font-semibold bg-red-600 hover:bg-red-700 text-white rounded-xl transition cursor-pointer border-0 shadow-sm"
                            >
                              Yes, Cancel It
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
        </PortalModal>
      )}

      {/* ── LEAVE TYPE MODAL ───────────────────────────────────── */}
      {showTypeModal && (
        <PortalModal>
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
                      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center p-6 border-b border-gray-200 dark:border-gray-700">
                          <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                            {editType ? 'Edit Leave Type' : 'Add Leave Type'}
                          </h2>
                          <button onClick={() => setShowTypeModal(false)} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-2xl leading-none bg-transparent border-0 cursor-pointer">×</button>
                        </div>
                        <form onSubmit={handleTypeSave} className="p-6 space-y-4">
                          <div className="grid grid-cols-2 gap-3">
                            <div className="col-span-2">
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name <span className="text-red-500">*</span></label>
                              <input value={typeForm.name} onChange={e => setTypeForm({ ...typeForm, name: e.target.value })} required
                                placeholder="e.g. Annual Leave"
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Code</label>
                              <input value={typeForm.code} onChange={e => setTypeForm({ ...typeForm, code: e.target.value })}
                                placeholder="e.g. AL"
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
                              <select value={typeForm.status} onChange={e => setTypeForm({ ...typeForm, status: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer">
                                <option value="active">Active</option>
                                <option value="inactive">Inactive</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Default Days</label>
                              <input type="number" min="0" value={typeForm.default_days} onChange={e => setTypeForm({ ...typeForm, default_days: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Max Allowed</label>
                              <input type="number" min="0" value={typeForm.max_allowed} onChange={e => setTypeForm({ ...typeForm, max_allowed: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                            </div>
                            <div className="col-span-2">
                              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
                                <input type="checkbox" checked={typeForm.is_paid} onChange={e => setTypeForm({ ...typeForm, is_paid: e.target.checked })}
                                  className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                                Paid Leave
                              </label>
                            </div>
                            <div className="col-span-2">
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                              <textarea value={typeForm.description} onChange={e => setTypeForm({ ...typeForm, description: e.target.value })} rows={2}
                                placeholder="Optional description..."
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                            </div>
                          </div>
                          <div className="flex justify-end gap-3 pt-2">
                            <button type="button" onClick={() => setShowTypeModal(false)}
                              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition cursor-pointer border border-gray-300 dark:border-gray-600 bg-transparent">
                              Cancel
                            </button>
                            <button type="submit" disabled={savingType}
                              className="px-5 py-2 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition disabled:opacity-50 cursor-pointer border-0">
                              {savingType ? 'Saving...' : 'Save'}
                            </button>
                          </div>
                        </form>
                      </div>
                    </div>
        </PortalModal>
      )}

      {/* ── ALLOCATION EDIT MODAL ──────────────────────────────── */}
      {showAllocModal && editAlloc && (
        <PortalModal>
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
                      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-sm w-full">
                        <div className="flex justify-between items-center p-6 border-b border-gray-200 dark:border-gray-700">
                          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Edit Allocation</h2>
                          <button onClick={() => setShowAllocModal(false)} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-2xl leading-none bg-transparent border-0 cursor-pointer">×</button>
                        </div>
                        <form onSubmit={handleAllocSave} className="p-6 space-y-4">
                          <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-3 mb-2">
                            <p className="text-sm font-semibold text-gray-900 dark:text-white">{editAlloc.first_name} {editAlloc.last_name}</p>
                            <p className="text-xs text-gray-500">{editAlloc.leave_type_name}</p>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                              Allocated Days <span className="text-red-500">*</span>
                            </label>
                            <input type="number" min="0" step="0.5" value={allocForm.allocated_days}
                              onChange={e => setAllocForm({ ...allocForm, allocated_days: e.target.value })} required
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                              Remarks <span className="text-gray-400 font-normal">(optional)</span>
                            </label>
                            <textarea value={allocForm.remark} onChange={e => setAllocForm({ ...allocForm, remark: e.target.value })} rows={2}
                              placeholder="e.g. Prorated from mid-year hire"
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                          </div>
                          <div className="flex justify-end gap-3 pt-2">
                            <button type="button" onClick={() => setShowAllocModal(false)}
                              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition cursor-pointer border border-gray-300 dark:border-gray-600 bg-transparent">
                              Cancel
                            </button>
                            <button type="submit" disabled={savingAlloc}
                              className="px-5 py-2 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition disabled:opacity-50 cursor-pointer border-0">
                              {savingAlloc ? 'Saving...' : 'Save Changes'}
                            </button>
                          </div>
                        </form>
                      </div>
                    </div>
        </PortalModal>
      )}
    </div>
  )
}
