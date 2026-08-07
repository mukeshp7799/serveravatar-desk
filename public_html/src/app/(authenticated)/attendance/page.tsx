'use client'
import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import PageLoader from '@/components/PageLoader'
import {
  CheckCircle, Coffee, Clock, Edit2, Eye, LogIn,
  LogOut, PlayCircle, Search, StopCircle, Users, X,
  Calendar, ChevronLeft, ChevronRight, Clock as ClockIcon,
  AlertTriangle, Gift, Globe, Moon, Sun, Coffee as CoffeeIcon,
  Briefcase, ArrowUpDown, ArrowUp, ArrowDown,
} from 'lucide-react'

// --- Helpers -----------------------------------------------------------------

function fmtDate(raw: string | null | undefined): string {
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

function fmtTime(raw: string | null | undefined): string {
  if (!raw) return '—'
  try {
    return new Date(raw).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
  } catch { return String(raw) }
}

function fmtHours(decimal: number | null | undefined): string {
  if (decimal == null) return '—'
  const h = Math.floor(decimal)
  const m = Math.round((decimal - h) * 60)
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function fmtBreak(minutes: number | null | undefined): string {
  if (!minutes) return '—'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  return `${h}h ${m}m`
}

function fmtDateTimeLocal(raw: string): string {
  if (!raw) return ''
  const d = new Date(raw)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fmtShortDate(raw: string | null | undefined): string {
  if (!raw) return '—'
  const s = String(raw).trim()
  const [y, m, d] = s.includes('T') ? s.split('T')[0].split('-') : s.split('-')
  return `${m}/${d}`
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const STATUS_META: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  absent:     { label: 'Absent',       color: 'text-gray-500',   bg: 'bg-gray-100',    icon: X },
  clocked_in: { label: 'Clocked In',   color: 'text-sky-600',    bg: 'bg-sky-50',      icon: LogIn },
  working:    { label: 'Working',      color: 'text-emerald-600', bg: 'bg-emerald-50',  icon: CheckCircle },
  on_break:   { label: 'On Break',    color: 'text-amber-600',  bg: 'bg-amber-50',    icon: Coffee },
  completed:  { label: 'Completed',   color: 'text-indigo-600', bg: 'bg-indigo-50',   icon: Clock },
}

const TIMELINE_STATUS_META: Record<string, { label: string; color: string; bg: string; textColor: string }> = {
  present:  { label: 'Present',   color: 'text-emerald-600', bg: 'bg-emerald-50',    textColor: 'border-emerald-200' },
  absent:   { label: 'Absent',    color: 'text-gray-500',    bg: 'bg-gray-100',      textColor: 'border-gray-200' },
  leave:    { label: 'Leave',     color: 'text-blue-600',    bg: 'bg-blue-50',       textColor: 'border-blue-200' },
  holiday:  { label: 'Holiday',   color: 'text-purple-600',  bg: 'bg-purple-50',    textColor: 'border-purple-200' },
  weekend:  { label: 'Weekend',   color: 'text-amber-600',   bg: 'bg-amber-50',      textColor: 'border-amber-200' },
}

// --- Types ---------------------------------------------------------------------

type TopTab = 'today' | 'history' | 'team' | 'reports'
type ReportSubTab = 'summary' | 'timeline'

interface Summary {
  user_id: number; first_name: string; last_name: string; email: string
  department_name: string; hire_date: string
  total_days: number; working_days: number; weekends: number; company_holidays: number
  present_days: number; approved_leave_days: number; absent_days: number
  late_checkins: number; total_working_hours: number; total_break_minutes: number
  average_working_hours: number
}

interface TimelineDay {
  date: string; day_of_week: number; status: string; status_label: string
  clock_in_time: string | null; clock_out_time: string | null
  total_break_minutes: number; working_hours: number | null
  is_late: boolean; late_minutes: number; remarks: string | null
  holiday_name: string | null; leave_reason: string | null
  breaks: any[]; attendance_id: number | null; raw_status: string | null
}

interface Break {
  id: number; attendance_id: number; start_time: string; end_time: string | null; duration_minutes: number
}

// --- Status Badge -------------------------------------------------------------

function statusBadge(s: string) {
  const m = STATUS_META[s] || STATUS_META.absent
  const Icon = m.icon
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${m.bg} ${m.color}`}>
      <Icon size={11} /> {m.label}
    </span>
  )
}

// --- Edit Modal ---------------------------------------------------------------

function EditModal({ day, onClose, onSave }: {
  day: TimelineDay; onClose: () => void; onSave: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState(day.raw_status || day.status === 'present' ? 'completed' : (day.raw_status || 'absent'))
  const [clockIn, setClockIn] = useState(day.clock_in_time ? fmtDateTimeLocal(day.clock_in_time) : '')
  const [clockOut, setClockOut] = useState(day.clock_out_time ? fmtDateTimeLocal(day.clock_out_time) : '')
  const [remarks, setRemarks] = useState(day.remarks || '')
  const [breaks, setBreaks] = useState<Break[]>(day.breaks)
  const [newBreakStart, setNewBreakStart] = useState('')

  // Lock body scroll when modal is open
  useEffect(() => {
    const scrollY = window.scrollY
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
      window.scrollTo(0, scrollY)
    }
  }, [])
  const [newBreakEnd, setNewBreakEnd] = useState('')

  async function handleSave() {
    setSaving(true)
    try {
      const attId = day.attendance_id
      if (!attId) { toast.error('No attendance record to edit'); setSaving(false); return }

      await api.put(`/attendance/${attId}`, {
        status,
        clock_in_time: clockIn ? new Date(clockIn).toISOString() : null,
        clock_out_time: clockOut ? new Date(clockOut).toISOString() : null,
        remarks: remarks || null,
      })

      // Sync breaks
      for (const b of breaks) {
        if (b.id) {
          await api.put(`/attendance/${attId}/breaks/${b.id}`, {
            start_time: b.start_time,
            end_time: b.end_time,
          })
        }
      }

      toast.success('Record updated')
      onSave()
      onClose()
    } catch (err: any) {
      toast.error(err.message || 'Failed to update')
    } finally {
      setSaving(false)
    }
  }

  async function handleAddBreak() {
    if (!newBreakStart) return
    setSaving(true)
    try {
      const attId = day.attendance_id
      if (!attId) { toast.error('No attendance record'); setSaving(false); return }
      const r = await api.post(`/attendance/${attId}/breaks`, {
        start_time: new Date(newBreakStart).toISOString(),
        end_time: newBreakEnd ? new Date(newBreakEnd).toISOString() : null,
      })
      setBreaks([...breaks, r.break])
      setNewBreakStart('')
      setNewBreakEnd('')
      toast.success('Break added')
    } catch (err: any) {
      toast.error(err.message || 'Failed to add break')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteBreak(br: Break) {
    setSaving(true)
    try {
      await api.delete(`/attendance/${day.attendance_id}/breaks/${br.id}`)
      setBreaks(breaks.filter(b => b.id !== br.id))
      toast.success('Break removed')
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete break')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] bg-black/50 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-lg w-full h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-gray-200 dark:border-gray-700 shrink-0 bg-white dark:bg-gray-800 rounded-t-2xl">
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white">Edit Attendance</h2>
            <p className="text-xs text-gray-500 mt-0.5">{fmtDate(day.date)} — {DAY_LABELS[day.day_of_week]}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-2xl leading-none bg-transparent border-0 cursor-pointer">×</button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Status */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Attendance Status</label>
            <select value={status} onChange={e => setStatus(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer">
              <option value="absent">Absent</option>
              <option value="clocked_in">Clocked In</option>
              <option value="working">Working</option>
              <option value="on_break">On Break</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          {/* Clock In */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Clock In Time</label>
            <input type="datetime-local" value={clockIn} onChange={e => setClockIn(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>

          {/* Clock Out */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Clock Out Time</label>
            <input type="datetime-local" value={clockOut} onChange={e => setClockOut(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>

          {/* Remarks */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Remarks</label>
            <textarea value={remarks} onChange={e => setRemarks(e.target.value)} rows={2}
              placeholder="Optional remarks..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>

          {/* Breaks */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Break Records</label>
            <div className="space-y-2 mb-2">
              {breaks.map(br => (
                <div key={br.id} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700 rounded-lg px-3 py-2">
                  <ClockIcon size={13} className="text-gray-400 shrink-0" />
                  <span className="text-xs text-gray-600 dark:text-gray-300 flex-1">
                    {fmtTime(br.start_time)} → {br.end_time ? fmtTime(br.end_time) : 'Open'}
                    <span className="ml-2 font-semibold text-amber-600">({fmtBreak(br.duration_minutes)})</span>
                  </span>
                  <button onClick={() => handleDeleteBreak(br)}
                    className="text-gray-400 hover:text-red-500 bg-transparent border-0 cursor-pointer p-0.5">
                    <X size={13} />
                  </button>
                </div>
              ))}
              {breaks.length === 0 && (
                <p className="text-xs text-gray-400 dark:text-gray-500 italic">No breaks recorded</p>
              )}
            </div>
            <div className="flex gap-2 items-center">
              <input type="datetime-local" value={newBreakStart} onChange={e => setNewBreakStart(e.target.value)}
                className="flex-1 px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500" />
              <input type="datetime-local" value={newBreakEnd} onChange={e => setNewBreakEnd(e.target.value)}
                className="flex-1 px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500" />
              <button onClick={handleAddBreak} disabled={!newBreakStart || saving}
                className="px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50 cursor-pointer border-0">
                + Add
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 flex justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-b-2xl">
          <button onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition cursor-pointer border border-gray-300 dark:border-gray-600 bg-transparent">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition disabled:opacity-50 cursor-pointer border-0">
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// --- Main Page ----------------------------------------------------------------

export default function AttendancePage() {
  const user = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('user') || '{}') : {}
  const perms: string[] = Array.isArray(user.permissions) ? user.permissions : []
  const isHRAdmin = perms.includes('attendance.manage_all')
  const canViewTeam = perms.includes('attendance.view_team') || isHRAdmin
  const canClock = perms.includes('attendance.clock_in_out')

  // -- Top-level tabs ---------------------------------------------------------
  const [tab, setTab] = useState<TopTab>('today')
  const [loading, setLoading] = useState(true)

  // -- My Today ----------------------------------------------------------------
  const [myToday, setMyToday] = useState<any>(null)
  const [myBreaks, setMyBreaks] = useState<any[]>([])
  const [actioning, setActioning] = useState<string | null>(null)

  // -- History -----------------------------------------------------------------
  const [history, setHistory] = useState<any[]>([])
  const [histPage, setHistPage] = useState(1)
  const [histTotal, setHistTotal] = useState(0)

  // -- Team --------------------------------------------------------------------
  const [teamRecords, setTeamRecords] = useState<any[]>([])
  const [stats, setStats] = useState<any>({})

  // -- Reports (HR/Admin) -----------------------------------------------------
  const [reportSubTab, setReportSubTab] = useState<ReportSubTab>('summary')

  // Shared report filters
  const today = new Date()
  const y = today.getFullYear(), m = today.getMonth()
  const defaultFrom = new Date(y, m, 1).toISOString().slice(0, 10)
  const defaultTo = new Date(y, m + 1, 0).toISOString().slice(0, 10)
  const [dateFrom, setDateFrom] = useState(defaultFrom)
  const [dateTo, setDateTo] = useState(defaultTo)
  const [selDept, setSelDept] = useState('')
  const [selEmp, setSelEmp] = useState('')
  const [selStatus, setSelStatus] = useState('')

  // Summary data
  const [summaries, setSummaries] = useState<Summary[]>([])
  const [sortKey, setSortKey] = useState<string>('')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [summPage, setSummPage] = useState(1)
  const [summLimit, setSummLimit] = useState(10)
  const [summTotal, setSummTotal] = useState(0)
  const [summSearch, setSummSearch] = useState('')

  // Timeline data
  const [tlUserId, setTlUserId] = useState<string>('')
  const [tlEmpName, setTlEmpName] = useState('')
  const [timeline, setTimeline] = useState<TimelineDay[]>([])
  const [tlEmpInfo, setTlEmpInfo] = useState<any>(null)

  // Lookups
  const [departments, setDepartments] = useState<any[]>([])
  const [employees, setEmployees] = useState<any[]>([])

  // Edit modal
  const [editDay, setEditDay] = useState<TimelineDay | null>(null)

  // -- Load data ---------------------------------------------------------------

  const loadToday = async () => {
    try {
      const r = await api.get('/attendance/today')
      setMyToday(r.attendance)
      setMyBreaks(r.attendance?.breaks || [])
    } catch {}
  }

  const loadHistory = async (page = 1) => {
    try {
      const r = await api.get(`/attendance/history?page=${page}&limit=20`)
      setHistory(r.records || [])
      setHistPage(page)
      setHistTotal(r.pagination?.total || 0)
    } catch {}
  }

  const loadTeam = async () => {
    try {
      const [team, st, depts] = await Promise.all([
        api.get('/attendance/team'),
        api.get('/attendance/stats'),
        canViewTeam ? api.get('/departments') : Promise.resolve({ departments: [] }),
      ])
      setTeamRecords(team.records || [])
      setStats(st.stats || {})
      setDepartments(depts.departments || [])
    } catch {}
  }

  const loadReportLookups = async () => {
    try {
      const [d, e] = await Promise.all([
        api.get('/departments'),
        api.get('/employees'),
      ])
      setDepartments(d.departments || [])
      setEmployees(e.employees || e.records || [])
    } catch {}
  }

  const loadSummary = useCallback(async (page = summPage) => {
    if (!dateFrom || !dateTo) return
    setLoading(true)
    try {
      const params = new URLSearchParams({
        date_from: dateFrom,
        date_to: dateTo,
        page: String(page),
        limit: String(summLimit),
      })
      if (selDept) params.set('department_id', selDept)
      if (selEmp) params.set('user_id', selEmp)
      if (selStatus) params.set('status', selStatus)
      if (summSearch) params.set('search', summSearch)
      const r = await api.get(`/attendance/analytics/summary?${params.toString()}`)
      setSummaries(r.summaries || [])
      setSummPage(r.pagination?.page || page)
      setSummTotal(r.pagination?.total || 0)
    } catch (err: any) {
      toast.error(err.message || 'Failed to load summary')
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo, selDept, selEmp, selStatus, summLimit, summSearch])

  const loadTimeline = useCallback(async (empId?: string) => {
    const targetId = empId || tlUserId
    if (!targetId || !dateFrom || !dateTo) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ user_id: targetId, date_from: dateFrom, date_to: dateTo })
      const r = await api.get(`/attendance/analytics/timeline?${params.toString()}`)
      setTimeline(r.timeline || [])
      setTlEmpInfo(r.employee || null)
    } catch (err: any) {
      toast.error(err.message || 'Failed to load timeline')
    } finally {
      setLoading(false)
    }
  }, [tlUserId, dateFrom, dateTo])

  // Initial load
  useEffect(() => {
    setLoading(true)
    Promise.all([loadToday()]).finally(() => setLoading(false))
  }, [])

  useEffect(() => { if (tab === 'history') loadHistory(1) }, [tab])
  useEffect(() => { if (tab === 'team') loadTeam() }, [tab])

  useEffect(() => {
    if (tab === 'reports') {
      loadReportLookups()
      setSummPage(1)
      loadSummary(1)
    }
  }, [tab])

  // Reset to page 1 when filters change
  useEffect(() => {
    if (tab === 'reports' && reportSubTab === 'summary') {
      setSummPage(1)
      loadSummary(1)
    }
  }, [dateFrom, dateTo, selDept, selEmp, selStatus])

  // Debounced search
  useEffect(() => {
    if (tab === 'reports' && reportSubTab === 'summary') {
      const timer = setTimeout(() => {
        setSummPage(1)
        loadSummary(1)
      }, 400)
      return () => clearTimeout(timer)
    }
  }, [summSearch])

  // When switching to timeline sub-tab
  useEffect(() => {
    if (tab === 'reports' && reportSubTab === 'timeline') {
      if (tlUserId) {
        loadTimeline(tlUserId)
      } else if (selEmp && summaries.length > 0) {
        const emp = summaries.find(s => String(s.user_id) === String(selEmp))
        if (emp) {
          setTlUserId(String(emp.user_id))
          setTlEmpName(`${emp.first_name} ${emp.last_name}`)
          loadTimeline(String(emp.user_id))
        }
      }
    }
  }, [tab, reportSubTab])

  // -- Actions -----------------------------------------------------------------

  const doAction = async (action: 'clock-in' | 'clock-out' | 'start-break' | 'end-break') => {
    setActioning(action)
    try {
      const r = await api.post(`/attendance/${action}`, {})
      toast.success(r.message || 'Done')
      await loadToday()
    } catch (err: any) {
      toast.error(err.message || 'Failed')
    } finally {
      setActioning(null)
    }
  }

  // -- Report helpers ----------------------------------------------------------

  function viewTimeline(emp: Summary) {
    // Set the employee filter to the selected employee
    setSelEmp(String(emp.user_id))
    setTlUserId(String(emp.user_id))
    setTlEmpName(`${emp.first_name} ${emp.last_name}`)
    setReportSubTab('timeline')
    // Load timeline data for this employee
    loadTimeline(String(emp.user_id))
  }

  function handleTimelineEmpChange(empId: string) {
    setTlUserId(empId)
    const emp = summaries.find(s => String(s.user_id) === String(empId))
    setTlEmpName(emp ? `${emp.first_name} ${emp.last_name}` : '')
    if (empId) loadTimeline(empId)
  }

  function applyReportFilters() {
    if (reportSubTab === 'summary') {
      loadSummary()
    } else if (tlUserId) {
      loadTimeline(tlUserId)
    }
  }

  function resetReportFilters() {
    setSelDept('')
    setSelEmp('')
    setSelStatus('')
    setTlUserId('')
    setTlEmpName('')
    setTimeline([])
    setSortKey('')
    setSortDir('asc')
    setSummSearch('')
  }

  function handleSort(key: string) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  function handleEditSave() {
    // Refresh both summary and timeline
    loadSummary()
    if (tlUserId) loadTimeline(tlUserId)
  }

  // -- Tabs config -------------------------------------------------------------

  const topTabs: { key: TopTab; label: string }[] = [
    { key: 'today', label: 'My Today' },
    { key: 'history', label: 'History' },
    ...(canViewTeam ? [{ key: 'team' as TopTab, label: 'Team' }] : []),
    ...(isHRAdmin ? [{ key: 'reports' as TopTab, label: 'Reports' }] : []),
  ]

  const histPages = Math.ceil(histTotal / 20)

  const canClockIn = myToday && (myToday.status === 'absent') && canClock
  const canClockOut = myToday && ['clocked_in', 'working'].includes(myToday.status) && myToday.status !== 'on_break' && canClock
  const canStartBreak = myToday && ['clocked_in', 'working'].includes(myToday.status) && myToday.status !== 'on_break' && canClock
  const canEndBreak = myToday && myToday.status === 'on_break' && canClock

  // --- Render -----------------------------------------------------------------

  return (
    <div className="w-full px-4 py-6 space-y-5 animate-fade-in-up">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Attendance</h1>
        {canViewTeam && (
          <div className="flex flex-wrap gap-2 text-xs">
            {[
              { label: 'Present Today', value: stats.present_today, color: 'text-emerald-600' },
              { label: 'Absent Today', value: stats.absent_today, color: 'text-gray-500' },
              { label: 'Working Now', value: stats.working_now, color: 'text-sky-600' },
              { label: 'On Break', value: stats.on_break, color: 'text-amber-600' },
              { label: 'Completed', value: stats.completed_today, color: 'text-indigo-600' },
              { label: 'Late', value: stats.late_checkins, color: 'text-red-500' },
            ].map(s => (
              <div key={s.label}
                className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-center">
                <div className={`text-lg font-bold ${s.color}`}>{s.value ?? 0}</div>
                <div className="text-gray-500 dark:text-gray-400 text-[10px] font-medium">{s.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Top-level Tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-700/50 rounded-xl p-1 w-fit">
        {topTabs.map(tb => (
          <button key={tb.key} onClick={() => setTab(tb.key)}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition cursor-pointer border-0 ${
              tab === tb.key
                ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}>
            {tb.label}
          </button>
        ))}
      </div>

      {/* ====================================================================== */}
      {/* == MY TODAY TAB =================================================== */}
      {/* ====================================================================== */}
      {tab === 'today' && (
        <>
          {loading ? <PageLoader /> : (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Current status */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
                  <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-4 uppercase tracking-wide">Current Status</h3>
                  {myToday ? (
                    <div className="space-y-4">
                      {(() => {
                        const m = STATUS_META[myToday.status] || STATUS_META.absent
                        const Icon = m.icon
                        return (
                          <div className="flex items-center gap-3">
                            <div className={`w-14 h-14 rounded-2xl ${m.bg} flex items-center justify-center`}>
                              <Icon size={24} className={m.color} />
                            </div>
                            <div>
                              <div className={`text-2xl font-bold ${m.color}`}>{m.label}</div>
                              <div className="text-xs text-gray-400">{fmtDate(myToday.date)}</div>
                            </div>
                          </div>
                        )
                      })()}
                      <div className="space-y-2 text-sm">
                        {myToday.clock_in_time && (
                          <div className="flex justify-between">
                            <span className="text-gray-500">Clock In</span>
                            <span className="font-semibold text-gray-900 dark:text-white">{fmtTime(myToday.clock_in_time)}</span>
                          </div>
                        )}
                        {myToday.clock_out_time && (
                          <div className="flex justify-between">
                            <span className="text-gray-500">Clock Out</span>
                            <span className="font-semibold text-gray-900 dark:text-white">{fmtTime(myToday.clock_out_time)}</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-gray-500">Total Break</span>
                          <span className="font-semibold text-amber-600">{fmtBreak(myToday.total_break_minutes)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Working Hours</span>
                          <span className="font-semibold text-indigo-600">{fmtHours(myToday.working_hours)}</span>
                        </div>
                        {myToday.is_late && (
                          <div className="flex justify-between">
                            <span className="text-gray-500">Late By</span>
                            <span className="font-semibold text-red-500">{myToday.late_minutes} min</span>
                          </div>
                        )}
                        {myToday.remarks && (
                          <div className="flex flex-col gap-1 mt-2">
                            <span className="text-gray-500 text-xs">Remarks</span>
                            <span className="text-gray-700 dark:text-gray-300 text-sm italic">"{myToday.remarks}"</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="text-gray-400 text-sm">No attendance record for today.</div>
                  )}
                </div>

                {/* Action buttons */}
                <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
                  <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-4 uppercase tracking-wide">Actions</h3>
                  {!canClock ? (
                    <div className="text-center py-8 text-gray-400">
                      <Clock size={32} className="mx-auto mb-2 opacity-50" />
                      <p className="text-sm">You do not have permission to clock in/out.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <button onClick={() => doAction('clock-in')} disabled={!canClockIn || actioning !== null}
                        className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-dashed border-sky-200 dark:border-sky-800 hover:border-sky-400 hover:bg-sky-50 dark:hover:bg-sky-900/20 transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer bg-transparent">
                        <LogIn size={28} className="text-sky-600" />
                        <span className="text-xs font-semibold text-sky-700 dark:text-sky-300">Clock In</span>
                      </button>
                      <button onClick={() => doAction('start-break')} disabled={!canStartBreak || actioning !== null}
                        className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-dashed border-amber-200 dark:border-amber-800 hover:border-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer bg-transparent">
                        <PlayCircle size={28} className="text-amber-600" />
                        <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">Start Break</span>
                      </button>
                      <button onClick={() => doAction('end-break')} disabled={!canEndBreak || actioning !== null}
                        className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-dashed border-emerald-200 dark:border-emerald-800 hover:border-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer bg-transparent">
                        <StopCircle size={28} className="text-emerald-600" />
                        <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">End Break</span>
                      </button>
                      <button onClick={() => doAction('clock-out')} disabled={!canClockOut || actioning !== null}
                        className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-dashed border-indigo-200 dark:border-indigo-800 hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer bg-transparent">
                        <LogOut size={28} className="text-indigo-600" />
                        <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">Clock Out</span>
                      </button>
                    </div>
                  )}
                  {actioning && (
                    <div className="mt-3 text-center text-xs text-indigo-600 font-medium animate-pulse">Processing...</div>
                  )}
                </div>
              </div>

              {/* Today's breaks */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700">
                  <h2 className="text-base font-semibold text-gray-900 dark:text-white">Today's Breaks</h2>
                </div>
                {myBreaks.length === 0 ? (
                  <div className="p-10 text-center text-gray-400 dark:text-gray-500 text-sm">No breaks recorded today.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 dark:bg-gray-700/50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">#</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Start</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">End</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Duration</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                        {myBreaks.map((b: any, i: number) => (
                          <tr key={b.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                            <td className="px-4 py-3 text-gray-400 dark:text-gray-500">{i + 1}</td>
                            <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{fmtTime(b.start_time)}</td>
                            <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{b.end_time ? fmtTime(b.end_time) : <span className="text-amber-500 font-medium">In progress</span>}</td>
                            <td className="px-4 py-3 font-semibold text-amber-600 dark:text-amber-400">{fmtBreak(b.duration_minutes)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* ====================================================================== */}
      {/* == HISTORY TAB ======================================================= */}
      {/* ====================================================================== */}
      {tab === 'history' && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">My Attendance History</h2>
          </div>
          {history.length === 0 ? (
            <div className="p-12 text-center text-gray-400 dark:text-gray-500 text-sm">No attendance records yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Clock In</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Clock Out</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Break</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Working Hrs</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Late</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {history.map((r: any) => (
                    <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{fmtDate(r.date)}</td>
                      <td className="px-4 py-3">{statusBadge(r.status)}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{fmtTime(r.clock_in_time)}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{fmtTime(r.clock_out_time)}</td>
                      <td className="px-4 py-3 font-semibold text-amber-600 dark:text-amber-400">{fmtBreak(r.total_break_minutes)}</td>
                      <td className="px-4 py-3 font-semibold text-indigo-600 dark:text-indigo-400">{fmtHours(r.working_hours)}</td>
                      <td className="px-4 py-3 text-red-500">{r.is_late ? `${r.late_minutes}m` : '—'}</td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs max-w-[150px] truncate">{r.remarks || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {histPages > 1 && (
            <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <span className="text-xs text-gray-400">Page {histPage} of {histPages} ({histTotal} records)</span>
              <div className="flex gap-2">
                <button onClick={() => loadHistory(histPage - 1)} disabled={histPage <= 1}
                  className="px-3 py-1 text-xs font-medium bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-lg disabled:opacity-40 cursor-pointer border border-gray-200 dark:border-gray-600">Previous</button>
                <button onClick={() => loadHistory(histPage + 1)} disabled={histPage >= histPages}
                  className="px-3 py-1 text-xs font-medium bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-lg disabled:opacity-40 cursor-pointer border border-gray-200 dark:border-gray-600">Next</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ====================================================================== */}
      {/* == TEAM TAB ======================================================== */}
      {/* ====================================================================== */}
      {tab === 'team' && canViewTeam && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">
              Team Attendance — {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Employee</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Dept</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Clock In</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Clock Out</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Break</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Working Hrs</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Late</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {teamRecords.map((r: any) => (
                  <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 dark:text-white">{r.first_name} {r.last_name}</div>
                      <div className="text-xs text-gray-400">{r.email}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{r.department_name || '—'}</td>
                    <td className="px-4 py-3">{statusBadge(r.status)}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{fmtTime(r.clock_in_time)}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{fmtTime(r.clock_out_time)}</td>
                    <td className="px-4 py-3 font-semibold text-amber-600 dark:text-amber-400">{fmtBreak(r.total_break_minutes)}</td>
                    <td className="px-4 py-3 font-semibold text-indigo-600 dark:text-indigo-400">{fmtHours(r.working_hours)}</td>
                    <td className="px-4 py-3 text-red-500">{r.is_late ? `${r.late_minutes}m` : '—'}</td>
                  </tr>
                ))}
                {teamRecords.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400 dark:text-gray-500">No records found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ====================================================================== */}
      {/* == REPORTS TAB (HR/Admin) ======================================== */}
      {/* ====================================================================== */}
      {tab === 'reports' && isHRAdmin && (
        <>
          {/* Sub-tabs: Summary / Timeline */}
          <div className="flex gap-1 bg-gray-100 dark:bg-gray-700/50 rounded-xl p-1 w-fit">
            <button onClick={() => setReportSubTab('summary')}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition cursor-pointer border-0 ${
                reportSubTab === 'summary'
                  ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}>
              Summary
            </button>
            <button onClick={() => setReportSubTab('timeline')}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition cursor-pointer border-0 ${
                reportSubTab === 'timeline'
                  ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}>
              Timeline
            </button>
          </div>

          {/* -- Shared Filters ----------------------------------------- */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 flex flex-wrap gap-3 items-end">
            {/* Date From */}
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">From</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            {/* Date To */}
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">To</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            {/* Department */}
            <div className="flex-1 min-w-[150px]">
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Department</label>
              <select value={selDept} onChange={e => setSelDept(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer">
                <option value="">All Departments</option>
                {departments.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            {/* Employee */}
            <div className="flex-1 min-w-[180px]">
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                {reportSubTab === 'timeline' ? 'Employee (Timeline)' : 'Employee'}
              </label>
              {reportSubTab === 'timeline' ? (
                <select value={tlUserId} onChange={e => handleTimelineEmpChange(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer">
                  <option value="">Select employee...</option>
                  {summaries.map(s => (
                    <option key={s.user_id} value={s.user_id}>{s.first_name} {s.last_name}</option>
                  ))}
                </select>
              ) : (
                <select value={selEmp} onChange={e => setSelEmp(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer">
                  <option value="">All Employees</option>
                  {employees.map((e: any) => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
                </select>
              )}
            </div>
            {/* Status (Summary only) */}
            {reportSubTab === 'summary' && (
              <div className="min-w-[140px]">
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Status</label>
                <select value={selStatus} onChange={e => setSelStatus(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer">
                  <option value="">All Statuses</option>
                  <option value="clocked_in">Clocked In</option>
                  <option value="working">Working</option>
                  <option value="completed">Completed</option>
                  <option value="absent">Absent</option>
                </select>
              </div>
            )}
            {/* Actions */}
            <button onClick={applyReportFilters}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition cursor-pointer border-0">
              Apply
            </button>
            <button onClick={resetReportFilters}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 text-sm font-medium rounded-lg transition cursor-pointer border border-gray-200 dark:border-gray-600">
              Reset
            </button>
          </div>

                    {/* -- SUMMARY SUB-TAB ---------------------------------------- */}
          {reportSubTab === 'summary' && (() => {
                const totalPages = Math.ceil(summTotal / summLimit)
                const SortTh = ({ col, label, align = 'left' }: { col: string; label: string; align?: string }) => {
                  const active = sortKey === col
                  return (
                    <th
                      onClick={() => handleSort(col)}
                      className={`px-4 py-3 text-${align} text-xs font-semibold uppercase cursor-pointer select-none whitespace-nowrap ${active ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-500 dark:text-gray-400'} hover:text-indigo-500 dark:hover:text-indigo-300 transition-colors`}
                    >
                      <span className={`flex items-center gap-1.5 ${align === 'center' ? 'justify-center' : align === 'right' ? 'justify-end' : 'justify-start'}`}>
                        {label}
                        {active ? sortDir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} /> : <ArrowUpDown size={11} className="opacity-40" />}
                      </span>
                    </th>
                  )
                }
                return loading ? <PageLoader /> : (
                  <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                    {/* Toolbar */}
                    <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex flex-wrap items-center gap-3 justify-between">
                      <div>
                        <h3 className="text-sm font-bold text-gray-900 dark:text-white">Employee Attendance Summary</h3>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {summTotal === 0 ? 'No' : summTotal} employee{summTotal !== 1 ? 's' : ''} &middot; {fmtDate(dateFrom)} &ndash; {fmtDate(dateTo)}
                        </p>
                      </div>
                      <div className="relative">
                        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                        <input
                          type="text"
                          value={summSearch}
                          onChange={e => setSummSearch(e.target.value)}
                          placeholder="Search employee..."
                          className="pl-8 pr-4 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs w-52 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-400"
                        />
                      </div>
                    </div>

                    {summaries.length === 0 ? (
                      <div className="p-12 text-center text-gray-400 dark:text-gray-500 text-sm">No data for the selected filters.</div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 dark:bg-gray-700/50">
                            <tr>
                              <SortTh col="employee" label="Employee" />
                              <SortTh col="total_days" label="Total Days" align="center" />
                              <SortTh col="working_days" label="Working Days" align="center" />
                              <SortTh col="weekends" label="Weekends" align="center" />
                              <SortTh col="company_holidays" label="Company Holidays" align="center" />
                              <SortTh col="present_days" label="Present Days" align="center" />
                              <SortTh col="approved_leave_days" label="Approved Leave" align="center" />
                              <SortTh col="absent_days" label="Absent Days" align="center" />
                              <SortTh col="late_checkins" label="Late Check-ins" align="center" />
                              <SortTh col="total_working_hours" label="Total Working Hrs" align="center" />
                              <SortTh col="total_break_minutes" label="Total Break" align="center" />
                              <SortTh col="average_working_hours" label="Avg Working Hrs" align="center" />
                              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                            {summaries.map(s => (
                              <tr key={s.user_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                                <td className="px-4 py-3">
                                  <div className="font-medium text-gray-900 dark:text-white whitespace-nowrap">{s.first_name} {s.last_name}</div>
                                  <div className="text-xs text-gray-400">{s.department_name || '—'}</div>
                                </td>
                                <td className="px-4 py-3 text-center font-semibold text-gray-900 dark:text-white">{s.total_days}</td>
                                <td className="px-4 py-3 text-center font-semibold text-blue-600 dark:text-blue-400">{s.working_days}</td>
                                <td className="px-4 py-3 text-center text-purple-600 dark:text-purple-400">{s.weekends}</td>
                                <td className="px-4 py-3 text-center text-indigo-600 dark:text-indigo-400">{s.company_holidays}</td>
                                <td className="px-4 py-3 text-center"><span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">{s.present_days}</span></td>
                                <td className="px-4 py-3 text-center"><span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">{s.approved_leave_days}</span></td>
                                <td className="px-4 py-3 text-center"><span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-500 dark:bg-red-900/30 dark:text-red-400">{s.absent_days}</span></td>
                                <td className="px-4 py-3 text-center"><span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">{s.late_checkins}</span></td>
                                <td className="px-4 py-3 text-center text-teal-600 dark:text-teal-400 font-semibold whitespace-nowrap">{fmtHours(s.total_working_hours)}</td>
                                <td className="px-4 py-3 text-center text-orange-600 dark:text-orange-400 whitespace-nowrap">{fmtBreak(s.total_break_minutes)}</td>
                                <td className="px-4 py-3 text-center text-indigo-600 dark:text-indigo-400 font-semibold whitespace-nowrap">{fmtHours(s.average_working_hours)}</td>
                                <td className="px-4 py-3 text-center whitespace-nowrap">
                                  <button onClick={() => viewTimeline(s)} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-indigo-50 hover:bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400 dark:hover:bg-indigo-900/50 rounded-lg transition cursor-pointer border-0">
                                    <Eye size={12} /> Timeline
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Pagination footer */}
                    <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30 flex flex-wrap items-center justify-between gap-3">
                      {/* Left: results count + per-page */}
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-xs text-gray-500">
                          Showing <span className="font-semibold text-gray-700 dark:text-gray-200">{Math.min((summPage - 1) * summLimit + 1, summTotal)}</span>
                          {' '}to{' '}
                          <span className="font-semibold text-gray-700 dark:text-gray-200">{Math.min(summPage * summLimit, summTotal)}</span>
                          {' '}of{' '}
                          <span className="font-semibold text-gray-700 dark:text-gray-200">{summTotal}</span>
                          {' '}results
                        </span>
                        <select
                          value={summLimit}
                          onChange={e => { setSummLimit(Number(e.target.value)); setSummPage(1); loadSummary(1) }}
                          className="px-2 py-1 border border-gray-300 dark:border-gray-500 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                        >
                          {[10, 20, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </div>

                      {/* Right: page number buttons */}
                      <div className="flex items-center gap-1 flex-wrap">
                        {/* Prev arrow */}
                        <button
                          onClick={() => { const p = Math.max(1, summPage - 1); setSummPage(p); loadSummary(p) }}
                          disabled={summPage <= 1}
                          className="w-8 h-8 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-700 transition cursor-pointer border-0"
                        >
                          &lsaquo;
                        </button>

                        {/* Page 1 button — always shown when totalPages >= 1 */}
                        <button
                          onClick={() => { setSummPage(1); loadSummary(1) }}
                          className={`min-w-[32px] h-8 flex items-center justify-center rounded-md text-xs font-medium transition cursor-pointer border-0 ${
                            summPage === 1
                              ? 'bg-indigo-600 text-white shadow-sm'
                              : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                          }`}
                        >
                          1
                        </button>

                        {/* Ellipsis after first page */}
                        {summPage > 3 && totalPages > 4 && (
                          <span className="px-1 text-gray-400 text-xs select-none">...</span>
                        )}

                        {/* Middle pages */}
                        {Array.from({ length: Math.min(totalPages - 2, 7) }, (_, i) => {
                          const pageNum = Math.max(2, Math.min(totalPages - 1, summPage - 3 + i))
                          if (pageNum < 2 || pageNum > totalPages - 1) return null
                          if (pageNum === 1 || pageNum === totalPages) return null
                          return (
                            <button
                              key={pageNum}
                              onClick={() => { setSummPage(pageNum); loadSummary(pageNum) }}
                              className={`min-w-[32px] h-8 flex items-center justify-center rounded-md text-xs font-medium transition cursor-pointer border-0 ${
                                summPage === pageNum
                                  ? 'bg-indigo-600 text-white shadow-sm'
                                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                              }`}
                            >
                              {pageNum}
                            </button>
                          )
                        })}

                        {/* Ellipsis before last page */}
                        {summPage < totalPages - 2 && totalPages > 4 && (
                          <span className="px-1 text-gray-400 text-xs select-none">...</span>
                        )}

                        {/* Last page button — shown when totalPages > 1 */}
                        {totalPages > 1 && (
                          <button
                            onClick={() => { setSummPage(totalPages); loadSummary(totalPages) }}
                            className={`min-w-[32px] h-8 flex items-center justify-center rounded-md text-xs font-medium transition cursor-pointer border-0 ${
                              summPage === totalPages
                                ? 'bg-indigo-600 text-white shadow-sm'
                                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                            }`}
                          >
                            {totalPages}
                          </button>
                        )}

                        {/* Next arrow */}
                        <button
                          onClick={() => { const p = Math.min(totalPages, summPage + 1); setSummPage(p); loadSummary(p) }}
                          disabled={summPage >= totalPages}
                          className="w-8 h-8 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-700 transition cursor-pointer border-0"
                        >
                          &rsaquo;
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })()}



          {/* -- TIMELINE SUB-TAB --------------------------------------- */}
          {reportSubTab === 'timeline' && (
            <>
              {/* Employee summary banner */}
              {tlEmpInfo && (
                <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl border border-indigo-100 dark:border-indigo-800 p-4 flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <div className="text-base font-bold text-indigo-700 dark:text-indigo-300">
                      {tlEmpInfo.first_name} {tlEmpInfo.last_name}
                    </div>
                    <div className="text-xs text-indigo-500 dark:text-indigo-400 mt-0.5">
                      {tlEmpInfo.department_name || 'No Department'} · {tlEmpInfo.email}
                    </div>
                  </div>
                  <div className="flex gap-4 text-xs">
                    <div className="text-center">
                      <div className="font-bold text-emerald-600">{timeline.filter(d => d.status === 'present').length}</div>
                      <div className="text-gray-500">Present</div>
                    </div>
                    <div className="text-center">
                      <div className="font-bold text-red-500">{timeline.filter(d => d.status === 'absent').length}</div>
                      <div className="text-gray-500">Absent</div>
                    </div>
                    <div className="text-center">
                      <div className="font-bold text-blue-600">{timeline.filter(d => d.status === 'leave').length}</div>
                      <div className="text-gray-500">Leave</div>
                    </div>
                    <div className="text-center">
                      <div className="font-bold text-purple-600">{timeline.filter(d => d.status === 'holiday').length}</div>
                      <div className="text-gray-500">Holiday</div>
                    </div>
                    <div className="text-center">
                      <div className="font-bold text-amber-600">{timeline.filter(d => d.status === 'weekend').length}</div>
                      <div className="text-gray-500">Weekend</div>
                    </div>
                  </div>
                </div>
              )}

              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white">Day-wise Timeline</h3>
                  {isHRAdmin && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
                      <Edit2 size={11} /> Admin edit mode
                    </p>
                  )}
                </div>
                <div className="p-4">
                  {!tlUserId ? (
                    <div className="text-center py-16 text-gray-400 dark:text-gray-500">
                      <ClockIcon size={40} className="mx-auto mb-3 opacity-40" />
                      <p className="text-sm">Select an employee from the Summary tab or the dropdown above to view their timeline.</p>
                    </div>
                  ) : loading ? (
                    <PageLoader />
                  ) : timeline.length === 0 ? (
                    <div className="text-center py-16 text-gray-400 dark:text-gray-500 text-sm">No timeline data found.</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 dark:bg-gray-700/60">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap">Date</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap">Day</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap">Status</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap">Clock In</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap">Clock Out</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap">Breaks</th>
                            <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap">Wrk Hrs</th>
                            <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap">Late</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Remarks</th>
                            {isHRAdmin && (
                              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap">Action</th>
                            )}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                          {timeline.map((day, idx) => {
                            const meta = TIMELINE_STATUS_META[day.status] || TIMELINE_STATUS_META.absent
                            const isEditable = day.attendance_id != null && isHRAdmin
                            const isOdd = idx % 2 === 1
                            return (
                              <tr key={day.date} className={`${isOdd ? 'bg-gray-50/60 dark:bg-gray-700/20' : ''} hover:bg-indigo-50/40 dark:hover:bg-indigo-900/20 transition-colors`}>
                                {/* Date */}
                                <td className="px-4 py-3">
                                  <span className="font-semibold text-gray-900 dark:text-white text-xs whitespace-nowrap">{fmtDate(day.date)}</span>
                                  {day.holiday_name && (
                                    <div className="text-[10px] text-purple-600 dark:text-purple-400 font-medium mt-0.5">🎉 {day.holiday_name}</div>
                                  )}
                                  {day.leave_reason && (
                                    <div className="text-[10px] text-blue-500 dark:text-blue-400 font-medium mt-0.5">🏖️ {day.leave_reason}</div>
                                  )}
                                </td>
                                {/* Day of week */}
                                <td className="px-4 py-3">
                                  <span className={`text-xs font-medium ${day.day_of_week === 0 || day.day_of_week === 6 ? 'text-amber-500' : 'text-gray-500 dark:text-gray-400'}`}>
                                    {DAY_LABELS[day.day_of_week]}
                                  </span>
                                </td>
                                {/* Status badge */}
                                <td className="px-4 py-3">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${meta.bg} ${meta.color} border-0 whitespace-nowrap`}>
                                    {meta.label}
                                  </span>
                                </td>
                                {/* Clock In */}
                                <td className="px-4 py-3">
                                  {day.status === 'present' && day.clock_in_time ? (
                                    <div className="flex items-center gap-1.5">
                                      <LogIn size={11} className="text-emerald-500 shrink-0" />
                                      <span className="text-xs font-medium text-gray-700 dark:text-gray-200">{fmtTime(day.clock_in_time)}</span>
                                      {day.is_late && <span className="text-[10px] text-red-500 font-bold">+{day.late_minutes}m</span>}
                                    </div>
                                  ) : <span className="text-xs text-gray-300 dark:text-gray-600">—</span>}
                                </td>
                                {/* Clock Out */}
                                <td className="px-4 py-3">
                                  {day.status === 'present' && day.clock_out_time ? (
                                    <div className="flex items-center gap-1.5">
                                      <LogOut size={11} className="text-indigo-500 shrink-0" />
                                      <span className="text-xs font-medium text-gray-700 dark:text-gray-200">{fmtTime(day.clock_out_time)}</span>
                                    </div>
                                  ) : <span className="text-xs text-gray-300 dark:text-gray-600">—</span>}
                                </td>
                                {/* Breaks */}
                                <td className="px-4 py-3">
                                  {day.breaks.length > 0 ? (
                                    <div className="space-y-0.5">
                                      {day.breaks.map(br => (
                                        <div key={br.id} className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
                                          <Coffee size={10} className="shrink-0" />
                                          <span>{fmtTime(br.start_time)} → {br.end_time ? fmtTime(br.end_time) : '...'} <span className="font-semibold">({fmtBreak(br.duration_minutes)})</span></span>
                                        </div>
                                      ))}
                                    </div>
                                  ) : <span className="text-xs text-gray-300 dark:text-gray-600">—</span>}
                                </td>
                                {/* Working Hours */}
                                <td className="px-4 py-3 text-center">
                                  <span className={`text-xs font-bold ${day.working_hours != null ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-300 dark:text-gray-600'}`}>
                                    {day.working_hours != null ? fmtHours(day.working_hours) : '—'}
                                  </span>
                                </td>
                                {/* Late */}
                                <td className="px-4 py-3 text-center">
                                  {day.is_late ? (
                                    <span className="text-xs font-bold text-red-500">{day.late_minutes}m</span>
                                  ) : <span className="text-xs text-gray-300 dark:text-gray-600">—</span>}
                                </td>
                                {/* Remarks */}
                                <td className="px-4 py-3 max-w-[160px]">
                                  <span className="text-xs text-gray-500 dark:text-gray-400 italic truncate block" title={day.remarks || ''}>
                                    {day.remarks || <span className="text-gray-300 dark:text-gray-600">—</span>}
                                  </span>
                                </td>
                                {/* Action */}
                                {isHRAdmin && (
                                  <td className="px-4 py-3 text-center">
                                    {isEditable ? (
                                      <button onClick={() => setEditDay(day)}
                                        className="p-1.5 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition cursor-pointer bg-transparent border-0">
                                        <Edit2 size={13} />
                                      </button>
                                    ) : <span className="text-xs text-gray-300 dark:text-gray-600">—</span>}
                                  </td>
                                )}
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* -- Edit Modal ------------------------------------------------------- */}
      {editDay && (
        <EditModal
          day={editDay}
          onClose={() => setEditDay(null)}
          onSave={handleEditSave}
        />
      )}
    </div>
  )
}
