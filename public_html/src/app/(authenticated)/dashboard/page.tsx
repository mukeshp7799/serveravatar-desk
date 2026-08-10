'use client';
// Safe date formatter — handles string, Date, or unexpected formats
function safeFmtDate(d: any, dateFormat = 'DD/MM/YYYY'): string {
  if (!d) return '-'
  try {
    let date: Date
    if (d instanceof Date) {
      date = d
    } else if (typeof d === 'string') {
      // MySQL date 'YYYY-MM-DD' — append time to avoid UTC-vs-localday off-by-one
      date = d.includes('T') ? new Date(d) : new Date(d + 'T12:00:00Z')
    } else {
      return '-'
    }
    if (isNaN(date.getTime())) return '-'
    const y = date.getUTCFullYear()
    const m = date.getUTCMonth() + 1
    const day = date.getUTCDate()
    return dateFormat
      .replace('YYYY', String(y)).replace('YY', String(y).slice(-2))
      .replace('MM', String(m).padStart(2,'0')).replace('M', String(m))
      .replace('DD', String(day).padStart(2,'0')).replace('D', String(day))
  } catch { return '-' }
}
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Link from 'next/link';
import {
  Users, Gem, CheckSquare, Clock, Palmtree, Bell, Megaphone,
  Calendar, PartyPopper, Star, ChevronRight, AlertCircle,
  CalendarDays, ArrowRight, Coffee, LogIn, LogOut,
  Pause, Loader2, CheckSquare as Check, Target,
  Sparkles, TrendingUp, Activity, Flame, Award, Zap
} from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import PendingInvitationsBanner from '@/components/dashboard/PendingInvitationsBanner';
import StatCard from '@/components/dashboard/widgets/StatCard';
import GradientCard from '@/components/dashboard/widgets/GradientCard';
import { useDateSettings } from '@/contexts/CompanySettingsContext';
import { formatDateOnly, formatTimeOnly } from '@/lib/dateFormat';

// Locale map
const localeMap: Record<string, string> = {
  en: 'en-US', hi: 'hi-IN', gu: 'gu-IN', mr: 'mr-IN', ur: 'ur-PK', es: 'es-ES', zh: 'zh-CN',
};

// Formatters
// Replaced with useDateSettings - keep as fallback
function fmtTimeFallback(ts: string | null | undefined, timeFormat = '24h', tz = 'UTC') {
  if (!ts) return '--:--';
  try {
    const date = new Date(ts);
    const opts: Intl.DateTimeFormatOptions = { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: timeFormat === '12h' };
    return new Intl.DateTimeFormat('en-GB', opts).format(date);
  } catch { return '--:--'; }
}

