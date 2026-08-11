'use client'
import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useDebouncedCallback } from 'use-debounce'
import toast from 'react-hot-toast'
import PortalModal from '@/components/PortalModal';
import api from '@/lib/api'
import PageLoader from '@/components/PageLoader'
import { useDateSettings } from '@/contexts/CompanySettingsContext'
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

// Format "HH:MM" 24-hour string to "1:30 PM" 12-hour with AM/PM
function fmtHHMM(raw: string | null | undefined): string {
  if (!raw) return '—'
  const parts = String(raw).split(':')
  const h = parseInt(parts[0], 10)
  const m = parseInt(parts[1], 10)
  if (isNaN(h) || isNaN(m)) return String(raw)
  const ampm = h < 12 ? 'AM' : 'PM'
  const h12 = h % 12 || 12
  const mm = String(m).padStart(2, '0')
  return h12 + ':' + mm + ' ' + ampm
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

// ─── Timezone helpers ────────────────────────────────────────────────────────
// Backend returns times as company-local HH:MM strings (e.g. "13:00" means 1:00 PM
// in the company timezone). The browser's input[type=time] also expects HH:MM in
// browser-local time. Since company TZ = browser TZ, no conversion is needed here.
// These helpers are kept as no-ops for semantic clarity.
function companyTimeToInputValue(companyTime: string, _companyTz: string): string {
  return companyTime || ''
}

function inputValueToCompanyTime(inputTime: string, _companyTz: string): string {
  return inputTime || ''
}

function fmtShortDate(raw: string | null | undefined): string {
  if (!raw) return '—'
  const s = String(raw).trim()
  const [y, m, d] = s.includes('T') ? s.split('T')[0].split('-') : s.split('-')
  return `${m}/${d}`
}

// Date range preset helpers
function getDateRange(preset: string): { from: string; to: string } {
  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)
  const day = now.getDay() // 0 = Sun
  const diffToMon = day === 0 ? 6 : day - 1 // days since Monday
  const diffToSun = day === 0 ? 0 : 7 - day // days until Sunday

  switch (preset) {
    case 'today':
      return { from: todayStr, to: todayStr }
    case 'this_week': {
      const monday = new Date(now)
      monday.setDate(now.getDate() - diffToMon)
      const sunday = new Date(now)
      sunday.setDate(now.getDate() + diffToSun)
      return { from: monday.toISOString().slice(0, 10), to: sunday.toISOString().slice(0, 10) }
    }
    case 'last_week': {
      const lastMonday = new Date(now)
      lastMonday.setDate(now.getDate() - diffToMon - 7)
      const lastSunday = new Date(now)
      lastSunday.setDate(now.getDate() - diffToMon - 1)
      return { from: lastMonday.toISOString().slice(0, 10), to: lastSunday.toISOString().slice(0, 10) }
    }
    case 'this_month': {
      const first = new Date(now.getFullYear(), now.getMonth(), 1)
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) }
    }
    case 'last_month': {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const last = new Date(now.getFullYear(), now.getMonth(), 0)
      return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) }
    }
    default:
      return { from: todayStr, to: todayStr }
  }
}

