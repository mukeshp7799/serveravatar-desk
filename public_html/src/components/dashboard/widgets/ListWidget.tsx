'use client';
import { LucideIcon } from 'lucide-react';
import Link from 'next/link';

interface ListWidgetProps {
  title: string;
  icon: LucideIcon;
  items: any[];
  emptyText: string;
  renderItem: (item: any) => React.ReactNode;
  viewAllHref?: string;
  viewAllLabel?: string;
  delay?: number;
  headerAction?: React.ReactNode;
}

export default function ListWidget({ title, icon: Icon, items, emptyText, renderItem, viewAllHref, viewAllLabel = 'View All →', delay = 0, headerAction }: ListWidgetProps) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden animate-fade-in-up" style={{ animationDelay: `${delay}ms` }}>
      <div className="border-b border-gray-200 px-5 py-4 flex justify-between items-center">
        <div className="flex items-center gap-2 text-gray-900">
          <Icon size={20} strokeWidth={2.5} />
          <h3 className="font-bold">{title}</h3>
        </div>
        <div className="flex items-center gap-2">
          {headerAction}
          {viewAllHref && (
            <Link href={viewAllHref} className="text-xs font-medium text-indigo-600 hover:text-indigo-800 no-underline">
              {viewAllLabel}
            </Link>
          )}
        </div>
      </div>
      <div className="divide-y divide-gray-100">
        {items.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-gray-400 text-sm">{emptyText}</p>
          </div>
        ) : (
          items.slice(0, 5).map((item, i) => (
            <div key={item.id ?? i} className="px-5 py-3.5 row-hover">
              {renderItem(item)}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
