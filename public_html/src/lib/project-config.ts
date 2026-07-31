/**
 * Static UI config for the Project Dashboard.
 *
 * Pure data — no API calls, no random generation, no DB state. These
 * helpers describe the structure of the dashboard (which cards exist,
 * where they link to, what tabs to render) and can be safely called
 * on the server.
 *
 * Separated from `mock-project-data.ts` (now deleted) so the rest of the
 * app can import config without pulling in random-data generators.
 */

import type { FeatureCardConfig, QuickAction } from '@/types/project'

/* ──────────────────────────────────────────────────────────────────
 * Feature card config (one entry per dashboard card).
 * ────────────────────────────────────────────────────────────────── */
export const FEATURE_CARDS: FeatureCardConfig[] = [
  {
    key: 'message-board',
    title: 'Message Board',
    description: 'Long-form updates and announcements from the team.',
    iconName: 'MessageSquare',
    accent: 'indigo',
    href: (id) => `/projects/${id}/message-board`,
  },
  {
    key: 'todos',
    title: 'To-do Lists',
    description: 'Track work items assigned across the project.',
    iconName: 'ListChecks',
    accent: 'emerald',
    href: (id) => `/projects/${id}/todos`,
  },
  {
    key: 'task-board',
    title: 'Task Board',
    description: 'Kanban-style board with custom columns, drag-and-drop, and rich task details.',
    iconName: 'KanbanSquare',
    accent: 'sky',
    href: (id) => `/projects/${id}/task-board`,
  },
  {
    key: 'test-cases',
    title: 'Test Cases',
    description: 'Manage test suites, test cases, steps, and results.',
    iconName: 'ClipboardCheck',
    accent: 'teal',
    href: (id) => `/projects/${id}/test-cases`,
  },
  {
    key: 'files',
    title: 'Files & Documents',
    description: 'Shared uploads, downloads, and rich-text documents.',
    iconName: 'Folder',
    accent: 'amber',
    href: (id) => `/projects/${id}/files`,
  },
  {
    key: 'schedule',
    title: 'Schedule',
    description: 'Milestones, meetings, and deadlines on a calendar.',
    iconName: 'Calendar',
    accent: 'rose',
    href: (id) => `/projects/${id}/schedule`,
  },
  {
    key: 'team',
    title: 'Team Members',
    description: 'Roles and access for everyone working on this project.',
    iconName: 'Users',
    accent: 'violet',
    href: (id) => `/projects/${id}/team`,
  },
  {
    key: 'chat',
    title: 'Chat',
    description: 'Quick channels for real-time conversation.',
    iconName: 'Hash',
    accent: 'cyan',
    href: (id) => `/projects/${id}/chat`,
  },
  {
    key: 'activity',
    title: 'Activity Timeline',
    description: 'Everything that has happened, in chronological order.',
    iconName: 'Activity',
    accent: 'orange',
    href: (id) => `/projects/${id}/activity`,
  },
]

/** QuickActions list for the dashboard header. */
export function getQuickActions(projectId: number | string): QuickAction[] {
  const base = `/projects/${projectId}`
  return [
    { key: 'new-message', label: 'New message', iconName: 'MessageSquare', href: `${base}/message-board` },
    { key: 'new-todo',    label: 'Add to-do',   iconName: 'ListChecks',    href: `${base}/todos` },
    { key: 'new-task',    label: 'New task',    iconName: 'KanbanSquare',  href: `${base}/task-board` },
    { key: 'new-test',    label: 'New test case', iconName: 'ClipboardCheck', href: `${base}/test-cases` },
    { key: 'upload',      label: 'Upload file', iconName: 'Upload',        href: `${base}/files` },
    { key: 'invite',      label: 'Invite',      iconName: 'UserPlus',      href: `${base}/team` },
    { key: 'settings',    label: 'Settings',    iconName: 'Settings',      href: `${base}/settings` },
  ]
}

/* ──────────────────────────────────────────────────────────────────
 * Project tabs
 *
 * Returns the navigation pill bar shown on every /projects/[id]/* page.
 * Order: Dashboard → all features → Settings. The Dashboard tab points
 * to the project root, so it doubles as the "Back to dashboard" home.
 * ────────────────────────────────────────────────────────────────── */
export interface ProjectTab {
  key: string
  label: string
  iconName: string
  href: string
  accent: string
}

export function getProjectTabs(projectId: number | string): ProjectTab[] {
  const tabs: ProjectTab[] = [
    {
      key: 'dashboard',
      label: 'Dashboard',
      iconName: 'LayoutGrid',
      href: `/projects/${projectId}`,
      accent: 'slate',
    },
  ]

  for (const card of FEATURE_CARDS) {
    tabs.push({
      key: card.key,
      label: card.title,
      iconName: card.iconName,
      href: card.href(projectId),
      accent: card.accent,
    })
  }

  tabs.push({
    key: 'settings',
    label: 'Settings',
    iconName: 'Settings',
    href: `/projects/${projectId}/settings`,
    accent: 'slate',
  })

  return tabs
}
