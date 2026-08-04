'use client';
import { useState, useEffect } from 'react';
import { Gem } from 'lucide-react';
import StatCard from './StatCard';
import ListWidget from './ListWidget';

export default function ProjectsWidget({ data }: { data: any }) {
  const myProjects = data?.myProjects || [];
  const widgets = [];

  if (myProjects.length > 0) {
    widgets.push(
      <StatCard key="my-projects" label="My Projects" value={myProjects.length} icon={Gem} color="text-purple-600" bgColor="bg-purple-50" delay={50} />
    );
  }

  widgets.push(
    <ListWidget
      key="my-projects-list"
      title="My Projects"
      icon={Gem}
      items={myProjects}
      emptyText="No projects assigned"
      viewAllHref="/projects"
      delay={150}
      renderItem={(proj: any) => {
        const done = proj.done_tasks || 0;
        const total = proj.total_tasks || 0;
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
        return (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-sm text-gray-800 truncate">{proj.name}</div>
              <div className="text-xs text-gray-500 mt-0.5">{total} tasks · {done} done</div>
            </div>
            <div className="w-16 bg-gray-100 rounded-full h-2 shrink-0">
              <div className="bg-purple-600 h-full rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      }}
    />
  );

  return <>{widgets}</>;
}
