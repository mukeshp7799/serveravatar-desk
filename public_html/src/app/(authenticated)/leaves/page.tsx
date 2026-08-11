'use client'
import PortalModal from '@/components/PortalModal';
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { useDateSettings, useCompanySettings } from '@/contexts/CompanySettingsContext'
import Tabs from '@/components/Tabs'
import PageLoader from '@/components/PageLoader'
import {
  Calendar, Check, CheckSquare, Clock, Info, Plus, Search, Settings,
  ThumbsDown, ThumbsUp, Trash2, X, MoreHorizontal, ChevronDown,
  User, Users, Briefcase, Sparkles
} from 'lucide-react'

// ────────────────────────────────────────────────────────────
// HELPERS
// ────────────────────────────────────────────────────────────

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

function fmtDate(raw: string | null | undefined): string {
  if (!raw) return '—'
  const parts = String(raw).split('T')[0].split('-')
  if (parts.length !== 3) return String(raw)
  const [y, m, d] = parts.map(Number)
  if (isNaN(y)) return String(raw)
  const mm = String(m).padStart(2, '0')
  const dd = String(d).padStart(2, '0')
  return `${mm}/${dd}/${y}`
}

// ────────────────────────────────────────────────────────────
// CONSTANTS
// ────────────────────────────────────────────────────────────

const ACCENT = '#4F46E5'

const BALANCE_META: Record<string, { icon: string; color: string; bg: string }> = {
  'Annual Leave':      { icon: '🏖️', color: 'text-indigo-600',    bg: 'bg-indigo-50' },
  'Sick Leave':        { icon: '🩺', color: 'text-rose-600',      bg: 'bg-rose-50' },
  'Casual Leave':      { icon: '🌴', color: 'text-amber-600',     bg: 'bg-amber-50' },
  'Maternity Leave':   { icon: '🤱', color: 'text-pink-600',      bg: 'bg-pink-50' },
  'Paternity Leave':   { icon: '👔', color: 'text-blue-600',      bg: 'bg-blue-50' },
  'Bereavement Leave': { icon: '🕯️', color: 'text-gray-600',     bg: 'bg-gray-50' },
}

const STATUS_META: Record<string, { label: string; dot: string; bg: string; text: string }> = {
  approved:  { label: 'Approved',  dot: 'bg-emerald-500', bg: 'bg-emerald-50',  text: 'text-emerald-700' },
  rejected:  { label: 'Rejected',  dot: 'bg-red-500',     bg: 'bg-red-50',      text: 'text-red-700' },
  pending:   { label: 'Pending',   dot: 'bg-amber-500',   bg: 'bg-amber-50',    text: 'text-amber-700' },
  cancelled: { label: 'Cancelled',  dot: 'bg-gray-400',    bg: 'bg-gray-100',     text: 'text-gray-500' },
}

type Tab = 'my' | 'team' | 'types' | 'allocations'

// ────────────────────────────────────────────────────────────
// LEAVE WARNINGS
// ────────────────────────────────────────────────────────────

const DAY_MAP: Record<number, string> = {
  0: 'sun', 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat',
}

function LeaveWarnings({
  startDate, endDate, workingDays, maxConsecutive,
}: {
  startDate: string; endDate: string; workingDays: string[]; maxConsecutive?: number
}) {
  const warnings: string[] = []
  if (!startDate || !endDate) return null
  const start = new Date(startDate + 'T00:00:00')
  const end   = new Date(endDate   + 'T00:00:00')
  const totalDays = Math.round((end.getTime() - start.getTime()) / 86400000) + 1
  if (maxConsecutive && totalDays > maxConsecutive)
    warnings.push(`Range spans ${totalDays} days; max allowed is ${maxConsecutive} consecutive days.`)
  const cur = new Date(start)
  const weekends: string[] = []
  while (cur <= end) {
    if (!workingDays.includes(DAY_MAP[cur.getDay()]!))
      weekends.push(cur.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))
    cur.setDate(cur.getDate() + 1)
  }
  if (weekends.length > 0)
    warnings.push(`Selected range includes weekends: ${[...new Set(weekends)].join(', ')}.`)
  if (warnings.length === 0) return null
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 px-4 py-3 space-y-2">
      <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
        <Info size={14} className="shrink-0" />
        <span className="text-xs font-semibold">Review before submitting</span>
      </div>
      {warnings.map((w, i) => (
        <p key={i} className="text-xs text-amber-600 dark:text-amber-400 pl-5">• {w}</p>
      ))}
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// THREE-DOT ACTION MENU
// ────────────────────────────────────────────────────────────

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

// ────────────────────────────────────────────────────────────
// PAGINATION
// ────────────────────────────────────────────────────────────

const PER_PAGE_OPTIONS = [10, 20, 30, 50, 100]

