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
      className="rounded-xl p-4 sm:p-5 bg-white border border-gray-200 hover:border-indigo-300 hover:shadow-sm transition hover-lift animate-fade-in-up card-hover"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-lg ${bgColor} ${color} flex items-center justify-center mb-3`}>
        <Icon size={20} strokeWidth={2.25} />
      </div>
      <div className="text-xs sm:text-sm font-semibold text-gray-500 mb-1">{label}</div>
      <div className="text-2xl sm:text-3xl font-bold text-gray-900 leading-none">
        {value}
      </div>
    </div>
  );
}
