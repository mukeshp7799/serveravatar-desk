'use client'
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import api from '@/lib/api'
import type { CompanyDateSettings } from '@/lib/dateFormat'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface GeneralSettings {
  company_name: string
  company_logo: string | null
  timezone: string
  date_format: string
  time_format: '12h' | '24h'
}

interface WorkingScheduleSettings {
  working_days: string[]
  office_start_time: string
  office_end_time: string
  required_working_hours: number
  late_checkin_grace_minutes: number
  default_break_duration_minutes: number
  allow_multiple_breaks: boolean
}

interface AttendanceSettings {
  allow_early_clock_in: boolean
  allow_late_clock_out: boolean
  require_clock_out: boolean
  auto_close_attendance: boolean
  auto_mark_absent: boolean
}

interface LeaveSettings {
  allow_half_day_leave: boolean
  half_day_session: 'first_half' | 'second_half'
  minimum_leave_notice_days: number
  allow_backdated_leave: boolean
  max_consecutive_leave_days: number
  allow_leave_on_weekends: boolean
  allow_leave_on_company_holidays: boolean
  require_leave_approval: boolean
}

export interface CompanySettings {
  general: GeneralSettings
  working_schedule: WorkingScheduleSettings
  attendance: AttendanceSettings
  leave: LeaveSettings
}

interface CompanySettingsContextValue {
  settings: CompanySettings | null
  loading: boolean
  dateSettings: CompanyDateSettings
  refresh: () => void
}

// ─── Context ──────────────────────────────────────────────────────────────────

const CompanySettingsContext = createContext<CompanySettingsContextValue>({
  settings: null,
  loading: true,
  dateSettings: { timezone: 'UTC', date_format: 'YYYY-MM-DD', time_format: '24h' },
  refresh: () => {},
})

export function CompanySettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<CompanySettings | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchSettings = useCallback(async () => {
    try {
      const res = await api.get('/company-settings')
      setSettings(res.settings)
    } catch (err) {
      console.error('[CompanySettings] Failed to load:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  // Expose date/time settings for easy access
  const dateSettings: CompanyDateSettings = {
    timezone: settings?.general?.timezone || 'UTC',
    date_format: (settings?.general?.date_format as CompanyDateSettings['date_format']) || 'YYYY-MM-DD',
    time_format: settings?.general?.time_format || '24h',
  }

  return (
    <CompanySettingsContext.Provider value={{ settings, loading, dateSettings, refresh: fetchSettings }}>
      {children}
    </CompanySettingsContext.Provider>
  )
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useCompanySettings() {
  return useContext(CompanySettingsContext)
}

/**
 * Convenience hook for just the date-related settings (timezone, date_format, time_format).
 * Use this for all date formatting operations.
 */
export function useDateSettings() {
  const { dateSettings, loading } = useContext(CompanySettingsContext)
  return { ...dateSettings, loading }
}
