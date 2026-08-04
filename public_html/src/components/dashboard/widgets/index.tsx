'use client';
import { usePermissions } from '@/hooks/usePermissions';
import EmployeesWidget from './EmployeesWidget';
import ProjectsWidget from './ProjectsWidget';
import TasksWidget from './TasksWidget';
import AttendanceWidget from './AttendanceWidget';
import LeaveWidget from './LeaveWidget';
import CalendarWidgets from './CalendarWidgets';
import AnnouncementsWidget from './AnnouncementsWidget';
import NotificationsWidget from './NotificationsWidget';

interface DashboardData {
  pendingApprovals: any[];
  myTasks: any[];
  leaveBalances: any[];
  myProjects: any[];
  announcements: any[];
  hrStats: any;
  attendanceStats: any;
  myToday: any;
  notifications: any[];
  calData: any;
}

export default function WidgetRenderer({ data }: { data: DashboardData }) {
  const { permissions, hasPermission, hasAny, loaded } = usePermissions();

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <>
      <EmployeesWidget permissions={permissions} data={data} />
      <ProjectsWidget data={data} />
      <TasksWidget data={data} />
      <AttendanceWidget permissions={permissions} data={data} />
      <LeaveWidget permissions={permissions} data={data} />
      <CalendarWidgets permissions={permissions} data={data} />
      <AnnouncementsWidget data={data} />
      <NotificationsWidget permissions={permissions} data={data} />
    </>
  );
}
