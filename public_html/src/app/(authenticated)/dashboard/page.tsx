'use client';
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
    primary: "bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm",
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
  const fmtDateStr = (d: string) => fmtDateStrFallback(d, date_format, timezone);

  const { t, i18n } = useTranslation();
  const [dashData, setDashData] = useState<any>(null);
  const [calData, setCalData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState({ date: '', time: '' });
  const [clocking, setClocking] = useState<string | null>(null);

  const fetchDashboard = () => {
    return api.get('/dashboard').then(d => { setDashData(d); return d; }).catch(() => {});
  };

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
    notifications = [],
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
      {/* ══ HERO BANNER ═══════════════════════════════════════════════════════ */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-500/90 via-purple-600/85 to-pink-600/80 dark:from-indigo-700/60 dark:via-purple-800/55 dark:to-pink-900/50 p-6 sm:p-8 text-white shadow-xl shadow-indigo-500/20 animate-page-zoom-in border border-white/10 dark:border-white/5">
        {/* Decorative blobs */}
        <div className="absolute -top-12 -right-12 w-64 h-64 bg-white/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-56 h-56 bg-pink-400/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-1/2 right-1/4 w-32 h-32 bg-yellow-300/10 rounded-full blur-2xl pointer-events-none" />

        <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            {/* Avatar circle */}
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-2xl sm:text-3xl font-black text-white shadow-lg border border-white/30 shrink-0">
              {(() => {
                const firstName = storedUser.firstName || ''
                const lastName = storedUser.lastName || ''
                const initials = (firstName[0] || '') + (lastName[0] || (firstName[1] || ''))
                return initials.toUpperCase() || 'U'
              })()}
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight mb-1">
                {storedUser.firstName || storedUser.first_name || 'User'} {storedUser.lastName || storedUser.last_name || ''}
              </h1>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 bg-white/20 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-semibold border border-white/20">
                  {storedUser.roleName || 'User'}
                </span>
                <span className="text-white/60 text-xs">{now.date}</span>
                <span className="text-white/60 text-xs">·</span>
                <span className="text-white/60 text-xs">{now.time}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <PendingInvitationsBanner />

      {/* Stat Cards Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {hasHR && (
          <Link href="/employees" className="no-underline">
            <StatCard label="Total Employees" value={hrStats.totalEmployees ?? '-'} icon={Users} color="text-blue-600" bgColor="bg-blue-50" delay={0} />
          </Link>
        )}
        <Link href="/projects" className="no-underline">
          <StatCard label="My Projects" value={myProjects.length} icon={Gem} color="text-purple-600" bgColor="bg-purple-50" delay={50} />
        </Link>
        <Link href="/projects" className="no-underline">
          <StatCard label="My Tasks" value={myTasks.length} icon={CheckSquare} color="text-emerald-600" bgColor="bg-emerald-50" delay={100} />
        </Link>
        {hasApprove && (
          <Link href="/leaves" className="no-underline">
            <StatCard label="Pending Approvals" value={pendingApprovals.length} icon={Clock} color="text-orange-600" bgColor="bg-orange-50" delay={150} />
          </Link>
        )}
      </div>

      {/* Gradient Highlights */}
      {hasCalendar && (calData?.todaysHoliday || calData?.onLeaveToday?.length > 0 || calData?.upcomingBirthdays?.length > 0 || calData?.upcomingEvents?.length > 0) && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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

      {/* 2-Column Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* LEFT COLUMN */}
        <div className="space-y-4">

          {/* Interactive Attendance Tracker */}
          {hasAttendance && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200/60 dark:border-gray-700/60 overflow-hidden shadow-sm hover:shadow-md card-hover-animate card-animate-in">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center">
                    <Clock size={16} className="text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Attendance Tracker</h3>
                </div>
                {meta && (
                  <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full ${meta.bg} ${meta.color}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${meta.dot} animate-pulse`} />
                    {meta.label}
                  </span>
                )}
              </div>
              <div className="px-5 py-4 space-y-4">
                {/* Stats grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 text-center">
                    <div className="text-xs text-gray-400 font-medium mb-1">Clock In</div>
                    <div className="text-sm font-bold text-gray-900 dark:text-white">{fmtTime(myToday?.clock_in_time)}</div>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 text-center">
                    <div className="text-xs text-gray-400 font-medium mb-1">Clock Out</div>
                    <div className="text-sm font-bold text-gray-900 dark:text-white">{fmtTime(myToday?.clock_out_time)}</div>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 text-center col-span-2 sm:col-span-1">
                    <div className="text-xs text-gray-400 font-medium mb-1">Worked</div>
                    <div className="text-sm font-bold text-gray-900 dark:text-white">
                      {myToday?.working_hours != null ? `${myToday.working_hours.toFixed(1)}h` : '-'}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 text-center">
                    <div className="text-xs text-gray-400 font-medium mb-1">Breaks</div>
                    <div className="text-sm font-bold text-gray-900 dark:text-white">{myToday?.break_count || 0}</div>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 text-center">
                    <div className="text-xs text-gray-400 font-medium mb-1">Break Time</div>
                    <div className="text-sm font-bold text-gray-900 dark:text-white">{fmtDuration(myToday?.total_break_minutes || 0)}</div>
                  </div>
                </div>
                {/* Late indicator */}
                {myToday?.is_late && (
                  <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-3 py-2">
                    <AlertCircle size={14} className="text-amber-500 shrink-0" />
                    <span className="text-xs text-amber-700 dark:text-amber-300 font-medium">
                      Arrived {myToday.late_minutes || 0} minutes late
                    </span>
                  </div>
                )}
                {/* Action buttons */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <ActionBtn label="Clock In" icon={LogIn} onClick={() => performAction('clock-in')} loading={clocking === 'clock-in'} disabled={!canClockIn} variant="primary" />
                  <ActionBtn label="Start Break" icon={Coffee} onClick={() => performAction('start-break')} loading={clocking === 'start-break'} disabled={!canStartBreak} variant="secondary" />
                  <ActionBtn label="End Break" icon={Pause} onClick={() => performAction('end-break')} loading={clocking === 'end-break'} disabled={!canEndBreak} variant="secondary" />
                  <ActionBtn label="Clock Out" icon={LogOut} onClick={() => performAction('clock-out')} loading={clocking === 'clock-out'} disabled={!canClockOut} variant="danger" />
                </div>
                {/* Team attendance */}
                {hasAttendanceTeam && attendanceStats && (
                  <div className="pt-3 border-t border-gray-100 dark:border-gray-700 grid grid-cols-3 gap-2 text-center">
                    <div className="bg-green-50 dark:bg-green-900/20 rounded-lg py-2 px-1">
                      <div className="text-lg font-bold text-green-700 dark:text-green-300">{attendanceStats.present_today}</div>
                      <div className="text-[10px] text-green-600 dark:text-green-400 font-medium">Present</div>
                    </div>
                    <div className="bg-red-50 dark:bg-red-900/20 rounded-lg py-2 px-1">
                      <div className="text-lg font-bold text-red-700 dark:text-red-300">{attendanceStats.absent_today}</div>
                      <div className="text-[10px] text-red-600 dark:text-red-400 font-medium">Absent</div>
                    </div>
                    <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg py-2 px-1">
                      <div className="text-lg font-bold text-amber-700 dark:text-amber-300">{attendanceStats.late_checkins}</div>
                      <div className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">Late</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Leave Balances */}
          {hasApply && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200/60 dark:border-gray-700/60 overflow-hidden shadow-sm hover:shadow-md card-hover-animate card-animate-in">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center">
                    <Palmtree size={16} className="text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Leave Balances</h3>
                </div>
                <Link href="/leaves" className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline no-underline">Apply</Link>
              </div>
              <div className="p-4 space-y-3">
                {leaveBalances.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">No leave allocated</p>
                ) : (
                  leaveBalances.slice(0, 4).map((b: any) => {
                    const pct = Math.min(100, (parseFloat(b.current_balance) / b.max_allowed) * 100);
                    return (
                      <div key={b.leave_type_id}>
                        <div className="flex justify-between items-center mb-1.5">
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{b.leave_type_name}</span>
                          <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">
                            {b.current_balance} <span className="text-gray-400 font-normal text-xs">/ {b.max_allowed}</span>
                          </span>
                        </div>
                        <div className="bg-gray-100 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                          <div className="bg-indigo-500 h-full rounded-full transition-all" style={{ width: `${pct}%` }} />
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
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200/60 dark:border-gray-700/60 overflow-hidden shadow-sm hover:shadow-md card-hover-animate card-animate-in">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center">
                    <Star size={16} className="text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Work Anniversaries</h3>
                </div>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-700">
                {calData.upcomingAnniversaries.slice(0, 3).map((a: any) => (
                  <div key={a.id} className="flex items-center gap-3 px-5 py-3">
                    <Avatar name={`${a.first_name} ${a.last_name}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-gray-900 dark:text-white">{a.first_name} {a.last_name}</div>
                      <div className="text-xs text-gray-500">{a.years} year{a.years > 1 ? 's' : ''} at company</div>
                    </div>
                    <span className="text-xs font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full">{fmtDateStr(a.hire_date)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-4">

          {/* Pending Approvals */}
          {hasApprove && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200/60 dark:border-gray-700/60 overflow-hidden shadow-sm hover:shadow-md card-hover-animate card-animate-in">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center">
                    <Clock size={16} className="text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <h3 className="font-semibold text-gray-900 dark:text-white text-sm">
                    Pending Approvals{pendingApprovals.length > 0 ? ` (${pendingApprovals.length})` : ''}
                  </h3>
                </div>
                <Link href="/leaves" className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline no-underline">View all</Link>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-700">
                {pendingApprovals.length === 0 ? (
                  <div className="px-5 py-8 text-center">
                    <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-2">
                      <Check size={20} className="text-green-600 dark:text-green-400" />
                    </div>
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">All caught up!</p>
                  </div>
                ) : (
                  pendingApprovals.slice(0, 5).map((lr: any) => (
                    <div key={lr.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition">
                      <Avatar name={`${lr.first_name} ${lr.last_name}`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-gray-900 dark:text-white">{lr.first_name} {lr.last_name}</div>
                        <div className="text-xs text-gray-500 mt-0.5">{lr.leave_type} · {fmtDateStr(lr.start_date)} → {fmtDateStr(lr.end_date)}</div>
                      </div>
                      <Link href="/leaves" className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline no-underline shrink-0">Review</Link>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* My Tasks */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200/60 dark:border-gray-700/60 overflow-hidden shadow-sm hover:shadow-md card-hover-animate card-animate-in">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center">
                  <CheckSquare size={16} className="text-indigo-600 dark:text-indigo-400" />
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white text-sm">My Tasks</h3>
              </div>
              <Link href="/projects" className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline no-underline">View all</Link>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {myTasks.length === 0 ? (
                <div className="px-5 py-8 text-center">
                  <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-2">
                    <Target size={20} className="text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No tasks assigned</p>
                </div>
              ) : (
                myTasks.slice(0, 5).map((task: any) => (
                  <div key={task.id} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">{task.title || task.description}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{task.project_name} · {task.column_name}</div>
                    </div>
                    <span className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold border ${PRIORITY[task.priority] || PRIORITY.low}`}>
                      {task.priority}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* My Projects */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200/60 dark:border-gray-700/60 overflow-hidden shadow-sm hover:shadow-md card-hover-animate card-animate-in">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center">
                  <Gem size={16} className="text-indigo-600 dark:text-indigo-400" />
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white text-sm">My Projects</h3>
              </div>
              <Link href="/projects" className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline no-underline">View all</Link>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {myProjects.length === 0 ? (
                <div className="px-5 py-8 text-center">
                  <Gem size={20} className="text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">No projects assigned</p>
                </div>
              ) : (
                myProjects.slice(0, 4).map((proj: any) => {
                  const pct = proj.total_tasks > 0 ? Math.round((proj.done_tasks / proj.total_tasks) * 100) : 0;
                  return (
                    <div key={proj.id} className="px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">{proj.name}</span>
                        <span className="text-xs font-bold text-purple-600 dark:text-purple-400 shrink-0 ml-2">{pct}%</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
                          <div className="bg-purple-500 h-full rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-[10px] text-gray-400 shrink-0">{proj.done_tasks}/{proj.total_tasks}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
        <div className="space-y-4">

          {/* Announcements */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200/60 dark:border-gray-700/60 overflow-hidden shadow-sm hover:shadow-md card-hover-animate card-animate-in">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center">
                  <Megaphone size={16} className="text-indigo-600 dark:text-indigo-400" />
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Announcements</h3>
              </div>
              <Link href="/announcements" className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline no-underline flex items-center gap-0.5">View <ChevronRight size={12} /></Link>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {announcements.length === 0 ? (
                <div className="px-5 py-8 text-center">
                  <Megaphone size={20} className="text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">No announcements</p>
                </div>
              ) : (
                announcements.slice(0, 4).map((a: any) => (
                  <div key={a.id} className="px-5 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${a.priority === 'urgent' ? 'bg-red-500' : a.priority === 'high' ? 'bg-amber-400' : a.priority === 'normal' ? 'bg-indigo-500' : 'bg-gray-400'}`} />
                      <div className="font-semibold text-sm text-gray-900 dark:text-white leading-tight truncate flex-1">{a.title}</div>
                    </div>
                    <div className="text-xs text-gray-500 mt-1 line-clamp-2">{a.content?.slice(0, 80)}{a.content?.length > 80 ? '...' : ''}</div>
                    <div className="flex items-center justify-between mt-1.5">
                      <div className="text-[10px] text-gray-400">By {a.poster_name || (a.first_name + ' ' + a.last_name)}</div>
                      {a.reactions && a.reactions.total > 0 && (
                        <div className="flex items-center gap-1 text-[10px] text-gray-500">
                          {a.reactions.emojis.slice(0, 2).map((r: any) => <span key={r.emoji}>{r.emoji} {r.count}</span>)}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Notifications */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200/60 dark:border-gray-700/60 overflow-hidden shadow-sm hover:shadow-md card-hover-animate card-animate-in">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center">
                  <Bell size={16} className="text-indigo-600 dark:text-indigo-400" />
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Notifications</h3>
              </div>
              <Link href="/notifications" className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline no-underline flex items-center gap-0.5">
                View All <ChevronRight size={12} />
              </Link>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {notifications.length === 0 ? (
                <div className="px-5 py-8 text-center">
                  <Bell size={20} className="text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">All caught up!</p>
                </div>
              ) : (
                notifications.slice(0, 4).map((n: any, i: number) => (
                  <div key={n.id ?? i} className="flex items-start gap-3 px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition">
                    <div className="relative shrink-0 mt-1">
                      <div className={`w-2 h-2 rounded-full ${n.is_read ? 'bg-gray-300' : 'bg-indigo-500'}`} />
                      {!n.is_read && (
                        <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-indigo-400 animate-ping opacity-60" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-gray-800 dark:text-gray-200 leading-tight line-clamp-1">
                        {n.title || n.message}
                      </div>
                      {n.message && n.title && (
                        <div className="text-xs text-gray-500 mt-0.5 line-clamp-1">{n.message}</div>
                      )}
                      {n.created_at && (
                        <div className="text-[10px] text-gray-400 mt-1 font-medium">{fmtNotifTime(n.created_at)}</div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Upcoming Events */}
          {hasCalendar && calData?.upcomingEvents?.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200/60 dark:border-gray-700/60 overflow-hidden shadow-sm hover:shadow-md card-hover-animate card-animate-in">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center">
                    <CalendarDays size={16} className="text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Upcoming Events</h3>
                </div>
                <Link href="/calendar" className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline no-underline flex items-center gap-0.5">Calendar <ChevronRight size={12} /></Link>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-700">
                {calData.upcomingEvents.slice(0, 4).map((ev: any) => (
                  <div key={ev.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition">
                    <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                      <CalendarDays size={16} className="text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-gray-900 dark:text-white truncate">{ev.title}</div>
                      <div className="text-xs text-gray-500 capitalize">{ev.category}</div>
                    </div>
                    <span className="text-xs font-medium text-gray-500 shrink-0">{fmtDateStr(ev.start_date)}</span>
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
