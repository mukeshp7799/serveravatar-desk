'use client';
import { Calendar, PartyPopper, Star, Bell } from 'lucide-react';
import GradientCard from './GradientCard';
import StatCard from './StatCard';
import ListWidget from './ListWidget';

export default function CalendarWidgets({ permissions, data }: { permissions: string[]; data: any }) {
  const calData = data?.calData;
  const hasView = permissions.includes('calendar.view');
  const widgets = [];

  if (!hasView) return null;

  // Today's Holiday
  if (calData?.todaysHoliday) {
    widgets.push(
      <GradientCard
        key="todays-holiday"
        gradient="from-red-500 to-rose-600"
        icon={Calendar}
        label="Today's Holiday"
        title={calData.todaysHoliday.name}
        subtitle={`${calData.todaysHoliday.holiday_type} Holiday`}
        delay={50}
      />
    );
  }

  // On Leave Today
  if (calData?.onLeaveToday?.length > 0) {
    widgets.push(
      <GradientCard
        key="on-leave"
        gradient="from-orange-500 to-amber-600"
        icon={Bell}
        label="On Leave Today"
        title={`${calData.onLeaveToday.length} Employee${calData.onLeaveToday.length > 1 ? 's' : ''}`}
        subtitle={calData.onLeaveToday.map((e: any) => `${e.first_name}`).join(', ')}
        delay={100}
      />
    );
  }

  // Upcoming Birthdays
  if (calData?.upcomingBirthdays?.length > 0) {
    const b = calData.upcomingBirthdays[0];
    const bd = new Date(b.date_of_birth + 'T00:00:00');
    widgets.push(
      <GradientCard
        key="upcoming-bday"
        gradient="from-pink-500 to-rose-500"
        icon={PartyPopper}
        label="🎂 Upcoming Birthday"
        title={`${b.first_name} ${b.last_name}`}
        subtitle={`${bd.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`}
        delay={120}
      />
    );
  }

  // Upcoming Anniversaries
  if (calData?.upcomingAnniversaries?.length > 0) {
    const a = calData.upcomingAnniversaries[0];
    widgets.push(
      <GradientCard
        key="upcoming-anniv"
        gradient="from-green-500 to-emerald-600"
        icon={Star}
        label="✨ Work Anniversary"
        title={`${a.first_name} ${a.last_name}`}
        subtitle={`${a.years} year${a.years > 1 ? 's' : ''}`}
        delay={140}
      />
    );
  }

  // Upcoming Events
  if (calData?.upcomingEvents?.length > 0) {
    const e = calData.upcomingEvents[0];
    widgets.push(
      <GradientCard
        key="upcoming-event"
        gradient="from-blue-500 to-indigo-600"
        icon={Calendar}
        label="📅 Next Event"
        title={e.title}
        subtitle={e.start_date}
        delay={160}
      />
    );
  }

  // Stat cards for holidays/events count
  widgets.push(
    <StatCard key="holidays-stat" label="Holidays This Month" value={calData?.todaysHoliday ? 1 : 0} icon={Calendar} color="text-red-600" bgColor="bg-red-50" delay={180} />
  );
  widgets.push(
    <StatCard key="bday-stat" label="Birthdays (30d)" value={calData?.upcomingBirthdays?.length || 0} icon={PartyPopper} color="text-pink-600" bgColor="bg-pink-50" delay={200} />
  );
  widgets.push(
    <StatCard key="event-stat" label="Events (30d)" value={calData?.upcomingEvents?.length || 0} icon={Star} color="text-blue-600" bgColor="bg-blue-50" delay={220} />
  );

  return <>{widgets}</>;
}
