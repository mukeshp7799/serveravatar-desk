'use client'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import {
  Building2, Clock, Fingerprint, Palmtree, Save, RefreshCw,
  Globe, Calendar, Timer,
} from 'lucide-react'
import TimezoneSelect from 'react-timezone-select'
import api from '@/lib/api'
import Tabs from '@/components/Tabs'
import { useTheme } from '@/components/ThemeProvider'

// ── Types ─────────────────────────────────────────────────────────────────────

type WorkingDays = ('mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun')[]

type CompanySettings = {
  general: {
    company_name: string
    company_logo: string | null
    timezone: string
    date_format: string
    time_format: '12h' | '24h'
  }
  working_schedule: {
    working_days: WorkingDays
    office_start_time: string
    office_end_time: string
    required_working_hours: number
    late_checkin_grace_minutes: number
    default_break_duration_minutes: number
    allow_multiple_breaks: boolean
  }
  attendance: {
    allow_early_clock_in: boolean
    allow_late_clock_out: boolean
    require_clock_out: boolean
    auto_close_attendance: boolean
    auto_mark_absent: boolean
  }
  leave: {
    allow_half_day_leave: boolean
    half_day_session: 'first_half' | 'second_half'
    minimum_leave_notice_days: number
    allow_backdated_leave: boolean
    max_consecutive_leave_days: number
    allow_leave_on_weekends: boolean
    allow_leave_on_company_holidays: boolean
    require_leave_approval: boolean
  }
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const inputCls = `w-full border-2 border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-4 focus:border-indigo-500 focus:ring-indigo-100 transition-all bg-white dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500`
const selectCls = `w-full border-2 border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-4 focus:border-indigo-500 focus:ring-indigo-100 transition-all bg-white dark:bg-gray-800 dark:text-gray-100 cursor-pointer`
const labelCls = 'block text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider'
const cardCls = 'bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800'
const sectionTitleCls = 'flex items-center gap-2.5 text-sm font-bold text-gray-800 dark:text-gray-100 pb-3 mb-4 border-b border-gray-100 dark:border-gray-800'
const toggleOnCls = 'relative inline-flex h-7 w-12 items-center rounded-full transition-colors cursor-pointer border-2 bg-indigo-600 border-indigo-600'
const toggleOffCls = 'relative inline-flex h-7 w-12 items-center rounded-full transition-colors cursor-pointer border-2 bg-gray-300 dark:bg-gray-600 border-gray-200 dark:border-gray-600'
const thumbOnCls = 'inline-block h-4 w-4 transform rounded-full bg-white shadow translate-x-6'
const thumbOffCls = 'inline-block h-4 w-4 transform rounded-full bg-white shadow translate-x-1'

// ── react-timezone-select theme-aware styles ───────────────────────────────────
function getTzSelectStyles(isDark: boolean) {
  const bg = isDark ? '#1f2937' : '#ffffff'
  const bgHover = isDark ? '#374151' : '#f3f4f6'
  const bgSelected = '#6366f1'
  const text = isDark ? '#f9fafb' : '#111827'
  const textMuted = isDark ? '#9ca3af' : '#9ca3af'
  const border = isDark ? '#374151' : '#e5e7eb'
  const borderFocus = '#6366f1'
  const menuShadow = isDark ? '0 10px 40px rgba(0,0,0,0.6)' : '0 10px 40px rgba(0,0,0,0.12)'

  return {
    container: (provided: any) => ({ ...provided, width: '100%' }),
    control: (provided: any, state: any) => ({
      ...provided,
      borderRadius: '0.75rem',
      border: `2px solid ${state.isFocused ? borderFocus : border}`,
      boxShadow: state.isFocused ? '0 0 0 4px #eef2ff' : 'none',
      backgroundColor: bg,
      color: text,
      fontSize: '0.875rem',
      padding: '2px 4px',
      minHeight: '46px',
      cursor: 'pointer',
      transition: 'border-color 0.15s, box-shadow 0.15s',
    }),
    input: (provided: any) => ({ ...provided, color: text }),
    singleValue: (provided: any) => ({ ...provided, color: text }),
    placeholder: (provided: any) => ({ ...provided, color: textMuted }),
    menuPortal: (provided: any) => ({ ...provided, zIndex: 9999 }),
    dropdownIndicator: (provided: any) => ({ ...provided, color: textMuted, '&:hover': { color: text } }),
    indicatorSeparator: (provided: any) => ({ ...provided, backgroundColor: border }),
    menu: (provided: any) => ({
      ...provided,
      borderRadius: '0.75rem',
      border: `1px solid ${border}`,
      boxShadow: menuShadow,
      backgroundColor: bg,
      overflow: 'hidden',
      zIndex: 9999,
    }),
    option: (provided: any, state: any) => ({
      ...provided,
      backgroundColor: state.isSelected ? bgSelected : state.isFocused ? bgHover : bg,
      color: state.isSelected ? '#ffffff' : text,
      fontSize: '0.875rem',
      cursor: 'pointer',
      padding: '8px 12px',
    }),
    menuList: (provided: any) => ({
      ...provided,
      padding: '4px',
      backgroundColor: bg,
    }),
  }
}

// ── Toggle Component ───────────────────────────────────────────────────────────
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={checked ? toggleOnCls : toggleOffCls}
    >
      <span className={checked ? thumbOnCls : thumbOffCls} />
    </button>
  )
}

