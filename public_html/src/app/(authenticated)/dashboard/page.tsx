"use client";
/* ──────────────────────────────────────────────────────────────
   ServerAvatar Hub — Dashboard Page (Premium Edition)
   Rich SaaS aesthetic: layered depth, glassmorphism accents,
   gradient progress bars, staggered entrance animations.
   ────────────────────────────────────────────────────────────── */

function safeFmtDate(d: any, dateFormat = "DD/MM/YYYY"): string {
  if (!d) return "-";
  try {
    let date: Date;
    if (d instanceof Date) {
      date = d;
    } else if (typeof d === "string") {
      date = d.includes("T") ? new Date(d) : new Date(d + "T12:00:00Z");
    } else {
      return "-";
    }
    if (isNaN(date.getTime())) return "-";
    const y = date.getUTCFullYear();
    const m = date.getUTCMonth() + 1;
    const day = date.getUTCDate();
    return dateFormat
      .replace("YYYY", String(y)).replace("YY", String(y).slice(-2))
      .replace("MM", String(m).padStart(2, "0")).replace("M", String(m))
      .replace("DD", String(day).padStart(2, "0")).replace("D", String(day));
  } catch { return "-"; }
}

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import {
  Users, Gem, CheckSquare, Clock, Palmtree, Bell, Megaphone,
  CalendarDays, AlertCircle, ChevronRight, Coffee,
  LogIn, LogOut, Pause, Loader2, Check, Target,
  Activity, ArrowUpRight, TrendingUp, Zap,
} from "lucide-react";
import api from "@/lib/api";
import toast from "react-hot-toast";
import StatCard from "@/components/dashboard/widgets/StatCard";
import Next7DaysWidget from "@/components/dashboard/widgets/Next7DaysWidget";
import { useDateSettings } from "@/contexts/CompanySettingsContext";

/* ── Helpers ── */
const localeMap: Record<string, string> = {
  en: "en-US", hi: "hi-IN", gu: "gu-IN", mr: "mr-IN", ur: "ur-PK",
};

function fmtTimeFallback(ts: string | null | undefined, timeFormat = "24h", tz = "UTC") {
  if (!ts) return "--:--";
  try {
    const date = new Date(ts);
    const opts: Intl.DateTimeFormatOptions = {
      timeZone: tz, hour: "2-digit", minute: "2-digit",
      hour12: timeFormat === "12h",
    };
    return new Intl.DateTimeFormat("en-GB", opts).format(date);
  } catch { return "--:--"; }
}

function fmtHrs(val: number | null | undefined) {
  if (val == null) return "—";
  const totalMins = Math.round(val * 60);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h === 0) return `${m}m`;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function fmtBreak(mins: number | null | undefined) {
  if (mins == null || mins === 0) return "0m";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtDateStr(d: any, dateFormat = "DD/MM/YYYY", tz = "UTC") {
  if (!d) return "";
  try {
    const date = new Date(d + "T00:00:00");
    const y = date.getFullYear();
    const m = date.getMonth() + 1;
    const day = date.getDate();
    return dateFormat
      .replace("YYYY", String(y)).replace("YY", String(y).slice(-2))
      .replace("MM", String(m).padStart(2, "0")).replace("M", String(m))
      .replace("DD", String(day).padStart(2, "0")).replace("D", String(day));
  } catch { return d; }
}

function timeAgo(dateStr: string): string {
  try {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h ago`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 7) return `${diffD}d ago`;
    return fmtDateStr(dateStr);
  } catch { return ""; }
}

function notifTime(ts: string): string {
  try {
    const diffMs = Date.now() - new Date(ts).getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h ago`;
    return `${Math.floor(diffH / 24)}d ago`;
  } catch { return ""; }
}

/* ── Sub-components ── */
function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const parts = name.trim().split(" ");
  const initials =
    parts.length >= 2
      ? parts[0][0] + parts[parts.length - 1][0]
      : parts[0].slice(0, 2);
  const sz =
    size === "sm" ? "w-8 h-8 text-[10px]" : "w-9 h-9 text-xs";
  return (
    <div
      className={`${sz} rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center font-bold shrink-0 shadow-md`}
    >
      {initials.toUpperCase()}
    </div>
  );
}

