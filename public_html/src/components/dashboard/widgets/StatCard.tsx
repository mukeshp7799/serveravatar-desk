"use client";
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
      className="group relative bg-white dark:bg-[#161b22] rounded-xl border border-gray-200 dark:border-gray-700/80
        hover:border-indigo-300 dark:hover:border-indigo-600
        hover:shadow-sm hover:shadow-indigo-100/60 dark:hover:shadow-indigo-900/20
        transition-all duration-200 animate-fade-in-up overflow-hidden"
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Top accent line */}
      <div
        className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-indigo-500 to-purple-500
          opacity-0 group-hover:opacity-100 transition-opacity duration-200"
      />

      <div className="flex items-center gap-3 p-4">
        {/* Icon */}
        <div
          className={`
            w-10 h-10 rounded-xl flex items-center justify-center shrink-0
            ${bgColor} ${color}
            transition-transform duration-200 group-hover:scale-105
          `}
        >
          <Icon size={18} strokeWidth={2.25} />
        </div>

        {/* Label + Value */}
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-medium text-gray-500 dark:text-gray-400 leading-tight mb-0.5">
            {label}
          </div>
          <div className="text-xl font-bold text-gray-900 dark:text-white leading-none">
            {value}
          </div>
        </div>
      </div>
    </div>
  );
}