function fmtDateInput(d: Date): string {
  return d.toISOString().slice(0, 10)
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

type TopTab = 'today' | 'history' | 'team' | 'reports' | 'adjustments'
type ReportSubTab = 'summary' | 'timeline'

interface Summary {
  user_id: number; first_name: string; last_name: string; email: string
  department_name: string; hire_date: string
  total_days: number; working_days: number; weekends: number; company_holidays: number
  present_days: number; approved_leave_days: number; absent_days: number
  late_checkins: number; total_working_hours: number; total_break_minutes: number
  total_break_adjustment_minutes: number; average_working_hours: number
}

interface TimelineDay {
  date: string; day_of_week: number; status: string; status_label: string
  clock_in_time: string | null; clock_out_time: string | null
  total_break_minutes: number; working_hours: number | null
  is_late: boolean; late_minutes: number; remarks: string | null
  holiday_name: string | null; leave_reason: string | null
  breaks: any[]; attendance_id: number | null; raw_status: string | null;
  adjustments?: InlineAdjustment[];
}

interface InlineAdjustment {
  id: number; break_id: number; requested_minutes: number;
  start_time: string; end_time: string; time_start: string; time_end: string;
  reason: string; status: 'Pending' | 'Approved' | 'Rejected';
  admin_remarks: string | null; reviewed_at: string | null; reviewed_by?: number | null;
  created_at?: string;
  break_time_start: string; break_time_end: string; break_duration: number;
  reviewer?: { first_name: string; last_name: string };
}

interface Break {
  id: number; attendance_id: number; start_time: string; end_time: string | null;
  duration_minutes: number; time_start: string; time_end: string;
}

interface BreakWithAdjustment extends Break {
  adjustable_minutes: number;
  adjustment: {
    id: number; requested_minutes: number; reason: string;
    status: 'Pending' | 'Approved' | 'Rejected';
    admin_remarks: string | null; reviewed_at: string | null;
  } | null;
}

interface AdjustmentRequest {
  id: number; attendance_id: number; break_id: number; user_id: number;
  requested_minutes: number; start_time: string; end_time: string;
  time_start: string; time_end: string; reason: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  reviewed_by: number | null; reviewed_at: string | null;
  admin_remarks: string | null;
  created_at: string; updated_at: string;
  employee: { first_name: string; last_name: string; email: string; department_name: string };
  attendance: { date: string; clock_in_time: string; clock_out_time: string };
  break: { start_time: string; end_time: string; time_start: string; time_end: string; duration_minutes: number };
  reviewer: { first_name: string; last_name: string } | null;
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
    <PortalModal>
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
    </PortalModal>
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
  const [histLimit, setHistLimit] = useState(10)
  const [histSummary, setHistSummary] = useState<any>(null)
  // Date range state for history
  const histToday = new Date()
  const histYm = histToday.getFullYear(), histMm = histToday.getMonth()
  const histDefaultFrom = new Date(histYm, histMm, 1).toISOString().slice(0, 10)
  const histDefaultTo = new Date(histYm, histMm + 1, 0).toISOString().slice(0, 10)
  const [histDateFrom, setHistDateFrom] = useState(histDefaultFrom)
  const [histDateTo, setHistDateTo] = useState(histDefaultTo)
  const [histPreset, setHistPreset] = useState<'today' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'custom'>('this_month')

  // -- Team --------------------------------------------------------------------
  const [teamRecords, setTeamRecords] = useState<any[]>([])
  const [stats, setStats] = useState<any>({})

  // -- Break Adjustments ------------------------------------------------------
  const [adjustments, setAdjustments] = useState<AdjustmentRequest[]>([])
  const [adjPage, setAdjPage] = useState(1)
  const [adjTotal, setAdjTotal] = useState(0)
  const [adjLimit, setAdjLimit] = useState(10)
  const [adjFilter, setAdjFilter] = useState<'Pending' | 'Approved' | 'Rejected' | ''>('')
  const [adjSearch, setAdjSearch] = useState('')
  const [adjLoading, setAdjLoading] = useState(false)
  const [adjStats, setAdjStats] = useState({ pending_count: 0, approved_today: 0, rejected_today: 0 })
  // Request modal state
  const [showRequestModal, setShowRequestModal] = useState(false)
  const [requestAttendanceId, setRequestAttendanceId] = useState<number | null>(null)
  const [requestCompanyTz, setRequestCompanyTz] = useState<string>('UTC')
  const [requestBreaks, setRequestBreaks] = useState<BreakWithAdjustment[]>([])
  const [selectedBreak, setSelectedBreak] = useState<BreakWithAdjustment | null>(null)
  const [requestStartTime, setRequestStartTime] = useState('')
  const [requestEndTime, setRequestEndTime] = useState('')
  const [requestReason, setRequestReason] = useState('')
  const [requesting, setRequesting] = useState(false)
  // Approve/Reject modal
  const [reviewModal, setReviewModal] = useState<AdjustmentRequest | null>(null)
  const [adjDetailModal, setAdjDetailModal] = useState<{ date: string; adjustments: InlineAdjustment[] } | null>(null)
  const [historyAdjModal, setHistoryAdjModal] = useState<{ attendance_id: number; date: string; loading: boolean; adjustments: InlineAdjustment[]; attendance: any } | null>(null)
  const [reviewAction, setReviewAction] = useState<'approve' | 'reject'>('approve')
  const [reviewRemarks, setReviewRemarks] = useState('')
  const [reviewing, setReviewing] = useState(false)

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
  const [selStatus, setSelStatus] = useState('')

  // Summary data
  const [summaries, setSummaries] = useState<Summary[]>([])
  const [sortKey, setSortKey] = useState<string>('')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [summPage, setSummPage] = useState(1)
  const [summLimit, setSummLimit] = useState(10)
  const summLimitRef = useRef(summLimit)
  const [summTotal, setSummTotal] = useState(0)
  const [summSearch, setSummSearch] = useState('')

  // Timeline data
  const [tlUserId, setTlUserId] = useState<string>('')
  const [tlEmpName, setTlEmpName] = useState('')
  const [tlSearch, setTlSearch] = useState('')
  const [timeline, setTimeline] = useState<TimelineDay[]>([])
  const [tlPage, setTlPage] = useState(1)
  const [tlLimit, setTlLimit] = useState(15)
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
    } catch (err: any) {
      console.error('[Attendance] loadToday failed:', err?.message)
    }
  }

  const loadHistory = async (page = 1, limit = histLimit) => {
    if (!histDateFrom || !histDateTo) return
    try {
      const params = new URLSearchParams({
        date_from: histDateFrom,
        date_to: histDateTo,
        page: String(page),
        limit: String(limit),
      })
      const r = await api.get(`/attendance/my-history?${params}`)
      setHistory(r.timeline || [])
      setHistSummary(r.summary || null)
      setHistPage(r.pagination?.page || page)
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

  const loadAdjustmentStats = async () => {
    try {
      const r = await api.get('/attendance/break-adjustments/stats')
      setAdjStats(r)
    } catch {}
  }

  const loadAdjustments = async (page = adjPage, status = adjFilter, limit = 10, search = adjSearch) => {
    setAdjLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) })
      if (status) params.set('status', status)
      if (search) params.set('search', search)
      const r = await api.get(`/attendance/break-adjustments?${params}`)
      setAdjustments(r.requests || [])
      setAdjTotal(r.pagination?.total || 0)
    } catch {} finally {
      setAdjLoading(false)
    }
  }

  // Debounced search
  const debouncedLoadAdjustments = useDebouncedCallback(
    (search: string) => { loadAdjustments(1, adjFilter, 10, search) },
    400
  )

  const openRequestModal = async (attendanceId: number) => {
    try {
      const r = await api.get(`/attendance/break-adjustments/breaks/${attendanceId}`)
      setRequestAttendanceId(r.attendance_id)
      setRequestCompanyTz(r.company_tz || 'UTC')
      setRequestBreaks(r.breaks || [])
      setSelectedBreak(null)
      setRequestStartTime('')
      setRequestEndTime('')
      setRequestReason('')
      setShowRequestModal(true)
    } catch (err: any) {
      toast.error(err.message || 'Failed to load breaks')
    }
  }

  const submitAdjustmentRequest = async () => {
    if (!selectedBreak || !requestStartTime || !requestEndTime || !requestReason.trim()) {
      toast.error('Please select a break, pick start and end times, and provide a reason')
      return
    }
    if (requestStartTime >= requestEndTime) {
      toast.error('Start time must be before end time')
      return
    }
    setRequesting(true)
    try {
      await api.post('/attendance/break-adjustments', {
        attendance_id: requestAttendanceId,
        break_id: selectedBreak.id,
        start_time: inputValueToCompanyTime(requestStartTime, requestCompanyTz),
        end_time:   inputValueToCompanyTime(requestEndTime, requestCompanyTz),
        reason: requestReason.trim(),
      })
      toast.success('Break adjustment request submitted')
      setShowRequestModal(false)
      if (tab === 'adjustments') loadAdjustments(1)
      loadAdjustmentStats()
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit request')
    } finally {
      setRequesting(false)
    }
  }

  const reviewAdjustment = async () => {
    if (!reviewModal) return;
    setReviewing(true)
    try {
      if (reviewAction === 'approve') {
        await api.put(`/attendance/break-adjustments/${reviewModal.id}/approve`, {
          admin_remarks: reviewRemarks.trim(),
        })
        toast.success('Adjustment approved')
      } else {
        await api.put(`/attendance/break-adjustments/${reviewModal.id}/reject`, {
          admin_remarks: reviewRemarks.trim(),
        })
        toast.success('Adjustment rejected')
      }
      setReviewModal(null)
      loadAdjustments(adjPage, adjFilter, adjLimit, adjSearch)
      loadAdjustmentStats()
    } catch (err: any) {
      toast.error(err.message || 'Action failed')
    } finally {
      setReviewing(false)
    }
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

  const loadSummary = useCallback(async (page: number, limitOverride?: number) => {
    if (!dateFrom || !dateTo) return
    const activeLimit = limitOverride ?? summLimitRef.current
    setLoading(true)
    try {
      const params = new URLSearchParams({
        date_from: dateFrom,
        date_to: dateTo,
        page: String(page),
        limit: String(activeLimit),
      })
      if (selDept) params.set('department_id', selDept)
      if (selStatus) params.set('status', selStatus)
      if (summSearch) params.set('search', summSearch)
      const r = await api.get(`/attendance/analytics/summary?${params.toString()}`)
      setSummaries(r.summaries || [])
      setSummPage(r.pagination?.page ?? page)
      setSummTotal(r.pagination?.total ?? 0)
    } catch (err: any) {
      toast.error(err.message || 'Failed to load summary')
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo, selDept, selStatus, summSearch])

  const loadTimeline = useCallback(async (empId?: string) => {
    const targetId = empId || tlUserId
    if (!targetId || !dateFrom || !dateTo) return
    setLoading(true)
    setTlPage(1)
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

  useEffect(() => { if (tab === 'history') loadHistory(1) }, [tab, histDateFrom, histDateTo])
  useEffect(() => { if (tab === 'team') loadTeam() }, [tab])
  useEffect(() => { if (tab === 'adjustments') { loadAdjustments(1); loadAdjustmentStats() } }, [tab])
  useEffect(() => { if (tab === 'adjustments') loadAdjustments(adjPage, adjFilter, adjLimit, adjSearch) }, [adjPage, adjFilter, adjLimit, adjSearch, tab])

  useEffect(() => {
    if (tab === 'reports') {
      loadReportLookups()
      setSummPage(1)
      loadSummary(1)
    }
  }, [tab])

  // Keep summLimitRef in sync with summLimit state
  useEffect(() => { summLimitRef.current = summLimit }, [summLimit])

  // Reset to page 1 and reload when any filter changes (including search via debounce)
  useEffect(() => {
    if (tab === 'reports') {
      const timer = setTimeout(() => {
        setSummPage(1)
        loadSummary(1)
      }, 400)
      return () => clearTimeout(timer)
    }
  }, [dateFrom, dateTo, selDept, selStatus, summSearch])

  // When tlUserId changes, load timeline
  useEffect(() => {
    if (tab === 'reports' && tlUserId) {
      loadTimeline(tlUserId)
    }
  }, [tab, tlUserId])

  // -- Actions -----------------------------------------------------------------

  const doAction = async (action: 'clock-in' | 'clock-out' | 'start-break' | 'end-break') => {
    setActioning(action)
    let newStatus: string | null = null
    try {
      const r = await api.post(`/attendance/${action}`, {})
      toast.success(r.message || 'Done')
      // Optimistically update local state so button reflects correct availability immediately
      if (action === 'clock-out') {
        setMyToday((prev: any) => prev ? { ...prev, status: 'completed' } : prev)
        newStatus = 'completed'
      } else if (action === 'clock-in') {
        setMyToday((prev: any) => prev ? { ...prev, status: 'clocked_in' } : prev)
        newStatus = 'clocked_in'
      } else if (action === 'start-break') {
        setMyToday((prev: any) => prev ? { ...prev, status: 'on_break' } : prev)
        newStatus = 'on_break'
      } else if (action === 'end-break') {
        setMyToday((prev: any) => prev ? { ...prev, status: 'clocked_in' } : prev)
        newStatus = 'clocked_in'
      }
      await loadToday()
    } catch (err: any) {
      // Handle early clock-in blocked specially — show a more informative message
      if (err.code === 'EARLY_CLOCK_IN_BLOCKED' || (err.message && err.message.includes('Early clock-in is not allowed'))) {
        toast.error(err.message || 'Early clock-in is not allowed at this time. Please wait until office hours begin.')
      } else {
        toast.error(err.message || 'Failed')
      }
      // Reload to resync state on error
      await loadToday()
    } finally {
      setActioning(null)
    }
  }

  // -- Report helpers ----------------------------------------------------------

  function viewTimeline(emp: Summary) {
    setTlUserId(String(emp.user_id))
    setTlEmpName(`${emp.first_name} ${emp.last_name}`)
    setReportSubTab('timeline')
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
      loadSummary(summPage)
    } else if (tlUserId) {
      loadTimeline(tlUserId)
    }
  }

  function resetReportFilters() {
    setSelDept('')
    setSelStatus('')
    setTlUserId('')
    setTlEmpName('')
    setTlSearch('')
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
    loadSummary(summPage)
    if (tlUserId) loadTimeline(tlUserId)
  }

  // -- Tabs config -------------------------------------------------------------

  const canViewAdjustments = perms.includes('attendance.break_adjustment.request');

  const topTabs: { key: TopTab; label: string }[] = [
    { key: 'today', label: 'My Today' },
    { key: 'history', label: 'History' },
    ...(canViewTeam ? [{ key: 'team' as TopTab, label: 'Team' }] : []),
    ...(isHRAdmin ? [
      { key: 'reports' as TopTab, label: 'Reports' },
    ] : []),
    ...(isHRAdmin ? [{ key: 'adjustments' as TopTab, label: 'Break Adjustments' }] : []),
  ]

  // canClockIn: allow for 'absent' (first clock-in of the day) OR 'completed' (re-clock-in after clock-out)
  const canClockIn = myToday && (myToday.status === 'absent' || myToday.status === 'completed') && canClock
  const canClockOut = myToday && ['clocked_in', 'working'].includes(myToday.status) && myToday.status !== 'on_break' && canClock
  const canStartBreak = myToday && ['clocked_in', 'working'].includes(myToday.status) && myToday.status !== 'on_break' && canClock
  const canEndBreak = myToday && myToday.status === 'on_break' && canClock

  // --- Render -----------------------------------------------------------------

  return (
    <div className="w-full px-4 py-6 space-y-5 animate-fade-in-up">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Attendance</h1>
      </div>

      {/* Top-level Tabs */}
      <div className="flex flex-wrap gap-1 bg-gray-100 rounded-xl p-1 dark:[background-color:#1f2937]">
        {topTabs.map(tb => (
          <button key={tb.key} onClick={() => setTab(tb.key)}
            className={`px-4 sm:px-5 py-2 rounded-lg text-sm font-semibold transition cursor-pointer border-0 ${
              tab === tb.key
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-300'
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
                        {myToday.effective_break_minutes > 0 && (
                          <div className="flex justify-between">
                            <span className="text-gray-500">Adjusted As Work</span>
                            <span className="font-semibold text-emerald-600">+{myToday.effective_break_minutes} min</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-gray-500">Working Hours</span>
                          <span className="font-semibold text-indigo-600">{fmtHours(myToday.live_working_hours ?? myToday.working_hours)}</span>
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
                        {perms.includes('attendance.break_adjustment.request') && myToday.breaks?.some((b: any) => b.end_time) && (
                          <button onClick={() => myToday.attendance_id ? openRequestModal(myToday.attendance_id) : openRequestModal(myToday.id)}
                            className="mt-3 w-full px-3 py-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 border border-indigo-200 dark:border-indigo-700 rounded-lg transition cursor-pointer">
                            Request Break Adjustment
                          </button>
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
        <div className="space-y-4">
          {/* Date Range Filter */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 px-5 py-4">
            <div className="flex flex-wrap items-center gap-3">
              {/* Preset buttons */}
              <div className="flex flex-wrap gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                {([
                  { key: 'today', label: 'Today' },
                  { key: 'this_week', label: 'This Week' },
                  { key: 'last_week', label: 'Last Week' },
                  { key: 'this_month', label: 'This Month' },
                  { key: 'last_month', label: 'Last Month' },
                  { key: 'custom', label: 'Custom' },
                ] as const).map(p => (
                  <button
                    key={p.key}
                    onClick={() => {
                      const range = getDateRange(p.key)
                      setHistPreset(p.key)
                      setHistDateFrom(range.from)
                      setHistDateTo(range.to)
                      setHistPage(1)
                    }}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition cursor-pointer border-0 ${
                      histPreset === p.key
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-300'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Date inputs */}
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={histDateFrom}
                  onChange={e => { setHistPreset('custom'); setHistDateFrom(e.target.value) }}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-500 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <span className="text-gray-400 text-xs">to</span>
                <input
                  type="date"
                  value={histDateTo}
                  onChange={e => { setHistPreset('custom'); setHistDateTo(e.target.value) }}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-500 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {/* Apply & Reset */}
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const range = getDateRange('this_month')
                    setHistPreset('this_month')
                    setHistDateFrom(range.from)
                    setHistDateTo(range.to)
                    setHistPage(1)
                    loadHistory(1)
                  }}
                  className="px-4 py-2 text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition cursor-pointer border border-gray-200 dark:border-gray-600"
                >
                  Reset
                </button>
              </div>
            </div>
          </div>

          {/* Summary Cards */}
          {histSummary && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
              {[
                { label: 'Total Working Hrs', value: fmtHours(histSummary.total_working_hours), color: 'text-indigo-600' },
                { label: 'Total Break Time', value: fmtBreak(histSummary.total_break_minutes), color: 'text-amber-600' },
                { label: 'Break Adj. Time', value: fmtBreak(histSummary.break_adjustment_minutes), color: 'text-emerald-600' },
                { label: 'Avg Working Hrs', value: fmtHours(histSummary.average_working_hours), color: 'text-sky-600' },
                { label: 'Total Days', value: histSummary.total_days, color: 'text-gray-600' },
                { label: 'Working Days', value: histSummary.working_days, color: 'text-gray-600' },
                { label: 'Present Days', value: histSummary.present_days, color: 'text-emerald-600' },
                { label: 'Approved Leave', value: histSummary.approved_leave_days, color: 'text-blue-600' },
                { label: 'Absent Days', value: histSummary.absent_days, color: 'text-red-500' },
                { label: 'Late Check-ins', value: histSummary.late_checkins, color: 'text-orange-500' },
                { label: 'Company Holidays', value: histSummary.company_holidays, color: 'text-purple-600' },
                { label: 'Attendance Rate', value: histSummary.working_days > 0 ? `${Math.round((histSummary.present_days / histSummary.working_days) * 100)}%` : '—', color: 'text-teal-600' },
              ].map((card, i) => (
                <div key={i} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-3">
                  <div className={`text-xl font-bold ${card.color} dark:text-opacity-90`}>{card.value}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{card.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Table */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
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
                    {perms.includes('attendance.break_adjustment.request') && <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Adjustments</th>}
                    {perms.includes('attendance.break_adjustment.request') && <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {history.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-12 text-center text-gray-400 dark:text-gray-500 text-sm">No attendance records found.</td>
                    </tr>
                  ) : history.map((r: any) => (
                    <tr key={r.date} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{fmtDate(r.date)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          r.status === 'present' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                          r.status === 'absent' ? 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400' :
                          r.status === 'leave' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                          r.status === 'holiday' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' :
                          r.status === 'weekend' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                          'bg-gray-100 text-gray-600 dark:bg-gray-700'
                        }`}>
                          {r.status_label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{r.clock_in_time ? fmtHHMM(r.clock_in_time) : '—'}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{r.clock_out_time ? fmtHHMM(r.clock_out_time) : '—'}</td>
                      <td className="px-4 py-3 font-semibold text-amber-600 dark:text-amber-400">{fmtBreak(r.total_break_minutes)}</td>
                      <td className="px-4 py-3 font-semibold text-indigo-600 dark:text-indigo-400">{fmtHours(r.working_hours)}</td>
                      <td className="px-4 py-3 text-red-500">{r.is_late ? `${r.late_minutes}m` : '—'}</td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs max-w-[150px] truncate">
                        {r.holiday_name ? r.holiday_name : r.leave_reason ? r.leave_reason : r.remarks || '—'}
                      </td>
                      {perms.includes('attendance.break_adjustment.request') && (
                        <td className="px-4 py-3 text-center">
                          {r.adjustments && r.adjustments.length > 0 ? (
                            <button
                              onClick={() => setAdjDetailModal({ date: r.date, adjustments: r.adjustments })}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold cursor-pointer border-0 transition"
                              style={{
                                background: r.adjustments.some((a: any) => a.status === 'Pending') ? 'rgba(251,191,36,0.15)' : r.adjustments.some((a: any) => a.status === 'Rejected') ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.12)',
                                color: r.adjustments.some((a: any) => a.status === 'Pending') ? '#b45309' : r.adjustments.some((a: any) => a.status === 'Rejected') ? '#dc2626' : '#059669',
                              }}
                            >
                              {r.adjustments.length === 1 ? r.adjustments[0].status : r.adjustments.filter((a: any) => a.status === 'Pending').length > 0 ? `${r.adjustments.filter((a: any) => a.status === 'Pending').length} Pending` : `${r.adjustments.length} Adjusted`}
                            </button>
                          ) : <span className="text-gray-300 dark:text-gray-600 text-xs">—</span>}
                        </td>
                      )}
                      {perms.includes('attendance.break_adjustment.request') && (
                        <td className="px-4 py-3 text-center">
                          {r.attendance_id && r.status === 'present' && (
                            <>
                              <button
                                onClick={() => setAdjDetailModal({ date: r.date, adjustments: r.adjustments || [] })}
                                className="px-2 py-1 text-xs font-medium text-slate-600 dark:text-slate-400 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 border border-gray-200 dark:border-gray-600 rounded-lg transition cursor-pointer mr-1"
                              >
                                View
                              </button>
                              <button
                                onClick={() => openRequestModal(r.attendance_id)}
                                className="px-2 py-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 border border-indigo-200 dark:border-indigo-700 rounded-lg transition cursor-pointer"
                              >
                                Adjust
                              </button>
                            </>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {histTotal > histLimit && (
              <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500">
                    Showing <span className="font-semibold text-gray-700 dark:text-gray-200">{Math.min((histPage - 1) * histLimit + 1, histTotal)}</span>
                    {' '}to{' '}
                    <span className="font-semibold text-gray-700 dark:text-gray-200">{Math.min(histPage * histLimit, histTotal)}</span>
                    {' '}of{' '}
                    <span className="font-semibold text-gray-700 dark:text-gray-200">{histTotal}</span>
                  </span>
                  <select
                    value={histLimit}
                    onChange={e => { const l = Number(e.target.value); setHistLimit(l); setHistPage(1); loadHistory(1, l) }}
                    className="px-2 py-1 border border-gray-300 dark:border-gray-500 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                  >
                    {[10, 20, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-1 flex-wrap">
                  <button
                    onClick={() => { const p = Math.max(1, histPage - 1); setHistPage(p); loadHistory(p) }}
                    disabled={histPage <= 1}
                    className="w-8 h-8 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-700 transition cursor-pointer border-0"
                  >
                    ‹
                  </button>
                  {Array.from({ length: Math.ceil(histTotal / histLimit) }, (_, i) => i + 1).map(p => (
                    <button
                      key={p}
                      onClick={() => { setHistPage(p); loadHistory(p) }}
                      className={`min-w-[32px] h-8 flex items-center justify-center rounded-md text-xs font-medium transition cursor-pointer border-0 ${
                        histPage === p
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                  <button
                    onClick={() => { const p = Math.min(Math.ceil(histTotal / histLimit), histPage + 1); setHistPage(p); loadHistory(p) }}
                    disabled={histPage >= Math.ceil(histTotal / histLimit)}
                    className="w-8 h-8 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-700 transition cursor-pointer border-0"
                  >
                    ›
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ====================================================================== */}
      {/* == TEAM TAB ======================================================== */}
      {/* ====================================================================== */}
      {tab === 'team' && canViewTeam && (
        <>
          {/* Stats cards — only on Team tab */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
            {[
              { label: 'Present Today', value: stats.present_today, color: 'text-emerald-600' },
              { label: 'Absent Today', value: stats.absent_today, color: 'text-gray-500' },
              { label: 'Working Now', value: stats.working_now, color: 'text-sky-600' },
              { label: 'On Break', value: stats.on_break, color: 'text-amber-600' },
              { label: 'Completed', value: stats.completed_today, color: 'text-indigo-600' },
              { label: 'Late', value: stats.late_checkins, color: 'text-red-500' },
            ].map(s => (
              <div key={s.label}
                className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 px-3 sm:px-4 py-2 sm:py-3 text-center">
                <div className={`text-xl sm:text-2xl font-bold ${s.color}`}>{s.value ?? 0}</div>
                <div className="text-gray-500 dark:text-gray-400 text-[10px] sm:text-xs font-medium mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Team table */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white whitespace-nowrap">
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
                    <td className="px-4 py-3 font-semibold text-indigo-600 dark:text-indigo-400">{fmtHours(r.live_working_hours ?? r.working_hours)}</td>
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
        </>
      )}

      {/* ====================================================================== */}
      {/* == REPORTS TAB (HR/Admin) ======================================== */}
      {/* ====================================================================== */}
      {tab === 'reports' && isHRAdmin && (
        <>
          {/* -- Shared Filters (Summary only) ----------------------------------------- */}
          {reportSubTab === 'summary' && (
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
              {/* Employee Search */}
              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Search Employee</label>
                <div className="relative">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <input
                    type="text"
                    value={summSearch}
                    onChange={e => setSummSearch(e.target.value)}
                    placeholder="Search by name or email..."
                    className="w-full pl-8 pr-8 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-400"
                  />
                  {summSearch && (
                    <button
                      onClick={() => { setSummSearch('') }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition cursor-pointer border-0 bg-transparent"
                      title="Clear"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                  )}
                </div>
              </div>
              {/* Status */}
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
              {/* Actions */}
              <button onClick={resetReportFilters}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 text-sm font-medium rounded-lg transition cursor-pointer border border-gray-200 dark:border-gray-600">
                Reset
              </button>
            </div>
          )}

                    {/* -- SUMMARY SUB-TAB ---------------------------------------- */}
          {reportSubTab === 'summary' && (<>
            {(() => {
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
                    <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700">
                      <h3 className="text-sm font-bold text-gray-900 dark:text-white">Employee Attendance Summary</h3>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {summTotal === 0 ? 'No' : summTotal} employee{summTotal !== 1 ? 's' : ''} &middot; {fmtDate(dateFrom)} &ndash; {fmtDate(dateTo)}
                      </p>
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
                              <SortTh col="total_break_adjustment_minutes" label="Break Adj" align="center" />
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
                                <td className="px-4 py-3 text-center text-rose-600 dark:text-rose-400 whitespace-nowrap">{fmtBreak(s.total_break_adjustment_minutes)}</td>
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
                          onChange={e => { const newLimit = Number(e.target.value); setSummLimit(newLimit); setSummPage(1); loadSummary(1, newLimit) }}
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
          </>)}


          {/* -- TIMELINE SUB-TAB --------------------------------------- */}
          {reportSubTab === 'timeline' && (
            <>
              {/* Back to Summary */}
              <button
                onClick={() => setReportSubTab('summary')}
                className="mb-3 flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 font-medium transition cursor-pointer border-0 bg-transparent"
              >
                &larr; Back to Summary
              </button>
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
                  ) : (() => {
                    const tlTotal = timeline.length
                    const tlTotalPages = Math.max(1, Math.ceil(tlTotal / tlLimit))
                    const currentPage = Math.min(tlPage, tlTotalPages)
                    const paginatedTimeline = timeline.slice((currentPage - 1) * tlLimit, currentPage * tlLimit)
                    return (
                      <>
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
                          {paginatedTimeline.map((day, idx) => {
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

                        {/* Pagination footer */}
                        {tlTotalPages > 1 && (
                          <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30 flex flex-wrap items-center justify-between gap-3 mt-0">
                            <div className="flex items-center gap-3 flex-wrap">
                              <span className="text-xs text-gray-500">
                                Showing <span className="font-semibold text-gray-700 dark:text-gray-200">{Math.min((currentPage - 1) * tlLimit + 1, tlTotal)}</span>
                                {' '}to{' '}
                                <span className="font-semibold text-gray-700 dark:text-gray-200">{Math.min(currentPage * tlLimit, tlTotal)}</span>
                                {' '}of{' '}
                                <span className="font-semibold text-gray-700 dark:text-gray-200">{tlTotal}</span>
                              </span>
                              <select
                                value={tlLimit}
                                onChange={e => { setTlLimit(Number(e.target.value)); setTlPage(1) }}
                                className="px-2 py-1 border border-gray-300 dark:border-gray-500 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                              >
                                {[10, 15, 20, 30, 50].map(n => <option key={n} value={n}>{n}</option>)}
                              </select>
                            </div>
                            <div className="flex items-center gap-1 flex-wrap">
                              <button
                                onClick={() => { const p = Math.max(1, currentPage - 1); setTlPage(p) }}
                                disabled={currentPage <= 1}
                                className="w-8 h-8 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-700 transition cursor-pointer border-0"
                              >
                                &lsaquo;
                              </button>
                              {currentPage > 3 && tlTotalPages > 4 && (
                                <span className="px-1 text-gray-400 text-xs select-none">...</span>
                              )}
                              {(() => {
                                const start = Math.max(1, Math.min(tlTotalPages - 4, currentPage - 2))
                                const end = Math.min(tlTotalPages, start + 4)
                                return Array.from({ length: end - start + 1 }, (_, i) => start + i)
                              })().map(pageNum => (
                                <button
                                  key={pageNum}
                                  onClick={() => setTlPage(pageNum)}
                                  className={`min-w-[32px] h-8 flex items-center justify-center rounded-md text-xs font-medium transition cursor-pointer border-0 ${
                                    currentPage === pageNum
                                      ? 'bg-indigo-600 text-white shadow-sm'
                                      : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                                  }`}
                                >
                                  {pageNum}
                                </button>
                              ))}
                              {currentPage < tlTotalPages - 2 && tlTotalPages > 4 && (
                                <span className="px-1 text-gray-400 text-xs select-none">...</span>
                              )}
                              <button
                                onClick={() => { const p = Math.min(tlTotalPages, currentPage + 1); setTlPage(p) }}
                                disabled={currentPage >= tlTotalPages}
                                className="w-8 h-8 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-700 transition cursor-pointer border-0"
                              >
                                &rsaquo;
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    )
                  })()}
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* ====================================================================== */}
      {/* == BREAK ADJUSTMENTS TAB ========================================= */}
      {/* ====================================================================== */}
      {tab === 'adjustments' && isHRAdmin && (
        <div className="space-y-4">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">
              {isHRAdmin ? 'Break Adjustment Requests' : 'My Adjustments'}
            </h2>
          </div>

          {/* Stats cards */}
          <div className="flex gap-3 flex-wrap">
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-2 text-center">
              <div className="text-xl font-bold text-amber-600">{adjStats.pending_count}</div>
              <div className="text-xs text-amber-500">Pending</div>
            </div>
            <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl px-4 py-2 text-center">
              <div className="text-xl font-bold text-emerald-600">{adjStats.approved_today}</div>
              <div className="text-xs text-emerald-500">Approved Today</div>
            </div>
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-2 text-center">
              <div className="text-xl font-bold text-red-600">{adjStats.rejected_today}</div>
              <div className="text-xs text-red-500">Rejected Today</div>
            </div>
          </div>

          {/* Filter bar: Search → Status → Refresh */}
          <div className="flex flex-wrap justify-end gap-3 items-center">
            {/* Search field */}
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m21 21-4.35-4.35"/></svg>
              <input
                type="text"
                placeholder="Search..."
                value={adjSearch}
                onChange={e => { setAdjSearch(e.target.value); debouncedLoadAdjustments(e.target.value) }}
                className="w-full pl-9 pr-8 py-2.5 border border-gray-300 dark:border-gray-500 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder-gray-400"
              />
              {adjSearch && (
                <button
                  onClick={() => { setAdjSearch(''); setAdjPage(1); loadAdjustments(1, adjFilter, 10, '') }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition cursor-pointer border-0 bg-transparent"
                  title="Clear"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              )}
            </div>

            {/* Status */}
            <select
              value={adjFilter}
              onChange={e => { const val = e.target.value as '' | 'Pending' | 'Approved' | 'Rejected'; setAdjFilter(val); setAdjPage(1); loadAdjustments(1, val, 10, adjSearch) }}
              className="px-3 py-2.5 border border-gray-300 dark:border-gray-500 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="">All</option>
              <option value="Pending">Pending</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
            </select>

            {/* Refresh */}
            <button
              onClick={() => loadAdjustments(adjPage, adjFilter, 10, adjSearch)}
              disabled={adjLoading}
              className={`p-2 rounded-lg transition border-0 ${adjLoading ? 'text-gray-400 cursor-not-allowed bg-gray-100 dark:bg-gray-700' : 'text-gray-500 hover:text-indigo-600 dark:text-gray-400 dark:hover:text-indigo-400 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 cursor-pointer'}`}
              title="Refresh"
            >
              {adjLoading ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              )}
            </button>
          </div>

          {/* Table */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700/50">
                  <tr>
                    {isHRAdmin && <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Employee</th>}
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Break</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Adj. Mins</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Reason</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Reviewed By</th>
                    {isHRAdmin && <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {adjustments.length === 0 ? (
                    <tr><td colSpan={isHRAdmin ? 8 : 7} className="px-4 py-8 text-center text-gray-400 text-sm">No adjustment requests found.</td></tr>
                  ) : adjustments.map(r => (
                    <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                      {isHRAdmin && (
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900 dark:text-white text-xs">{r.employee.first_name} {r.employee.last_name}</div>
                          <div className="text-gray-400 text-xs">{r.employee.department_name || '—'}</div>
                        </td>
                      )}
                      <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-300">{fmtDate(r.attendance.date)}</td>
                      <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-300">
                        <div>{fmtTime(r.break.start_time)} → {fmtTime(r.break.end_time)}</div>
                        <div className="text-gray-400">({r.break.duration_minutes} min break)</div>
                      </td>
                      <td className="px-4 py-3">
                        {r.time_start && r.time_end ? (
                          <div>
                            <span className="font-bold text-indigo-600 text-xs">{fmtHHMM(r.time_start)}</span>
                            <span className="text-gray-400 text-xs mx-1">→</span>
                            <span className="font-bold text-indigo-600 text-xs">{fmtHHMM(r.time_end)}</span>
                            <div className="text-xs text-gray-400">+{r.requested_minutes} min</div>
                          </div>
                        ) : (
                          <span className="font-bold text-indigo-600 text-sm">+{r.requested_minutes} min</span>
                        )}
                      </td>
                      <td className="px-4 py-3 max-w-[200px]">
                        <p className="text-xs text-gray-600 dark:text-gray-300 truncate block" title={r.reason}>{r.reason}</p>
                      </td>
                      <td className="px-4 py-3">
                        {r.status === 'Pending' && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Pending</span>}
                        {r.status === 'Approved' && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">Approved</span>}
                        {r.status === 'Rejected' && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">Rejected</span>}
                        {r.admin_remarks && <p className="text-xs text-gray-400 mt-0.5 italic truncate block max-w-[160px]" title={r.admin_remarks}>"{r.admin_remarks}"</p>}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                        {r.reviewer ? `${r.reviewer.first_name} ${r.reviewer.last_name}` : '—'}
                        {r.reviewed_at && <div className="text-gray-400">{fmtDate(r.reviewed_at)}</div>}
                      </td>
                      {isHRAdmin && (
                        <td className="px-4 py-3 text-center">
                          {r.status === 'Pending' ? (
                            <div className="flex items-center justify-center gap-2">
                              <button onClick={() => { setReviewModal(r); setReviewAction('approve'); setReviewRemarks(''); setShowRequestModal(false) }}
                                className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition cursor-pointer border-0">
                                Approve
                              </button>
                              <button onClick={() => { setReviewModal(r); setReviewAction('reject'); setReviewRemarks(''); setShowRequestModal(false) }}
                                className="px-3 py-1.5 text-xs font-semibold bg-red-600 hover:bg-red-700 text-white rounded-lg transition cursor-pointer border-0">
                                Reject
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-300 dark:text-gray-600">—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {adjTotal > 0 && (
              <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30 flex flex-wrap items-center justify-between gap-3">
                {/* Left: results count + per-page */}
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs text-gray-500">
                    Showing <span className="font-semibold text-gray-700 dark:text-gray-200">{Math.min((adjPage - 1) * adjLimit + 1, adjTotal)}</span>
                    {' '}to{' '}
                    <span className="font-semibold text-gray-700 dark:text-gray-200">{Math.min(adjPage * adjLimit, adjTotal)}</span>
                    {' '}of{' '}
                    <span className="font-semibold text-gray-700 dark:text-gray-200">{adjTotal}</span>
                    {' '}results
                  </span>
                  <select
                    value={adjLimit}
                    onChange={e => { const l = Number(e.target.value); setAdjLimit(l); setAdjPage(1); loadAdjustments(1, adjFilter, l, adjSearch) }}
                    className="px-2 py-1 border border-gray-300 dark:border-gray-500 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                  >
                    {[10, 20, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>

                {/* Right: page number buttons */}
                <div className="flex items-center gap-1 flex-wrap">
                  <button
                    onClick={() => { const p = Math.max(1, adjPage - 1); setAdjPage(p); loadAdjustments(p, adjFilter, adjLimit, adjSearch) }}
                    disabled={adjPage <= 1}
                    className="w-8 h-8 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-700 transition cursor-pointer border-0"
                  >
                    ‹
                  </button>

                  {Array.from({ length: Math.ceil(adjTotal / adjLimit) }, (_, i) => i + 1).map(p => (
                    <button
                      key={p}
                      onClick={() => { setAdjPage(p); loadAdjustments(p, adjFilter, adjLimit, adjSearch) }}
                      className={`min-w-[32px] h-8 flex items-center justify-center rounded-md text-xs font-medium transition cursor-pointer border-0 ${
                        adjPage === p
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                    >
                      {p}
                    </button>
                  ))}

                  <button
                    onClick={() => { const p = Math.min(Math.ceil(adjTotal / adjLimit), adjPage + 1); setAdjPage(p); loadAdjustments(p, adjFilter, adjLimit, adjSearch) }}
                    disabled={adjPage >= Math.ceil(adjTotal / adjLimit)}
                    className="w-8 h-8 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-700 transition cursor-pointer border-0"
                  >
                    ›
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ====================================================================== */}
      {/* == REQUEST ADJUSTMENT MODAL (Employee) ============================== */}
      {/* ====================================================================== */}
      {showRequestModal && (
        <PortalModal>
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] bg-black/50 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg mx-4 my-[10vh]">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900 dark:text-white">Request Break Adjustment</h3>
              <button onClick={() => setShowRequestModal(false)} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 bg-transparent border-0 cursor-pointer text-2xl leading-none">×</button>
            </div>
            <div className="px-6 py-5 space-y-5">
              {/* Select Break */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Select Break</label>
                <div className="space-y-2">
                  {requestBreaks.filter(b => b.adjustable_minutes > 0).length === 0 && (
                    <p className="text-sm text-gray-400 italic">No adjustable breaks available.</p>
                  )}
                  {requestBreaks.filter(b => b.adjustable_minutes > 0).map(br => (
                    <div key={br.id}
                      onClick={() => {
                        setSelectedBreak(br)
                        // Convert company-local times from backend to browser-local for input display
                        setRequestStartTime(companyTimeToInputValue(br.time_start, requestCompanyTz))
                        setRequestEndTime(companyTimeToInputValue(br.time_end, requestCompanyTz))
                      }}
                      className={`p-3 rounded-xl border-2 cursor-pointer transition ${
                        selectedBreak?.id === br.id
                          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                          : 'border-gray-200 dark:border-gray-600 hover:border-indigo-300 dark:hover:border-indigo-600'
                      }`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-semibold text-gray-900 dark:text-white">
                            {fmtTime(br.start_time)} → {fmtTime(br.end_time)}
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5">Break: {br.duration_minutes} min</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-bold text-emerald-600">Up to {br.adjustable_minutes} min</div>
                          <div className="text-xs text-gray-400">adjustable</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Time Window */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Count This Time Window As Work</label>
                {selectedBreak ? (
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex-1 min-w-[120px]">
                      <label className="block text-xs text-gray-400 mb-1">Start time</label>
                      <input type="time"
                        min={selectedBreak.time_start}
                        max={requestEndTime || selectedBreak.time_end}
                        value={requestStartTime}
                        onChange={e => setRequestStartTime(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <span className="text-gray-400 text-sm mt-5">—</span>
                    <div className="flex-1 min-w-[120px]">
                      <label className="block text-xs text-gray-400 mb-1">End time</label>
                      <input type="time"
                        min={requestStartTime || selectedBreak.time_start}
                        max={selectedBreak.time_end}
                        value={requestEndTime}
                        onChange={e => setRequestEndTime(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic">Select a break to pick a time window</p>
                )}
                {selectedBreak && requestStartTime && requestEndTime && (
                  <p className="text-xs text-emerald-500 mt-1.5 font-medium">
                    = {Math.round((new Date(`2000-01-01T${requestEndTime}`).getTime() - new Date(`2000-01-01T${requestStartTime}`).getTime()) / 60000)} min
                    &nbsp;(break window: {fmtHHMM(selectedBreak.time_start)} – {fmtHHMM(selectedBreak.time_end)})
                  </p>
                )}
              </div>

              {/* Reason */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Reason</label>
                <textarea value={requestReason} onChange={e => setRequestReason(e.target.value)} rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  placeholder="Explain why this break should count as working time..."
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
              <button onClick={() => setShowRequestModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition cursor-pointer border border-gray-300 dark:border-gray-600 bg-transparent">
                Cancel
              </button>
              <button onClick={submitAdjustmentRequest} disabled={requesting}
                className="px-5 py-2 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition disabled:opacity-50 cursor-pointer border-0">
                {requesting ? 'Submitting...' : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
        </PortalModal>
      )}

      {/* ====================================================================== */}
      {/* == APPROVE/REJECT MODAL (Admin) ===================================== */}
      {/* ====================================================================== */}
      {reviewModal && (
        <PortalModal>
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] bg-black/50 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md mx-4 my-[10vh]">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900 dark:text-white">
                {reviewAction === 'approve' ? 'Approve' : 'Reject'} Adjustment
              </h3>
              <button onClick={() => setReviewModal(null)} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 bg-transparent border-0 cursor-pointer text-2xl leading-none">×</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Employee</span>
                  <span className="font-medium text-gray-900 dark:text-white">{reviewModal.employee.first_name} {reviewModal.employee.last_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Date</span>
                  <span className="font-medium text-gray-900 dark:text-white">{fmtDate(reviewModal.attendance.date)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Break</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {fmtTime(reviewModal.break.start_time)} → {fmtTime(reviewModal.break.end_time)} ({reviewModal.break.duration_minutes} min)
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Requested</span>
                  <span className="font-bold text-indigo-600">
                    {reviewModal.time_start && reviewModal.time_end
                      ? fmtHHMM(reviewModal.time_start) + ' – ' + fmtHHMM(reviewModal.time_end) + ' (+' + reviewModal.requested_minutes + ' min)'
                      : '+' + reviewModal.requested_minutes + ' min as work'
                    }
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-gray-500">Reason</span>
                  <span className="text-gray-700 dark:text-gray-300 italic">"{reviewModal.reason}"</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Remarks <span className="text-gray-400 text-xs font-normal">(optional)</span>
                </label>
                <textarea value={reviewRemarks} onChange={e => setReviewRemarks(e.target.value)} rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  placeholder="Optional remarks..."
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
              <button onClick={() => setReviewModal(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition cursor-pointer border border-gray-300 dark:border-gray-600 bg-transparent">
                Cancel
              </button>
              <button onClick={reviewAdjustment} disabled={reviewing || (reviewAction === 'reject' && !reviewRemarks.trim())}
                className={`px-5 py-2 text-sm font-semibold text-white rounded-lg transition disabled:opacity-50 cursor-pointer border-0 ${
                  reviewAction === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'
                }`}>
                {reviewing ? 'Processing...' : (reviewAction === 'approve' ? 'Confirm Approval' : 'Confirm Rejection')}
              </button>
            </div>
          </div>
        </div>
        </PortalModal>
      )}

      {/* -- Adjustment Detail Modal (Employee View) -------------------------- */}
      {adjDetailModal && (
        <PortalModal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between sticky top-0 bg-white dark:bg-gray-800 rounded-t-2xl z-10">
                <div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white">Adjustment Details</h3>
                  <p className="text-xs text-gray-400 mt-0.5">Date: {fmtDate(adjDetailModal.date)}</p>
                </div>
                <button onClick={() => setAdjDetailModal(null)}
                  className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 bg-transparent border-0 cursor-pointer text-2xl leading-none">
                  ×
                </button>
              </div>
              <div className="px-6 py-4 space-y-3">
                {adjDetailModal.adjustments.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">No adjustments found.</p>
                ) : adjDetailModal.adjustments.map((adj) => (
                  <div key={adj.id} className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                        adj.status === 'Approved' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                        adj.status === 'Rejected' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                        'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                      }`}>
                        {adj.status}
                      </span>
                      <span className="text-xs text-gray-400">+{adj.requested_minutes} min</span>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-start gap-2">
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 w-24 shrink-0">Requested Time:</span>
                        <span className="text-xs text-gray-700 dark:text-gray-200">{fmtHHMM(adj.time_start)} → {fmtHHMM(adj.time_end)}</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 w-24 shrink-0">Break:</span>
                        <span className="text-xs text-gray-700 dark:text-gray-200">{fmtHHMM(adj.break_time_start)} → {fmtHHMM(adj.break_time_end)} ({adj.break_duration} min)</span>
                      </div>
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-300 italic">"{adj.reason}"</p>
                    {adj.status === 'Rejected' && adj.admin_remarks && (
                      <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg p-2">
                        <p className="text-xs text-red-600 dark:text-red-400 italic">
                          <span className="font-semibold not-italic">Rejection reason: </span>{adj.admin_remarks}
                        </p>
                      </div>
                    )}
                    {adj.created_at && (
                      <p className="text-xs text-gray-400">Requested on {fmtDate(adj.created_at)}</p>
                    )}
                    {adj.reviewed_at && (
                      <p className="text-xs text-gray-400">
                        {adj.status === 'Approved' ? 'Approved' : adj.status === 'Rejected' ? 'Rejected' : 'Reviewed'} on {fmtDate(adj.reviewed_at)}
                        {adj.reviewer && <> by {adj.reviewer.first_name} {adj.reviewer.last_name}</>}
                      </p>
                    )}
                  </div>
                ))}
              </div>
              <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end sticky bottom-0 bg-white dark:bg-gray-800 rounded-b-2xl z-10">
                <button onClick={() => setAdjDetailModal(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition cursor-pointer border border-gray-300 dark:border-gray-600 bg-transparent">
                  Close
                </button>
              </div>
            </div>
          </div>
        </PortalModal>
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
