'use client'

import { useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import ProjectLayout from '@/components/project/ProjectLayout'
import ProjectDashboardCard, { type CardSummaryData } from '@/components/project/ProjectDashboardCard'
import { FEATURE_CARDS } from '@/lib/project-config'
import {
  useProjectAndMembers,
  useProjectMessages,
  useProjectTodos,
  useProjectTaskBoard,
  useProjectDocuments,
  useProjectSchedule,
  useProjectChat,
  useProjectActivities,
} from '@/lib/project-api'
import {
  summarizeMessages,
  summarizeTodos,
  summarizeTaskBoard,
  summarizeFiles,
  summarizeSchedule,
  summarizeChat,
  summarizeActivity,
  summarizeTeam,
  summarizeTestCases,
} from '@/lib/dashboard-summaries'
import { useProjectTestCases } from '@/lib/test-cases-api'
import type { FeatureCardConfig } from '@/types/project'

// Desired card display order for the project tools grid.
// Row 1: Team Members → Files & Documents → Task Board
// Row 2: Message Board → To-do Lists → Test Cases
// Row 3: Schedule → Chat → Activity Timeline
const CARD_ORDER: FeatureCardConfig[] = [
  FEATURE_CARDS.find((c) => c.key === 'team')!,
  FEATURE_CARDS.find((c) => c.key === 'files')!,
  FEATURE_CARDS.find((c) => c.key === 'task-board')!,
  FEATURE_CARDS.find((c) => c.key === 'message-board')!,
  FEATURE_CARDS.find((c) => c.key === 'todos')!,
  FEATURE_CARDS.find((c) => c.key === 'test-cases')!,
  FEATURE_CARDS.find((c) => c.key === 'schedule')!,
  FEATURE_CARDS.find((c) => c.key === 'chat')!,
  FEATURE_CARDS.find((c) => c.key === 'activity')!,
]

/**
 * /projects/[projectId] — the Basecamp-style project hub dashboard.
 *
 * Each card hydrates from its own real-API endpoint. Skeletons are shown
 * per-card until its data arrives; an inline error banner + Retry appears
 * if a fetch fails. The header (name / status / memberCount) comes from
 * /api/projects/:id.
 */
export default function ProjectDashboardPage() {
  const params = useParams<{ projectId: string }>()
  const router = useRouter()
  const projectId = params.projectId

  // ── Real-API hooks (run in parallel on mount) ─────────────────────
  const projRes = useProjectAndMembers(projectId)
  const msgsRes = useProjectMessages(projectId)
  const todosRes = useProjectTodos(projectId)
  const boardRes = useProjectTaskBoard(projectId)
  const docsRes = useProjectDocuments(projectId)
  const schedRes = useProjectSchedule(projectId)
  const chatRes = useProjectChat(projectId)
  const actRes = useProjectActivities(projectId)
  const testCasesRes = useProjectTestCases(projectId)

  // ── Per-card summaries ───────────────────────────────────────────
  const summaryMap: Record<string, CardSummaryData> = useMemo(() => ({
    'message-board': summarizeMessages(msgsRes.data ?? []),
    'todos':         summarizeTodos(todosRes.data ?? []),
    'task-board':    summarizeTaskBoard(boardRes.data ?? []),
    'files':         summarizeFiles(docsRes.data ?? []),
    'schedule':      summarizeSchedule(schedRes.data ?? []),
    'team':          summarizeTeam(projRes.data?.members ?? []),
    'chat':          summarizeChat(chatRes.data ?? []),
    'activity':      summarizeActivity(actRes.data ?? []),
    'test-cases':    summarizeTestCases(testCasesRes.testCases ?? []),
  }), [msgsRes.data, todosRes.data, boardRes.data, docsRes.data, schedRes.data, projRes.data, chatRes.data, actRes.data, testCasesRes.testCases])

  const loadingMap: Record<string, boolean> = useMemo(() => ({
    'message-board': msgsRes.loading,
    'todos':         todosRes.loading,
    'task-board':    boardRes.loading,
    'files':         docsRes.loading,
    'schedule':      schedRes.loading,
    'team':          projRes.loading,
    'chat':          chatRes.loading,
    'activity':      actRes.loading,
    'test-cases':    testCasesRes.loading,
  }), [msgsRes.loading, todosRes.loading, boardRes.loading, docsRes.loading, schedRes.loading, projRes.loading, chatRes.loading, actRes.loading, testCasesRes.loading])

  const errorMap: Record<string, string | null> = useMemo(() => ({
    'message-board': msgsRes.error,
    'todos':         todosRes.error,
    'task-board':    boardRes.error,
    'files':         docsRes.error,
    'schedule':      schedRes.error,
    'team':          projRes.error,
    'chat':          chatRes.error,
    'activity':      actRes.error,
    'test-cases':    testCasesRes.error,
  }), [msgsRes.error, todosRes.error, boardRes.error, docsRes.error, schedRes.error, projRes.error, chatRes.error, actRes.error, testCasesRes.error])

  const retryMap: Record<string, () => void> = useMemo(() => ({
    'message-board': msgsRes.refetch,
    'todos':         todosRes.refetch,
    'task-board':    boardRes.refetch,
    'files':         docsRes.refetch,
    'schedule':      schedRes.refetch,
    'team':          projRes.refetch,
    'chat':          chatRes.refetch,
    'activity':      actRes.refetch,
    'test-cases':    testCasesRes.refresh,
  }), [msgsRes.refetch, todosRes.refetch, boardRes.refetch, docsRes.refetch, schedRes.refetch, projRes.refetch, chatRes.refetch, actRes.refetch, testCasesRes.refresh])

  // ── Derived data (used in breadcrumb) ───────────────────────────
  const project = projRes.data?.project ?? null

  // ── Render branches ──────────────────────────────────────────────
  // (Hooks above must all run on every render — branches below are fine
  // because no further hooks are called.)

  // First-load loader
  if (!projectId || (projRes.loading && !projRes.initialized && !projRes.error)) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="flex flex-col items-center gap-3 text-gray-500 dark:text-gray-400">
          <Loader2 size={28} className="animate-spin text-indigo-500" />
          <p className="text-sm font-medium">Loading project dashboard…</p>
        </div>
      </div>
    )
  }

  // Hard error fallback if project endpoint failed
  if (projRes.error && projRes.initialized && !project) {
    // Non-owner accessing archived project → redirect to dashboard silently
    if (String(projRes.error).includes('PROJECT_ARCHIVED')) {
      router.replace('/dashboard')
      return null
    }
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] text-center">
        <p className="text-base font-semibold text-gray-700 dark:text-gray-200 mb-1">Couldn't load this project</p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{projRes.error}</p>
        <button
          type="button"
          onClick={() => projRes.refetch()}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow transition border-none cursor-pointer"
        >
          Retry
        </button>
        <button
          type="button"
          onClick={() => router.replace('/projects')}
          className="mt-3 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 underline"
        >
          ← Back to projects
        </button>
      </div>
    )
  }

  return (
    <ProjectLayout
      breadcrumb={[
        { label: 'Projects', href: '/projects' },
        { label: project?.name || 'Project' },
      ]}
      pageTitle=""
    >
      {/* Back to Projects */}
      <div className="px-1 mb-4">
        <button
          type="button"
          onClick={() => router.push('/projects')}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors cursor-pointer"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Back to Projects
        </button>
      </div>

      {/* Project tools grid */}
      <div className="grid grid-cols-1 gap-4 sm:gap-5">
        <div>
          <div className="flex items-end justify-between mb-3">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white">Project tools</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">Every feature, one click away. Open any card for the full view.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {CARD_ORDER.map((config) => (
              <ProjectDashboardCard
                key={config.key}
                config={config}
                summary={summaryMap[config.key]}
                projectId={projectId}
                loading={loadingMap[config.key]}
                error={errorMap[config.key]}
                onRetry={retryMap[config.key]}
              />
            ))}
          </div>
        </div>
      </div>
    </ProjectLayout>
  )
}
