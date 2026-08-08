'use client';
import { Clock, Coffee, TrendingUp } from 'lucide-react';
import StatCard from './StatCard';
import api from '@/lib/api';

function fmtBreak(mins: number | null | undefined) {
  if (mins == null || mins === 0) return '0m';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function AttendanceWidget({ permissions, data }: { permissions: string[]; data: any }) {
  const myToday = data?.myToday;
  const stats = data?.attendanceStats;
  const hasViewTeam = permissions.includes('attendance.view_team') || permissions.includes('attendance.manage_all');
  const hasViewOwn = permissions.includes('attendance.view_own') || permissions.includes('attendance.clock_in_out');

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'clocked_in': return 'text-emerald-600 bg-emerald-50';
      case 'working': return 'text-blue-600 bg-blue-50';
      case 'on_break': return 'text-amber-600 bg-amber-50';
      case 'completed': return 'text-gray-600 bg-gray-50';
      case 'absent': return 'text-red-600 bg-red-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'clocked_in': return 'Working';
      case 'working': return 'Working';
      case 'on_break': return 'On Break';
      case 'completed': return 'Completed';
      case 'absent': return 'Absent';
      default: return status || 'Unknown';
    }
  };

  // Resolve working hours: live (in-progress) takes priority over stored
  const displayHours = myToday?.live_working_hours ?? myToday?.working_hours ?? null;

  const widgets = [];

  if (hasViewOwn) {
    // Today's Working Hours — prominent stat card
    widgets.push(
      <StatCard
        key="today-work-hours"
        label="Today's Working Hours"
        value={displayHours != null ? `${displayHours.toFixed(1)}h` : '—'}
        icon={TrendingUp}
        color="text-indigo-600"
        bgColor="bg-indigo-50"
        delay={250}
      />
    );

    // Today's Total Break Time
    widgets.push(
      <StatCard
        key="today-break"
        label="Today's Break Time"
        value={fmtBreak(myToday?.total_break_minutes)}
        icon={Coffee}
        color="text-amber-600"
        bgColor="bg-amber-50"
        delay={300}
      />
    );
  }

  if (hasViewTeam && stats) {
    widgets.push(
      <StatCard key="present-today" label="Present Today" value={stats.present_today} icon={Clock} color="text-green-600" bgColor="bg-green-50" delay={350} />
    );
    widgets.push(
      <StatCard key="late-checkins" label="Late Check-ins" value={stats.late_checkins} icon={Clock} color="text-amber-600" bgColor="bg-amber-50" delay={400} />
    );
  }

  return <>{widgets}</>;
}