const PRIORITY: Record<string, string> = {
  urgent: "bg-red-50 text-red-700 ring-1 ring-red-200 dark:bg-red-950/50 dark:text-red-300 dark:ring-red-800",
  high: "bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-800",
  medium: "bg-sky-50 text-sky-700 ring-1 ring-sky-200 dark:bg-sky-950/50 dark:text-sky-300 dark:ring-sky-800",
  low: "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300 dark:ring-indigo-800",
};

const STATUS_META: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  absent:     { label: "Absent",     color: "text-red-600",    bg: "bg-red-50 dark:bg-red-950/40",     dot: "bg-red-500" },
  clocked_in: { label: "Clocked In", color: "text-green-600", bg: "bg-green-50 dark:bg-green-950/40", dot: "bg-green-500" },
  working:    { label: "Working",    color: "text-blue-600",  bg: "bg-blue-50 dark:bg-blue-950/40",   dot: "bg-blue-500" },
  on_break:   { label: "On Break",   color: "text-amber-600",bg: "bg-amber-50 dark:bg-amber-950/40", dot: "bg-amber-500" },
  completed:  { label: "Completed",  color: "text-gray-600",  bg: "bg-gray-100 dark:bg-gray-800",     dot: "bg-gray-400" },
};

/* Premium Card wrapper with hover lift */
function Card({
  children,
  className = "",
  accentColor = "indigo",
}: {
  children: React.ReactNode;
  className?: string;
  accentColor?: string;
}) {
  const accentMap: Record<string, string> = {
    indigo:  "hover:shadow-indigo-200/60 dark:hover:shadow-indigo-950/50 hover:border-indigo-200/60 dark:hover:border-indigo-700/50",
    emerald: "hover:shadow-emerald-200/60 dark:hover:shadow-emerald-950/50 hover:border-emerald-200/60 dark:hover:border-emerald-700/50",
    purple:  "hover:shadow-purple-200/60 dark:hover:shadow-purple-950/50 hover:border-purple-200/60 dark:hover:border-purple-700/50",
    orange:  "hover:shadow-orange-200/60 dark:hover:shadow-orange-950/50 hover:border-orange-200/60 dark:hover:border-orange-700/50",
    teal:    "hover:shadow-teal-200/60 dark:hover:shadow-teal-950/50 hover:border-teal-200/60 dark:hover:border-teal-700/50",
    amber:   "hover:shadow-amber-200/60 dark:hover:shadow-amber-950/50 hover:border-amber-200/60 dark:hover:border-amber-700/50",
  };
  return (
    <div
      className={`h-full flex flex-col bg-white dark:bg-[#161b22] rounded-2xl border border-gray-100 dark:border-gray-700/60
        shadow-sm hover:shadow-xl ${accentMap[accentColor] ?? accentMap.indigo}
        hover:-translate-y-0.5 transition-all duration-300 animate-fade-in-up ${className}`}
    >
      {children}
    </div>
  );
}