// ── Toggle Row ─────────────────────────────────────────────────────────────────
function ToggleRow({
  label, description, checked, onChange, indent = false
}: {
  label: string
  description?: string
  checked: boolean
  onChange: (v: boolean) => void
  indent?: boolean
}) {
  return (
    <div className={`flex items-center justify-between py-3 ${indent ? 'pl-4 border-l-2 border-gray-100 dark:border-gray-700' : ''}`}>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-gray-800">{label}</div>
        {description && <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</div>}
      </div>
      <div className="ml-4 shrink-0">
        <Toggle checked={checked} onChange={onChange} />
      </div>
    </div>
  )
}

// ── Weekday Selector ────────────────────────────────────────────────────────────
const WEEKDAYS: { key: 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'; label: string }[] = [
  { key: 'mon', label: 'Mon' },
  { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
  { key: 'sat', label: 'Sat' },
  { key: 'sun', label: 'Sun' },
]

function WeekdaySelector({ value, onChange }: { value: WorkingDays; onChange: (v: WorkingDays) => void }) {
  const toggle = (day: 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun') => {
    if (value.includes(day)) {
      if (value.length > 1) onChange(value.filter(d => d !== day))
    } else {
      onChange([...value, day].sort((a, b) =>
        ['mon','tue','wed','thu','fri','sat','sun'].indexOf(a) - ['mon','tue','wed','thu','fri','sat','sun'].indexOf(b)
      ))
    }
  }
  return (
    <div className="flex flex-wrap gap-2">
      {WEEKDAYS.map(d => {
        const active = value.includes(d.key)
        return (
          <button
            key={d.key}
            type="button"
            onClick={() => toggle(d.key)}
            className={`w-12 h-10 rounded-xl text-xs font-bold transition-all cursor-pointer border-2 ${
              active
                ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-indigo-300'
            }`}
          >
            {d.label}
          </button>
        )
      })}
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function CompanySettingsPage() {
  const { t } = useTranslation()
  const { resolvedTheme } = useTheme()
  const [activeTab, setActiveTab] = useState<'general' | 'working_schedule' | 'attendance' | 'leave'>('general')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  const [settings, setSettings] = useState<CompanySettings>({
    general: { company_name: '', company_logo: null, timezone: 'Asia/Kolkata', date_format: 'DD/MM/YYYY', time_format: '12h' },
    working_schedule: {
      working_days: ['mon', 'tue', 'wed', 'thu', 'fri'],
      office_start_time: '09:30',
      office_end_time: '18:30',
      required_working_hours: 8,
      late_checkin_grace_minutes: 30,
      default_break_duration_minutes: 60,
      allow_multiple_breaks: false,
    },
    attendance: {
      allow_early_clock_in: true,
      allow_late_clock_out: true,
      require_clock_out: true,
      auto_close_attendance: false,
      auto_mark_absent: true,
    },
    leave: {
      allow_half_day_leave: true,
      half_day_session: 'first_half',
      minimum_leave_notice_days: 1,
      allow_backdated_leave: false,
      max_consecutive_leave_days: 10,
      allow_leave_on_weekends: false,
      allow_leave_on_company_holidays: false,
      require_leave_approval: true,
    },
  })

  const [original, setOriginal] = useState<CompanySettings | null>(null)

  // Load settings on mount
  useEffect(() => {
    api.get('/company-settings').then((data: any) => {
      const s = data?.settings || {}
      setSettings({
        general: {
          company_name: s.general?.company_name || '',
          company_logo: s.general?.company_logo || null,
          timezone: s.general?.timezone || 'Asia/Kolkata',
          date_format: s.general?.date_format || 'DD/MM/YYYY',
          time_format: s.general?.time_format || '12h',
        },
        working_schedule: {
          working_days: s.working_schedule?.working_days || ['mon', 'tue', 'wed', 'thu', 'fri'],
          office_start_time: s.working_schedule?.office_start_time || '09:30',
          office_end_time: s.working_schedule?.office_end_time || '18:30',
          required_working_hours: Number(s.working_schedule?.required_working_hours) || 8,
          late_checkin_grace_minutes: Number(s.working_schedule?.late_checkin_grace_minutes) || 30,
          default_break_duration_minutes: Number(s.working_schedule?.default_break_duration_minutes) || 60,
          allow_multiple_breaks: Boolean(s.working_schedule?.allow_multiple_breaks),
        },
        attendance: {
          allow_early_clock_in: Boolean(s.attendance?.allow_early_clock_in),
          allow_late_clock_out: Boolean(s.attendance?.allow_late_clock_out),
          require_clock_out: Boolean(s.attendance?.require_clock_out),
          auto_close_attendance: Boolean(s.attendance?.auto_close_attendance),
          auto_mark_absent: Boolean(s.attendance?.auto_mark_absent),
        },
        leave: {
          allow_half_day_leave: Boolean(s.leave?.allow_half_day_leave),
          half_day_session: s.leave?.half_day_session || 'first_half',
          minimum_leave_notice_days: Number(s.leave?.minimum_leave_notice_days) || 1,
          allow_backdated_leave: Boolean(s.leave?.allow_backdated_leave),
          max_consecutive_leave_days: Number(s.leave?.max_consecutive_leave_days) || 10,
          allow_leave_on_weekends: Boolean(s.leave?.allow_leave_on_weekends),
          allow_leave_on_company_holidays: Boolean(s.leave?.allow_leave_on_company_holidays),
          require_leave_approval: Boolean(s.leave?.require_leave_approval),
        },
      })
      setOriginal(JSON.parse(JSON.stringify(settings)))
      setLoading(false)
    }).catch(() => {
      setLoading(false)
      toast.error(t('common.failedToLoad'))
    })
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.put('/company-settings', { settings })
      toast.success(t('settings.companySettingsUpdatedSuccess'))
    } catch (err: any) {
      toast.error(err.message || t('common.failedToSave'))
    } finally {
      setSaving(false)
    }
  }

  const update = <K extends keyof CompanySettings>(
    group: K,
    key: keyof CompanySettings[K],
    value: any
  ) => {
    setSettings(prev => ({
      ...prev,
      [group]: { ...prev[group], [key]: value },
    }))
  }

  const gs = settings.general
  const ws = settings.working_schedule
  const att = settings.attendance
  const lv = settings.leave

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <RefreshCw size={28} strokeWidth={2.25} className="animate-spin text-indigo-500" />
        <p className="text-sm text-gray-500">{t('common.loading')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-5 animate-fade-in-up">

      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-extrabold text-gray-900">{t('companySettings.title')}</h1>
        <p className="text-sm text-gray-500 mt-0.5">{t('companySettings.subtitle')}</p>
      </div>

      {/* Tabs */}
      <Tabs
        active={activeTab}
        onChange={(k) => setActiveTab(k as typeof activeTab)}
        tabs={[
          { key: 'general',           label: <span className="inline-flex items-center gap-1.5"><Building2 size={14} strokeWidth={2.25} />{t('companySettings.general')}</span> },
          { key: 'working_schedule',  label: <span className="inline-flex items-center gap-1.5"><Clock size={14} strokeWidth={2.25} />{t('companySettings.workingSchedule')}</span> },
          { key: 'attendance',        label: <span className="inline-flex items-center gap-1.5"><Fingerprint size={14} strokeWidth={2.25} />{t('companySettings.attendanceSettings')}</span> },
          { key: 'leave',             label: <span className="inline-flex items-center gap-1.5"><Palmtree size={14} strokeWidth={2.25} />{t('companySettings.leaveSettings')}</span> },
        ]}
      />

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* GENERAL ─────────────────────────────────────────────────────────── */}
      {activeTab === 'general' && (
        <div className={cardCls}>
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
            <h3 className={sectionTitleCls}>
              <Building2 size={16} strokeWidth={2.25} className="text-indigo-600 dark:text-indigo-400" />
              {t('companySettings.general')}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 -mt-2">{t('companySettings.generalDesc')}</p>
          </div>
          <div className="p-5 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className={labelCls}>{t('companySettings.companyName')}</label>
                <input
                  value={gs.company_name}
                  onChange={e => update('general', 'company_name', e.target.value)}
                  className={inputCls}
                  placeholder="Your Company Name"
                />
              </div>
              <div>
                <label className={labelCls}>{t('companySettings.companyLogo')}</label>
                <div className="flex items-center gap-3">
                  {gs.company_logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={gs.company_logo} alt="Logo" className="w-12 h-12 rounded-xl object-contain border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800" />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-indigo-50 border-2 border-dashed border-indigo-200 flex items-center justify-center">
                      <Building2 size={20} strokeWidth={2.25} className="text-indigo-400" />
                    </div>
                  )}
                  <button
                    type="button"
                    className="px-4 py-2 text-sm font-semibold bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-xl transition cursor-pointer border-2 border-indigo-200"
                  >
                    {t('companySettings.uploadLogo')}
                  </button>
                </div>
              </div>
              <div className="relative" style={{ zIndex: 50 }}>
                <label className={labelCls}>{t('companySettings.timezone')}</label>
                <TimezoneSelect
                  value={{ value: gs.timezone, label: gs.timezone }}
                  onChange={(tz: any) => update('general', 'timezone', tz.value)}
                  className="text-sm"
                  menuPortalTarget={typeof document !== 'undefined' ? document.body : undefined}
                  styles={getTzSelectStyles(resolvedTheme === 'dark')}
                />
              </div>
              <div>
                <label className={labelCls}>{t('companySettings.dateFormat')}</label>
                <select
                  value={gs.date_format}
                  onChange={e => update('general', 'date_format', e.target.value)}
                  className={selectCls}
                >
                  <option value="DD/MM/YYYY">DD/MM/YYYY (e.g. 05/08/2026)</option>
                  <option value="MM/DD/YYYY">MM/DD/YYYY (e.g. 08/05/2026)</option>
                  <option value="YYYY-MM-DD">YYYY-MM-DD (e.g. 2026-08-05)</option>
                  <option value="DD-MM-YYYY">DD-MM-YYYY (e.g. 05-08-2026)</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>{t('companySettings.timeFormat')}</label>
                <select
                  value={gs.time_format}
                  onChange={e => update('general', 'time_format', e.target.value as '12h' | '24h')}
                  className={selectCls}
                >
                  <option value="12h">12-hour (e.g. 09:30 AM)</option>
                  <option value="24h">24-hour (e.g. 09:30)</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* WORKING SCHEDULE ─────────────────────────────────────────────────── */}
      {activeTab === 'working_schedule' && (
        <div className={cardCls}>
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
            <h3 className={sectionTitleCls}>
              <Clock size={16} strokeWidth={2.25} className="text-indigo-600 dark:text-indigo-400" />
              {t('companySettings.workingSchedule')}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 -mt-2">{t('companySettings.workingScheduleDesc')}</p>
          </div>
          <div className="p-5 space-y-6">

            {/* Working Days */}
            <div>
              <label className={labelCls}>{t('companySettings.workingDays')}</label>
              <WeekdaySelector
                value={ws.working_days}
                onChange={v => update('working_schedule', 'working_days', v)}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <div>
                <label className={labelCls}>{t('companySettings.officeStartTime')}</label>
                <input
                  type="time"
                  value={ws.office_start_time}
                  onChange={e => update('working_schedule', 'office_start_time', e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>{t('companySettings.officeEndTime')}</label>
                <input
                  type="time"
                  value={ws.office_end_time}
                  onChange={e => update('working_schedule', 'office_end_time', e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>{t('companySettings.requiredWorkingHours')}</label>
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    max="24"
                    value={ws.required_working_hours}
                    onChange={e => update('working_schedule', 'required_working_hours', Number(e.target.value))}
                    className={inputCls + ' pr-16'}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">
                    {t('companySettings.requiredWorkingHoursUnit')}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className={labelCls}>{t('companySettings.lateCheckinGracePeriod')}</label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max="180"
                    value={ws.late_checkin_grace_minutes}
                    onChange={e => update('working_schedule', 'late_checkin_grace_minutes', Number(e.target.value))}
                    className={inputCls + ' pr-14'}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">
                    {t('companySettings.lateCheckinGracePeriodUnit')}
                  </span>
                </div>
              </div>
              <div>
                <label className={labelCls}>{t('companySettings.defaultBreakDuration')}</label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max="300"
                    value={ws.default_break_duration_minutes}
                    onChange={e => update('working_schedule', 'default_break_duration_minutes', Number(e.target.value))}
                    className={inputCls + ' pr-14'}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">
                    {t('companySettings.defaultBreakDurationUnit')}
                  </span>
                </div>
              </div>
            </div>

            {/* Allow Multiple Breaks */}
            <div className="border-t border-gray-100 dark:border-gray-700 pt-4">
              <ToggleRow
                label={t('companySettings.allowMultipleBreaks')}
                description="Employees can take multiple breaks throughout the day"
                checked={ws.allow_multiple_breaks}
                onChange={v => update('working_schedule', 'allow_multiple_breaks', v)}
              />
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ATTENDANCE ──────────────────────────────────────────────────────── */}
      {activeTab === 'attendance' && (
        <div className={cardCls}>
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
            <h3 className={sectionTitleCls}>
              <Fingerprint size={16} strokeWidth={2.25} className="text-indigo-600 dark:text-indigo-400" />
              {t('companySettings.attendanceSettings')}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 -mt-2">{t('companySettings.attendanceSettingsDesc')}</p>
          </div>
          <div className="p-5 divide-y divide-gray-100 dark:divide-gray-700">
            <ToggleRow
              label={t('companySettings.allowEarlyClockIn')}
              description="Employees can clock in before office start time"
              checked={att.allow_early_clock_in}
              onChange={v => update('attendance', 'allow_early_clock_in', v)}
            />
            <ToggleRow
              label={t('companySettings.allowLateClockOut')}
              description="Employees can clock out after office end time"
              checked={att.allow_late_clock_out}
              onChange={v => update('attendance', 'allow_late_clock_out', v)}
            />
            <ToggleRow
              label={t('companySettings.requireClockOut')}
              description="Employees must explicitly clock out; auto-close disabled"
              checked={att.require_clock_out}
              onChange={v => update('attendance', 'require_clock_out', v)}
            />
            <ToggleRow
              label={t('companySettings.autoCloseAttendance')}
              description="Automatically close attendance at end of office hours"
              checked={att.auto_close_attendance}
              onChange={v => update('attendance', 'auto_close_attendance', v)}
            />
            <ToggleRow
              label={t('companySettings.autoMarkAbsent')}
              description="Automatically mark employees absent if no clock-in by end of day"
              checked={att.auto_mark_absent}
              onChange={v => update('attendance', 'auto_mark_absent', v)}
            />
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* LEAVE ────────────────────────────────────────────────────────────── */}
      {activeTab === 'leave' && (
        <div className={cardCls}>
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
            <h3 className={sectionTitleCls}>
              <Palmtree size={16} strokeWidth={2.25} className="text-indigo-600 dark:text-indigo-400" />
              {t('companySettings.leaveSettings')}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 -mt-2">{t('companySettings.leaveSettingsDesc')}</p>
          </div>
          <div className="p-5 space-y-5">

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className={labelCls}>{t('companySettings.halfDaySession')}</label>
                <select
                  value={lv.half_day_session}
                  onChange={e => update('leave', 'half_day_session', e.target.value as 'first_half' | 'second_half')}
                  className={selectCls}
                >
                  <option value="first_half">{t('companySettings.firstHalf')}</option>
                  <option value="second_half">{t('companySettings.secondHalf')}</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>{t('companySettings.minimumLeaveNotice')}</label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max="365"
                    value={lv.minimum_leave_notice_days}
                    onChange={e => update('leave', 'minimum_leave_notice_days', Number(e.target.value))}
                    className={inputCls + ' pr-16'}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">
                    {t('companySettings.minimumLeaveNoticeUnit')}
                  </span>
                </div>
              </div>
              <div>
                <label className={labelCls}>{t('companySettings.maxConsecutiveLeave')}</label>
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    max="365"
                    value={lv.max_consecutive_leave_days}
                    onChange={e => update('leave', 'max_consecutive_leave_days', Number(e.target.value))}
                    className={inputCls + ' pr-16'}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">
                    {t('companySettings.maxConsecutiveLeaveUnit')}
                  </span>
                </div>
              </div>
            </div>

            <div className="border-t border-gray-100 dark:border-gray-700 pt-4 space-y-1">
              <ToggleRow
                label={t('companySettings.allowHalfDayLeave')}
                description="Employees can apply for half-day leaves"
                checked={lv.allow_half_day_leave}
                onChange={v => update('leave', 'allow_half_day_leave', v)}
              />
              <ToggleRow
                label={t('companySettings.allowBackdatedLeave')}
                description="Employees can apply for leaves on past dates"
                checked={lv.allow_backdated_leave}
                onChange={v => update('leave', 'allow_backdated_leave', v)}
              />
              <ToggleRow
                label={t('companySettings.allowLeaveOnWeekends')}
                description="Employees can apply for leaves that fall on weekends"
                checked={lv.allow_leave_on_weekends}
                onChange={v => update('leave', 'allow_leave_on_weekends', v)}
              />
              <ToggleRow
                label={t('companySettings.allowLeaveOnHolidays')}
                description="Employees can apply for leaves that fall on company holidays"
                checked={lv.allow_leave_on_company_holidays}
                onChange={v => update('leave', 'allow_leave_on_company_holidays', v)}
              />
              <ToggleRow
                label={t('companySettings.requireLeaveApproval')}
                description="All leave requests require manager approval"
                checked={lv.require_leave_approval}
                onChange={v => update('leave', 'require_leave_approval', v)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Sticky Save Button */}
      <div className="sticky bottom-4 z-10 flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-8 py-3 text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl transition shadow-xl cursor-pointer border-none disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
        >
          {saving
            ? <><RefreshCw size={16} strokeWidth={2.25} className="animate-spin" /> {t('common.saving')}</>
            : <><Save size={16} strokeWidth={2.25} /> {t('settings.save')}</>
          }
        </button>
      </div>
    </div>
  )
}
