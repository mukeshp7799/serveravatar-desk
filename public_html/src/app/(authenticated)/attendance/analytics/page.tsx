'use client'
import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import PortalModal from '@/components/PortalModal';
import api from '@/lib/api'
import PageLoader from '@/components/PageLoader'
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import {
  Calendar, ChevronLeft, ChevronRight, Clock, Edit2,
  Eye, LogIn, LogOut, Coffee, Users, AlertTriangle,
  CheckCircle, X, Coffee as CoffeeIcon, Sun, Moon, Gift,
  Briefcase, Globe, ArrowRight
} from 'lucide-react'

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function fmtShortDate(raw: string | null | undefined): string {
  if (!raw) return '—'
  const s = String(raw).trim()
  const [y, m, d] = s.includes('T') ? s.split('T')[0].split('-') : s.split('-')
  return `${m}/${d}`
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

function isDarkTheme() {
  return document.documentElement.classList.contains('dark') ||
    document.documentElement.getAttribute('data-theme') === 'dark'
}

function ThemeTooltip({ active, payload, label }: any) {
  const [dark, setDark] = useState(false)
  useEffect(() => {
    const observer = new MutationObserver(() => setDark(isDarkTheme()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    setDark(isDarkTheme())
    return () => observer.disconnect()
  }, [])

  if (!active || !payload || !payload.length) return null

  const bg = dark ? '#1f2937' : '#ffffff'
  const border = dark ? '#374151' : '#e5e7eb'
  const text = dark ? '#f9fafb' : '#111827'
  const sub = dark ? '#9ca3af' : '#6b7280'
  const shadow = dark ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.15)'

  return (
    <div style={{
      backgroundColor: bg, border: `1px solid ${border}`, borderRadius: 10,
      padding: '8px 12px', boxShadow: `0 4px 12px ${shadow}`,
      fontSize: 12, color: text, minWidth: 120,
    }}>
      {label && (
        <div style={{ color: sub, fontSize: 11, fontWeight: 600, marginBottom: 4 }}>
          {label}
        </div>
      )}
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: p.color || p.fill }} />
          <span style={{ color: sub }}>{p.name}:</span>
          <span style={{ fontWeight: 700 }}>{p.value}</span>
        </div>
      ))}
    </div>
  )
}

function legendStyle() {
  return { fontSize: 11, color: isDarkTheme() ? '#9ca3af' : '#6b7280', fontFamily: 'inherit' }
}

const PIE_COLORS = ['#22c55e', '#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899']

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const STATUS_META: Record<string, { label: string; color: string; bg: string; textColor: string }> = {
  present:  { label: 'Present',      color: 'text-emerald-600',   bg: 'bg-emerald-50',    textColor: 'border-emerald-200' },
  absent:   { label: 'Absent',       color: 'text-gray-500',     bg: 'bg-gray-100',      textColor: 'border-gray-200' },
  leave:    { label: 'Leave',        color: 'text-blue-600',      bg: 'bg-blue-50',       textColor: 'border-blue-200' },
  holiday:  { label: 'Holiday',      color: 'text-purple-600',    bg: 'bg-purple-50',     textColor: 'border-purple-200' },
  weekend:  { label: 'Weekend',      color: 'text-amber-600',     bg: 'bg-amber-50',      textColor: 'border-amber-200' },
}

const ATT_STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  absent:     { label: 'Absent',     color: 'text-gray-500',   bg: 'bg-gray-100' },
  clocked_in: { label: 'Clocked In', color: 'text-sky-600',   bg: 'bg-sky-50' },
  working:    { label: 'Working',    color: 'text-emerald-600', bg: 'bg-emerald-50' },
  on_break:   { label: 'On Break',   color: 'text-amber-600',  bg: 'bg-amber-50' },
  completed:  { label: 'Completed',  color: 'text-indigo-600', bg: 'bg-indigo-50' },
}

// ─── Types ─────────────────────────────────────────────────────────────────────

