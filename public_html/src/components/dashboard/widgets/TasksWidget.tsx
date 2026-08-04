'use client';
import { Check } from 'lucide-react';
import ListWidget from './ListWidget';

const PRIORITY_CLASSES: Record<string, string> = {
  urgent: 'bg-red-50 text-red-700 border border-red-200',
  high: 'bg-amber-50 text-amber-700 border border-amber-200',
  medium: 'bg-sky-50 text-sky-700 border border-sky-200',
  low: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
};

export default function TasksWidget({ data }: { data: any }) {
  const myTasks = data?.myTasks || [];

  return (
    <ListWidget
      title="My Tasks"
      icon={Check}
      items={myTasks}
      emptyText="No tasks assigned"
      viewAllHref="/projects"
      delay={200}
      renderItem={(task: any) => (
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-sm text-gray-800 truncate">{task.title || task.description}</div>
            <div className="text-xs text-gray-500 mt-0.5">{task.project_name} • {task.column_name}</div>
          </div>
          <span className={`shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${PRIORITY_CLASSES[task.priority] || PRIORITY_CLASSES.low}`}>
            {task.priority}
          </span>
        </div>
      )}
    />
  );
}
