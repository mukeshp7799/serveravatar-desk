"use client";
/* ──────────────────────────────────────────────────────────────
   ServerAvatar Hub — Dashboard Page (Redesigned)
   Clean SaaS aesthetic: white cards, subtle borders, consistent
   spacing, refined typography, responsive grid.
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
  Activity, Star, PartyPopper, ArrowUpRight,
} from "lucide-react";
import api from "@/lib/api";
import toast from "react-hot-toast";
import StatCard from "@/components/dashboard/widgets/StatCard";
import GradientCard from "@/components/dashboard/widgets/GradientCard";
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
    size === "sm" ? "w-7 h-7 text-[10px]" : "w-8 h-8 text-xs";
  return (
    <div
      className={`${sz} rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold shrink-0`}
    >
      {initials.toUpperCase()}
    </div>
  );
}

const PRIORITY: Record<string, string> = {
  urgent: "bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800",
  high: "bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
  medium: "bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800",
  low: "bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800",
};

const STATUS_META: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  absent:     { label: "Absent",     color: "text-red-600",   bg: "bg-red-50 dark:bg-red-950/40",    dot: "bg-red-500" },
  clocked_in:  { label: "Clocked In", color: "text-green-600", bg: "bg-green-50 dark:bg-green-950/40", dot: "bg-green-500" },
  working:     { label: "Working",    color: "text-blue-600",  bg: "bg-blue-50 dark:bg-blue-950/40",   dot: "bg-blue-500" },
  on_break:    { label: "On Break",   color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/40",dot: "bg-amber-500" },
  completed:   { label: "Completed",  color: "text-gray-600",  bg: "bg-gray-100 dark:bg-gray-800",     dot: "bg-gray-400" },
};

/* Card wrapper — consistent SaaS card styling */
function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`bg-white dark:bg-[#161b22] rounded-xl border border-gray-200 dark:border-gray-700/80
        shadow-sm transition-shadow duration-200 hover:shadow-md ${className}`}
    >
      {children}
    </div>
  );
}

