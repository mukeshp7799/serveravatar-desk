'use client';
import { LucideIcon } from 'lucide-react';

interface GradientCardProps {
  gradient: string;
  icon?: LucideIcon;
  label: string;
  title: string;
  subtitle?: string;
  delay?: number;
}

export default function GradientCard({ gradient, icon: Icon, label, title, subtitle, delay = 0 }: GradientCardProps) {
  return (
    <div className={`bg-gradient-to-r ${gradient} rounded-2xl p-5 text-white shadow-lg animate-fade-in-up`} style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-center gap-2 mb-1">
        {Icon && <Icon size={18} />}
        <span className="text-xs font-semibold uppercase tracking-wide opacity-80">{label}</span>
      </div>
      <div className="text-xl font-bold">{title}</div>
      {subtitle && <div className="text-xs opacity-75 mt-1">{subtitle}</div>}
    </div>
  );
}
