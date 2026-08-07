'use client';
import { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';
import StatCard from './StatCard';
import ListWidget from './ListWidget';
import api from '@/lib/api';

export default function AttendanceWidget({ permissions, data }: { permissions: string[]; data: any }) {
  const myToday = data?.myToday;
  const stats = data?.attendanceStats;
  const hasViewTeam = permissions.includes('attendance.view_team') || permissions.includes('attendance.manage_all');
  const hasViewOwn = permissions.includes('attendance.view_own') || permissions.includes('attendance.clock_in_out');

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'clocked_in': return 'text-green-600 bg-green-50';
      case 'working': return 'text-blue-600 bg-blue-50';
      case 'on_break': return 'text-amber-600 bg-amber-50';
      case 'completed': return 'text-gray-600 bg-gray-50';
      case 'absent': return 'text-red-600 bg-red-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'clocked_in': return 'Clocked In';
      case 'working': return 'Working';
      case 'on_break': return 'On Break';
      case 'completed': return 'Completed';
      case 'absent': return 'Absent';
      default: return status || 'Unknown';
    }
  };

  const widgets = [];

  if (hasViewOwn && myToday) {
    widgets.push(
      <div key="my-attendance" className="rounded-xl p-4 sm:p-5 bg-white border border-gray-200 card-hover animate-fade-in-up" style={{ animationDelay: '250ms' }}>
        <div className="flex items-center gap-3 mb-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${getStatusColor(myToday.status)}`}>
            <Clock size={20} />
          </div>
          <div>
            <div className="text-xs font-semibold text-gray-500">Today&apos;s Attendance</div>
            <div className="text-sm font-bold text-gray-900 capitalize">{getStatusLabel(myToday.status)}</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
          {myToday.clock_in_time && <div>🕐 In: {new Date(myToday.clock_in_time).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</div>}
          {myToday.clock_out_time && <div>🏁 Out: {new Date(myToday.clock_out_time).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</div>}
          {myToday.working_hours != null && <div>⏱️ {myToday.working_hours.toFixed(1)}h worked</div>}
          {myToday.is_late && <div className="text-amber-600">⏰ Late by {myToday.late_minutes}m</div>}
        </div>
      </div>
    );
  }

  if (hasViewOwn && !myToday) {
    widgets.push(
      <StatCard key="no-attendance" label="Today's Attendance" value="—" icon={Clock} color="text-gray-400" bgColor="bg-gray-50" delay={250} />
    );
  }

  if (hasViewTeam && stats) {
    widgets.push(
      <StatCard key="present-today" label="Present Today" value={stats.present_today} icon={Clock} color="text-green-600" bgColor="bg-green-50" delay={300} />
    );
    widgets.push(
      <StatCard key="late-checkins" label="Late Check-ins" value={stats.late_checkins} icon={Clock} color="text-amber-600" bgColor="bg-amber-50" delay={350} />
    );
  }

  return <>{widgets}</>;
}