/* Premium Card header with colored left-border accent */
function CardHeader({
  icon: Icon,
  iconBg,
  iconColor,
  title,
  action,
  accentColor = "indigo",
}: {
  icon: any;
  iconBg: string;
  iconColor: string;
  title: React.ReactNode;
  action?: React.ReactNode;
  accentColor?: string;
}) {
  const borderMap: Record<string, string> = {
    indigo:  "border-l-indigo-500",
    emerald: "border-l-emerald-500",
    purple:  "border-l-purple-500",
    orange:  "border-l-orange-500",
    teal:    "border-l-teal-500",
    amber:   "border-l-amber-500",
  };
  return (
    <div className={`flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700/60 border-l-4 ${borderMap[accentColor] ?? borderMap.indigo}`}>
      <div className="flex items-center gap-2.5">
        <div className={`w-8 h-8 rounded-xl ${iconBg} flex items-center justify-center shrink-0 shadow-sm`}>
          <Icon size={14} className={iconColor} strokeWidth={2.5} />
        </div>
        <h3 className="text-xs font-bold text-gray-700 dark:text-gray-200 tracking-wide uppercase">
          {title}
        </h3>
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

/* Gradient progress bar component */
function GradientBar({ pct, from = "from-indigo-500", to = "to-purple-500" }: { pct: number; from?: string; to?: string }) {
  return (
    <div className="bg-gray-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden shadow-inner">
      <div
        className={`bg-gradient-to-r ${from} ${to} h-full rounded-full transition-all duration-700 relative overflow-hidden`}
        style={{ width: `${Math.min(100, pct)}%` }}
      >
        {/* Shine overlay */}
        <div className="absolute inset-0 bg-white/20 shimmer" />
      </div>
    </div>
  );
}

/* Empty state */
function EmptyState({ icon: Icon, message }: { icon: any; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-700 flex items-center justify-center mb-3 shadow-sm">
        <Icon size={20} className="text-gray-300 dark:text-gray-600" />
      </div>
      <p className="text-xs text-gray-400 dark:text-gray-500 font-medium">{message}</p>
    </div>
  );
}

/* ── Main Page ── */
export default function DashboardPage() {
  const { timezone, date_format, time_format } = useDateSettings();
  const fmtTime = (ts: string | null | undefined) =>
    fmtTimeFallback(ts, time_format, timezone);
  const fmtDateStr = (d: any) => safeFmtDate(d, date_format);

  const { t, i18n } = useTranslation();
  const [dashData, setDashData] = useState<any>(null);
  const [calData, setCalData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const [clocking, setClocking] = useState<string | null>(null);

  const fetchDashboard = () =>
    api
      .get("/dashboard")
      .then((d: any) => {
        setDashData(d);
        return d;
      })
      .catch(() => {});

  useEffect(() => {
    const t = setInterval(fetchDashboard, 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 10_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    Promise.all([
      fetchDashboard(),
      api.get("/calendar/dashboard?days=7").catch(() => null),
    ])
      .then(([dash, cal]) => {
        setDashData(dash);
        setCalData(cal);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const performAction = async (action: string) => {
    setClocking(action);
    try {
      await api.post(`/attendance/${action}`);
      toast.success("Action completed!");
      await fetchDashboard();
    } catch (err: any) {
      toast.error(err.message || "Action failed");
    } finally {
      setClocking(null);
    }
  };

  useEffect(() => {
    const update = () => {
      const d = new Date();
      const loc = localeMap[i18n.language?.split("-")[0]] || "en-US";
      const dateStr = d.toLocaleDateString(loc, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      });
      setNowStr(dateStr);
    };
    update();
    const iv = setInterval(update, 60_000);
    return () => clearInterval(iv);
  }, [i18n.language]);

  const [nowStr, setNowStr] = useState("");

  const getLiveHours = () => {
    if (!myToday) return null;
    if (myToday.live_working_hours != null) return myToday.live_working_hours;
    if (myToday.working_hours != null) return myToday.working_hours;
    if (myToday.clock_in_time && myToday.status && myToday.status !== "absent") {
      const elapsedMs = Date.now() - new Date(myToday.clock_in_time).getTime();
      const elapsedHours = elapsedMs / (1000 * 60 * 60);
      const breakHours = (myToday.total_break_minutes || 0) / 60;
      return Math.max(0, elapsedHours - breakHours);
    }
    return null;
  };

  void tick;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-12 h-12 border-[3px] border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500 font-medium">Loading dashboard…</p>
        </div>
      </div>
    );
  }

  if (!dashData) return null;

  const {
    pendingApprovals = [],
    myTasks = [],
    leaveBalances = [],
    myProjects = [],
    announcements = [],
    hrStats = {},
    attendanceStats,
    myToday,
    notifications = [],
    recentActivities = [],
  } = dashData;

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  const meta = myToday?.status ? (STATUS_META[myToday.status] || STATUS_META.completed) : null;

  // Allow clock-in when: no record, absent, or completed (after clock-out)
  const canClockIn = !myToday || ["absent", "completed"].includes(myToday.status);
  const canStartBreak = myToday && ["clocked_in", "working"].includes(myToday.status);
  const canEndBreak = myToday && myToday.status === "on_break";
  const canClockOut = myToday && ["clocked_in", "working", "on_break"].includes(myToday.status);

  const storedUser = (() => {
    try { return JSON.parse(localStorage.getItem("user") || "{}"); } catch { return {}; }
  })();
  const perms = storedUser.permissions || [];
  const has = (p: string) => perms.includes(p);
  const hasHR = has("users.view_all");
  const hasApprove = has("leaves.approve");
  const hasApply = has("leaves.apply");
  const hasAttendance = has("attendance.view_own") || has("attendance.clock");
  const hasAttendanceTeam = has("attendance.view_team") || has("attendance.manage");
  const hasCalendar = has("calendar.view");

  const userInitials = `${(storedUser.firstName || "")[0] || ""}${(storedUser.lastName || "")[0] || ""}`.toUpperCase() || "U";

  /* ── Stat card configs ── */
  const statCards = [];
  if (hasHR) {
    statCards.push({ label: "Employees", value: hrStats.totalEmployees ?? "-", icon: Users, color: "text-blue-600", bgColor: "bg-blue-50", href: "/employees", delay: 0 });
  }
  statCards.push({ label: "Projects", value: myProjects.length, icon: Gem, color: "text-purple-600", bgColor: "bg-purple-50", href: "/projects", delay: 80 });
  statCards.push({ label: "My Tasks", value: myTasks.length, icon: CheckSquare, color: "text-emerald-600", bgColor: "bg-emerald-50", href: "/projects", delay: 160 });
  if (hasApprove) {
    statCards.push({ label: "Pending Approvals", value: pendingApprovals.length, icon: Clock, color: "text-orange-600", bgColor: "bg-orange-50", href: "/leaves", delay: 240 });
  }
  if (hasAttendanceTeam && attendanceStats) {
    statCards.push({ label: "Present Today", value: attendanceStats.present_today ?? "-", icon: Users, color: "text-green-600", bgColor: "bg-green-50", href: "/attendance", delay: 320 });
    if (Number(attendanceStats.late_checkins) > 0) {
      statCards.push({ label: "Late Check-ins", value: attendanceStats.late_checkins, icon: AlertCircle, color: "text-amber-600", bgColor: "bg-amber-50", href: "/attendance", delay: 400 });
    }
  }

  const liveHours = getLiveHours();
  const progressPct = Math.min(100, ((liveHours ?? 0) / 8) * 100);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 w-full">

      {/* ══════════════════════════════════════════════════
          1. PREMIUM GREETING CARD
      ══════════════════════════════════════════════════ */}
      <div className="relative overflow-hidden rounded-3xl">
        {/* Background gradient layers */}
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-600 via-purple-600 to-indigo-800" />
        {/* Decorative mesh */}
        <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-white/5 blur-3xl" />
        <div className="absolute -bottom-10 -left-10 w-48 h-48 rounded-full bg-purple-400/10 blur-3xl" />
        <div className="absolute top-0 right-1/3 w-24 h-24 rounded-full bg-white/5 blur-2xl" />
        {/* Grid overlay */}
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '24px 24px' }} />

        <div className="relative flex items-center gap-5 px-7 py-6">
          {/* Avatar */}
          <div className="relative shrink-0">
            <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-xl font-extrabold text-white border-2 border-white/30 shadow-xl">
              {userInitials}
            </div>
            {/* Online status dot */}
            <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-green-400 border-2 border-indigo-600 shadow-md" />
          </div>

          {/* Greeting text */}
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-extrabold text-white leading-tight tracking-tight">
              {greeting}, {storedUser.firstName || storedUser.first_name || "there"}
            </h1>
            <div className="flex items-center gap-2.5 mt-1.5 flex-wrap">
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-white/15 border border-white/20 text-white/90 backdrop-blur-sm">
                <Zap size={9} className="mr-1" />
                {storedUser.roleName || "User"}
              </span>
              <span className="text-xs text-indigo-200 font-medium">{nowStr}</span>
            </div>
          </div>

          {/* Status badge */}
          {meta && (
            <div className="hidden sm:flex flex-col items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-white/15 backdrop-blur-md border border-white/20 shadow-lg">
              <span className={`w-2 h-2 rounded-full ${meta.dot} animate-pulse`} />
              <span className="text-[11px] font-bold text-white/90">{meta.label}</span>
            </div>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════
          2. STAT CARDS
      ══════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
        {statCards.map((card) => (
          <Link key={card.label} href={card.href} className="no-underline">
            <StatCard {...card} />
          </Link>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════
          3. NEXT 7 DAYS — Calendar widget
      ══════════════════════════════════════════════════ */}
      {hasCalendar && (calData?.upcomingEvents?.length > 0 || calData?.upcomingHolidays?.length > 0) && (
        <Next7DaysWidget
          upcomingEvents={calData?.upcomingEvents}
          upcomingAnniversaries={calData?.upcomingAnniversaries}
          upcomingHolidays={calData?.upcomingHolidays}
        />
      )}

      {/* ══════════════════════════════════════════════════
          4. MAIN CONTENT — premium 3-column grid
      ══════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 items-stretch">

        {/* ── Attendance Card ── */}
        {hasAttendance && (
          <div className="md:col-span-2 xl:col-span-1">
            <Card accentColor="indigo">
              <CardHeader
                icon={Clock}
                iconBg="bg-indigo-100 dark:bg-indigo-950/60"
                iconColor="text-indigo-600 dark:text-indigo-400"
                title="Attendance"
                accentColor="indigo"
                action={
                  meta ? (
                    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full ${meta.bg} ${meta.color} ring-1 ring-inset ring-black/5 dark:ring-white/10`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${meta.dot} animate-pulse`} />
                      {meta.label}
                    </span>
                  ) : undefined
                }
              />
              <div className="flex flex-col justify-between h-full p-4 gap-4">

                {/* ── Top: 2×2 Glass Stat Grid ── */}
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Clock In", value: fmtTime(myToday?.clock_in_time), accent: false, icon: LogIn },
                    { label: "Clock Out", value: fmtTime(myToday?.clock_out_time), accent: false, icon: LogOut },
                    { label: "Worked", value: fmtHrs(liveHours), accent: false, icon: TrendingUp },
                    { label: "Break", value: fmtBreak(myToday?.total_break_minutes), accent: true, icon: Coffee },
                  ].map((box) => (
                    <div
                      key={box.label}
                      className={`relative rounded-2xl p-4 text-center overflow-hidden
                        ${box.accent
                          ? "bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/20 ring-1 ring-amber-200/60 dark:ring-amber-800/40"
                          : "bg-gradient-to-br from-gray-50 to-slate-50 dark:from-gray-800/60 dark:to-slate-800/40 ring-1 ring-gray-200/60 dark:ring-gray-700/40"
                        }`}
                    >
                      {/* Subtle icon watermark */}
                      <box.icon size={28} className={`absolute -bottom-2 -right-2 opacity-5 ${box.accent ? "text-amber-400" : "text-gray-300 dark:text-gray-600"}`} />
                      <div className={`text-[9px] font-bold uppercase tracking-widest mb-1.5 ${box.accent ? "text-amber-500" : "text-gray-400 dark:text-gray-500"}`}>
                        {box.label}
                      </div>
                      <div className={`text-lg font-extrabold tracking-tight ${box.accent ? "text-amber-700 dark:text-amber-400" : "text-gray-900 dark:text-white"}`}>
                        {box.value}
                      </div>
                    </div>
                  ))}
                </div>

                {/* ── Middle: Status Insights ── */}
                <div className="flex flex-col gap-2.5">
                  {myToday?.is_late && (
                    <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 shadow-sm">
                      <div className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                      <AlertCircle size={12} className="text-amber-500 shrink-0" />
                      <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                        Late arrival — {fmtBreak(myToday.late_minutes)}
                      </span>
                    </div>
                  )}

                  {/* Day progress bar */}
                  {myToday?.clock_in_time && !myToday?.clock_out_time && (
                    <div className="flex flex-col gap-1.5 px-3.5 py-3 rounded-xl bg-gradient-to-br from-indigo-50/80 to-purple-50/80 dark:from-indigo-950/30 dark:to-purple-950/20 border border-indigo-100/60 dark:border-indigo-800/30">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-1.5">
                          <TrendingUp size={10} className="text-indigo-500" />
                          <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-500 dark:text-indigo-400">Day Progress</span>
                        </div>
                        <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-300">{fmtHrs(liveHours)} / 8h</span>
                      </div>
                      <div className="bg-white/60 dark:bg-slate-900/40 rounded-full h-2.5 overflow-hidden shadow-inner ring-1 ring-indigo-100/60 dark:ring-indigo-900/40">
                        <div
                          className="h-full rounded-full transition-all duration-700 relative overflow-hidden"
                          style={{
                            width: `${progressPct}%`,
                            background: 'linear-gradient(90deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%)',
                          }}
                        >
                          <div className="absolute inset-0 bg-gradient-to-b from-white/30 to-transparent" />
                        </div>
                      </div>
                    </div>
                  )}

                  {!myToday?.clock_in_time && (
                    <div className="flex items-center justify-center gap-2 py-3 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/40">
                      <Clock size={12} className="text-slate-400" />
                      <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
                        No active shift — clock in to start
                      </span>
                    </div>
                  )}
                </div>

                {/* ── Bottom: Action Buttons ── */}
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => performAction("clock-in")}
                    disabled={!canClockIn || !!clocking}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold
                      bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800
                      text-white disabled:opacity-40 disabled:cursor-not-allowed
                      transition-all duration-200 shadow-lg shadow-indigo-600/25 hover:shadow-indigo-700/35 hover:-translate-y-0.5"
                  >
                    {clocking === "clock-in" ? <Loader2 size={12} className="animate-spin" /> : <LogIn size={12} strokeWidth={2.5} />}
                    Clock In
                  </button>
                  <button
                    onClick={() => performAction("start-break")}
                    disabled={!canStartBreak || !!clocking}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold
                      bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600
                      text-gray-600 dark:text-gray-200 border border-gray-200 dark:border-gray-600
                      disabled:opacity-40 disabled:cursor-not-allowed
                      transition-all duration-200 shadow-sm hover:shadow-md hover:-translate-y-0.5"
                  >
                    {clocking === "start-break" ? <Loader2 size={12} className="animate-spin" /> : <Coffee size={12} strokeWidth={2.5} />}
                    Break
                  </button>
                  <button
                    onClick={() => performAction("end-break")}
                    disabled={!canEndBreak || !!clocking}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold
                      bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600
                      text-gray-600 dark:text-gray-200 border border-gray-200 dark:border-gray-600
                      disabled:opacity-40 disabled:cursor-not-allowed
                      transition-all duration-200 shadow-sm hover:shadow-md hover:-translate-y-0.5"
                  >
                    {clocking === "end-break" ? <Loader2 size={12} className="animate-spin" /> : <Pause size={12} strokeWidth={2.5} />}
                    End Break
                  </button>
                  <button
                    onClick={() => performAction("clock-out")}
                    disabled={!canClockOut || !!clocking}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold
                      bg-white dark:bg-gray-700 hover:bg-red-50 dark:hover:bg-red-950/30
                      text-red-500 dark:text-red-400 border border-red-200 dark:border-red-800/60
                      disabled:opacity-40 disabled:cursor-not-allowed
                      transition-all duration-200 shadow-sm hover:shadow-md hover:-translate-y-0.5"
                  >
                    {clocking === "clock-out" ? <Loader2 size={12} className="animate-spin" /> : <LogOut size={12} strokeWidth={2.5} />}
                    Clock Out
                  </button>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* ── Leave Balances ── */}
        {hasApply && (
          <Card accentColor="emerald">
            <CardHeader
              icon={Palmtree}
              iconBg="bg-emerald-100 dark:bg-emerald-950/60"
              iconColor="text-emerald-600 dark:text-emerald-400"
              title="Leave Balances"
              accentColor="emerald"
              action={
                <Link href="/leaves" className="flex items-center gap-1 text-[11px] font-bold text-white bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 px-3 py-1 rounded-full transition-all shadow-sm shadow-emerald-500/30">
                  Apply
                </Link>
              }
            />
            <div className="flex flex-col justify-between h-full p-4">
              {leaveBalances.length === 0 ? (
                <div className="flex-1 flex items-center justify-center">
                  <EmptyState icon={Palmtree} message="No leave allocated" />
                </div>
              ) : (
                <div className="flex-1 flex flex-col justify-around gap-4">
                  {leaveBalances.slice(0, 4).map((b: any, i: number) => {
                    const pct = Math.min(100, (parseFloat(b.current_balance) / b.max_allowed) * 100);
                    const gradients = [
                      "from-indigo-500 to-purple-500",
                      "from-emerald-500 to-teal-500",
                      "from-amber-500 to-orange-500",
                      "from-pink-500 to-rose-500",
                    ];
                    return (
                      <div key={b.leave_type_id} className="group">
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-xs font-bold text-gray-700 dark:text-gray-200">{b.leave_type_name}</span>
                          <div className="text-right">
                            <span className="text-sm font-extrabold text-gray-900 dark:text-white">{b.current_balance}</span>
                            <span className="text-[10px] text-gray-400 font-medium"> / {b.max_allowed} days</span>
                          </div>
                        </div>
                        <GradientBar pct={pct} from={`from-${['indigo','emerald','amber','pink'][i]}-500`} to={`to-${['purple','teal','orange','rose'][i]}-500`} />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </Card>
        )}

        {/* ── My Tasks ── */}
        <Card accentColor="emerald">
          <CardHeader
            icon={CheckSquare}
            iconBg="bg-emerald-100 dark:bg-emerald-950/60"
            iconColor="text-emerald-600 dark:text-emerald-400"
            title="My Tasks"
            accentColor="emerald"
            action={
              <Link href="/projects" className="flex items-center gap-0.5 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 no-underline transition-colors">
                View all <ArrowUpRight size={10} />
              </Link>
            }
          />
          <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
            {myTasks.length === 0 ? (
              <EmptyState icon={Target} message="No tasks assigned" />
            ) : (
              myTasks.slice(0, 5).map((task: any) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20 transition-colors group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-gray-800 dark:text-gray-100 truncate group-hover:text-indigo-700 dark:group-hover:text-indigo-300 transition-colors">
                      {task.title || task.description}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <Gem size={9} className="text-gray-300 dark:text-gray-600 shrink-0" />
                      <span className="text-[10px] text-gray-400 dark:text-gray-500 truncate">{task.project_name}</span>
                      <span className="text-gray-200 dark:text-gray-700">·</span>
                      <span className="text-[10px] text-gray-400 dark:text-gray-500 truncate">{task.column_name}</span>
                    </div>
                  </div>
                  <span className={`shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-lg ${PRIORITY[task.priority] || PRIORITY.low}`}>
                    {task.priority}
                  </span>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* ── My Projects ── */}
        <Card accentColor="purple">
          <CardHeader
            icon={Gem}
            iconBg="bg-purple-100 dark:bg-purple-950/60"
            iconColor="text-purple-600 dark:text-purple-400"
            title="My Projects"
            accentColor="purple"
            action={
              <Link href="/projects" className="flex items-center gap-0.5 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 no-underline transition-colors">
                View all <ArrowUpRight size={10} />
              </Link>
            }
          />
          <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
            {myProjects.length === 0 ? (
              <EmptyState icon={Gem} message="No projects assigned" />
            ) : (
              myProjects.slice(0, 4).map((proj: any) => {
                const pct = proj.total_tasks > 0 ? Math.round((proj.done_tasks / proj.total_tasks) * 100) : 0;
                return (
                  <div key={proj.id} className="px-4 py-3.5 hover:bg-purple-50/40 dark:hover:bg-purple-950/20 transition-colors group">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-gray-800 dark:text-gray-100 truncate mr-2 group-hover:text-purple-700 dark:group-hover:text-purple-300 transition-colors">
                        {proj.name}
                      </span>
                      <span className="text-[11px] font-extrabold text-purple-600 dark:text-purple-400 shrink-0">{pct}%</span>
                    </div>
                    <GradientBar pct={pct} from="from-purple-500" to="to-pink-500" />
                  </div>
                );
              })
            )}
          </div>
        </Card>

        {/* ── Pending Approvals ── */}
        {hasApprove && (
          <Card accentColor="orange">
            <CardHeader
              icon={Clock}
              iconBg="bg-orange-100 dark:bg-orange-950/60"
              iconColor="text-orange-600 dark:text-orange-400"
              title="Pending Approvals"
              accentColor="orange"
              action={
                <span className="flex items-center gap-1 bg-orange-100 dark:bg-orange-900/50 text-orange-600 dark:text-orange-300 px-2 py-0.5 rounded-full text-[10px] font-bold ring-1 ring-orange-200/60 dark:ring-orange-800/40">
                  {pendingApprovals.length}
                </span>
              }
            />
            <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
              {pendingApprovals.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-green-50 dark:bg-green-950/40 flex items-center justify-center mb-3 shadow-sm">
                    <Check size={22} className="text-green-500" />
                  </div>
                  <p className="text-xs font-semibold text-green-600 dark:text-green-400">All caught up!</p>
                </div>
              ) : (
                pendingApprovals.slice(0, 4).map((lr: any) => (
                  <div key={lr.id} className="flex items-center gap-3 px-4 py-3.5 hover:bg-orange-50/40 dark:hover:bg-orange-950/20 transition-colors">
                    <Avatar name={`${lr.first_name} ${lr.last_name}`} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-gray-800 dark:text-gray-100 truncate">
                        {lr.first_name} {lr.last_name}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Palmtree size={9} className="text-gray-300 dark:text-gray-600 shrink-0" />
                        <span className="text-[10px] text-gray-400 dark:text-gray-500">{lr.leave_type}</span>
                        <span className="text-gray-200 dark:text-gray-700">·</span>
                        <span className="text-[10px] text-gray-400 dark:text-gray-500">{fmtDateStr(lr.start_date)}</span>
                      </div>
                    </div>
                    <Link href="/leaves" className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 shrink-0 transition-colors">
                      Review →
                    </Link>
                  </div>
                ))
              )}
            </div>
          </Card>
        )}

        {/* ── Announcements ── */}
        {announcements.length > 0 && (
          <Card accentColor="indigo">
            <CardHeader
              icon={Megaphone}
              iconBg="bg-indigo-100 dark:bg-indigo-950/60"
              iconColor="text-indigo-600 dark:text-indigo-400"
              title="Announcements"
              accentColor="indigo"
              action={
                <Link href="/announcements" className="flex items-center gap-0.5 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 no-underline transition-colors">
                  View all <ArrowUpRight size={10} />
                </Link>
              }
            />
            <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
              {announcements.slice(0, 3).map((a: any) => (
                <div key={a.id} className="px-4 py-3.5 hover:bg-indigo-50/40 dark:hover:bg-indigo-950/20 transition-colors">
                  <div className="flex items-center gap-2 mb-1">
                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 shadow-sm ${a.priority === "urgent" ? "bg-red-500" : "bg-indigo-400"}`} />
                    <div className="text-[11px] font-bold text-gray-800 dark:text-gray-100 leading-tight line-clamp-1">
                      {a.title}
                    </div>
                  </div>
                  <div className="text-[10px] text-gray-400 dark:text-gray-500 ml-3.5 leading-relaxed line-clamp-2">
                    {a.content?.slice(0, 100)}{a.content?.length > 100 ? "…" : ""}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* ── Recent Activity ── */}
        {(recentActivities.length > 0 || has("activity_logs.view_own") || has("activity_logs.view_all")) && (
          <Card accentColor="teal">
            <CardHeader
              icon={Activity}
              iconBg="bg-teal-100 dark:bg-teal-950/60"
              iconColor="text-teal-600 dark:text-teal-400"
              title="Recent Activity"
              accentColor="teal"
              action={
                <Link href="/activity-logs" className="flex items-center gap-0.5 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 no-underline transition-colors">
                  All <ChevronRight size={10} />
                </Link>
              }
            />
            <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
              {recentActivities.length === 0 ? (
                <EmptyState icon={Activity} message="No activity yet" />
              ) : (
                recentActivities.slice(0, 4).map((log: any) => (
                  <div key={log.id} className="px-4 py-3 hover:bg-teal-50/40 dark:hover:bg-teal-950/20 transition-colors">
                    <div className="text-[11px] text-gray-700 dark:text-gray-200 leading-relaxed font-medium">
                      {log.description || log.action}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 ring-1 ring-teal-200/60 dark:ring-teal-800/40 uppercase tracking-wider">
                        {log.module}
                      </span>
                      <span className="text-[10px] text-gray-400">{timeAgo(log.created_at)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        )}

        {/* ── Notifications ── */}
        <Card accentColor="amber">
          <CardHeader
            icon={Bell}
            iconBg="bg-amber-100 dark:bg-amber-950/60"
            iconColor="text-amber-600 dark:text-amber-400"
            title="Notifications"
            accentColor="amber"
            action={
              <Link href="/notifications" className="flex items-center gap-0.5 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 no-underline transition-colors">
                All <ChevronRight size={10} />
              </Link>
            }
          />
          <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
            {notifications.length === 0 ? (
              <EmptyState icon={Bell} message="All caught up!" />
            ) : (
              notifications.slice(0, 4).map((n: any, i: number) => (
                <div key={n.id ?? i} className="flex items-start gap-3 px-4 py-3.5 hover:bg-amber-50/30 dark:hover:bg-amber-950/20 transition-colors">
                  <div className="relative shrink-0 mt-0.5">
                    <div className={`w-2 h-2 rounded-full mt-1 ${n.is_read ? "bg-gray-300" : "bg-indigo-500 shadow-sm shadow-indigo-300/50"}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-bold text-gray-800 dark:text-gray-100 leading-tight truncate">
                      {n.title || n.message}
                    </div>
                    {n.message && n.title && (
                      <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 line-clamp-1">{n.message}</div>
                    )}
                    {n.created_at && (
                      <div className="text-[9px] text-gray-400 mt-0.5">{notifTime(n.created_at)}</div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

      </div>
    </div>
  );
}