function PaginationBar({ page, total, limit, onPage, onLimitChange }: {
  page: number; total: number; limit: number; onPage: (p: number) => void; onLimitChange: (l: number) => void
}) {
  const totalPages = Math.max(1, Math.ceil(total / limit))
  const start = Math.min((page - 1) * limit + 1, total)
  const end   = Math.min(page * limit, total)

  // Build compact page list: 1, 2, 3, ..., N-1, N
  const getPages = (): (number | '...')[] => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1)
    }
    const pages: (number | '...')[] = []
    const showLeft  = page > 3
    const showRight = page < totalPages - 2

    pages.push(1, 2)
    if (showLeft)  pages.push('...')
    const startPage = showLeft ? (showRight ? page - 1 : totalPages - 3) : 3
    const endPage   = showRight ? (showLeft ? page + 1 : 4)        : totalPages - 1
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
    <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-3 border-t border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800">
      {/* Left: results summary */}
      <p className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
        Showing <span className="font-medium text-gray-700 dark:text-gray-200">{start}</span> to{" "}
        <span className="font-medium text-gray-700 dark:text-gray-200">{end}</span> of{" "}
        <span className="font-medium text-gray-700 dark:text-gray-200">{total}</span> results
      </p>

      <div className="flex items-center gap-3">
        {/* Per-page selector */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400 whitespace-nowrap">Per page:</span>
          <div className="relative">
            <select
              value={limit}
              onChange={e => onLimitChange(Number(e.target.value))}
              className="appearance-none pl-2 pr-6 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
              style={{ colorScheme: 'normal' }}
            >
              {PER_PAGE_OPTIONS.map(o => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
            {/* Dropdown arrow */}
            <span className="pointer-events-none absolute inset-y-0 right-1.5 flex items-center text-gray-400">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </span>
          </div>
        </div>

        {/* Page navigation — only when more than 1 page */}
        {totalPages > 1 && (
          <div className="flex items-center gap-0.5 flex-wrap">
            <button
              onClick={() => onPage(prev)}
              disabled={page <= 1}
              className="min-w-[32px] h-8 px-2 flex items-center justify-center rounded-lg text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer border-0 bg-transparent"
            >‹</button>
            {pages.map((p, i) =>
              p === '...' ? (
                <span key={`ellipsis-${i}`} className="w-8 h-8 flex items-center justify-center text-gray-400 select-none">…</span>
              ) : (
                <button
                  key={p}
                  onClick={() => onPage(p)}
                  className={`min-w-[32px] h-8 px-1 flex items-center justify-center rounded-lg text-xs font-medium transition cursor-pointer border-0 ${
                    p === page
                      ? 'text-white'
                      : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                  style={p === page ? { backgroundColor: ACCENT } : {}}
                >
                  {p}
                </button>
              )
            )}
            <button
              onClick={() => onPage(next)}
              disabled={page >= totalPages}
              className="min-w-[32px] h-8 px-2 flex items-center justify-center rounded-lg text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer border-0 bg-transparent"
            >›</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// MAIN PAGE
// ────────────────────────────────────────────────────────────

export default function LeavesPage() {
  const user = typeof window !== 'undefined'
    ? JSON.parse(localStorage.getItem('user') || '{}') : {}
  const isHRAdmin = Array.isArray(user.permissions) && (
    user.permissions.includes('leave.manage_all') || user.permissions.includes('users.edit_all'))
  const isManager = Array.isArray(user.permissions) && (
    user.permissions.includes('leave.view_team') || isHRAdmin)

  const { settings: companySettings } = useCompanySettings()
  const lv = companySettings?.leave
  const ws = companySettings?.working_schedule
  const { timezone } = useDateSettings()

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
  const [applyForm, setApplyForm] = useState({
    leave_type_id: '', start_date: '', end_date: '', reason: '',
    half_day: false, half_day_session: 'first_half',
  })
  const [applying, setApplying] = useState(false)

  // Reject modal
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [rejectingId, setRejectingId] = useState<number | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  // Cancel modal
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancellingId, setCancellingId] = useState<number | null>(null)

  // Reseed modal
  const [showReseedModal, setShowReseedModal] = useState(false)

  // Type modal
  const [showTypeModal, setShowTypeModal] = useState(false)
  const [editType, setEditType] = useState<any>(null)
  const [typeForm, setTypeForm] = useState({
    name: '', code: '', description: '', is_paid: true,
    default_days: '', max_allowed: '', status: 'active',
  })
  const [savingType, setSavingType] = useState(false)

  // Allocation modal
  const [showAllocModal, setShowAllocModal] = useState(false)
  const [editAlloc, setEditAlloc] = useState<any>(null)
  const [allocForm, setAllocForm] = useState({ allocated_days: '', remark: '' })
  const [savingAlloc, setSavingAlloc] = useState(false)

  // Filters
  const [reqFilter, setReqFilter] = useState<'pending' | 'approved' | 'rejected' | 'cancelled' | ''>('')
  const [teamSearch, setTeamSearch] = useState('')
  const [allocSearch, setAllocSearch] = useState('')
  const [allocDept, setAllocDept] = useState('')
  const [allocLeaveType, setAllocLeaveType] = useState('')

  // Pagination
  const [myReqPage, setMyReqPage] = useState(1)
  const [myReqTotal, setMyReqTotal] = useState(0)
  const [myReqLimit, setMyReqLimit] = useState(10)
  const [teamReqPage, setTeamReqPage] = useState(1)
  const [teamReqTotal, setTeamReqTotal] = useState(0)
  const [teamReqLimit, setTeamReqLimit] = useState(10)
  const [typesPage, setTypesPage] = useState(1)
  const [typesTotal, setTypesTotal] = useState(0)
  const [typesLimit, setTypesLimit] = useState(10)
  const [allocPage, setAllocPage] = useState(1)
  const [allocTotal, setAllocTotal] = useState(0)
  const [allocLimit, setAllocLimit] = useState(10)

  // ── Data loading ──────────────────────────────────────────

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

  const loadMyRequests = (page = 1, limitOverride?: number) => {
    const limit = limitOverride ?? myReqLimit
    const params = new URLSearchParams({ page: String(page), limit: String(limit), userId: String(user.id) })
    api.get(`/leaves?${params}`).then(d => {
      setRequests(d.leaveRequests || [])
      setMyReqTotal(d.pagination?.total || 0)
      setMyReqPage(page)
    }).catch(() => {})
  }

  const loadTeamRequests = (page = 1, filter = reqFilter, limitOverride?: number) => {
    const limit = limitOverride ?? teamReqLimit
    const params = new URLSearchParams({ page: String(page), limit: String(limit) })
    if (filter) params.set('status', filter)
    if (teamSearch) params.set('search', teamSearch)
    Promise.all([
      api.get(`/leaves?${params}`),
      api.get('/departments'),
    ]).then(([d, deptsData]) => {
      setRequests(d.leaveRequests || [])
      setTeamReqTotal(d.pagination?.total || 0)
      setTeamReqPage(page)
      setDepartments(deptsData.departments || [])
    }).catch(() => {})
  }

  const loadLeaveTypes = (page = 1, limitOverride?: number) => {
    const limit = limitOverride ?? typesLimit
    const params = new URLSearchParams({ page: String(page), limit: String(limit) })
    api.get(`/leaves/types?${params}`).then(d => {
      setLeaveTypes(d.leaveTypes || [])
      setTypesTotal(d.pagination?.total || 0)
      setTypesPage(page)
    }).catch(() => {})
  }

  const fetchAllAllocs = (page = 1, limitOverride?: number) => {
    const limit = limitOverride ?? allocLimit
    const params = new URLSearchParams({ page: String(page), limit: String(limit) })
    if (allocSearch) params.set('search', allocSearch)
    if (allocDept) params.set('departmentId', allocDept)
    if (allocLeaveType) params.set('leaveTypeId', allocLeaveType)
    api.get(`/leaves/allocations?${params}`).then(d => {
      setAllAllocations(d.allocations || [])
      setAllocTotal(d.pagination?.total || 0)
    }).catch(() => {})
  }

  const reloadCurrentTab = () => {
    if (tab === 'my') loadMyRequests(myReqPage)
    else if (tab === 'team') loadTeamRequests(teamReqPage, reqFilter)
    else if (tab === 'types') loadLeaveTypes(typesPage)
    else if (tab === 'allocations') fetchAllAllocs(allocPage)
    loadAll()
  }

  useEffect(() => { loadAll() }, [])

  useEffect(() => {
    if (tab === 'my') loadMyRequests(1)
    else if (tab === 'team') { setReqFilter(''); loadTeamRequests(1, '') }
    else if (tab === 'types') {
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
    if (tab === 'allocations') fetchAllAllocs(allocPage)
  }, [allocSearch, allocDept, allocLeaveType, allocPage])

  // ── Leave apply ────────────────────────────────────────────

  const getMinDate = (): string => {
    const tz = timezone || 'UTC'
    const now = new Date()
    const offsetMs = tz === 'UTC' ? 0 : now.getTimezoneOffset() * 60000
    const localNow = new Date(now.getTime() - offsetMs)
    if (lv?.allow_backdated_leave) {
      localNow.setDate(localNow.getDate() - 365)
      return localNow.toISOString().split('T')[0]
    }
    localNow.setDate(localNow.getDate() + (Number(lv?.minimum_leave_notice_days) || 0))
    return localNow.toISOString().split('T')[0]
  }

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!applyForm.leave_type_id || !applyForm.start_date || !applyForm.end_date) {
      toast.error('Please fill in all required fields'); return
    }
    if (applyForm.half_day && applyForm.start_date !== applyForm.end_date) {
      toast.error('Half-day leave must have the same start and end date.'); return
    }
    setApplying(true)
    try {
      const res = await api.post('/leaves', {
        leave_type_id: parseInt(applyForm.leave_type_id),
        start_date: applyForm.start_date,
        end_date: applyForm.end_date,
        reason: applyForm.reason,
        half_day: applyForm.half_day || false,
        half_day_session: applyForm.half_day ? applyForm.half_day_session : undefined,
      })
      toast.success(res.message || 'Leave request submitted')
      setShowApply(false)
      setApplyForm({ leave_type_id: '', start_date: '', end_date: '', reason: '', half_day: false, half_day_session: 'first_half' })
      loadAll(); loadMyRequests(1)
    } catch (err: any) { toast.error(err.message || 'Failed to submit') }
    finally { setApplying(false) }
  }

  // ── Leave type management ──────────────────────────────────

  const openAddType = () => {
    setEditType(null)
    setTypeForm({ name: '', code: '', description: '', is_paid: true, default_days: '', max_allowed: '', status: 'active' })
    setShowTypeModal(true)
  }
  const openEditType = (lt: any) => {
    setEditType(lt)
    setTypeForm({
      name: lt.name || '', code: lt.code || '', description: lt.description || '',
      is_paid: Boolean(lt.is_paid),
      default_days: String(lt.default_days || ''),
      max_allowed: String(lt.max_allowed || ''),
      status: lt.status || 'active',
    })
    setShowTypeModal(true)
  }
  const handleTypeSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!typeForm.name.trim()) { toast.error('Name is required'); return }
    setSavingType(true)
    try {
      const payload = {
        name: typeForm.name, code: typeForm.code || null,
        description: typeForm.description || null, is_paid: typeForm.is_paid,
        default_days: parseInt(typeForm.default_days) || 0,
        max_allowed: parseInt(typeForm.max_allowed) || 0, status: typeForm.status,
      }
      if (editType) {
        await api.put(`/leaves/types/${editType.id}`, payload)
        toast.success('Leave type updated')
      } else {
        await api.post('/leaves/types', payload)
        toast.success('Leave type created')
      }
      setShowTypeModal(false); loadAll()
    } catch (err: any) { toast.error(err.message || 'Failed') }
    finally { setSavingType(false) }
  }
  const handleDeleteType = async (id: number) => {
    if (!confirm('Delete this leave type?')) return
    try { await api.delete(`/leaves/types/${id}`); toast.success('Deleted'); loadAll() }
    catch (err: any) { toast.error(err.message || 'Failed') }
  }

  // ── Allocation management ──────────────────────────────────

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
      setShowAllocModal(false); fetchAllAllocs(allocPage); loadAll()
    } catch (err: any) { toast.error(err.message || 'Failed') }
    finally { setSavingAlloc(false) }
  }

  // ── Request actions ────────────────────────────────────────

  const handleApprove = async (id: number, action: 'approved' | 'rejected') => {
    if (action === 'rejected') { setRejectingId(id); setRejectReason(''); setShowRejectModal(true); return }
    try {
      await api.put(`/leaves/${id}/approve`, { action })
      toast.success(`Leave request ${action}`); loadAll(); reloadCurrentTab()
    } catch (err: any) { toast.error(err.message || 'Failed') }
  }
  const handleRejectConfirm = async () => {
    if (rejectingId === null) return
    try {
      await api.put(`/leaves/${rejectingId}/approve`, { action: 'rejected', rejection_reason: rejectReason })
      toast.success('Leave request rejected')
      setShowRejectModal(false); setRejectingId(null); setRejectReason('')
      loadAll(); reloadCurrentTab()
    } catch (err: any) { toast.error(err.message || 'Failed') }
  }
  const handleCancel = async (id: number) => {
    try {
      await api.put(`/leaves/${id}/cancel`, {})
      toast.success('Request cancelled'); loadAll(); reloadCurrentTab()
    } catch (err: any) { toast.error(err.message || 'Failed') }
  }
  const confirmCancel = async () => {
    if (cancellingId === null) return
    try {
      await api.put(`/leaves/${cancellingId}/cancel`, {})
      toast.success('Request cancelled')
      setShowCancelModal(false); setCancellingId(null); loadAll(); reloadCurrentTab()
    } catch (err: any) { toast.error(err.message || 'Failed') }
  }

  const confirmReseed = async () => {
    setShowReseedModal(false)
    try {
      const res = await api.post('/leaves/allocations/seed', {})
      toast.success(res.message || 'Seeded'); loadAll()
      if (tab === 'allocations') fetchAllAllocs()
    } catch (err: any) { toast.error(err.message || 'Failed') }
  }

  // ── Helpers ────────────────────────────────────────────────

  const statusBadge = (s: string) => {
    const m = STATUS_META[s] || STATUS_META.pending
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${m.bg} ${m.text}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
        {m.label}
      </span>
    )
  }

  const filteredRequests = reqFilter ? requests.filter(r => r.status === reqFilter) : requests
  const myRequests = filteredRequests.filter(r => r.user_id === user.id)

  const tabs: { key: Tab; label: string }[] = [
    { key: 'my', label: 'My Leave' },
    ...(isManager ? [{ key: 'team' as Tab, label: 'Team Requests' }] : []),
    ...(isHRAdmin ? [
      { key: 'types' as Tab, label: 'Leave Types' },
      { key: 'allocations' as Tab, label: 'Allocations' },
    ] : []),
  ]

  // ──────────────────────────────────────────────────────────
  // RENDER
  // ──────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-900">

      {/* ── PAGE WRAPPER ──────────────────────────────────── */}
      <div className="px-4 sm:px-6 py-6 space-y-6">

        {/* ── PAGE HEADER ─────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
              Leave Management
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">Manage leave requests, types, and allocations</p>
          </div>
          <div className="flex items-center gap-2.5">
            {isHRAdmin && (
              <button
                onClick={() => setShowReseedModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-xl border border-gray-200 dark:border-gray-700 transition cursor-pointer"
              >
                <Sparkles size={14} /> Re-seed Allocations
              </button>
            )}
            <button
              onClick={() => setShowApply(true)}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white rounded-xl transition cursor-pointer border-0"
              style={{ backgroundColor: ACCENT }}
            >
              <Plus size={14} /> Apply for Leave
            </button>
          </div>
        </div>

        {/* ── TABS ─────────────────────────────────────────── */}
        <Tabs
          active={tab}
          onChange={k => setTab(k as Tab)}
          tabs={tabs}
          className="!bg-white dark:!bg-gray-800"
        />

        {/* ═══════════════════════════════════════════════════ */}
        {/* ── MY LEAVE TAB ─────────────────────────────────── */}
        {/* ═══════════════════════════════════════════════════ */}
        {tab === 'my' && (
          <>
            {/* ── BALANCE CARDS ─────────────────────────────── */}
            {loading ? (
              <div className="flex items-center justify-center py-20"><PageLoader /></div>
            ) : allocations.length === 0 ? (
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-12 text-center">
                <div className="text-4xl mb-3">📋</div>
                <p className="text-gray-500 dark:text-gray-400 text-sm">No leave allocations found. Contact HR.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {allocations.map((a: any) => {
                  const meta = BALANCE_META[a.leave_type_name] || { icon: '📋', color: 'text-gray-600', bg: 'bg-gray-50' }
                  const usagePct = a.allocated_days > 0
                    ? Math.min(100, Math.round((a.used / a.allocated_days) * 100))
                    : 0
                  const isPaid = a.is_paid
                  return (
                    <div key={a.id}
                      className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 hover:shadow-md transition-shadow"
                    >
                      {/* Card header */}
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="text-2xl">{meta.icon}</div>
                          <div>
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-white leading-tight">{a.leave_type_name}</h3>
                            {a.leave_type_code && (
                              <p className="text-xs text-gray-400 mt-0.5">{a.leave_type_code}</p>
                            )}
                          </div>
                        </div>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          isPaid
                            ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                            : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                        }`}>
                          {isPaid ? 'Paid' : 'Unpaid'}
                        </span>
                      </div>

                      {/* Stats grid */}
                      <div className="grid grid-cols-3 gap-2 mb-4">
                        {[
                          { label: 'Allocated', value: a.allocated_days, color: 'text-gray-900 dark:text-white', bg: 'bg-gray-50 dark:bg-gray-700/50' },
                          { label: 'Used',      value: a.used,           color: 'text-red-600 dark:text-red-400',   bg: 'bg-red-50 dark:bg-red-900/20' },
                          { label: 'Available', value: a.available,     color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
                        ].map(({ label, value, color, bg }) => (
                          <div key={label} className={`rounded-xl px-3 py-2.5 text-center ${bg}`}>
                            <div className={`text-lg font-bold ${color}`}>{value}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{label}</div>
                          </div>
                        ))}
                      </div>

                      {/* Progress bar */}
                      {a.allocated_days > 0 && (
                        <div>
                          <div className="flex justify-between items-center mb-1.5">
                            <span className="text-xs text-gray-500">Usage</span>
                            <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">{usagePct}%</span>
                          </div>
                          <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${usagePct}%`,
                                backgroundColor: usagePct > 80 ? '#ef4444' : usagePct > 50 ? '#f59e0b' : ACCENT,
                              }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* ── MY REQUESTS TABLE ─────────────────────────── */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              {/* Table header */}
              <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900 dark:text-white">My Leave Requests</h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {myReqTotal > 0 ? `${myReqTotal} total request${myReqTotal !== 1 ? 's' : ''}` : 'No requests'}
                  </p>
                </div>
                {/* Status filter */}
                <div className="relative">
                  <select
                    value={reqFilter}
                    onChange={e => { setReqFilter(e.target.value as any); setMyReqPage(1) }}
                    className="appearance-none pl-3 pr-8 py-2 text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl cursor-pointer focus:outline-none focus:ring-2 transition"
                    style={{ colorScheme: 'normal' }}
                  >
                    <option value="">All Status</option>
                    <option value="pending">Pending</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                  <ChevronDown size={12}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {/* Table */}
              {myRequests.length === 0 ? (
                <div className="px-5 py-14 text-center">
                  <div className="text-3xl mb-2">📭</div>
                  <p className="text-sm text-gray-400 dark:text-gray-500">No leave requests found</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-100 dark:border-gray-700">
                        {['Type', 'Period', 'Days', 'Status', 'Applied On', ''].map(h => (
                          <th key={h}
                            className="px-5 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap first:pl-5 last:pr-5">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-gray-700/60">
                      {myRequests.map((r: any) => (
                        <tr key={r.id} className="hover:bg-slate-50/70 dark:hover:bg-gray-700/30 transition-colors">
                          <td className="px-5 py-3.5">
                            <span className="text-sm font-medium text-gray-900 dark:text-white">{r.leave_type_name}</span>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                              {fmtDateDefault(r.start_date)} → {fmtDateDefault(r.end_date)}
                            </span>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className="text-sm font-semibold" style={{ color: ACCENT }}>{r.days}d</span>
                          </td>
                          <td className="px-5 py-3.5">{statusBadge(r.status)}</td>
                          <td className="px-5 py-3.5">
                            <span className="text-xs text-gray-400">{fmtDateDefault(r.created_at)}</span>
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            {r.status === 'pending' && (
                              <ActionMenu>
                                <button
                                  onClick={() => { setCancellingId(r.id); setShowCancelModal(true) }}
                                  className="w-full text-left px-4 py-2 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition cursor-pointer bg-transparent border-0"
                                >
                                  Cancel Request
                                </button>
                              </ActionMenu>
                            )}
                            {r.status === 'cancelled' && (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                            {(r.status === 'approved' || r.status === 'rejected') && (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <PaginationBar
                page={myReqPage}
                total={myReqTotal}
                limit={myReqLimit}
                onPage={p => { setMyReqPage(p); loadMyRequests(p) }}
                onLimitChange={l => { setMyReqLimit(l); setMyReqPage(1); loadMyRequests(1, l) }}
              />
            </div>
          </>
        )}

        {/* ═══════════════════════════════════════════════════ */}
        {/* ── TEAM REQUESTS TAB ─────────────────────────────── */}
        {/* ═══════════════════════════════════════════════════ */}
        {tab === 'team' && (
          <>
            {/* Search + Filter bar */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 px-5 py-4 flex flex-wrap gap-3 items-center">
              <div className="relative flex-1 min-w-[200px]">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search by name or email..."
                  value={teamSearch}
                  onChange={e => { setTeamSearch(e.target.value); setTeamReqPage(1) }}
                  onKeyDown={e => e.key === 'Enter' && loadTeamRequests(1, reqFilter)}
                  className="w-full pl-9 pr-4 py-2 text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 transition placeholder-gray-400"
                  style={{ '--tw-ring-color': ACCENT } as any}
                />
              </div>
              {/* Status pills */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {['', 'pending', 'approved', 'rejected', 'cancelled'].map(s => (
                  <button key={s}
                    onClick={() => { setReqFilter(s as any); loadTeamRequests(1, s as any) }}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer border-0 ${
                      reqFilter === s
                        ? 'text-white shadow-sm'
                        : 'text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                    style={reqFilter === s ? { backgroundColor: ACCENT } : {}}
                  >
                    {s ? s.charAt(0).toUpperCase() + s.slice(1) : 'All'}
                  </button>
                ))}
              </div>
              <button
                onClick={() => loadTeamRequests(1, reqFilter)}
                className="px-4 py-2 text-xs font-semibold text-white rounded-xl transition cursor-pointer border-0"
                style={{ backgroundColor: ACCENT }}
              >
                Search
              </button>
            </div>

            {/* Table */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              {filteredRequests.length === 0 ? (
                <div className="px-5 py-14 text-center">
                  <div className="text-3xl mb-2">🔍</div>
                  <p className="text-sm text-gray-400 dark:text-gray-500">No requests found</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-100 dark:border-gray-700">
                        {['Employee', 'Type', 'Period', 'Days', 'Reason', 'Status', ''].map(h => (
                          <th key={h}
                            className="px-5 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap first:pl-5 last:pr-5">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-gray-700/60">
                      {filteredRequests.map((r: any) => {
                        const isOwn = r.user_id === user.id
                        return (
                          <tr key={r.id} className="hover:bg-slate-50/70 dark:hover:bg-gray-700/30 transition-colors">
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-full bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center shrink-0">
                                  <User size={14} className="text-indigo-500" />
                                </div>
                                <div>
                                  <div className="text-sm font-medium text-gray-900 dark:text-white">{r.first_name} {r.last_name}</div>
                                  <div className="text-xs text-gray-400">{r.email}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-5 py-3.5">
                              <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{r.leave_type_name}</span>
                            </td>
                            <td className="px-5 py-3.5">
                              <span className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                                {fmtDateDefault(r.start_date)} → {fmtDateDefault(r.end_date)}
                              </span>
                            </td>
                            <td className="px-5 py-3.5">
                              <span className="text-sm font-semibold" style={{ color: ACCENT }}>{r.days}d</span>
                            </td>
                            <td className="px-5 py-3.5">
                              <span className="text-sm text-gray-500 dark:text-gray-400 max-w-[160px] truncate block">
                                {r.reason || '—'}
                              </span>
                            </td>
                            <td className="px-5 py-3.5">{statusBadge(r.status)}</td>
                            <td className="px-5 py-3.5 text-right">
                              {r.status === 'pending' && (
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    onClick={() => handleApprove(r.id, 'approved')}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white rounded-lg transition cursor-pointer border-0"
                                    style={{ backgroundColor: '#16a34a' }}
                                  >
                                    <ThumbsUp size={11} /> Approve
                                  </button>
                                  <button
                                    onClick={() => handleApprove(r.id, 'rejected')}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white rounded-lg transition cursor-pointer border-0"
                                    style={{ backgroundColor: '#dc2626' }}
                                  >
                                    <ThumbsDown size={11} /> Reject
                                  </button>
                                </div>
                              )}
                              {r.status === 'cancelled' && (
                                <span className="text-xs text-gray-400">—</span>
                              )}
                              {(r.status === 'approved' || r.status === 'rejected') && (
                                !isOwn ? (
                                  <ActionMenu>
                                    <button
                                      onClick={() => { setCancellingId(r.id); setShowCancelModal(true) }}
                                      className="w-full text-left px-4 py-2 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition cursor-pointer bg-transparent border-0"
                                    >
                                      Cancel Request
                                    </button>
                                  </ActionMenu>
                                ) : <span className="text-xs text-gray-400">—</span>
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
                page={teamReqPage}
                total={teamReqTotal}
                limit={teamReqLimit}
                onPage={p => { setTeamReqPage(p); loadTeamRequests(p, reqFilter) }}
                onLimitChange={l => { setTeamReqLimit(l); setTeamReqPage(1); loadTeamRequests(1, reqFilter, l) }}
              />
            </div>
          </>
        )}

        {/* ═══════════════════════════════════════════════════ */}
        {/* ── LEAVE TYPES TAB ───────────────────────────────── */}
        {/* ═══════════════════════════════════════════════════ */}
        {tab === 'types' && isHRAdmin && (
          <>
            <div className="flex justify-end">
              <button
                onClick={openAddType}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white rounded-xl transition cursor-pointer border-0"
                style={{ backgroundColor: ACCENT }}
              >
                <Plus size={14} /> Add Leave Type
              </button>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              {leaveTypes.length === 0 ? (
                <div className="px-5 py-14 text-center">
                  <div className="text-3xl mb-2">🏷️</div>
                  <p className="text-sm text-gray-400 dark:text-gray-500">No leave types defined</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-100 dark:border-gray-700">
                        {['Name', 'Code', 'Default Days', 'Max Allowed', 'Type', 'Status', 'Description', ''].map(h => (
                          <th key={h}
                            className="px-5 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide first:pl-5 last:pr-5">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-gray-700/60">
                      {leaveTypes.map((lt: any) => (
                        <tr key={lt.id} className="hover:bg-slate-50/70 dark:hover:bg-gray-700/30 transition-colors">
                          <td className="px-5 py-3.5">
                            <span className="text-sm font-semibold text-gray-900 dark:text-white">{lt.name}</span>
                          </td>
                          <td className="px-5 py-3.5">
                            <code className="text-xs text-gray-500 font-mono">{lt.code || '—'}</code>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className="text-sm font-semibold" style={{ color: ACCENT }}>{lt.default_days}</span>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className="text-sm text-gray-600 dark:text-gray-400">{lt.max_allowed || '—'}</span>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              lt.is_paid
                                ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                                : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                            }`}>
                              {lt.is_paid ? 'Paid' : 'Unpaid'}
                            </span>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                              lt.status === 'active'
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${lt.status === 'active' ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                              {lt.status === 'active' ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className="text-sm text-gray-500 dark:text-gray-400 max-w-[180px] truncate block">
                              {lt.description || '—'}
                            </span>
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => openEditType(lt)}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition cursor-pointer bg-transparent border-0"
                              >
                                <Settings size={14} />
                              </button>
                              <button
                                onClick={() => handleDeleteType(lt.id)}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition cursor-pointer bg-transparent border-0"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <PaginationBar
                page={typesPage}
                total={typesTotal}
                limit={typesLimit}
                onPage={p => { setTypesPage(p); loadLeaveTypes(p) }}
                onLimitChange={l => { setTypesLimit(l); setTypesPage(1); loadLeaveTypes(1, l) }}
              />
            </div>
          </>
        )}

        {/* ═══════════════════════════════════════════════════ */}
        {/* ── ALLOCATIONS TAB ───────────────────────────────── */}
        {/* ═══════════════════════════════════════════════════ */}
        {tab === 'allocations' && isHRAdmin && (
          <>
            {/* Filters */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 px-5 py-4 flex flex-wrap gap-3 items-end">
              <div className="flex-1 min-w-[180px]">
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Search</label>
                <div className="relative">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <input
                    type="text" placeholder="Employee name..."
                    value={allocSearch}
                    onChange={e => { setAllocSearch(e.target.value); setAllocPage(1) }}
                    className="w-full pl-8 pr-3 py-2 text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 transition placeholder-gray-400"
                    style={{ '--tw-ring-color': ACCENT } as any}
                  />
                </div>
              </div>
              <div className="min-w-[150px]">
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Department</label>
                <select value={allocDept}
                  onChange={e => { setAllocDept(e.target.value); setAllocPage(1) }}
                  className="w-full px-3 py-2 text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl cursor-pointer focus:outline-none focus:ring-2 transition">
                  <option value="">All Departments</option>
                  {departments.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div className="min-w-[150px]">
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Leave Type</label>
                <select value={allocLeaveType}
                  onChange={e => { setAllocLeaveType(e.target.value); setAllocPage(1) }}
                  className="w-full px-3 py-2 text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl cursor-pointer focus:outline-none focus:ring-2 transition">
                  <option value="">All Leave Types</option>
                  {leaveTypes.map((lt: any) => <option key={lt.id} value={lt.id}>{lt.name}</option>)}
                </select>
              </div>
            </div>

            {/* Table */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              {allAllocations.length === 0 ? (
                <div className="px-5 py-14 text-center">
                  <div className="text-3xl mb-2">📋</div>
                  <p className="text-sm text-gray-400 dark:text-gray-500">No allocations found</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-100 dark:border-gray-700">
                        {['Employee', 'Department', 'Leave Type', 'Allocated', 'Used', 'Available', 'Remark', ''].map(h => (
                          <th key={h}
                            className={`px-5 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide first:pl-5 last:pr-5 ${
                              ['Allocated','Used','Available'].includes(h) ? 'text-center' : ''
                            }`}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-gray-700/60">
                      {allAllocations.map((a: any) => (
                        <tr key={a.id} className="hover:bg-slate-50/70 dark:hover:bg-gray-700/30 transition-colors">
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-full bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center shrink-0">
                                <User size={14} className="text-indigo-500" />
                              </div>
                              <div>
                                <div className="text-sm font-medium text-gray-900 dark:text-white">{a.first_name} {a.last_name}</div>
                                <div className="text-xs text-gray-400">{a.email}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className="text-sm text-gray-600 dark:text-gray-400">{a.department_name || '—'}</span>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{a.leave_type_name}</span>
                            {a.leave_type_code && <span className="ml-1 text-xs text-gray-400">{a.leave_type_code}</span>}
                          </td>
                          <td className="px-5 py-3.5 text-center">
                            <span className="text-sm font-semibold text-gray-900 dark:text-white">{a.allocated_days}</span>
                          </td>
                          <td className="px-5 py-3.5 text-center">
                            <span className="text-sm font-semibold text-red-600 dark:text-red-400">{a.used}</span>
                          </td>
                          <td className="px-5 py-3.5 text-center">
                            <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">{a.available}</span>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className="text-xs text-gray-500 dark:text-gray-400 max-w-[140px] truncate block">
                              {a.remark || '—'}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <button
                              onClick={() => openAllocModal(a)}
                              className="px-3.5 py-1.5 text-xs font-semibold text-white rounded-lg transition cursor-pointer border-0"
                              style={{ backgroundColor: ACCENT }}
                            >
                              Edit
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <PaginationBar
                page={allocPage}
                total={allocTotal}
                limit={allocLimit}
                onPage={p => { setAllocPage(p); fetchAllAllocs(p) }}
                onLimitChange={l => { setAllocLimit(l); setAllocPage(1); fetchAllAllocs(1, l) }}
              />
            </div>
          </>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* MODALS                                                   */}
      {/* ═══════════════════════════════════════════════════════ */}

      {/* ── APPLY FOR LEAVE MODAL ──────────────────────────── */}
      {showApply && (
        <PortalModal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full">
              {/* Header */}
              <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100 dark:border-gray-700">
                <div>
                  <h2 className="text-base font-bold text-gray-900 dark:text-white">Apply for Leave</h2>
                  <p className="text-xs text-gray-500 mt-0.5">Submit a new leave request</p>
                </div>
                <button onClick={() => setShowApply(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition cursor-pointer bg-transparent border-0">
                  <X size={16} />
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleApply} className="p-6 space-y-4">
                {/* Leave type */}
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">
                    Leave Type <span className="text-red-500">*</span>
                  </label>
                  <select value={applyForm.leave_type_id}
                    onChange={e => setApplyForm(p => ({ ...p, leave_type_id: e.target.value }))}
                    required
                    className="w-full px-3 py-2.5 text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 transition cursor-pointer">
                    <option value="">— Select leave type —</option>
                    {allocations.map((a: any) => (
                      <option key={a.leave_type_id} value={a.leave_type_id} disabled={a.available <= 0}>
                        {a.leave_type_name} ({a.available} day{a.available !== 1 ? 's' : ''} available)
                      </option>
                    ))}
                  </select>
                </div>

                {/* Date range */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">
                      Start Date <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={applyForm.start_date}
                      onChange={e => setApplyForm(p => ({ ...p, start_date: e.target.value, half_day: false }))}
                      min={getMinDate()}
                      required
                      className="w-full px-3 py-2.5 text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 transition"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">
                      End Date <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={applyForm.end_date}
                      onChange={e => setApplyForm(p => ({ ...p, end_date: e.target.value, half_day: false }))}
                      min={getMinDate()}
                      required
                      className="w-full px-3 py-2.5 text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 transition"
                    />
                  </div>
                </div>

                {/* Half-day toggle */}
                {lv?.allow_half_day_leave && (
                  <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Half-Day Leave</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {applyForm.half_day_session === 'first_half' ? 'Morning (AM)' : 'Afternoon (PM)'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setApplyForm(p => ({
                          ...p,
                          half_day: !p.half_day,
                          end_date: !p.half_day ? p.start_date : p.end_date,
                        }))}
                        className={`relative inline-flex h-7 w-12 items-center rounded-full transition cursor-pointer border-2 ${
                          applyForm.half_day ? 'border-indigo-600' : 'border-gray-300 dark:border-gray-600'
                        }`}
                        style={applyForm.half_day ? { backgroundColor: ACCENT } : {}}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
                          applyForm.half_day ? 'translate-x-6' : 'translate-x-1'
                        }`} />
                      </button>
                    </div>
                    {applyForm.half_day && (
                      <div className="flex gap-2">
                        {(['first_half', 'second_half'] as const).map(session => (
                          <button
                            key={session}
                            type="button"
                            onClick={() => setApplyForm(p => ({ ...p, half_day_session: session }))}
                            className={`flex-1 py-2 rounded-lg text-xs font-semibold border-2 transition cursor-pointer ${
                              applyForm.half_day_session === session
                                ? 'border-indigo-600 text-white'
                                : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 bg-transparent hover:border-indigo-300'
                            }`}
                            style={applyForm.half_day_session === session ? { backgroundColor: ACCENT, borderColor: ACCENT } : {}}
                          >
                            {session === 'first_half' ? '🌅 Morning' : '🌆 Afternoon'}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Warnings */}
                {applyForm.start_date && applyForm.end_date && (
                  <LeaveWarnings
                    startDate={applyForm.start_date}
                    endDate={applyForm.end_date}
                    workingDays={ws?.working_days || ['mon', 'tue', 'wed', 'thu', 'fri']}
                    maxConsecutive={lv?.max_consecutive_leave_days}
                  />
                )}

                {/* Reason */}
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">Reason</label>
                  <textarea
                    value={applyForm.reason}
                    onChange={e => setApplyForm(p => ({ ...p, reason: e.target.value }))}
                    rows={3}
                    placeholder="Brief reason for leave..."
                    className="w-full px-3 py-2.5 text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 transition placeholder-gray-400 resize-none"
                  />
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-2.5 pt-2">
                  <button type="button" onClick={() => setShowApply(false)}
                    className="px-4 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-xl border border-gray-200 dark:border-gray-600 transition cursor-pointer">
                    Cancel
                  </button>
                  <button type="submit" disabled={applying}
                    className="px-5 py-2.5 text-sm font-semibold text-white rounded-xl transition disabled:opacity-50 cursor-pointer border-0"
                    style={{ backgroundColor: ACCENT }}>
                    {applying ? 'Submitting...' : 'Submit Request'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </PortalModal>
      )}

      {/* ── REJECT MODAL ───────────────────────────────────── */}
      {showRejectModal && (
        <PortalModal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full">
              <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100 dark:border-gray-700">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-red-50 dark:bg-red-900/30 flex items-center justify-center">
                    <X size={14} className="text-red-500" />
                  </div>
                  <h2 className="text-base font-bold text-gray-900 dark:text-white">Reject Leave Request</h2>
                </div>
                <button onClick={() => setShowRejectModal(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition cursor-pointer bg-transparent border-0">
                  <X size={16} />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">
                    Reason <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <textarea value={rejectReason}
                    onChange={e => setRejectReason(e.target.value)}
                    rows={3}
                    placeholder="Why is this request being rejected?"
                    className="w-full px-3 py-2.5 text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 transition resize-none" />
                </div>
                <div className="flex justify-end gap-2.5">
                  <button onClick={() => setShowRejectModal(false)}
                    className="px-4 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-xl border border-gray-200 dark:border-gray-600 transition cursor-pointer">
                    Cancel
                  </button>
                  <button onClick={handleRejectConfirm}
                    className="px-5 py-2.5 text-sm font-semibold text-white bg-red-500 hover:bg-red-600 rounded-xl transition cursor-pointer border-0">
                    Confirm Rejection
                  </button>
                </div>
              </div>
            </div>
          </div>
        </PortalModal>
      )}

      {/* ── CANCEL CONFIRM MODAL ───────────────────────────── */}
      {showCancelModal && (
        <PortalModal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-sm w-full p-6">
              <div className="text-center">
                <div className="w-14 h-14 rounded-full bg-red-50 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
                  <X size={22} className="text-red-500" />
                </div>
                <h2 className="text-base font-bold text-gray-900 dark:text-white mb-2">Cancel this request?</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                  This action cannot be undone. The leave request will be marked as cancelled.
                </p>
                <div className="flex gap-2.5">
                  <button onClick={() => setShowCancelModal(false)}
                    className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-xl border border-gray-200 dark:border-gray-600 transition cursor-pointer">
                    Keep It
                  </button>
                  <button onClick={confirmCancel}
                    className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-red-500 hover:bg-red-600 rounded-xl transition cursor-pointer border-0">
                    Yes, Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </PortalModal>
      )}

      {/* ── RE-SEED MODAL ──────────────────────────────────── */}
      {showReseedModal && (
        <PortalModal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-sm w-full p-6">
              <div className="text-center">
                <div className="w-14 h-14 rounded-full bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center mx-auto mb-4">
                  <Sparkles size={22} style={{ color: ACCENT }} />
                </div>
                <h2 className="text-base font-bold text-gray-900 dark:text-white mb-2">Re-seed All Allocations</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                  This will reset leave allocations for all active employees based on their assigned leave types. Existing approved leaves will not be affected.
                </p>
                <div className="flex gap-2.5">
                  <button onClick={() => setShowReseedModal(false)}
                    className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-xl border border-gray-200 dark:border-gray-600 transition cursor-pointer">
                    Cancel
                  </button>
                  <button onClick={confirmReseed}
                    className="flex-1 px-4 py-2.5 text-sm font-semibold text-white rounded-xl transition cursor-pointer border-0"
                    style={{ backgroundColor: ACCENT }}>
                    Confirm
                  </button>
                </div>
              </div>
            </div>
          </div>
        </PortalModal>
      )}

      {/* ── LEAVE TYPE MODAL ───────────────────────────────── */}
      {showTypeModal && (
        <PortalModal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full">
              <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100 dark:border-gray-700">
                <h2 className="text-base font-bold text-gray-900 dark:text-white">
                  {editType ? 'Edit Leave Type' : 'Add Leave Type'}
                </h2>
                <button onClick={() => setShowTypeModal(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition cursor-pointer bg-transparent border-0">
                  <X size={16} />
                </button>
              </div>
              <form onSubmit={handleTypeSave} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">Name <span className="text-red-500">*</span></label>
                    <input value={typeForm.name}
                      onChange={e => setTypeForm(p => ({ ...p, name: e.target.value }))}
                      required placeholder="e.g. Annual Leave"
                      className="w-full px-3 py-2.5 text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 transition" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">Code</label>
                    <input value={typeForm.code}
                      onChange={e => setTypeForm(p => ({ ...p, code: e.target.value }))}
                      placeholder="e.g. AL"
                      className="w-full px-3 py-2.5 text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 transition" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">Default Days</label>
                    <input type="number" min="0" value={typeForm.default_days}
                      onChange={e => setTypeForm(p => ({ ...p, default_days: e.target.value }))}
                      className="w-full px-3 py-2.5 text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 transition" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">Max Allowed</label>
                    <input type="number" min="0" value={typeForm.max_allowed}
                      onChange={e => setTypeForm(p => ({ ...p, max_allowed: e.target.value }))}
                      className="w-full px-3 py-2.5 text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 transition" />
                  </div>
                </div>
                {/* Paid toggle */}
                <div className="flex items-center justify-between rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Paid Leave</p>
                    <p className="text-xs text-gray-500 mt-0.5">Employee receives pay during this leave</p>
                  </div>
                  <button type="button"
                    onClick={() => setTypeForm(p => ({ ...p, is_paid: !p.is_paid }))}
                    className={`relative inline-flex h-7 w-12 items-center rounded-full transition cursor-pointer border-2 ${
                      typeForm.is_paid ? 'border-indigo-600' : 'border-gray-300 dark:border-gray-600'
                    }`}
                    style={typeForm.is_paid ? { backgroundColor: ACCENT } : {}}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
                      typeForm.is_paid ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">Description</label>
                  <textarea value={typeForm.description}
                    onChange={e => setTypeForm(p => ({ ...p, description: e.target.value }))}
                    rows={2} placeholder="Optional description..."
                    className="w-full px-3 py-2.5 text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 transition resize-none" />
                </div>
                <div className="flex justify-end gap-2.5 pt-2">
                  <button type="button" onClick={() => setShowTypeModal(false)}
                    className="px-4 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-xl border border-gray-200 dark:border-gray-600 transition cursor-pointer">
                    Cancel
                  </button>
                  <button type="submit" disabled={savingType}
                    className="px-5 py-2.5 text-sm font-semibold text-white rounded-xl transition disabled:opacity-50 cursor-pointer border-0"
                    style={{ backgroundColor: ACCENT }}>
                    {savingType ? 'Saving...' : editType ? 'Save Changes' : 'Create Type'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </PortalModal>
      )}

      {/* ── ALLOCATION EDIT MODAL ──────────────────────────── */}
      {showAllocModal && editAlloc && (
        <PortalModal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-sm w-full">
              <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100 dark:border-gray-700">
                <h2 className="text-base font-bold text-gray-900 dark:text-white">Edit Allocation</h2>
                <button onClick={() => setShowAllocModal(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition cursor-pointer bg-transparent border-0">
                  <X size={16} />
                </button>
              </div>
              <form onSubmit={handleAllocSave} className="p-6 space-y-4">
                {/* Employee banner */}
                <div className="flex items-center gap-3 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 px-4 py-3">
                  <div className="w-9 h-9 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center shrink-0">
                    <User size={16} className="text-indigo-500" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{editAlloc.first_name} {editAlloc.last_name}</p>
                    <p className="text-xs text-gray-500">{editAlloc.leave_type_name}</p>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">
                    Allocated Days <span className="text-red-500">*</span>
                  </label>
                  <input type="number" min="0" step="0.5"
                    value={allocForm.allocated_days}
                    onChange={e => setAllocForm(p => ({ ...p, allocated_days: e.target.value }))}
                    required
                    className="w-full px-3 py-2.5 text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 transition" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">Remarks</label>
                  <textarea value={allocForm.remark}
                    onChange={e => setAllocForm(p => ({ ...p, remark: e.target.value }))}
                    rows={2} placeholder="e.g. Prorated from mid-year hire"
                    className="w-full px-3 py-2.5 text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 transition resize-none" />
                </div>
                <div className="flex justify-end gap-2.5 pt-2">
                  <button type="button" onClick={() => setShowAllocModal(false)}
                    className="px-4 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-xl border border-gray-200 dark:border-gray-600 transition cursor-pointer">
                    Cancel
                  </button>
                  <button type="submit" disabled={savingAlloc}
                    className="px-5 py-2.5 text-sm font-semibold text-white rounded-xl transition disabled:opacity-50 cursor-pointer border-0"
                    style={{ backgroundColor: ACCENT }}>
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
