'use client';
import { Bell, Inbox } from 'lucide-react';
import ListWidget from './ListWidget';

export default function NotificationsWidget({ permissions, data }: { permissions: string[]; data: any }) {
  const hasView = permissions.includes('notifications.view') || permissions.includes('notifications.manage');
  if (!hasView) return null;

  const notifications = data?.notifications || [];

  return (
    <ListWidget
      title="Notifications"
      icon={Bell}
      items={notifications}
      emptyText="No notifications"
      delay={450}
      renderItem={(n: any) => (
        <div className="flex items-start gap-3">
          <div className={`w-2 h-2 rounded-full mt-2 shrink-0 ${n.is_read ? 'bg-gray-300' : 'bg-indigo-500'}`} />
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-sm text-gray-800">{n.title || n.message}</div>
            {n.message && n.title && <div className="text-xs text-gray-500 mt-0.5">{n.message}</div>}
          </div>
        </div>
      )}
    />
  );
}