function fmtDuration(minutes: number) {
  if (!minutes) return '0m';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtDateStrFallback(d: string, dateFormat = 'YYYY-MM-DD', tz = 'UTC') {
  if (!d) return '';
  try {
    const date = new Date(d + 'T00:00:00');
    // Apply company date format pattern
    const y = date.getFullYear();
    const m = date.getMonth() + 1;
    const day = date.getDate();
    const pattern = dateFormat; // e.g. 'DD/MM/YYYY'
    const result = pattern
      .replace('YYYY', String(y)).replace('YY', String(y).slice(-2))
      .replace('MM', String(m).padStart(2,'0')).replace('M', String(m))
      .replace('DD', String(day).padStart(2,'0')).replace('D', String(day));
    return result;
  } catch { return d; }
}

function fmtNotifTime(ts: string) {
  try {
    const diffMs = Date.now() - new Date(ts).getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h ago`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 7) return `${diffD}d ago`;
    return fmtDateStrFallback(ts);
  } catch { return ''; }
}

function timeAgo(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d ago`;
  return fmtDateStrFallback(dateStr);
}

const MODULE_COLOR_CLASSES: Record<string, string> = {
  Auth:             'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
  Employee:         'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  Attendance:       'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300',
  Leave:            'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  Calendar:         'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  Announcement:     'bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300',
  CompanySettings:  'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
  Role:             'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300',
  Permission:       'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300',
  Project:          'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
};

function getActionBadgeColor(action: string): string {
  const map: Record<string, string> = {
    Login:             'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
    Logout:            'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
    Created:           'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
    Updated:           'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
    Deleted:           'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300',
    Approved:          'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
    Rejected:          'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
    Archived:          'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    Restored:          'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300',
    Clocked_In:        'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300',
    Clocked_Out:       'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300',
    Applied:           'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
    Permissions_Updated: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
  };
  return map[action] || 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300';
}

// Avatar component
function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  const parts = name.trim().split(' ');
  const initials = parts.length >= 2 ? parts[0][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2);
  const sz = size === 'sm' ? 'w-7 h-7 text-[10px]' : 'w-9 h-9 text-xs';
  return (
    <div className={`${sz} rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold shrink-0`}>
      {initials.toUpperCase()}
    </div>
  );
}

// Priority badge
const PRIORITY: Record<string, string> = {
  urgent: 'bg-red-50 text-red-700 border border-red-200',
  high: 'bg-amber-50 text-amber-700 border border-amber-200',
  medium: 'bg-sky-50 text-sky-700 border border-sky-200',
  low: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
};

// Attendance status meta
const STATUS_META: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  absent:     { label: 'Absent',      color: 'text-red-600',    bg: 'bg-red-50',      dot: 'bg-red-500' },
  clocked_in:  { label: 'Clocked In',  color: 'text-green-600',  bg: 'bg-green-50',    dot: 'bg-green-500' },
  working:     { label: 'Working',     color: 'text-blue-600',   bg: 'bg-blue-50',     dot: 'bg-blue-500' },
  on_break:    { label: 'On Break',    color: 'text-amber-600',  bg: 'bg-amber-50',    dot: 'bg-amber-500' },
  completed:   { label: 'Completed',   color: 'text-gray-600',   bg: 'bg-gray-100',   dot: 'bg-gray-400' },
};

// Action button
function ActionBtn({ label, icon: Icon, onClick, loading, disabled, variant = 'primary' }: {
  label: string; icon: any; onClick: () => void; loading?: boolean; disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
}) {
  const base = "inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all cursor-pointer border-none disabled:opacity-40 disabled:cursor-not-allowed";
  const variants = {
    primary: "bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm hover:-translate-y-0.5 hover:shadow-md transition-all duration-200",
    secondary: "bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200",
    danger: "bg-red-50 hover:bg-red-100 text-red-600 border border-red-200",
  };
  return (
    <button onClick={onClick} disabled={disabled || loading} className={`${base} ${variants[variant]}`}>
      {loading ? <Loader2 size={12} className="animate-spin" /> : <Icon size={12} strokeWidth={2.5} />}
      {label}
    </button>
  );
}

