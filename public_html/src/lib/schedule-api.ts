/**
 * Schedule events — Basecamp-style calendar API hook.
 *
 * Project → Event (with optional attendee list).
 * Each mutation returns the updated event from the server; the hook merges
 * into local state.
 */

import { useCallback, useEffect, useState } from 'react';
import api from './api';

// ─── Types ──────────────────────────────────────────────────────────────────

export type ScheduleColor = 'sky' | 'emerald' | 'amber' | 'rose' | 'violet' | 'indigo';
export type ScheduleCategory = 'meeting' | 'milestone' | 'reminder' | 'release' | 'event';

export const SCHEDULE_COLORS: ScheduleColor[] = ['sky', 'emerald', 'amber', 'rose', 'violet', 'indigo'];
export const SCHEDULE_CATEGORIES: ScheduleCategory[] = ['meeting', 'milestone', 'reminder', 'release', 'event'];

export const COLOR_BG: Record<ScheduleColor, string> = {
  sky: 'bg-sky-500',
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  rose: 'bg-rose-500',
  violet: 'bg-violet-500',
  indigo: 'bg-indigo-500',
};

export const COLOR_BG_PALE: Record<ScheduleColor, string> = {
  sky: 'bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800',
  emerald: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  amber: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  rose: 'bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800',
  violet: 'bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800',
  indigo: 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
};

export interface ScheduleAttendee {
  user_id: number;
  response: 'pending' | 'accepted' | 'declined' | 'tentative';
  first_name: string;
  last_name: string;
  email: string;
}

export interface ScheduleEvent {
  id: number;
  project_id: number;
  title: string;
  description: string | null;
  start_at: string;       // ISO
  end_at: string;
  all_day: boolean;
  location: string | null;
  color: ScheduleColor;
  category: ScheduleCategory | string;
  created_at: string;
  updated_at: string | null;
  created_by: { id: number; first_name: string; last_name: string } | null;
  attendees: ScheduleAttendee[];
}

export interface EventInput {
  title: string;
  description?: string | null;
  start_at: string;
  end_at: string;
  all_day?: boolean;
  location?: string | null;
  color?: ScheduleColor;
  category?: ScheduleCategory;
  attendee_ids?: number[];
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useSchedule(projectId: string | number, { pollMs = 0 }: { pollMs?: number } = {}) {
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const projectIdStr = String(projectId);

  const refetch = useCallback(async () => {
    try {
      const r = await api.get(`/projects/${projectIdStr}/schedule`);
      setEvents((r as any).events || []);
      setError(null);
    } catch (e: any) {
      setError(e.message || 'Failed to load schedule');
    } finally {
      setLoading(false);
    }
  }, [projectIdStr]);

  useEffect(() => {
    setLoading(true);
    refetch();
    if (pollMs > 0) {
      const id = setInterval(refetch, pollMs);
      return () => clearInterval(id);
    }
    return undefined;
  }, [refetch, pollMs]);

  useEffect(() => {
    if (pollMs <= 0) return;
    const onVis = () => {
      if (document.visibilityState === 'visible') refetch();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [pollMs, refetch]);

  const create = useCallback(async (input: EventInput) => {
    const r: any = await api.post(`/projects/${projectIdStr}/schedule`, input);
    setEvents((es) => [...es, r.event]);
    return r.event as ScheduleEvent;
  }, [projectIdStr]);

  const update = useCallback(async (id: number, patch: Partial<EventInput>) => {
    const r: any = await api.patch(`/projects/${projectIdStr}/schedule/${id}`, patch);
    setEvents((es) => es.map((e) => (e.id === id ? r.event : e)));
    return r.event as ScheduleEvent;
  }, [projectIdStr]);

  const remove = useCallback(async (id: number) => {
    await api.delete(`/projects/${projectIdStr}/schedule/${id}`);
    setEvents((es) => es.filter((e) => e.id !== id));
  }, [projectIdStr]);

  return { events, loading, error, refetch, create, update, remove };
}