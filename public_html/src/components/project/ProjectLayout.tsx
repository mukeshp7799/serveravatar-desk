'use client'

import { useParams, useRouter, usePathname } from 'next/navigation'
import { Loader2, ArrowLeft } from 'lucide-react'
import ProjectHeader from './ProjectHeader'
import ProjectBreadcrumb, { type BreadcrumbItem } from './ProjectBreadcrumb'
import { getQuickActions } from '@/lib/project-config'
import {
  useProjectMembers,
  memberDisplayName,
  memberInitials,
  memberAvatarColor,
} from '@/lib/project-members-api'
import type { ProjectMeta, QuickAction } from '@/types/project'

interface ProjectLayoutProps {
  /**
   * Optional breadcrumb override. If provided, used as-is. If omitted, the
   * layout builds a default breadcrumb: `Projects / <real project name> /
   * <pageTitle>`. The page title falls back to `''` (current page hidden)
   * when not supplied.
   */
  breadcrumb?: BreadcrumbItem[]
  /** Title of the current page (used for the default breadcrumb + ProjectHeader breadcrumb text). */
  pageTitle?: string
  /** Page content (rendered below the header/breadcrumb). */
  children: React.ReactNode
}

/**
 * Shared layout for every /projects/[id]/* page.
 *
 * Loads project meta + members via the real backend (`/api/projects/:id`)
 * via the `useProjectMembers` hook (already used by the team page and
 * settings page, so we share a single round-trip per page load).
 *
 * Renders a small loader while the request is in flight, then shows the
 * ProjectHeader + breadcrumb + the page content. If the project fails to
 * load, falls back to a "Couldn't load" message with Retry + Back links.
 */
export default function ProjectLayout({ breadcrumb, pageTitle, children }: ProjectLayoutProps) {
  const params = useParams<{ projectId: string }>()
  const router = useRouter()
  const pathname = usePathname()
  const projectId = params.projectId
  const { project: realProject, members: realMembers, loading, error, initialized, refetch } = useProjectMembers(projectId)

  // Build the header project from real data. We never fall back to mocks —
  // until the API responds we show a loader instead.
  const headerProject: ProjectMeta | null = (() => {
    if (!realProject) return null
    const ownerRow = realMembers.find((m) => String(m.user_id) === String(realProject.manager_id))
    return {
      id: realProject.id ?? '',
      name: realProject.name || 'Untitled project',
      description: realProject.description || '',
      status: ((realProject.status as ProjectMeta['status']) || 'active'),
      createdAt: realProject.created_at || new Date().toISOString(),
      updatedAt: realProject.updated_at || new Date().toISOString(),
      owner: ownerRow
        ? {
            id: ownerRow.user_id,
            name: memberDisplayName(ownerRow),
            initials: memberInitials(ownerRow),
            email: ownerRow.email || '',
            avatarColor: memberAvatarColor(ownerRow),
            role: 'owner',
          }
        : {
            id: realProject.manager_id,
            name: 'Owner',
            initials: 'O',
            email: '',
            avatarColor: 'bg-indigo-500',
            role: 'owner',
          },
      memberCount: realMembers.length,
    }
  })()

  // Real member list for the avatar stack (max 5, excluding owner).
  const headerMembers = realMembers.length
    ? realMembers
        .filter((m) => String(m.user_id) !== String(realProject?.manager_id))
        .slice(0, 5)
        .map((m) => ({
          id: m.user_id,
          name: memberDisplayName(m),
          initials: memberInitials(m),
          avatarColor: memberAvatarColor(m),
        }))
    : undefined

  const quickActions: QuickAction[] = getQuickActions(projectId)

  // First-load loader (before we know if the project exists)
  const isFirstLoad = loading && !initialized
  if (!projectId || isFirstLoad) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="flex flex-col items-center gap-3 text-gray-500 dark:text-gray-400">
          <Loader2 size={28} className="animate-spin text-indigo-500" />
          <p className="text-sm font-medium">Loading project…</p>
        </div>
      </div>
    )
  }

  // 404-style fallback if the request failed AND we have no data
  if (error && !headerProject) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] text-center">
        <p className="text-base font-semibold text-gray-700 dark:text-gray-200 mb-1">Couldn't load this project</p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{error}</p>
        <button
          type="button"
          onClick={() => refetch()}
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

  if (!headerProject) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="flex flex-col items-center gap-3 text-gray-500 dark:text-gray-400">
          <Loader2 size={28} className="animate-spin text-indigo-500" />
          <p className="text-sm font-medium">Preparing project…</p>
        </div>
      </div>
    )
  }

  // Build the breadcrumb. If the page supplies one, use it as-is. Otherwise
  // construct a default `Projects / <real name> / <page title>` trail so
  // the project name always reflects the live DB value.
  const finalBreadcrumb: BreadcrumbItem[] = breadcrumb ?? [
    { label: 'Projects', href: '/projects' },
    { label: headerProject.name, href: `/projects/${projectId}` },
    ...(pageTitle ? [{ label: pageTitle }] : []),
  ]

  return (
    <div className="space-y-4 sm:space-y-5 animate-fade-in-up">
      <ProjectBreadcrumb items={finalBreadcrumb} />
      <ProjectHeader
        project={headerProject}
        actions={quickActions}
        members={headerMembers}
        memberCount={realMembers.length}
      />
      {/* Back to Project — always in its own div below ProjectHeader.
          Show on list pages (≤3 segments after projectId), hide on detail pages (>3 segments). */}
      {pageTitle && pathname.split('/').filter(Boolean).length <= 3 && (
        <div className="px-1">
          <button
            onClick={() => router.push(`/projects/${projectId}`)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl transition cursor-pointer"
          >
            <ArrowLeft size={13} strokeWidth={2.5} />
            Back to Project
          </button>
        </div>
      )}
      {children}
    </div>
  )
}
