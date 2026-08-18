"use client";
import { LucideIcon } from "lucide-react";
import Link from "next/link";

interface GradientCardProps {
  gradient: string;
  icon?: LucideIcon;
  label: string;
  title: string;
  subtitle?: string;
  href?: string;
  delay?: number;
}

export default function GradientCard({
  gradient,
  icon: Icon,
  label,
  title,
  subtitle,
  href,
  delay = 0,
}: GradientCardProps) {
  const content = (
    <div
      className={`
        relative overflow-hidden rounded-2xl p-5
        bg-gradient-to-br ${gradient}
        text-white shadow-md hover:shadow-lg hover:-translate-y-0.5
        transition-all duration-200 animate-fade-in-up cursor-pointer
      `}
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Decorative orb */}
      <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-white/10 blur-2xl pointer-events-none" />
      <div className="absolute -bottom-4 -left-4 w-16 h-16 rounded-full bg-black/10 blur-xl pointer-events-none" />

      <div className="relative">
        {Icon && (
          <div className="flex items-center gap-1.5 mb-2">
            <Icon size={13} strokeWidth={2.5} className="opacity-80" />
            <span className="text-[11px] font-semibold uppercase tracking-wider opacity-75">
              {label}
            </span>
          </div>
        )}
        <div className="text-lg font-bold leading-snug">{title}</div>
        {subtitle && (
          <div className="text-xs opacity-70 mt-1 leading-snug">{subtitle}</div>
        )}
      </div>
    </div>
  );

  if (href) {
    return <Link href={href} className="no-underline block">{content}</Link>;
  }
  return content;
}
