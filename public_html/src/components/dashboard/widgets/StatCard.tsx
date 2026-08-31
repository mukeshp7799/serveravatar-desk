'use client';
import { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: number | string;
  icon: LucideIcon;
  color?: string;
  bgColor?: string;
  link?: string;
  onClick?: () => void;
  delay?: number;
}

export default function StatCard({
  label,
  value,
  icon: Icon,
  color = "text-indigo-600",
  bgColor = "bg-indigo-50",
  delay = 0,
}: StatCardProps) {
  return (
    <div
      className="group relative bg-white dark:bg-[#161b22] rounded-2xl border border-gray-100 dark:border-gray-700/60
        hover:border-indigo-200 dark:hover:border-indigo-600/60
        hover:shadow-xl hover:shadow-indigo-200/40 dark:hover:shadow-indigo-950/30
        hover:-translate-y-0.5
        transition-all duration-300 animate-fade-in-up overflow-hidden"
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Top gradient accent bar */}
      <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

      {/* Subtle inner glow on hover */}
      <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-br from-indigo-50/40 via-transparent to-purple-50/30 dark:from-indigo-950/20 dark:via-transparent dark:to-purple-950/10 pointer-events-none" />

      <div className="relative flex items-center gap-3.5 p-4">
        {/* Icon with gradient background */}
        <div
          className={`
            w-11 h-11 rounded-xl flex items-center justify-center shrink-0
            bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-200/50 dark:shadow-indigo-900/40
            transition-transform duration-200 group-hover:scale-110 group-hover:rotate-3
          `}
        >
          <Icon size={18} strokeWidth={2.25} />
        </div>

        {/* Label + Value */}
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 leading-tight mb-1">
            {label}
          </div>
          <div className="text-2xl font-extrabold text-gray-900 dark:text-white leading-none tracking-tight">
            {value}
          </div>
        </div>
      </div>
    </div>
  );
}
