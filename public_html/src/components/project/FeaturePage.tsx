'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import ProjectLayout from './ProjectLayout'

interface FeaturePageProps {
  /** Feature key used for the dashboard summary lookup + breadcrumb title. */
  featureKey:
    | 'message-board'
    | 'todos'
    | 'task-board'
    | 'files'
    | 'schedule'
    | 'team'
    | 'chat'
    | 'activity'
    | 'settings'
  /** Human-readable label used in the breadcrumb. */
  title: string
  /** Page body — rendered after the ProjectLayout header. */
  children: React.ReactNode
}

/**
 * Shared wrapper used by every /projects/[id]/{feature} page.
 *
 * Defers a single paint so the inner feature page can render. The project
 * name + owner + member list come from ProjectLayout (which fetches the
 * real API), so we don't have to build a breadcrumb with mock data here.
 *
 * The wrapper intentionally does NOT pre-load feature data — that's the
 * feature page's job. This keeps the dashboard contract clean.
 */
export default function FeaturePage({ featureKey, title, children }: FeaturePageProps) {
  const params = useParams<{ projectId: string }>()
  const router = useRouter()
  const projectId = params.projectId
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!projectId) return
    const t = setTimeout(() => setLoading(false), 80)
    return () => clearTimeout(t)
  }, [projectId])

  if (!projectId) {
    router.replace('/projects')
    return null
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 size={28} className="animate-spin text-indigo-500" />
      </div>
    )
  }

  // Pass pageTitle so ProjectLayout builds `Projects / <real name> / <title>`.
  return (
    <ProjectLayout pageTitle={title}>
      {/* The ProjectTabs in ProjectLayout serves as the "back to dashboard"
          shortcut — the Dashboard tab is the first one. No more separate
          "Back to dashboard" link needed. */}
      {children}
    </ProjectLayout>
  )
}