export default function DashboardPage() {

  const { timezone, date_format, time_format } = useDateSettings();
  // Context-aware date/time formatters
  const fmtTime = (ts: string | null | undefined) => fmtTimeFallback(ts, time_format, timezone);
  const fmtDateStr = (d: any) => safeFmtDate(d, date_format);
  const fmtBreak = (mins: number | null | undefined) => {
    if (mins == null || mins === 0) return '0m';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  // Format working hours as "2h 30m" — null/undefined → "—"
  const fmtHrs = (val: number | null | undefined) => {
    if (val == null) return '—';
    const totalMins = Math.round(val * 60);
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    if (h === 0) return `${m}m`;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  };



  // Compute live working hours directly from clock_in_time when API hasn't computed it yet
  const getLiveHours = () => {
    if (myToday?.live_working_hours != null) return myToday.live_working_hours;
    if (myToday?.working_hours != null) return myToday.working_hours;
    // Fallback: compute from clock_in_time if employee has clocked in
    if (myToday?.clock_in_time && myToday?.status && myToday.status !== 'absent') {
      const elapsedMs = Date.now() - new Date(myToday.clock_in_time).getTime();
      const elapsedHours = elapsedMs / (1000 * 60 * 60);
      const breakHours = (myToday.total_break_minutes || 0) / 60;
      return Math.max(0, elapsedHours - breakHours);
    }
    return null;
  };

  const { t, i18n } = useTranslation();
  const [dashData, setDashData] = useState<any>(null);
  const [calData, setCalData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState({ date: '', time: '' });
  const [tick, setTick] = useState(0); // drives live hours re-compute every interval
  const [clocking, setClocking] = useState<string | null>(null);

  const fetchDashboard = () => {
    return api.get('/dashboard').then(d => { setDashData(d); return d; }).catch(() => {});
  };

  // Refresh dashboard every 60 seconds so attendance live hours stay current
  useEffect(() => {
    const t = setInterval(fetchDashboard, 60_000);
    return () => clearInterval(t);
  }, []);

  // Fast tick — re-render every 10s so attendance card live hours stay current
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 10_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    Promise.all([
      fetchDashboard(),
      api.get('/calendar/dashboard').catch(() => null),
    ]).then(([dash, cal]) => {
      setDashData(dash);
      setCalData(cal);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const performAction = async (action: string) => {
    setClocking(action);
    try {
      await api.post(`/attendance/${action}`);
      toast.success('Action completed!');
      await fetchDashboard();
    } catch (err: any) {
      toast.error(err.message || 'Action failed');
    } finally {
      setClocking(null);
    }
  };

  useEffect(() => {
    const update = () => {
      const d = new Date();
      const loc = i18n.language?.split('-')[0] || 'en';
      const ld = localeMap[loc] || 'en-US';
      const dateStr = d.toLocaleDateString(ld, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
      const timeStr = d.toLocaleTimeString(ld, { hour: '2-digit', minute: '2-digit' });
      setNow({ date: dateStr, time: timeStr });
    };
    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, [i18n.language]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-gray-500 text-sm">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (!dashData) return null;

  const {
    pendingApprovals = [], myTasks = [], leaveBalances = [], myProjects = [],
    announcements = [], hrStats = {}, attendanceStats, myToday,
    notifications = [], recentActivities = [], hasActivityViewAll = false,
  } = dashData;

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  })();

  const meta = myToday?.status ? (STATUS_META[myToday.status] || STATUS_META.completed) : null;

  const canClockIn    = !myToday || myToday.status === 'absent';
  const canStartBreak = myToday && ['clocked_in', 'working'].includes(myToday.status);
  const canEndBreak   = myToday && myToday.status === 'on_break';
  const canClockOut   = myToday && ['clocked_in', 'working', 'on_break'].includes(myToday.status);

  const storedUser = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } })();
  const perms = storedUser.permissions || [];
  const has = (p: string) => perms.includes(p);
  const hasHR = has('hr.view_directory') || has('hr.manage_all') || has('employees.view_all');
  const hasApprove = has('leave.approve');
  const hasApply = has('leave.apply');
  const hasAttendance = has('attendance.view_own') || has('attendance.clock_in_out');
  const hasAttendanceTeam = has('attendance.view_team') || has('attendance.manage_all');
  const hasCalendar = has('calendar.view');

  return (
    <div className="px-4 sm:px-6 py-5 space-y-4">

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ══ TOP: Full-width User Detail Card ════════════════════════════════ */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <div className="overflow-hidden rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700/60 shadow-sm hover:-translate-y-0.5 hover:shadow-md transition-all duration-200">
        <div className="flex items-center gap-4 px-5 py-4">
          {/* Avatar */}
          <div className="w-12 h-12 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-base font-bold text-indigo-600 dark:text-indigo-400 border-2 border-indigo-200 dark:border-indigo-700 shrink-0">
            {(() => {
              const firstName = storedUser.firstName || ''
              const lastName = storedUser.lastName || ''
              const initials = (firstName[0] || '') + (lastName[0] || (firstName[1] || ''))
              return initials.toUpperCase() || 'U'
            })()}
          </div>

          {/* Name & Role */}
          <div className="min-w-0">
            <div className="text-base font-bold text-gray-900 dark:text-white">
              {storedUser.firstName || storedUser.first_name || 'User'}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="inline-flex items-center bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 px-2 py-0.5 rounded-full text-[11px] font-semibold">
                {storedUser.roleName || 'User'}
              </span>
              <span className="text-[11px] text-gray-400">{now.date}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ══ STAT CARDS — 4 columns ═══════════════════════════════════════════ */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
        {hasHR && (
          <Link href="/employees" className="no-underline">
            <StatCard label="Employees" value={hrStats.totalEmployees ?? '-'} icon={Users} color="text-blue-600" bgColor="bg-blue-50" delay={0} />
          </Link>
        )}
        <Link href="/projects" className="no-underline">
          <StatCard label="Projects" value={myProjects.length} icon={Gem} color="text-purple-600" bgColor="bg-purple-50" delay={50} />
        </Link>
        <Link href="/projects" className="no-underline">
          <StatCard label="Tasks" value={myTasks.length} icon={CheckSquare} color="text-emerald-600" bgColor="bg-emerald-50" delay={100} />
        </Link>
        {hasApprove && (
          <Link href="/leaves" className="no-underline">
            <StatCard label="Pending" value={pendingApprovals.length} icon={Clock} color="text-orange-600" bgColor="bg-orange-50" delay={150} />
          </Link>
        )}
        {hasAttendanceTeam && attendanceStats && (
          <Link href="/attendance" className="no-underline">
            <StatCard label="Present Today" value={attendanceStats.present_today ?? '-'} icon={Clock} color="text-green-600" bgColor="bg-green-50" delay={200} />
          </Link>
        )}
        {hasAttendanceTeam && attendanceStats && Number(attendanceStats.late_checkins) > 0 && (
          <Link href="/attendance" className="no-underline">
            <StatCard label="Late Check-ins" value={attendanceStats.late_checkins} icon={AlertCircle} color="text-amber-600" bgColor="bg-amber-50" delay={250} />
          </Link>
        )}
      </div>

      {/* Gradient Highlights */}
      {hasCalendar && (calData?.todaysHoliday || calData?.onLeaveToday?.length > 0 || calData?.upcomingBirthdays?.length > 0 || calData?.upcomingEvents?.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {calData?.todaysHoliday && (
            <Link href="/calendar" className="no-underline">
              <GradientCard gradient="from-red-500 to-rose-600" icon={Calendar} label="Today's Holiday" title={calData.todaysHoliday.name} delay={200} />
            </Link>
          )}
          {calData?.onLeaveToday?.length > 0 && (
            <GradientCard
              gradient="from-orange-500 to-amber-600"
              icon={Bell}
              label="On Leave Today"
              title={`${calData.onLeaveToday.length} Employee${calData.onLeaveToday.length > 1 ? 's' : ''}`}
              delay={250}
            />
          )}
          {calData?.upcomingBirthdays?.length > 0 && (() => {
            const b = calData.upcomingBirthdays[0];
            return (
              <Link href="/calendar" className="no-underline">
                <GradientCard gradient="from-pink-500 to-rose-500" icon={PartyPopper} label="Next Birthday" title={`${b.first_name} ${b.last_name}`} delay={300} />
              </Link>
            );
          })()}
          {calData?.upcomingEvents?.length > 0 && (() => {
            const ev = calData.upcomingEvents[0];
            return (
              <Link href="/calendar" className="no-underline">
                <GradientCard gradient="from-blue-500 to-indigo-600" icon={Star} label="Next Event" title={ev.title} delay={350} />
              </Link>
            );
          })()}
        </div>
      )}

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">

        {/* COLUMN 1: Attendance + Leave Balances */}
        <div className="space-y-4">

          {/* Interactive Attendance Tracker */}
          {hasAttendance && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm hover:-translate-y-0.5 hover:shadow-md transition-all duration-200">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center">
                    <Clock size={14} className="text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <h3 className="font-semibold text-gray-900 dark:text-white text-xs">Attendance</h3>
                </div>
                {meta && (
                  <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${meta.bg} ${meta.color}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${meta.dot} animate-pulse`} />
                    {meta.label}
                  </span>
                )}
              </div>
              <div className="px-4 py-3 space-y-2">
                <div className="grid grid-cols-4 gap-2">
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2 text-center">
                    <div className="text-[10px] text-gray-400 font-medium mb-0.5">In</div>
                    <div className="text-xs font-bold text-gray-900 dark:text-white">{fmtTime(myToday?.clock_in_time)}</div>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2 text-center">
                    <div className="text-[10px] text-gray-400 font-medium mb-0.5">Out</div>
                    <div className="text-xs font-bold text-gray-900 dark:text-white">{fmtTime(myToday?.clock_out_time)}</div>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2 text-center">
                    <div className="text-[10px] text-gray-400 font-medium mb-0.5">Worked</div>
                    <div className="text-xs font-bold text-gray-900 dark:text-white">
                    {fmtHrs(getLiveHours())}
                    </div>
                  </div>
                  <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-2 text-center">
                    <div className="text-[10px] text-amber-500 font-medium mb-0.5">Break</div>
                    <div className="text-xs font-bold text-amber-600 dark:text-amber-400">{fmtBreak(myToday?.total_break_minutes)}</div>
                  </div>
                </div>
                {myToday?.is_late && (
                  <div className="flex items-center gap-1.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-2.5 py-1.5">
                    <AlertCircle size={11} className="text-amber-500 shrink-0" />
                    <span className="text-[10px] text-amber-700 dark:text-amber-300 font-medium">Late by {myToday.late_minutes || 0} min</span>
                  </div>
                )}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <ActionBtn label="In" icon={LogIn} onClick={() => performAction('clock-in')} loading={clocking === 'clock-in'} disabled={!canClockIn} variant="primary" />
                  <ActionBtn label="Break" icon={Coffee} onClick={() => performAction('start-break')} loading={clocking === 'start-break'} disabled={!canStartBreak} variant="secondary" />
                  <ActionBtn label="End" icon={Pause} onClick={() => performAction('end-break')} loading={clocking === 'end-break'} disabled={!canEndBreak} variant="secondary" />
                  <ActionBtn label="Out" icon={LogOut} onClick={() => performAction('clock-out')} loading={clocking === 'clock-out'} disabled={!canClockOut} variant="danger" />
                </div>
              </div>
            </div>
          )}

          {/* Leave Balances */}
          {hasApply && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm hover:-translate-y-0.5 hover:shadow-md transition-all duration-200">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center">
                    <Palmtree size={14} className="text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <h3 className="font-semibold text-gray-900 dark:text-white text-xs">Leave Balances</h3>
                </div>
                <Link href="/leaves" className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline no-underline">Apply</Link>
              </div>
              <div className="p-4 space-y-2.5">
                {leaveBalances.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-2">No leave allocated</p>
                ) : (
                  leaveBalances.slice(0, 4).map((b: any) => {
                    const pct = Math.min(100, (parseFloat(b.current_balance) / b.max_allowed) * 100);
                    return (
                      <div key={b.leave_type_id}>
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{b.leave_type_name}</span>
                          <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">{b.current_balance}<span className="text-gray-400 font-normal">/{b.max_allowed}</span></span>
                        </div>
                        <div className="bg-gray-100 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden">
                          <div className="bg-indigo-500 h-full rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Work Anniversaries */}
          {hasCalendar && calData?.upcomingAnniversaries?.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm hover:-translate-y-0.5 hover:shadow-md transition-all duration-200">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center">
                    <Star size={14} className="text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <h3 className="font-semibold text-gray-900 dark:text-white text-xs">Work Anniversaries</h3>
                </div>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-700">
                {calData.upcomingAnniversaries.slice(0, 3).map((a: any) => (
                  <div key={a.id} className="flex items-center gap-2.5 px-4 py-2.5">
                    <Avatar name={`${a.first_name} ${a.last_name}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-gray-900 dark:text-white">{a.first_name} {a.last_name}</div>
                      <div className="text-[10px] text-gray-500">{a.years} year{a.years > 1 ? 's' : ''}</div>
                    </div>
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded-full">{fmtDateStr(a.hire_date)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>




        {/* COLUMN 2: My Tasks + Projects */}
        <div className="space-y-4">

          {/* My Tasks */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200/60 dark:border-gray-700/60 overflow-hidden shadow-sm hover:-translate-y-0.5 hover:shadow-md transition-all duration-200">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center">
                  <CheckSquare size={14} className="text-emerald-600 dark:text-emerald-400" />
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white text-xs">My Tasks</h3>
              </div>
              <Link href="/projects" className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline no-underline">View all</Link>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {myTasks.length === 0 ? (
                <div className="px-4 py-6 text-center">
                  <Target size={18} className="text-gray-300 mx-auto mb-1" />
                  <p className="text-xs text-gray-400">No tasks assigned</p>
                </div>
              ) : (
                myTasks.slice(0, 5).map((task: any) => (
                  <div key={task.id} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">{task.title || task.description}</div>
                      <div className="text-[10px] text-gray-500 mt-0.5">{task.project_name} · {task.column_name}</div>
                    </div>
                    <span className={`shrink-0 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold border ${PRIORITY[task.priority] || PRIORITY.low}`}>
                      {task.priority}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* My Projects */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200/60 dark:border-gray-700/60 overflow-hidden shadow-sm hover:-translate-y-0.5 hover:shadow-md transition-all duration-200">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-purple-50 dark:bg-purple-900/30 flex items-center justify-center">
                  <Gem size={14} className="text-purple-600 dark:text-purple-400" />
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white text-xs">My Projects</h3>
              </div>
              <Link href="/projects" className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline no-underline">View all</Link>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {myProjects.length === 0 ? (
                <div className="px-4 py-6 text-center">
                  <Gem size={18} className="text-gray-300 mx-auto mb-1" />
                  <p className="text-xs text-gray-400">No projects assigned</p>
                </div>
              ) : (
                myProjects.slice(0, 4).map((proj: any) => {
                  const pct = proj.total_tasks > 0 ? Math.round((proj.done_tasks / proj.total_tasks) * 100) : 0;
                  return (
                    <div key={proj.id} className="px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-gray-900 dark:text-white truncate mr-2">{proj.name}</span>
                        <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 shrink-0">{pct}%</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
                          <div className="bg-purple-500 h-full rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </div>

        {/* COLUMN 3: Approvals + Announcements + Activity + Notifications */}
        <div className="space-y-4">

          {/* Pending Approvals */}
          {hasApprove && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200/60 dark:border-gray-700/60 overflow-hidden shadow-sm hover:-translate-y-0.5 hover:shadow-md transition-all duration-200">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 dark:border-gray-700">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-orange-50 dark:bg-orange-900/30 flex items-center justify-center">
                    <Clock size={14} className="text-orange-600 dark:text-orange-400" />
                  </div>
                  <h3 className="font-semibold text-gray-900 dark:text-white text-xs">
                    Pending{pendingApprovals.length > 0 ? ` (${pendingApprovals.length})` : ''}
                  </h3>
                </div>
                <Link href="/leaves" className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline no-underline">View all</Link>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-700">
                {pendingApprovals.length === 0 ? (
                  <div className="px-4 py-6 text-center">
                    <Check size={18} className="text-green-400 mx-auto mb-1" />
                    <p className="text-xs text-gray-400">All caught up!</p>
                  </div>
                ) : (
                  pendingApprovals.slice(0, 4).map((lr: any) => (
                    <div key={lr.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition">
                      <Avatar name={`${lr.first_name} ${lr.last_name}`} size="sm" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-gray-900 dark:text-white truncate">{lr.first_name} {lr.last_name}</div>
                        <div className="text-[10px] text-gray-500 mt-0.5">{lr.leave_type} · {fmtDateStr(lr.start_date)}</div>
                      </div>
                      <Link href="/leaves" className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 shrink-0">Review</Link>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Announcements */}
          {announcements.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200/60 dark:border-gray-700/60 overflow-hidden shadow-sm hover:-translate-y-0.5 hover:shadow-md transition-all duration-200">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 dark:border-gray-700">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center">
                    <Megaphone size={14} className="text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <h3 className="font-semibold text-gray-900 dark:text-white text-xs">Announcements</h3>
                </div>
                <Link href="/announcements" className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline no-underline">View all</Link>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-700">
                {announcements.slice(0, 3).map((a: any) => (
                  <div key={a.id} className="px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <div className="flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${a.priority === 'urgent' ? 'bg-red-500' : 'bg-indigo-400'}`} />
                      <div className="text-xs font-semibold text-gray-900 dark:text-white leading-tight truncate">{a.title}</div>
                    </div>
                    <div className="text-[10px] text-gray-500 mt-0.5 ml-3.5 line-clamp-1">{a.content?.slice(0, 60)}{a.content?.length > 60 ? '...' : ''}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Activity Logs */}
          {(recentActivities.length > 0 || has('activity_logs.view_own') || has('activity_logs.view_all')) && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200/60 dark:border-gray-700/60 overflow-hidden shadow-sm hover:-translate-y-0.5 hover:shadow-md transition-all duration-200">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 dark:border-gray-700">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-teal-50 dark:bg-teal-900/30 flex items-center justify-center">
                    <Activity size={14} className="text-teal-600 dark:text-teal-400" />
                  </div>
                  <h3 className="font-semibold text-gray-900 dark:text-white text-xs">Recent Activity</h3>
                </div>
                <Link href="/activity-logs" className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline no-underline flex items-center gap-0.5">All <ChevronRight size={10} /></Link>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-700">
                {recentActivities.length === 0 ? (
                  <div className="px-4 py-5 text-center">
                    <Activity size={16} className="text-gray-300 mx-auto mb-1" />
                    <p className="text-xs text-gray-400">No activity yet</p>
                  </div>
                ) : (
                  recentActivities.slice(0, 4).map((log: any) => (
                    <div key={log.id} className="px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                      <div className="text-[11px] text-gray-700 dark:text-gray-200 leading-tight">{log.description || log.action}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="inline-flex items-center px-1 py-0.5 rounded text-[9px] font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">{log.module}</span>
                        <span className="text-[9px] text-gray-400">{timeAgo(log.created_at)}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Notifications */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200/60 dark:border-gray-700/60 overflow-hidden shadow-sm hover:-translate-y-0.5 hover:shadow-md transition-all duration-200">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center">
                  <Bell size={14} className="text-amber-600 dark:text-amber-400" />
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white text-xs">Notifications</h3>
              </div>
              <Link href="/notifications" className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline no-underline flex items-center gap-0.5">All <ChevronRight size={10} /></Link>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {notifications.length === 0 ? (
                <div className="px-4 py-5 text-center">
                  <Bell size={16} className="text-gray-300 mx-auto mb-1" />
                  <p className="text-xs text-gray-400">All caught up!</p>
                </div>
              ) : (
                notifications.slice(0, 4).map((n: any, i: number) => (
                  <div key={n.id ?? i} className="flex items-start gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <div className="relative shrink-0 mt-1">
                      <div className={`w-1.5 h-1.5 rounded-full ${n.is_read ? 'bg-gray-300' : 'bg-indigo-500'}`} />
                      {!n.is_read && <div className="absolute -top-0.5 -right-0.5 w-1 h-1 rounded-full bg-indigo-400" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-gray-800 dark:text-gray-200 leading-tight truncate">{n.title || n.message}</div>
                      {n.message && n.title && <div className="text-[10px] text-gray-500 mt-0.5 line-clamp-1">{n.message}</div>}
                      {n.created_at && <div className="text-[9px] text-gray-400 mt-0.5">{fmtNotifTime(n.created_at)}</div>}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Upcoming Events */}
          {hasCalendar && calData?.upcomingEvents?.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200/60 dark:border-gray-700/60 overflow-hidden shadow-sm hover:-translate-y-0.5 hover:shadow-md transition-all duration-200">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 dark:border-gray-700">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
                    <CalendarDays size={14} className="text-blue-600 dark:text-blue-400" />
                  </div>
                  <h3 className="font-semibold text-gray-900 dark:text-white text-xs">Upcoming Events</h3>
                </div>
                <Link href="/calendar" className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline no-underline">View all</Link>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-700">
                {calData.upcomingEvents.slice(0, 4).map((ev: any) => (
                  <div key={ev.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                      <CalendarDays size={13} className="text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-gray-900 dark:text-white truncate">{ev.title}</div>
                      <div className="text-[10px] text-gray-500 capitalize">{ev.category}</div>
                    </div>
                    <span className="text-[10px] font-medium text-gray-500 shrink-0">{fmtDateStr(ev.start_date)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
}