type Tab = 'summary' | 'timeline'

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

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, color, icon: Icon, sub }: {
  label: string; value: string | number; color: string; icon: any; sub?: string
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
        <Icon size={22} />
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-bold text-gray-900 dark:text-white truncate">{value}</div>
        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{label}</div>
        {sub && <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{sub}</div>}
      </div>
    </div>
  )
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────

function EditModal({ day, onClose, onSave }: {
  day: TimelineDay; onClose: () => void; onSave: () => void
}) {
  const { t } = useTranslation()
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState(day.raw_status || day.status === 'present' ? 'completed' : 'absent')
  const [clockIn, setClockIn] = useState(day.clock_in_time ? fmtDateTimeLocal(day.clock_in_time) : '')
  const [clockOut, setClockOut] = useState(day.clock_out_time ? fmtDateTimeLocal(day.clock_out_time) : '')
  const [remarks, setRemarks] = useState(day.remarks || '')
  const [breaks, setBreaks] = useState<Break[]>(day.breaks)
  const [newBreakStart, setNewBreakStart] = useState('')
  const [newBreakEnd, setNewBreakEnd] = useState('')

  function fmtDateTimeLocal(raw: string): string {
    if (!raw) return ''
    const d = new Date(raw)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  async function handleSave() {
    setSaving(true)
    try {
      // Update attendance record
      const attId = day.attendance_id
      if (attId) {
        await api.put(`/attendance/${attId}`, {
          status,
          clock_in_time: clockIn ? new Date(clockIn).toISOString() : null,
          clock_out_time: clockOut ? new Date(clockOut).toISOString() : null,
          remarks: remarks || null,
        })
      } else {
        // Need to create attendance record for this date
        toast.error('No attendance record to edit for this day')
        setSaving(false)
        return
      }

      // Sync breaks
      for (const b of breaks) {
        await api.put(`/attendance/${attId}/breaks/${b.id}`, {
          start_time: b.start_time,
          end_time: b.end_time,
        })
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center p-5 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 rounded-t-2xl">
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white">Edit Attendance</h2>
            <p className="text-xs text-gray-500 mt-0.5">{fmtDate(day.date)} — {DAY_LABELS[day.day_of_week]}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-2xl leading-none bg-transparent border-0 cursor-pointer">×</button>
        </div>

        <div className="p-5 space-y-4">
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
                  <Clock size={13} className="text-gray-400 shrink-0" />
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
                placeholder="Start"
                className="flex-1 px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500" />
              <input type="datetime-local" value={newBreakEnd} onChange={e => setNewBreakEnd(e.target.value)}
                placeholder="End (optional)"
                className="flex-1 px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500" />
              <button onClick={handleAddBreak} disabled={!newBreakStart || saving}
                className="px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50 cursor-pointer border-0">
                + Add
              </button>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
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
    </div>
    </PortalModal>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AttendanceAnalyticsPage() {
  const { t } = useTranslation()
  const user = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('user') || '{}') : {}
  const perms: string[] = Array.isArray(user.permissions) ? user.permissions : []
  const isAdmin = perms.includes('attendance.manage_all')

  const [tab, setTab] = useState<Tab>('summary')
  const [loading, setLoading] = useState(true)

  // Shared filters
  const today = new Date()
  const y = today.getFullYear(), m = today.getMonth()
  const defaultFrom = new Date(y, m, 1).toISOString().slice(0, 10)
  const defaultTo = new Date(y, m + 1, 0).toISOString().slice(0, 10)
  const [dateFrom, setDateFrom] = useState(defaultFrom)
  const [dateTo, setDateTo] = useState(defaultTo)
  const [selDept, setSelDept] = useState('')
  const [selEmp, setSelEmp] = useState('')
  const [selStatus, setSelStatus] = useState('')

  // Timeline: selected employee for drill-down
  const [tlUserId, setTlUserId] = useState<string>('')
  const [tlEmpName, setTlEmpName] = useState('')

  // Summary data
  const [summaries, setSummaries] = useState<Summary[]>([])
  const [charts, setCharts] = useState<any>({})

  // Timeline data
  const [timeline, setTimeline] = useState<TimelineDay[]>([])
  const [tlEmpInfo, setTlEmpInfo] = useState<any>(null)

  // Lookups
  const [departments, setDepartments] = useState<any[]>([])
  const [employees, setEmployees] = useState<any[]>([])

  // Edit modal
  const [editDay, setEditDay] = useState<TimelineDay | null>(null)

  // Load lookups
  useEffect(() => {
    Promise.all([
      api.get('/departments').catch(() => ({ departments: [] })),
      api.get('/employees').catch(() => ({ employees: [] })),
    ]).then(([d, e]) => {
      setDepartments(d.departments || [])
      setEmployees(e.employees || e.records || [])
    })
  }, [])

  // Load summary data
  const loadSummary = useCallback(async () => {
    if (!dateFrom || !dateTo) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo })
      if (selDept) params.set('department_id', selDept)
      if (selEmp) params.set('user_id', selEmp)
      if (selStatus) params.set('status', selStatus)
      const r = await api.get(`/attendance/analytics/summary?${params.toString()}`)
      setSummaries(r.summaries || [])
      setCharts(r.charts || {})
    } catch (err: any) {
      toast.error(err.message || 'Failed to load analytics')
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo, selDept, selEmp, selStatus])

  useEffect(() => { loadSummary() }, [loadSummary])

  // Load timeline
  const loadTimeline = useCallback(async (empId: string) => {
    if (!empId || !dateFrom || !dateTo) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ user_id: empId, date_from: dateFrom, date_to: dateTo })
      const r = await api.get(`/attendance/analytics/timeline?${params.toString()}`)
      setTimeline(r.timeline || [])
      setTlEmpInfo(r.employee || null)
    } catch (err: any) {
      toast.error(err.message || 'Failed to load timeline')
    } finally {
      setLoading(false)
    }
  }, [tlUserId, dateFrom, dateTo])

  // When switching to timeline tab, load for selected employee or first summary row
  useEffect(() => {
    if (tab === 'timeline') {
      if (tlUserId) {
        loadTimeline(tlUserId)
      } else if (summaries.length > 0 && selEmp) {
        const emp = summaries.find(s => String(s.user_id) === String(selEmp))
        if (emp) {
          setTlEmpName(`${emp.first_name} ${emp.last_name}`)
          loadTimeline(String(emp.user_id))
        }
      }
    }
  }, [tab, tlUserId, dateFrom, dateTo])

  // View Timeline action from summary table
  function viewTimeline(emp: Summary) {
    setTlUserId(String(emp.user_id))
    setTlEmpName(`${emp.first_name} ${emp.last_name}`)
    setTab('timeline')
  }

  // Handle filter changes
  function applyFilters() {
    if (tab === 'summary') loadSummary()
    else if (tlUserId) loadTimeline(tlUserId)
  }

  function resetFilters() {
    setSelDept(''); setSelEmp(''); setSelStatus('')
    setTlUserId(''); setTlEmpName('')
  }

  // Totals for KPI row
  const totals = summaries.reduce((acc, s) => ({
    total_days: acc.total_days + s.total_days,
    working_days: acc.working_days + s.working_days,
    present_days: acc.present_days + s.present_days,
    absent_days: acc.absent_days + s.absent_days,
    late_checkins: acc.late_checkins + s.late_checkins,
    approved_leave_days: acc.approved_leave_days + s.approved_leave_days,
    weekends: acc.weekends + s.weekends,
    company_holidays: acc.company_holidays + s.company_holidays,
    total_working_hours: acc.total_working_hours + s.total_working_hours,
    total_break_minutes: acc.total_break_minutes + s.total_break_minutes,
  }), {
    total_days: 0, working_days: 0, present_days: 0, absent_days: 0,
    late_checkins: 0, approved_leave_days: 0, weekends: 0,
    company_holidays: 0, total_working_hours: 0, total_break_minutes: 0,
  })

  const totalAvgWH = summaries.length > 0
    ? summaries.reduce((a, s) => a + s.average_working_hours, 0) / summaries.length
    : 0

  // ── KPI Cards ──────────────────────────────────────────────────────────────
  const kpiCards = [
    { label: 'Total Days', value: totals.total_days, color: 'bg-sky-50 text-sky-600 dark:bg-sky-900/30 dark:text-sky-400', icon: Calendar },
    { label: 'Working Days', value: totals.working_days, color: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400', icon: Briefcase },
    { label: 'Present', value: totals.present_days, color: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400', icon: CheckCircle },
    { label: 'Absent', value: totals.absent_days, color: 'bg-red-50 text-red-500 dark:bg-red-900/30 dark:text-red-400', icon: X },
    { label: 'Approved Leave', value: totals.approved_leave_days, color: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400', icon: Gift },
    { label: 'Late Check-ins', value: totals.late_checkins, color: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400', icon: AlertTriangle },
    { label: 'Weekends', value: totals.weekends, color: 'bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400', icon: Moon },
    { label: 'Company Holidays', value: totals.company_holidays, color: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400', icon: Globe },
    { label: 'Total Working Hrs', value: fmtHours(totals.total_working_hours), color: 'bg-teal-50 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400', icon: Clock },
    { label: 'Total Break', value: fmtBreak(totals.total_break_minutes), color: 'bg-orange-50 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400', icon: CoffeeIcon },
    { label: 'Avg Working Hrs', value: fmtHours(totalAvgWH), color: 'bg-cyan-50 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400', icon: Sun },
  ]

  // Chart: Attendance Trend
  const trendData = (charts.trend || []).map((d: any) => ({
    ...d,
    date: fmtShortDate(d.date),
  }))

  // Chart: Present vs Absent
  const pvaData = charts.present_vs_absent || []

  // Chart: Department-wise
  const deptData = charts.department_wise || []

  // Chart: Late Trend
  const lateData = (charts.late_trend || []).map((d: any) => ({
    ...d,
    date: fmtShortDate(d.date),
  }))

  // Timeline employee selector
  function handleTimelineEmpChange(empId: string) {
    setTlUserId(empId)
    const emp = summaries.find(s => String(s.user_id) === String(empId))
    setTlEmpName(emp ? `${emp.first_name} ${emp.last_name}` : '')
    if (empId) loadTimeline(empId)
  }

  // Summary table
  function SummaryTable() {
    if (summaries.length === 0) {
      return (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500 text-sm">
          No data for the selected filters.
        </div>
      )
    }
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-700/50">
            <tr>
              {['Employee', 'Department', 'Working Days', 'Present', 'Absent', 'Leave', 'Late', 'Avg Hrs', 'Action'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {summaries.map(s => (
              <tr key={s.user_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900 dark:text-white whitespace-nowrap">{s.first_name} {s.last_name}</div>
                  <div className="text-xs text-gray-400">{s.email}</div>
                </td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">{s.department_name || '—'}</td>
                <td className="px-4 py-3 text-center font-semibold text-gray-900 dark:text-white whitespace-nowrap">{s.working_days}</td>
                <td className="px-4 py-3 text-center"><span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">{s.present_days}</span></td>
                <td className="px-4 py-3 text-center"><span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-500 dark:bg-red-900/30 dark:text-red-400">{s.absent_days}</span></td>
                <td className="px-4 py-3 text-center"><span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">{s.approved_leave_days}</span></td>
                <td className="px-4 py-3 text-center"><span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">{s.late_checkins}</span></td>
                <td className="px-4 py-3 text-center text-indigo-600 dark:text-indigo-400 font-semibold whitespace-nowrap">{fmtHours(s.average_working_hours)}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <button
                    onClick={() => viewTimeline(s)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-indigo-50 hover:bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400 dark:hover:bg-indigo-900/50 rounded-lg transition cursor-pointer border-0">
                    <Eye size={12} /> Timeline
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  // Timeline grid
  function TimelineGrid() {
    if (!tlUserId) {
      return (
        <div className="text-center py-16 text-gray-400 dark:text-gray-500">
          <Clock size={40} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">Select an employee from the Summary tab or dropdown above to view their timeline.</p>
        </div>
      )
    }
    if (timeline.length === 0) {
      return <PageLoader />
    }

    // Group into weeks
    const weeks: TimelineDay[][] = []
    let cur: TimelineDay[] = []
    for (const day of timeline) {
      if (cur.length > 0 && day.day_of_week === 0) {
        weeks.push(cur); cur = []
      }
      cur.push(day)
    }
    if (cur.length) weeks.push(cur)

    return (
      <div className="space-y-4">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {week.map(day => {
              const meta = STATUS_META[day.status] || STATUS_META.absent
              const isEditable = day.attendance_id != null && isAdmin
              return (
                <div key={day.date} className={`rounded-xl border ${meta.textColor} dark:border-gray-600 ${meta.bg} dark:bg-gray-800 p-4 relative`}>
                  {/* Date header */}
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="text-xs text-gray-400 dark:text-gray-500">{DAY_LABELS[day.day_of_week]}, {fmtDate(day.date)}</div>
                      {day.holiday_name && (
                        <div className="text-xs font-semibold text-purple-600 dark:text-purple-400 mt-0.5">🎉 {day.holiday_name}</div>
                      )}
                      {day.leave_reason && (
                        <div className="text-xs text-blue-500 dark:text-blue-400 mt-0.5">🏖️ {day.leave_reason}</div>
                      )}
                    </div>
                    <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${meta.bg} ${meta.color} border-0`}>
                      {meta.label}
                    </span>
                  </div>

                  {/* Times */}
                  {(day.status === 'present') && (
                    <div className="space-y-1.5 mb-3">
                      <div className="flex items-center gap-2 text-xs">
                        <LogIn size={11} className="text-emerald-500 shrink-0" />
                        <span className="text-gray-600 dark:text-gray-300 font-medium">{fmtTime(day.clock_in_time)}</span>
                        {day.is_late && <span className="text-[10px] text-red-500 font-semibold">+{day.late_minutes}m late</span>}
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <LogOut size={11} className="text-indigo-500 shrink-0" />
                        <span className="text-gray-600 dark:text-gray-300 font-medium">{fmtTime(day.clock_out_time)}</span>
                      </div>
                      {day.breaks.length > 0 && (
                        <div className="flex items-start gap-2 text-xs pl-0.5">
                          <CoffeeIcon size={11} className="text-amber-500 shrink-0 mt-0.5" />
                          <div className="space-y-0.5">
                            {day.breaks.map(br => (
                              <div key={br.id} className="text-gray-500 dark:text-gray-400">
                                {fmtTime(br.start_time)}→{br.end_time ? fmtTime(br.end_time) : '...'}
                                <span className="ml-1 text-amber-600">({fmtBreak(br.duration_minutes)})</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Working Hours */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {day.working_hours != null ? fmtHours(day.working_hours) : '—'}
                    </span>
                    {isEditable && (
                      <button onClick={() => setEditDay(day)}
                        className="p-1 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-md hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition cursor-pointer bg-transparent border-0">
                        <Edit2 size={13} />
                      </button>
                    )}
                  </div>
                  {day.remarks && (
                    <div className="mt-2 text-xs text-gray-400 dark:text-gray-500 italic border-t border-gray-200 dark:border-gray-700 pt-2">
                      {day.remarks}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    )
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'summary', label: 'Summary' },
    { key: 'timeline', label: 'Timeline' },
  ]

  return (
    <div className="w-full px-4 py-6 space-y-5 animate-fade-in-up">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => window.history.back()}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition cursor-pointer bg-transparent border-0">
            <ChevronLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Attendance Analytics</h1>
            <p className="text-xs text-gray-500 mt-0.5">Employee attendance summaries, timelines, and management</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Calendar size={14} />
          <span>{fmtDate(dateFrom)} — {fmtDate(dateTo)}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-700/50 rounded-xl p-1 w-fit">
        {tabs.map(tb => (
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

      {/* ── Shared Filters ──────────────────────────────────────────────── */}
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
            {tab === 'timeline' ? 'Employee (Timeline)' : 'Employee'}
          </label>
          {tab === 'timeline' ? (
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
        {tab === 'summary' && (
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
        <button onClick={applyFilters}
          className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition cursor-pointer border-0">
          Apply
        </button>
        <button onClick={resetFilters}
          className="px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 text-sm font-medium rounded-lg transition cursor-pointer border border-gray-200 dark:border-gray-600">
          Reset
        </button>
      </div>

      {loading ? <PageLoader /> : (
        <>
          {/* ── SUMMARY TAB ─────────────────────────────────────────────── */}
          {tab === 'summary' && (
            <>
              {/* KPI Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {kpiCards.map(card => (
                  <KpiCard key={card.label} {...card} />
                ))}
              </div>

              {/* Charts Row 1: Trend + Present vs Absent + Dept */}
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                {/* Attendance Trend */}
                <div className="xl:col-span-2 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Attendance Trend</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={trendData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={isDarkTheme() ? '#374151' : '#e5e7eb'} />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: isDarkTheme() ? '#9ca3af' : '#6b7280' }} />
                      <YAxis tick={{ fontSize: 10, fill: isDarkTheme() ? '#9ca3af' : '#6b7280' }} />
                      <Tooltip content={<ThemeTooltip />} />
                      <Legend wrapperStyle={legendStyle()} />
                      <Bar dataKey="present" name="Present" fill="#22c55e" radius={[3,3,0,0]} />
                      <Bar dataKey="absent" name="Absent" fill="#ef4444" radius={[3,3,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Present vs Absent */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Present vs Absent</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={pvaData} cx="50%" cy="50%" innerRadius={50} outerRadius={80}
                        dataKey="value" nameKey="name" paddingAngle={3}>
                        {pvaData.map((_: any, i: number) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<ThemeTooltip />} />
                      <Legend wrapperStyle={legendStyle()} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Charts Row 2: Department-wise + Late Trend */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {/* Department-wise */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Department-wise Attendance</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={deptData} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={isDarkTheme() ? '#374151' : '#e5e7eb'} />
                      <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: isDarkTheme() ? '#9ca3af' : '#6b7280' }} />
                      <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: isDarkTheme() ? '#9ca3af' : '#6b7280' }} width={100} />
                      <Tooltip content={<ThemeTooltip />} formatter={(v: number) => [`${v}%`, 'Attendance Rate']} />
                      <Bar dataKey="attendance_rate" name="Attendance Rate" fill="#3b82f6" radius={[0,4,4,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Late Check-in Trend */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Late Check-in Trend</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={lateData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={isDarkTheme() ? '#374151' : '#e5e7eb'} />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: isDarkTheme() ? '#9ca3af' : '#6b7280' }} />
                      <YAxis tick={{ fontSize: 10, fill: isDarkTheme() ? '#9ca3af' : '#6b7280' }} />
                      <Tooltip content={<ThemeTooltip />} />
                      <Legend wrapperStyle={legendStyle()} />
                      <Line type="monotone" dataKey="count" name="Late Count" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Summary Table */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white">Employee Attendance Summary</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{summaries.length} employee{summaries.length !== 1 ? 's' : ''} • {fmtDate(dateFrom)} – {fmtDate(dateTo)}</p>
                </div>
                <SummaryTable />
              </div>
            </>
          )}

          {/* ── TIMELINE TAB ─────────────────────────────────────────────── */}
          {tab === 'timeline' && (
            <>
              {tlEmpInfo && (
                <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl border border-indigo-100 dark:border-indigo-800 p-4 flex items-center justify-between">
                  <div>
                    <div className="text-base font-bold text-indigo-700 dark:text-indigo-300">
                      {tlEmpInfo.first_name} {tlEmpInfo.last_name}
                    </div>
                    <div className="text-xs text-indigo-500 dark:text-indigo-400 mt-0.5">
                      {tlEmpInfo.department_name || 'No Department'} • {tlEmpInfo.email}
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
                  {isAdmin && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
                      <Edit2 size={11} /> Admin edit mode
                    </p>
                  )}
                </div>
                <div className="p-4">
                  <TimelineGrid />
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* Edit Modal */}
      {editDay && (
        <EditModal day={editDay} onClose={() => setEditDay(null)} onSave={() => {
          if (tlUserId) loadTimeline(tlUserId)
        }} />
      )}
    </div>
  )
}
