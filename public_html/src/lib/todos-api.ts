/**
 * To-do Lists — Basecamp-style checklists API hook.
 *
 * Project → List → Item hierarchy.
 *
 * Each mutation returns the updated lists payload from the server (mirrors the
 * backend's `loadFull` response shape) — the hook merges it into local state
 * so callers don't need to refetch.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api from './api';

// ─── Types ──────────────────────────────────────────────────────────────────

export type TodoColor = 'indigo' | 'emerald' | 'amber' | 'sky' | 'pink' | 'violet';

export interface UserSummary {
  id: number;
  first_name: string;
  last_name: string;
}

export interface TodoItem {
  id: number;
  list_id: number;
  title: string;
  notes: string | null;
  completed: boolean;
  completed_at: string | null;
  due_date: string | null;
  assignee_id: number | null;
  assignee: UserSummary | null;
  completed_by: UserSummary | null;
  position: number;
  created_at: string;
  updated_at: string | null;
  created_by: UserSummary | null;
}

export interface TodoList {
  id: number;
  name: string;
  color: TodoColor;
  position: number;
  created_at: string;
  updated_at: string | null;
  created_by: UserSummary | null;
  items: TodoItem[];
}

export interface NewItemInput {
  title: string;
  notes?: string | null;
  assignee_id?: number | null;
  due_date?: string | null;
}

export interface NewListInput {
  name: string;
  color?: TodoColor;
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useTodos(projectId: string | number, { pollMs = 0 }: { pollMs?: number } = {}) {
  const [lists, setLists] = useState<TodoList[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const projectIdStr = String(projectId);

  const refetch = useCallback(async () => {
    try {
      const r = await api.get(`/projects/${projectIdStr}/todos`);
      setLists((r as any).lists || []);
      setError(null);
    } catch (e: any) {
      setError(e.message || 'Failed to load to-do lists');
    } finally {
      setLoading(false);
    }
  }, [projectIdStr]);

  // Initial load + optional polling
  useEffect(() => {
    setLoading(true);
    refetch();
    if (pollMs > 0) {
      const id = setInterval(refetch, pollMs);
      return () => clearInterval(id);
    }
    return undefined;
  }, [refetch, pollMs]);

  // Pause polling when tab is hidden — same pattern as chat
  useEffect(() => {
    if (pollMs <= 0) return;
    const onVis = () => {
      if (document.visibilityState === 'visible') refetch();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [pollMs, refetch]);

  // ─── List ops ────────────────────────────────────────────────────────────

  const createList = useCallback(async (input: NewListInput) => {
    const r: any = await api.post(`/projects/${projectIdStr}/todos/lists`, input);
    setLists(r.lists || []);
    return r.list as TodoList;
  }, [projectIdStr]);

  const updateList = useCallback(async (listId: number, patch: Partial<NewListInput & { position: number }>) => {
    const r: any = await api.patch(`/projects/${projectIdStr}/todos/lists/${listId}`, patch);
    setLists(r.lists || []);
    return r.list as TodoList;
  }, [projectIdStr]);

  const removeList = useCallback(async (listId: number) => {
    const r: any = await api.delete(`/projects/${projectIdStr}/todos/lists/${listId}`);
    setLists(r.lists || []);
  }, [projectIdStr]);

  // ─── Item ops ────────────────────────────────────────────────────────────

  const createItem = useCallback(async (listId: number, input: NewItemInput) => {
    const r: any = await api.post(`/projects/${projectIdStr}/todos/lists/${listId}/items`, input);
    setLists(r.lists || []);
    return r.item as TodoItem;
  }, [projectIdStr]);

  const updateItem = useCallback(async (itemId: number, patch: Partial<NewItemInput & { completed: boolean; position: number }>) => {
    const r: any = await api.patch(`/projects/${projectIdStr}/todos/items/${itemId}`, patch);
    setLists(r.lists || []);
    return r.item as TodoItem;
  }, [projectIdStr]);

  const removeItem = useCallback(async (itemId: number) => {
    const r: any = await api.delete(`/projects/${projectIdStr}/todos/items/${itemId}`);
    setLists(r.lists || []);
  }, [projectIdStr]);

  const reorderItems = useCallback(async (listId: number, order: { id: number; position: number }[]) => {
    const r: any = await api.patch(`/projects/${projectIdStr}/todos/lists/${listId}/items/reorder`, { order });
    setLists(r.lists || []);
  }, [projectIdStr]);

  // ─── Derived state ───────────────────────────────────────────────────────

  const stats = useMemo(() => {
    let total = 0, completed = 0;
    for (const l of lists) {
      total += l.items.length;
      completed += l.items.filter((i) => i.completed).length;
    }
    return { total, completed };
  }, [lists]);

  return {
    lists,
    loading,
    error,
    stats,
    refetch,
    createList,
    updateList,
    removeList,
    createItem,
    updateItem,
    removeItem,
    reorderItems,
  };
}