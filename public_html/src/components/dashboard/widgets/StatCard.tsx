'use client';
import { LucideIcon } from 'lucide-react';

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

export default function StatCard({ label, value, icon: Icon, color = 'text-indigo-600', bgColor = 'bg-indigo-50', delay = 0 }: StatCardProps) {
  return (
    <div
      className="rounded-xl p-3 sm:p-4 bg-white border border-gray-200 hover:border-indigo-300 hover:shadow-sm transition animate-fade-in-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center gap-3">
        {/* Icon */}
        <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl ${bgColor} ${color} flex items-center justify-center shrink-0`}>
          <Icon size={18} strokeWidth={2.25} />
        </div>

        {/* Label */}
        <div className="text-[11px] sm:text-xs font-semibold text-gray-500 leading-tight">{label}</div>

        {/* Count — right side, centered vertically */}
        <div className="ml-auto text-xl sm:text-2xl font-bold text-gray-900 leading-none flex items-center">
          {value}
        </div>
      </div>
    </div>
  );
}
