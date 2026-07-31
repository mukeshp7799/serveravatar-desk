/**
 * Per-feature full data + CRUD store for each feature page.
 *
 * Each store is keyed by projectId so the same project always returns
 * the same data (deterministic). All state lives in module-level Maps —
 * survives across navigations within a session.
 *
 * Pages call the `use*` hook for that feature and get back:
 *   - `items`      the current list
 *   - `loading`    true until the first render
 *   - `create`     append a new item
 *   - `update`     patch by id
 *   - `remove`     delete by id
 *
 * These are intentionally client-only. A real backend integration would
 * swap these calls for `api.post(...)` / `api.put(...)` / `api.delete(...)`.
 */

import { useEffect, useState } from 'react'
import { hashSeed } from './prng'

/* ──────────────────────────────────────────────────────────────────
 *  Shared hook
 * ────────────────────────────────────────────────────────────────── */
function useStore<T extends { id: string | number }>(
  bucket: Map<string | number, T[]>,
  projectId: string | number,
  seed: number,
  factory: (rand: () => number) => T[],
) {
  const [items, setItems] = useState<T[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const t = setTimeout(() => {
      if (!bucket.has(projectId)) {
        // mulberry32 impl imported lazily to avoid dup
        const mulberry = (s: number) => {
          let a = s
          return () => {
            a |= 0
            a = (a + 0x6d2b79f5) | 0
            let t = a
            t = Math.imul(t ^ (t >>> 15), t | 1)
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296
          }
        }
        bucket.set(projectId, factory(mulberry(seed)))
      }
      setItems(bucket.get(projectId) || [])
      setLoading(false)
    }, 100)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  return {
    items,
    loading,
    create(item: Omit<T, 'id'>) {
      const list = bucket.get(projectId) || []
      const id = `${projectId}-${list.length + 1}-${Date.now()}`
      const next = [...list, { ...item, id } as T]
      bucket.set(projectId, next)
      setItems(next)
      return next[next.length - 1]
    },
    update(id: string | number, patch: Partial<T>) {
      const list = bucket.get(projectId) || []
      const next = list.map((it) => (it.id === id ? { ...it, ...patch } : it))
      bucket.set(projectId, next)
      setItems(next)
    },
    remove(id: string | number) {
      const list = bucket.get(projectId) || []
      const next = list.filter((it) => it.id !== id)
      bucket.set(projectId, next)
      setItems(next)
    },
  }
}

/* ──────────────────────────────────────────────────────────────────
 *  1. Message Board
 * ────────────────────────────────────────────────────────────────── */
export interface Message {
  id: string | number
  author: string
  authorInitials: string
  authorColor: string
  title: string
  body: string
  createdAt: string
  category: 'update' | 'question' | 'announcement' | 'discussion'
}
const MSG_BUCKET = new Map<string | number, Message[]>()
const MSG_AUTHORS = [
  { name: 'Priya Patel', initials: 'PP', color: 'bg-pink-500' },
  { name: 'Liam Smith', initials: 'LS', color: 'bg-indigo-500' },
  { name: 'Mia Johnson', initials: 'MJ', color: 'bg-emerald-500' },
  { name: 'Ethan Brown', initials: 'EB', color: 'bg-amber-500' },
  { name: 'Ava Davis', initials: 'AD', color: 'bg-sky-500' },
]
const MSG_TITLES = [
  'Kickoff recap and next steps',
  'Design v3 — feedback wanted',
  'Performance regression in checkout',
  'Customer interview highlights — week 4',
  'API rate limits — what changed',
  'Sprint 22 demo recording',
  'New brand guidelines + Figma library',
  'Q3 OKRs — final draft',
  'Hiring update — back-end',
  'Release notes for v1.4.2',
]
const MSG_BODIES = [
  'Short summary of the meeting and what we agreed on. Action items at the end.',
  'Sharing the latest design pass. Open questions in the comments — please react with 👍 / 👀.',
  'Heads up — we saw a 12% slowdown on /checkout between 09:00 and 11:00 UTC. Investigating.',
  'Five interviews completed this week. Themes and quotes are in the linked doc.',
  'Bumped default rate limit from 60 → 120 req/min. Let me know if anything breaks.',
  'Recording link + speaker notes for last Friday’s demo.',
  'New tokens, new logo lockups. Figma library is now the source of truth.',
  'OKRs are 90% locked. Push back by EOW if anything looks off.',
  'Two offers out, three in late-stage loops. Pipeline update on Friday.',
  'Bug fixes: AUTH-441, BILL-302. New: project invites via email.',
]
const MSG_CATEGORIES: Message['category'][] = ['update', 'discussion', 'question', 'announcement']

export function useMessages(projectId: string | number) {
  return useStore<Message>(MSG_BUCKET, projectId, hashSeed(projectId) ^ 0x100, (rand) => {
    const count = 8 + Math.floor(rand() * 4)
    return Array.from({ length: count }).map((_, i) => {
      const author = MSG_AUTHORS[Math.floor(rand() * MSG_AUTHORS.length)]
      return {
        id: `${projectId}-msg-${i + 1}`,
        author: author.name,
        authorInitials: author.initials,
        authorColor: author.color,
        title: MSG_TITLES[Math.floor(rand() * MSG_TITLES.length)],
        body: MSG_BODIES[Math.floor(rand() * MSG_BODIES.length)],
        category: MSG_CATEGORIES[Math.floor(rand() * MSG_CATEGORIES.length)],
        createdAt: new Date(Date.now() - (i + 1) * (60 + Math.floor(rand() * 600)) * 60_000).toISOString(),
      }
    })
  })
}

/* ──────────────────────────────────────────────────────────────────
 *  2. To-do Lists
 * ────────────────────────────────────────────────────────────────── */
export interface TodoList {
  id: string | number
  name: string
  color: 'indigo' | 'emerald' | 'amber' | 'sky' | 'pink' | 'violet'
  todos: Todo[]
}
export interface Todo {
  id: string | number
  title: string
  completed: boolean
  assignee?: string
  due?: string
}
const TODO_BUCKET = new Map<string | number, TodoList[]>()
const TODO_LIST_NAMES = [
  'This week', 'Backlog', 'Customer asks', 'Bug fixes',
  'Polish', 'Documentation', 'Stretch goals',
]
const TODO_COLORS: TodoList['color'][] = ['indigo', 'emerald', 'amber', 'sky', 'pink', 'violet']
const TODO_TITLES = [
  'Triage new bug reports',
  'Finalize Q3 plan',
  'Update onboarding doc',
  'Review PR #482',
  'Schedule design review',
  'Email weekly digest',
  'Audit sso providers',
  'Prepare demo script',
  'Polish settings UI',
  'Write integration test',
  'Migrate users to v2 schema',
  'Plan launch comms',
]

export function useTodos(projectId: string | number) {
  return useStore<TodoList>(TODO_BUCKET, projectId, hashSeed(projectId) ^ 0x200, (rand) => {
    const count = 4 + Math.floor(rand() * 2)
    return Array.from({ length: count }).map((_, i) => ({
      id: `${projectId}-list-${i + 1}`,
      name: TODO_LIST_NAMES[i % TODO_LIST_NAMES.length],
      color: TODO_COLORS[i % TODO_COLORS.length],
      todos: Array.from({ length: 4 + Math.floor(rand() * 4) }).map((__, j) => ({
        id: `${projectId}-list-${i + 1}-todo-${j + 1}`,
        title: TODO_TITLES[Math.floor(rand() * TODO_TITLES.length)],
        completed: rand() < 0.35,
      })),
    }))
  })
}

/* ──────────────────────────────────────────────────────────────────
 *  3. Card Table (Kanban)
 * ────────────────────────────────────────────────────────────────── */
export interface KanbanCard {
  id: string | number
  title: string
  column: 'backlog' | 'in_progress' | 'review' | 'done'
  assignee?: string
  due?: string
}
const KANBAN_BUCKET = new Map<string | number, KanbanCard[]>()
const KANBAN_CARDS = [
  'Refactor auth middleware',
  'Add 2FA support',
  'Polish onboarding flow',
  'Reduce bundle size by 30%',
  'Fix accessibility issues',
  'Write integration tests',
  'Add Slack notifications',
  'Improve search relevance',
  'Migrate to Postgres 16',
  'Document deployment runbook',
  'Improve error tracking',
  'Upgrade Node.js to 22',
  'Add multi-region failover',
  'Switch CDN provider',
  'Improve billing emails',
]
const COLUMNS: KanbanCard['column'][] = ['backlog', 'in_progress', 'review', 'done']

export function useKanban(projectId: string | number) {
  return useStore<KanbanCard>(KANBAN_BUCKET, projectId, hashSeed(projectId) ^ 0x300, (rand) => {
    const count = 12 + Math.floor(rand() * 5)
    return Array.from({ length: count }).map((_, i) => {
      const col = COLUMNS[Math.floor(rand() * COLUMNS.length)]
      return {
        id: `${projectId}-kcard-${i + 1}`,
        title: KANBAN_CARDS[i % KANBAN_CARDS.length],
        column: col,
      }
    })
  })
}

/* ──────────────────────────────────────────────────────────────────
 *  4. Files & Documents
 * ────────────────────────────────────────────────────────────────── */
export interface ProjectFile {
  id: string | number
  name: string
  kind: 'pdf' | 'doc' | 'sheet' | 'image' | 'video' | 'other'
  size: string
  uploadedBy: string
  uploadedAt: string
}
const FILE_BUCKET = new Map<string | number, ProjectFile[]>()
const FILE_NAMES = [
  'brand-guidelines.pdf', 'sprint-23-review.fig', 'logo-final.png',
  'q3-financials.xlsx', 'competitive-analysis.docx', 'demo-recording.mp4',
  'architecture-v3.png', 'user-research.pdf', 'meeting-notes.md',
  'product-roadmap.pdf', 'sales-deck.pptx', 'security-audit.pdf',
]
const FILE_KINDS: ProjectFile['kind'][] = ['pdf', 'doc', 'sheet', 'image', 'video', 'other']
const FILE_SIZES = ['120 KB', '340 KB', '1.2 MB', '2.4 MB', '5.6 MB', '12 MB', '24 MB']

export function useFiles(projectId: string | number) {
  return useStore<ProjectFile>(FILE_BUCKET, projectId, hashSeed(projectId) ^ 0x400, (rand) => {
    const count = 6 + Math.floor(rand() * 4)
    return Array.from({ length: count }).map((_, i) => ({
      id: `${projectId}-file-${i + 1}`,
      name: FILE_NAMES[i % FILE_NAMES.length],
      kind: FILE_KINDS[Math.floor(rand() * FILE_KINDS.length)],
      size: FILE_SIZES[Math.floor(rand() * FILE_SIZES.length)],
      uploadedBy: MSG_AUTHORS[Math.floor(rand() * MSG_AUTHORS.length)].name,
      uploadedAt: new Date(Date.now() - (i + 1) * (30 + Math.floor(rand() * 600)) * 60_000).toISOString(),
    }))
  })
}

/* ──────────────────────────────────────────────────────────────────
 *  5. Schedule
 * ────────────────────────────────────────────────────────────────── */
export interface ScheduleEvent {
  id: string | number
  title: string
  date: string // ISO date
  type: 'meeting' | 'milestone' | 'reminder' | 'release'
}
const SCHED_BUCKET = new Map<string | number, ScheduleEvent[]>()
const SCHED_TITLES = [
  'Sprint planning', 'Demo day', 'Retro & planning',
  'Design review', 'Stakeholder update', 'Release freeze',
  'Quarterly OKR review', 'Architecture sync', 'Customer interview',
  'Hiring loop debrief', 'Roadmap review', 'Incident postmortem',
]
const SCHED_TYPES: ScheduleEvent['type'][] = ['meeting', 'milestone', 'reminder', 'release']

export function useSchedule(projectId: string | number) {
  return useStore<ScheduleEvent>(SCHED_BUCKET, projectId, hashSeed(projectId) ^ 0x500, (rand) => {
    const count = 6 + Math.floor(rand() * 4)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return Array.from({ length: count }).map((_, i) => {
      const offsetDays = -7 + Math.floor(rand() * 60)
      const d = new Date(today.getTime() + offsetDays * 24 * 60 * 60 * 1000)
      return {
        id: `${projectId}-sched-${i + 1}`,
        title: SCHED_TITLES[Math.floor(rand() * SCHED_TITLES.length)],
        date: d.toISOString(),
        type: SCHED_TYPES[Math.floor(rand() * SCHED_TYPES.length)],
      }
    }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  })
}

/* ──────────────────────────────────────────────────────────────────
 *  6. Team
 * ────────────────────────────────────────────────────────────────── */
export interface TeamMember {
  id: string | number
  name: string
  initials: string
  avatarColor: string
  email: string
  role: 'owner' | 'admin' | 'member' | 'guest'
  title: string
}
const TEAM_BUCKET = new Map<string | number, TeamMember[]>()
const TEAM_TITLES = ['Project Manager', 'Designer', 'Engineer', 'QA', 'PMM', 'Researcher', 'Data']

export function useTeam(projectId: string | number) {
  return useStore<TeamMember>(TEAM_BUCKET, projectId, hashSeed(projectId) ^ 0x600, (rand) => {
    const count = 5 + Math.floor(rand() * 4)
    const used = new Set<string>()
    return Array.from({ length: count }).map((_, i) => {
      let name = MSG_AUTHORS[i % MSG_AUTHORS.length].name
      while (used.has(name)) name = `${name.split(' ')[0]} ${i}`
      used.add(name)
      const author = MSG_AUTHORS[Math.floor(rand() * MSG_AUTHORS.length)]
      return {
        id: `${projectId}-team-${i + 1}`,
        name,
        initials: author.initials,
        avatarColor: author.color,
        email: `${name.toLowerCase().replace(' ', '.')}@example.com`,
        role: i === 0 ? 'owner' : i === 1 ? 'admin' : rand() < 0.8 ? 'member' : 'guest',
        title: TEAM_TITLES[Math.floor(rand() * TEAM_TITLES.length)],
      }
    })
  })
}

/* ──────────────────────────────────────────────────────────────────
 *  7. Chat
 * ────────────────────────────────────────────────────────────────── */
export interface ChatChannel {
  id: string | number
  name: string
  topic: string
  unread: number
  members: number
}
const CHAT_BUCKET = new Map<string | number, ChatChannel[]>()
const CHAT_NAMES = ['general', 'random', 'design', 'dev', 'launch', 'support']

export function useChatChannels(projectId: string | number) {
  return useStore<ChatChannel>(CHAT_BUCKET, projectId, hashSeed(projectId) ^ 0x700, (rand) => {
    return CHAT_NAMES.map((name, i) => ({
      id: `${projectId}-chat-${i + 1}`,
      name,
      topic: name === 'general' ? 'Project-wide chatter and announcements.'
        : name === 'random' ? 'Non-work banter and watercooler chat.'
        : name === 'design' ? 'Design reviews, asset requests, brand questions.'
        : name === 'dev' ? 'Engineering questions and deploy coordination.'
        : name === 'launch' ? 'Launch checklist, comms, and QA coordination.'
        : 'Customer issues, escalations, and bug triage.',
      unread: Math.floor(rand() * 5),
      members: 4 + Math.floor(rand() * 8),
    }))
  })
}

/* ──────────────────────────────────────────────────────────────────
 * 10. Activity Timeline
 * ────────────────────────────────────────────────────────────────── */
export interface TimelineEvent {
  id: string | number
  actor: string
  initials: string
  actorColor: string
  action: string
  target: string
  feature: 'message-board' | 'todos' | 'task-board' | 'files' | 'schedule' | 'team' | 'chat' | 'settings'
  timestamp: string
}
const TIMELINE_BUCKET = new Map<string | number, TimelineEvent[]>()
const TIMELINE_VERBS = [
  'posted', 'completed', 'moved', 'uploaded', 'updated', 'scheduled',
  'joined', 'commented on', 'edited', 'archived', 'reopened', 'created',
]
const TIMELINE_TARGETS = [
  'a message', 'a to-do', 'a card', 'a file', 'a milestone', 'a note',
  'a channel', 'a report', 'project settings', 'an invite',
]

export function useTimeline(projectId: string | number) {
  return useStore<TimelineEvent>(TIMELINE_BUCKET, projectId, hashSeed(projectId) ^ 0xa00, (rand) => {
    const count = 18 + Math.floor(rand() * 8)
    return Array.from({ length: count }).map((_, i) => {
      const author = MSG_AUTHORS[Math.floor(rand() * MSG_AUTHORS.length)]
      return {
        id: `${projectId}-tl-${i + 1}`,
        actor: author.name,
        initials: author.initials,
        actorColor: author.color,
        action: TIMELINE_VERBS[Math.floor(rand() * TIMELINE_VERBS.length)],
        target: TIMELINE_TARGETS[Math.floor(rand() * TIMELINE_TARGETS.length)],
        feature: (['message-board', 'todos', 'task-board', 'files', 'schedule', 'team', 'chat'] as const)[Math.floor(rand() * 7)],
        timestamp: new Date(Date.now() - (i + 1) * (10 + Math.floor(rand() * 180)) * 60_000).toISOString(),
      }
    })
  })
}