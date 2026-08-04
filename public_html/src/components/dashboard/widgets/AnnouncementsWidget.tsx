'use client';
import { Megaphone, Inbox, Pin } from 'lucide-react';
import ListWidget from './ListWidget';

export default function AnnouncementsWidget({ data }: { data: any }) {
  const announcements = data?.announcements || [];

  return (
    <ListWidget
      title="Announcements"
      icon={Megaphone}
      items={announcements}
      emptyText="No announcements yet"
      viewAllHref="/announcements"
      delay={400}
      renderItem={(a: any) => (
        <div>
          <div className="flex items-start gap-1.5 mb-0.5">
            {a.is_pinned && (
              <span className="mt-0.5 shrink-0">
                <Pin size={10} className="text-amber-500" />
              </span>
            )}
            <div className={`font-bold text-sm text-gray-800 leading-tight ${a.is_pinned ? '' : 'ml-4'}`}>{a.title}</div>
          </div>
          <div className="text-xs text-gray-500 line-clamp-2">{a.content?.substring(0, 100)}{a.content?.length > 100 ? '...' : ''}</div>
          <div className="flex items-center gap-2 mt-1">
            <div className="text-[10px] text-gray-400">By {a.first_name} {a.last_name}</div>
            {a.reactions?.total > 0 && (
              <div className="text-[10px] text-gray-400 flex items-center gap-0.5">
                {a.reactions.emojis?.slice(0, 3).map((r: any) => (
                  <span key={r.emoji}>{r.emoji}</span>
                ))}
                {a.reactions.total > 0 && <span>{a.reactions.total}</span>}
              </div>
            )}
          </div>
        </div>
      )}
    />
  );
}