/* Card header */
function CardHeader({
  icon: Icon,
  iconBg,
  iconColor,
  title,
  action,
}: {
  icon: any;
  iconBg: string;
  iconColor: string;
  title: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700/80">
      <div className="flex items-center gap-2">
        <div className={`w-7 h-7 rounded-lg ${iconBg} flex items-center justify-center shrink-0`}>
          <Icon size={13} className={iconColor} strokeWidth={2.25} />
        </div>
        <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-200">
          {title}
        </h3>
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

/* Empty state */
function EmptyState({ icon: Icon, message }: { icon: any; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
      <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-2">
        <Icon size={18} className="text-gray-300 dark:text-gray-600" />
      </div>
      <p className="text-xs text-gray-400 dark:text-gray-500">{message}</p>
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

  // Refresh attendance every 60s
  useEffect(() => {
    const t = setInterval(fetchDashboard, 60_000);
    return () => clearInterval(t);
  }, []);

  // Re-render for live hours every 10s
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 10_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    Promise.all([
      fetchDashboard(),
      api.get("/calendar/dashboard").catch(() => null),
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

  // Live working hours computation
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

  // Force tick dependency
  void tick;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-10 h-10 border-[3px] border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Loading dashboard…</p>
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

  const canClockIn = !myToday || myToday.status === "absent";
  const canStartBreak = myToday && ["clocked_in", "working"].includes(myToday.status);
  const canEndBreak = myToday && myToday.status === "on_break";
  const canClockOut = myToday && ["clocked_in", "working", "on_break"].includes(myToday.status);

  const storedUser = (() => {
    try { return JSON.parse(localStorage.getItem("user") || "{}"); } catch { return {}; }
  })();
  const perms = storedUser.permissions || [];
  const has = (p: string) => perms.includes(p);
  const hasHR = has("hr.view_directory") || has("hr.manage_all") || has("employees.view_all");
  const hasApprove = has("leave.approve");
  const hasApply = has("leave.apply");
  const hasAttendance = has("attendance.view_own") || has("attendance.clock_in_out");
  const hasAttendanceTeam = has("attendance.view_team") || has("attendance.manage_all");
  const hasCalendar = has("calendar.view");

  const userInitials = `${(storedUser.firstName || "")[0] || ""}${(storedUser.lastName || "")[0] || ""}`.toUpperCase() || "U";

  /* ── Stat card configs ── */
  const statCards = [];
  if (hasHR) {
    statCards.push({
      label: "Employees",
      value: hrStats.totalEmployees ?? "-",
      icon: Users,
      color: "text-blue-600",
      bgColor: "bg-blue-50 dark:bg-blue-950/40",
      href: "/employees",
      delay: 0,
    });
  }
  statCards.push({
    label: "Projects",
    value: myProjects.length,
    icon: Gem,
    color: "text-purple-600",
    bgColor: "bg-purple-50 dark:bg-purple-950/40",
    href: "/projects",
    delay: 50,
  });
  statCards.push({
    label: "My Tasks",
    value: myTasks.length,
    icon: CheckSquare,
    color: "text-emerald-600",
    bgColor: "bg-emerald-50 dark:bg-emerald-950/40",
    href: "/projects",
    delay: 100,
  });
  if (hasApprove) {
    statCards.push({
      label: "Pending Approvals",
      value: pendingApprovals.length,
      icon: Clock,
      color: "text-orange-600",
      bgColor: "bg-orange-50 dark:bg-orange-950/40",
      href: "/leaves",
      delay: 150,
    });
  }
  if (hasAttendanceTeam && attendanceStats) {
    statCards.push({
      label: "Present Today",
      value: attendanceStats.present_today ?? "-",
      icon: Users,
      color: "text-green-600",
      bgColor: "bg-green-50 dark:bg-green-950/40",
      href: "/attendance",
      delay: 200,
    });
    if (Number(attendanceStats.late_checkins) > 0) {
      statCards.push({
        label: "Late Check-ins",
        value: attendanceStats.late_checkins,
        icon: AlertCircle,
        color: "text-amber-600",
        bgColor: "bg-amber-50 dark:bg-amber-950/40",
        href: "/attendance",
        delay: 250,
      });
    }
  }

  /* ── Gradient highlights ── */
  const gradientItems = [];
  if (calData?.todaysHoliday) {
    gradientItems.push({
      gradient: "from-red-500 to-rose-600",
      icon: CalendarDays,
      label: "Today's Holiday",
      title: calData.todaysHoliday.name,
      href: "/calendar",
      delay: 100,
    });
  }
  if (calData?.onLeaveToday?.length > 0) {
    gradientItems.push({
      gradient: "from-orange-500 to-amber-600",
      icon: Bell,
      label: "On Leave Today",
      title: `${calData.onLeaveToday.length} Employee${calData.onLeaveToday.length > 1 ? "s" : ""}`,
      delay: 150,
    });
  }
  if (calData?.upcomingBirthdays?.length > 0) {
    const b = calData.upcomingBirthdays[0];
    gradientItems.push({
      gradient: "from-pink-500 to-rose-500",
      icon: PartyPopper,
      label: "Next Birthday",
      title: `${b.first_name} ${b.last_name}`,
      href: "/calendar",
      delay: 200,
    });
  }
  if (calData?.upcomingEvents?.length > 0) {
    const ev = calData.upcomingEvents[0];
    gradientItems.push({
      gradient: "from-blue-500 to-indigo-600",
      icon: Star,
      label: "Next Event",
      title: ev.title,
      href: "/calendar",
      delay: 250,
    });
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-5 w-full">

      {/* ══════════════════════════════════════════════════
          1. GREETING CARD
      ══════════════════════════════════════════════════ */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 text-white shadow-lg">
        {/* Decorative circles */}
        <div className="absolute -top-8 -right-8 w-36 h-36 rounded-full bg-white/10" />
        <div className="absolute -bottom-6 -left-6 w-24 h-24 rounded-full bg-white/8" />
        <div className="absolute top-2 right-1/4 w-8 h-8 rounded-full bg-white/6" />

        <div className="relative flex items-center gap-4 px-6 py-5">
          <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-lg font-bold shrink-0 border border-white/30">
            {userInitials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-lg sm:text-xl font-bold leading-tight">
              {greeting}, {storedUser.firstName || storedUser.first_name || "there"}
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-white/20 border border-white/30">
                {storedUser.roleName || "User"}
              </span>
              <span className="text-xs text-indigo-200">{nowStr}</span>
            </div>
          </div>
          {meta && (
            <div className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold ${meta.bg} ${meta.color}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${meta.dot} animate-pulse`} />
              {meta.label}
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
          3. GRADIENT HIGHLIGHTS (Calendar strip)
      ══════════════════════════════════════════════════ */}
      {hasCalendar && gradientItems.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {gradientItems.map((item) => (
            <GradientCard key={item.label} {...item} />
          ))}
        </div>
      )}

      {/* ══════════════════════════════════════════════════
          4. MAIN CONTENT — 3-column grid
      ══════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">

        {/* ── Column 1 ── */}
        <div className="space-y-5">

          {/* Attendance */}
          {hasAttendance && (
            <Card>
              <CardHeader
                icon={Clock}
                iconBg="bg-indigo-50 dark:bg-indigo-950/40"
                iconColor="text-indigo-600 dark:text-indigo-400"
                title="Attendance"
                action={
                  meta ? (
                    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${meta.bg} ${meta.color}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${meta.dot} animate-pulse`} />
                      {meta.label}
                    </span>
                  ) : undefined
                }
              />
              <div className="p-4 space-y-3">
                {/* Time boxes */}
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { label: "Clock In", value: fmtTime(myToday?.clock_in_time), accent: false },
                    { label: "Clock Out", value: fmtTime(myToday?.clock_out_time), accent: false },
                    { label: "Worked", value: fmtHrs(getLiveHours()), accent: false },
                    { label: "Break", value: fmtBreak(myToday?.total_break_minutes), accent: true },
                  ].map((box) => (
                    <div
                      key={box.label}
                      className={`rounded-xl p-2.5 text-center ${box.accent ? "bg-amber-50 dark:bg-amber-950/40" : "bg-gray-50 dark:bg-gray-800/60"}`}
                    >
                      <div className="text-[10px] font-medium text-gray-400 dark:text-gray-500 mb-0.5 leading-none">
                        {box.label}
                      </div>
                      <div className={`text-sm font-bold leading-none ${box.accent ? "text-amber-600 dark:text-amber-400" : "text-gray-900 dark:text-white"}`}>
                        {box.value}
                      </div>
                    </div>
                  ))}
                </div>

                {myToday?.is_late && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800">
                    <AlertCircle size={11} className="text-amber-500 shrink-0" />
                    <span className="text-[11px] text-amber-700 dark:text-amber-300 font-medium">
                      Late by {myToday.late_minutes || 0} min
                    </span>
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    onClick={() => performAction("clock-in")}
                    disabled={!canClockIn || !!clocking}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
                      bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-40 disabled:cursor-not-allowed
                      transition-colors shadow-sm"
                  >
                    {clocking === "clock-in" ? <Loader2 size={11} className="animate-spin" /> : <LogIn size={11} strokeWidth={2.5} />}
                    Clock In
                  </button>
                  <button
                    onClick={() => performAction("start-break")}
                    disabled={!canStartBreak || !!clocking}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
                      bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600
                      text-gray-700 dark:text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed
                      transition-colors"
                  >
                    {clocking === "start-break" ? <Loader2 size={11} className="animate-spin" /> : <Coffee size={11} strokeWidth={2.5} />}
                    Break
                  </button>
                  <button
                    onClick={() => performAction("end-break")}
                    disabled={!canEndBreak || !!clocking}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
                      bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600
                      text-gray-700 dark:text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed
                      transition-colors"
                  >
                    {clocking === "end-break" ? <Loader2 size={11} className="animate-spin" /> : <Pause size={11} strokeWidth={2.5} />}
                    End Break
                  </button>
                  <button
                    onClick={() => performAction("clock-out")}
                    disabled={!canClockOut || !!clocking}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
                      bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-900/40
                      text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800
                      disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {clocking === "clock-out" ? <Loader2 size={11} className="animate-spin" /> : <LogOut size={11} strokeWidth={2.5} />}
                    Clock Out
                  </button>
                </div>
              </div>
            </Card>
          )}

          {/* Leave Balances */}
          {hasApply && (
            <Card>
              <CardHeader
                icon={Palmtree}
                iconBg="bg-emerald-50 dark:bg-emerald-950/40"
                iconColor="text-emerald-600 dark:text-emerald-400"
                title="Leave Balances"
                action={
                  <Link href="/leaves" className="flex items-center gap-0.5 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline no-underline">
                    Apply <ArrowUpRight size={10} />
                  </Link>
                }
              />
              <div className="p-4 space-y-3">
                {leaveBalances.length === 0 ? (
                  <EmptyState icon={Palmtree} message="No leave allocated" />
                ) : (
                  leaveBalances.slice(0, 4).map((b: any) => {
                    const pct = Math.min(100, (parseFloat(b.current_balance) / b.max_allowed) * 100);
                    return (
                      <div key={b.leave_type_id}>
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{b.leave_type_name}</span>
                          <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                            {b.current_balance}
                            <span className="text-gray-400 font-normal">/{b.max_allowed}</span>
                          </span>
                        </div>
                        <div className="bg-gray-100 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-indigo-500 h-full rounded-full transition-all duration-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </Card>
          )}

          {/* Work Anniversaries */}
          {hasCalendar && calData?.upcomingAnniversaries?.length > 0 && (
            <Card>
              <CardHeader
                icon={Star}
                iconBg="bg-amber-50 dark:bg-amber-950/40"
                iconColor="text-amber-600 dark:text-amber-400"
                title="Work Anniversaries"
              />
              <div className="divide-y divide-gray-100 dark:divide-gray-700/80">
                {calData.upcomingAnniversaries.slice(0, 3).map((a: any) => (
                  <div key={a.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                    <Avatar name={`${a.first_name} ${a.last_name}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-gray-900 dark:text-white">
                        {a.first_name} {a.last_name}
                      </div>
                      <div className="text-[11px] text-gray-500">{a.years} year{a.years > 1 ? "s" : ""}</div>
                    </div>
                    <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full shrink-0">
                      {fmtDateStr(a.hire_date)}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* ── Column 2 ── */}
        <div className="space-y-5">

          {/* My Tasks */}
          <Card>
            <CardHeader
              icon={CheckSquare}
              iconBg="bg-emerald-50 dark:bg-emerald-950/40"
              iconColor="text-emerald-600 dark:text-emerald-400"
              title="My Tasks"
              action={
                <Link href="/projects" className="flex items-center gap-0.5 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline no-underline">
                  View all <ArrowUpRight size={10} />
                </Link>
              }
            />
            <div className="divide-y divide-gray-100 dark:divide-gray-700/80">
              {myTasks.length === 0 ? (
                <EmptyState icon={Target} message="No tasks assigned" />
              ) : (
                myTasks.slice(0, 5).map((task: any) => (
                  <div
                    key={task.id}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-gray-800 dark:text-gray-100 truncate">
                        {task.title || task.description}
                      </div>
                      <div className="text-[11px] text-gray-500 mt-0.5 truncate">
                        {task.project_name} · {task.column_name}
                      </div>
                    </div>
                    <span className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold border ${PRIORITY[task.priority] || PRIORITY.low}`}>
                      {task.priority}
                    </span>
                  </div>
                ))
              )}
            </div>
          </Card>

          {/* My Projects */}
          <Card>
            <CardHeader
              icon={Gem}
              iconBg="bg-purple-50 dark:bg-purple-950/40"
              iconColor="text-purple-600 dark:text-purple-400"
              title="My Projects"
              action={
                <Link href="/projects" className="flex items-center gap-0.5 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline no-underline">
                  View all <ArrowUpRight size={10} />
                </Link>
              }
            />
            <div className="divide-y divide-gray-100 dark:divide-gray-700/80">
              {myProjects.length === 0 ? (
                <EmptyState icon={Gem} message="No projects assigned" />
              ) : (
                myProjects.slice(0, 4).map((proj: any) => {
                  const pct = proj.total_tasks > 0 ? Math.round((proj.done_tasks / proj.total_tasks) * 100) : 0;
                  return (
                    <div key={proj.id} className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-semibold text-gray-900 dark:text-white truncate mr-2">
                          {proj.name}
                        </span>
                        <span className="text-[11px] font-bold text-purple-600 dark:text-purple-400 shrink-0">
                          {pct}%
                        </span>
                      </div>
                      <div className="bg-gray-100 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-purple-500 h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Card>
        </div>

        {/* ── Column 3 ── */}
        <div className="space-y-5">

          {/* Pending Approvals */}
          {hasApprove && (
            <Card>
              <CardHeader
                icon={Clock}
                iconBg="bg-orange-50 dark:bg-orange-950/40"
                iconColor="text-orange-600 dark:text-orange-400"
                title={
                  <span>
                    Pending
                    {pendingApprovals.length > 0 && (
                      <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-orange-100 dark:bg-orange-900/60 text-[9px] font-bold text-orange-700 dark:text-orange-300">
                        {pendingApprovals.length}
                      </span>
                    )}
                  </span>
                }
                action={
                  <Link href="/leaves" className="flex items-center gap-0.5 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline no-underline">
                    View all <ArrowUpRight size={10} />
                  </Link>
                }
              />
              <div className="divide-y divide-gray-100 dark:divide-gray-700/80">
                {pendingApprovals.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
                    <div className="w-10 h-10 rounded-xl bg-green-50 dark:bg-green-950/40 flex items-center justify-center mb-2">
                      <Check size={18} className="text-green-500" />
                    </div>
                    <p className="text-xs text-gray-400 dark:text-gray-500">All caught up!</p>
                  </div>
                ) : (
                  pendingApprovals.slice(0, 4).map((lr: any) => (
                    <div
                      key={lr.id}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors"
                    >
                      <Avatar name={`${lr.first_name} ${lr.last_name}`} size="sm" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-gray-900 dark:text-white truncate">
                          {lr.first_name} {lr.last_name}
                        </div>
                        <div className="text-[11px] text-gray-500 mt-0.5">
                          {lr.leave_type} · {fmtDateStr(lr.start_date)}
                        </div>
                      </div>
                      <Link href="/leaves" className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 shrink-0 hover:underline">
                        Review
                      </Link>
                    </div>
                  ))
                )}
              </div>
            </Card>
          )}

          {/* Announcements */}
          {announcements.length > 0 && (
            <Card>
              <CardHeader
                icon={Megaphone}
                iconBg="bg-indigo-50 dark:bg-indigo-950/40"
                iconColor="text-indigo-600 dark:text-indigo-400"
                title="Announcements"
                action={
                  <Link href="/announcements" className="flex items-center gap-0.5 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline no-underline">
                    View all <ArrowUpRight size={10} />
                  </Link>
                }
              />
              <div className="divide-y divide-gray-100 dark:divide-gray-700/80">
                {announcements.slice(0, 3).map((a: any) => (
                  <div key={a.id} className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${a.priority === "urgent" ? "bg-red-500" : "bg-indigo-400"}`}
                      />
                      <div className="text-xs font-semibold text-gray-900 dark:text-white leading-tight truncate">
                        {a.title}
                      </div>
                    </div>
                    <div className="text-[11px] text-gray-500 ml-3.5 line-clamp-1">
                      {a.content?.slice(0, 80)}
                      {a.content?.length > 80 ? "…" : ""}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Recent Activity */}
          {(recentActivities.length > 0 || has("activity_logs.view_own") || has("activity_logs.view_all")) && (
            <Card>
              <CardHeader
                icon={Activity}
                iconBg="bg-teal-50 dark:bg-teal-950/40"
                iconColor="text-teal-600 dark:text-teal-400"
                title="Recent Activity"
                action={
                  <Link href="/activity-logs" className="flex items-center gap-0.5 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline no-underline">
                    All <ChevronRight size={10} />
                  </Link>
                }
              />
              <div className="divide-y divide-gray-100 dark:divide-gray-700/80">
                {recentActivities.length === 0 ? (
                  <EmptyState icon={Activity} message="No activity yet" />
                ) : (
                  recentActivities.slice(0, 4).map((log: any) => (
                    <div key={log.id} className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                      <div className="text-[12px] text-gray-700 dark:text-gray-200 leading-snug">
                        {log.description || log.action}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
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

          {/* Notifications */}
          <Card>
            <CardHeader
              icon={Bell}
              iconBg="bg-amber-50 dark:bg-amber-950/40"
              iconColor="text-amber-600 dark:text-amber-400"
              title="Notifications"
              action={
                <Link href="/notifications" className="flex items-center gap-0.5 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline no-underline">
                  All <ChevronRight size={10} />
                </Link>
              }
            />
            <div className="divide-y divide-gray-100 dark:divide-gray-700/80">
              {notifications.length === 0 ? (
                <EmptyState icon={Bell} message="All caught up!" />
              ) : (
                notifications.slice(0, 4).map((n: any, i: number) => (
                  <div
                    key={n.id ?? i}
                    className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors"
                  >
                    <div className="relative shrink-0 mt-1">
                      <div className={`w-1.5 h-1.5 rounded-full ${n.is_read ? "bg-gray-300" : "bg-indigo-500"}`} />
                      {!n.is_read && (
                        <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-indigo-400" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-gray-800 dark:text-gray-100 leading-tight truncate">
                        {n.title || n.message}
                      </div>
                      {n.message && n.title && (
                        <div className="text-[11px] text-gray-500 mt-0.5 line-clamp-1">{n.message}</div>
                      )}
                      {n.created_at && (
                        <div className="text-[10px] text-gray-400 mt-0.5">{notifTime(n.created_at)}</div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          {/* Upcoming Events */}
          {hasCalendar && calData?.upcomingEvents?.length > 0 && (
            <Card>
              <CardHeader
                icon={CalendarDays}
                iconBg="bg-blue-50 dark:bg-blue-950/40"
                iconColor="text-blue-600 dark:text-blue-400"
                title="Upcoming Events"
                action={
                  <Link href="/calendar" className="flex items-center gap-0.5 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline no-underline">
                    View all <ArrowUpRight size={10} />
                  </Link>
                }
              />
              <div className="divide-y divide-gray-100 dark:divide-gray-700/80">
                {calData.upcomingEvents.slice(0, 4).map((ev: any) => (
                  <div
                    key={ev.id}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center shrink-0">
                      <CalendarDays size={13} className="text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-gray-900 dark:text-white truncate">
                        {ev.title}
                      </div>
                      <div className="text-[11px] text-gray-500 capitalize">{ev.category}</div>
                    </div>
                    <span className="text-[11px] font-medium text-gray-500 shrink-0">
                      {fmtDateStr(ev.start_date)}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
