'use client';
import { useState, useEffect } from 'react';
import api from '@/lib/api';

// Singleton — permissions are loaded once and shared
let globalPermissions: string[] = [];
let globalPermsLoaded = false;
let loadingPromise: Promise<void> | null = null;

async function loadPermissions(): Promise<void> {
  if (globalPermsLoaded) return;
  if (loadingPromise) return loadingPromise;

  loadingPromise = api.get('/auth/me')
    .then(data => {
      globalPermissions = data.user?.permissions || [];
      globalPermsLoaded = true;
    })
    .catch(() => {
      try {
        const stored = JSON.parse(localStorage.getItem('user') || '{}');
        globalPermissions = stored.permissions || [];
      } catch {}
      globalPermsLoaded = true;
    });
  return loadingPromise;
}

export function usePermissions() {
  // Initialize with whatever is available immediately
  const [permissions, setPermissions] = useState<string[]>(globalPermissions);
  const [loaded, setLoaded] = useState(globalPermsLoaded);

  useEffect(() => {
    if (loaded) return; // already have permissions
    loadPermissions().then(() => {
      setPermissions([...globalPermissions]);
      setLoaded(true);
    });
  }, [loaded]);

  const hasPermission = (perm: string) => permissions.includes(perm);
  const hasAny = (perms: string[]) => perms.some(p => permissions.includes(p));
  const hasAll = (perms: string[]) => perms.every(p => permissions.includes(p));

  return { permissions, hasPermission, hasAny, hasAll, loaded };
}
