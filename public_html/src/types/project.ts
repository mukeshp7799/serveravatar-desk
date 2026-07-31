/**
 * TypeScript interfaces for the Basecamp-style Project Hub.
 *
 * The dashboard at /projects/[projectId] shows SUMMARY data only — counts,
 * last activity, recent titles. Full CRUD lives on the dedicated feature
 * pages (message-board, todos, card-table, files, schedule, team, chat,
 * activity, settings).
 *
 * All mock data is generated deterministically per projectId so the same
 * project always looks the same across reloads.
 */

export type ID = number | string

export interface ProjectMember {
  id: ID
  name: string
  initials: string
  role: 'owner' | 'admin' | 'member' | 'guest'
  email: string
  avatarColor: string
}

export interface ProjectMeta {
  id: ID
  name: string
  description: string
  status: 'active' | 'on_hold' | 'completed' | 'cancelled'
  createdAt: string
  updatedAt: string
  owner: ProjectMember
  memberCount: number
}

/** Generic summary record shown on a dashboard card. */
export interface FeatureSummary {
  /** Total count of items in this feature (e.g. messages, tasks, files). */
  count: number
  /** ISO timestamp of the last write — rendered as relative time. */
  lastUpdatedAt: string
  /** Short title for the most recent item (e.g. "Sprint planning"). */
  recentTitle: string
  /** One- or two-line preview of the most recent activity. */
  recentActivity: string
  /** Name/initials of the person who triggered the recent activity. */
  recentActor: string
}

export interface ProjectSummary {
  project: ProjectMeta
  messageBoard: FeatureSummary
  todos: FeatureSummary
  taskBoard: FeatureSummary
  files: FeatureSummary
  schedule: FeatureSummary
  team: FeatureSummary
  chat: FeatureSummary
  activity: FeatureSummary
}

/** Shape used by QuickActions on the dashboard header. */
export interface QuickAction {
  key: string
  label: string
  iconName:
    | 'Plus'
    | 'MessageSquare'
    | 'ListChecks'
    | 'LayoutGrid'
    | 'Upload'
    | 'CalendarPlus'
    | 'UserPlus'
    | 'Hash'
    | 'FileText'
    | 'BarChart3'
    | 'Settings'
    | 'KanbanSquare'
    | 'ClipboardCheck'
  /** Route or callback target. */
  href: string
}

/** Stat tile shown in ProjectStats (top of dashboard). */
export interface ProjectStat {
  key: string
  label: string
  value: string | number
  trend?: 'up' | 'down' | 'flat'
  trendValue?: string
  iconName: 'ListChecks' | 'MessageSquare' | 'Users' | 'BarChart3'
  tone: 'indigo' | 'emerald' | 'amber' | 'sky' | 'pink'
}

/** Single recent-activity entry used by the RecentActivity component. */
export interface ActivityEntry {
  id: ID
  actor: string
  initials: string
  actorColor: string
  action: string
  target: string
  featureKey:
    | 'message-board'
    | 'todos'
    | 'task-board'
    | 'files'
    | 'schedule'
    | 'team'
    | 'chat'
    | 'settings'
  timestamp: string
}

/* ─── Real-API Message Board types ─── */

export interface Reaction {
  emoji: string
  count: number
  mine: boolean
  /**
   * Display names of users who reacted with this emoji, in chronological order.
   * Used to render the hover tooltip ("Liked by Mukesh, Rahul, Priya, ...").
   * Server returns these — backend JOINs on `users` and aggregates by emoji.
   */
  users: string[]
}

export interface MessageCategory {
  value: 'update' | 'discussion' | 'question' | 'announcement'
  label: string
  /** Tailwind classes for the badge — bg + text + border (dark variants included). */
  badgeCls: string
}

export const MESSAGE_CATEGORIES: MessageCategory[] = [
  { value: 'update',       label: 'Update',       badgeCls: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-800' },
  { value: 'discussion',   label: 'Discussion',   badgeCls: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-900/30 dark:text-sky-300 dark:border-sky-800' },
  { value: 'question',     label: 'Question',     badgeCls: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800' },
  { value: 'announcement', label: 'Announcement', badgeCls: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800' },
]

export interface ProjectMessage {
  id: ID
  project_id: ID
  author_id: ID
  author_name: string
  author_email: string
  author_avatar: string | null
  author_initials: string
  title: string | null
  body_html: string
  category: 'update' | 'discussion' | 'question' | 'announcement'
  is_pinned: boolean
  pin_order: number | null
  created_at: string
  updated_at: string
  edited_at: string | null
  reactions: Reaction[]
  /** Server-computed flag — true when the current user is the author. */
  is_mine: boolean
}

/** The 24-emoji set used by the reactions bar. */
export const REACTION_EMOJIS = [
  '👍', '❤️', '🎉', '👀', '🚀', '😂',
  '😍', '🔥', '👏', '💯', '🤔', '😢',
  '😡', '✅', '❌', '⭐', '🙌', '💪',
  '🤝', '📌', '🎯', '🎁', '⚡', '🙏',
] as const

/* ─── Files & Documents types ─── */

/** Per-user entry inside a reaction tooltip — name + initials + optional
 *  avatar URL. Server JOINs on `users` for this. */
export interface ReactionUser {
  name: string
  initials: string
  avatar: string | null
}

export interface DocumentReaction {
  emoji: string
  count: number
  mine: boolean
  /** Per-user details (chronological), for hover tooltip with avatars. */
  users: ReactionUser[]
}

export interface Document {
  id: ID
  project_id: ID | null
  title: string
  content_html: string
  file_url: string | null
  file_type: string | null
  file_size: number | null
  /** `doc` = rich-text; `file` = uploaded file. */
  kind: 'doc' | 'file'
  author_id: ID
  author_name: string
  author_email: string
  author_initials: string
  author_avatar: string | null
  created_at: string
  updated_at: string | null
  last_modified: string
  reactions: DocumentReaction[]
  comment_count: number
}

export interface DocumentComment {
  id: ID
  document_id: ID
  body: string
  created_at: string
  updated_at: string | null
  author_id: ID
  author_name: string
  author_email: string
  author_initials: string
  author_avatar: string | null
  is_mine: boolean
  /**
   * Comment-level reactions — same shape as `Reaction` (server returns name strings).
   * For document-level reactions use `Document.reactions: DocumentReaction[]`.
   */
  reactions: Reaction[]
}

/** Per-feature config used by ProjectDashboardCard. */
export interface FeatureCardConfig {
  key:
    | 'message-board'
    | 'todos'
    | 'task-board'
    | 'files'
    | 'schedule'
    | 'team'
    | 'chat'
    | 'activity'
    | 'test-cases'
  title: string
  description: string
  iconName:
    | 'MessageSquare'
    | 'ListChecks'
    | 'LayoutGrid'
    | 'KanbanSquare'
    | 'Folder'
    | 'Calendar'
    | 'Users'
    | 'Hash'
    | 'FileText'
    | 'BarChart3'
    | 'Activity'
    | 'ClipboardCheck'
  accent:
    | 'indigo'
    | 'emerald'
    | 'amber'
    | 'sky'
    | 'pink'
    | 'violet'
    | 'rose'
    | 'cyan'
    | 'lime'
    | 'orange'
    | 'teal'
  href: (projectId: ID) => string
}
