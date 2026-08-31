'use client';
import { CalendarDays } from 'lucide-react';
import Link from 'next/link';

interface EventItem {
  id: number;
  title: string;
  start_date: string;
  category: string;
  color?: string;
  subtitle?: string;
}

interface AnniversaryItem {
  id: number;
  first_name: string;
  last_name: string;
  hire_date: string;
  years: number;
  upcoming_month?: number;
  upcoming_day?: number;
}

interface Next7DaysWidgetProps {
  upcomingEvents?: EventItem[];
  upcomingAnniversaries?: AnniversaryItem[];
  upcomingHolidays?: EventItem[];
  delay?: number;
}

const CATEGORY_COLORS: Record<string, string> = {
  holiday:     'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400',
  festival:    'bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400',
  anniversary: 'bg-cyan-50 text-cyan-600 dark:bg-cyan-950/40 dark:text-cyan-400',
  birthday:    'bg-pink-50 text-pink-600 dark:bg-pink-950/40 dark:text-pink-400',
  company:     'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400',
  event:       'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400',
};

function parseDate(dateStr: string) {
  const d = new Date(dateStr);
  return {
    year:  d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day:   d.getUTCDate(),
  };
}

// Map anniversary to event structure
function anniversaryToEvent(a: AnniversaryItem): EventItem {
  const month = a.upcoming_month ?? parseDate(a.hire_date).month;
  const day   = a.upcoming_day   ?? parseDate(a.hire_date).day;
  const year  = new Date().getUTCFullYear();
  const start_date = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}T00:00:00.000Z`;
  return {
    id: a.id,
    title: `${a.first_name} ${a.last_name}`,
    subtitle: `${a.years} year${a.years > 1 ? 's' : ''} Work Anniversary`,
    start_date,
    category: 'anniversary',
  };
}

function getMonthName(month: number) {
  return ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][month - 1] ?? '';
}

export default function Next7DaysWidget({ upcomingEvents = [], upcomingAnniversaries = [], upcomingHolidays = [], delay = 0 }: Next7DaysWidgetProps) {
  // Merge anniversaries and holidays into the events list
  const anniversaryEvents = (upcomingAnniversaries || []).map(anniversaryToEvent);
  const allEvents: EventItem[] = [
    ...(upcomingEvents || []),
    ...anniversaryEvents,
    ...(upcomingHolidays || []),
  ];

  // Sort by date ascending
  allEvents.sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());

  if (allEvents.length === 0) return null;

  return (
    <div
      className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm animate-fade-in-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Header */}
      <div className="px-5 py-4 flex items-center justify-between border-b border-gray-100">
        <div className="flex items-center gap-2">
          <CalendarDays size={18} strokeWidth={2.5} className="text-indigo-600" />
          <h3 className="font-bold text-gray-900 text-sm">Next 7 Days</h3>
        </div>
        <Link
          href="/calendar"
          className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline no-underline"
        >
          View calendar ↗
        </Link>
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 p-4">
        {allEvents.slice(0, 8).map((ev) => {
          const { month, day } = parseDate(ev.start_date);
          const colorClass = CATEGORY_COLORS[ev.category?.toLowerCase()] ?? CATEGORY_COLORS.event;
          return (
            <div
              key={ev.id}
              className="flex items-start gap-2.5 p-2.5 rounded-xl bg-gray-50 dark:bg-gray-800/60 hover:bg-gray-100 dark:hover:bg-gray-700/80 transition-colors"
            >
              {/* Date badge */}
              <div className="flex flex-col items-center justify-center w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-600 to-purple-600 text-white shrink-0">
                <span className="text-[9px] font-bold leading-none opacity-80">{getMonthName(month)}</span>
                <span className="text-sm font-bold leading-none">{day}</span>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded-full mb-0.5 capitalize ${colorClass}`}>
                  {ev.category}
                </span>
                <div className="text-[11px] font-semibold text-gray-800 dark:text-gray-100 leading-tight line-clamp-2">
                  {ev.title}
                </div>
                {ev.subtitle && (
                  <div className="text-[10px] text-gray-400 leading-tight mt-0.5 line-clamp-1">
                    {ev.subtitle}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
