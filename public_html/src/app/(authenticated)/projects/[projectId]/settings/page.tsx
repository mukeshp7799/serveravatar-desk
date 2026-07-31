'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import FeaturePage from '@/components/project/FeaturePage'
import ConfirmDialog from '@/components/project/ConfirmDialog'
import { Save, Trash2, Loader2 } from 'lucide-react'
import { useProjectMembers } from '@/lib/project-members-api'
import toast from 'react-hot-toast'
import api from '@/lib/api'

export default function ProjectSettingsPage() {
  const params = useParams<{ projectId: string }>()
  const projectId = params.projectId
  const { project, loading, initialized, refetch, isOwner, leaveProject } = useProjectMembers(projectId)

  const currentUserId = (() => {
    if (typeof window === 'undefined') return null
    try { return (JSON.parse(localStorage.getItem('user') || '{}') as any)?.id ?? null } catch { return null }
  })()
  const amOwner = project ? Number(project.manager_id) === Number(currentUserId) : false

  const [tab, setTab] = useState<'general' | 'notifications' | 'danger'>('general')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState('active')
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [leaving, setLeaving] = useState(false)

  // Hydrate the form once the project is loaded.
  useEffect(() => {
    if (!project) return
    setName(project.name || '')
    setDescription(project.description || '')
    setStatus((project.status as string) || 'active')
    setDirty(false)
  }, [project?.id])

  const handleArchive = async () => {
    setArchiving(true)
    try {
      const res = await api.put(`/projects/${projectId}/archive`)
      if (res) {
        toast.success('Project archived')
        await refetch()
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('project:updated', { detail: { projectId: String(projectId) } }))
        }
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to archive project')
    } finally {
      setArchiving(false)
    }
  }

  const handleRestore = async () => {
    setRestoring(true)
    try {
      const res = await api.post(`/projects/${projectId}/restore`)
      if (res) {
        toast.success('Project restored')
        await refetch()
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('project:updated', { detail: { projectId: String(projectId) } }))
        }
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to restore project')
    } finally {
      setRestoring(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      const res = await api.delete(`/projects/${projectId}`)
      if (res) {
        toast.success('Project deleted')
        if (typeof window !== 'undefined') {
          window.location.href = '/dashboard'
        }
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete project')
    } finally {
      setDeleting(false)
    }
  }

  const handleLeave = async () => {
    setLeaving(true)
    try {
      await leaveProject()
      toast.success('You have left the project.')
      if (typeof window !== 'undefined') {
        window.location.href = '/dashboard'
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to leave project')
    } finally {
      setLeaving(false)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (saving) return
    if (!name.trim()) {
      toast.error('Project name cannot be empty')
      return
    }
    setSaving(true)
    try {
      // Backend's PUT /api/projects/:id currently accepts only name + description
      // (status changes are not exposed via the API yet — read-only for now).
      const res = await api.put(`/projects/${projectId}`, { name: name.trim(), description })
      if (res) {
        toast.success('Project settings saved')
        setDirty(false)
        // Re-pull so the layout header reflects the new name immediately.
        await refetch()
        // Broadcast so ProjectLayout (which has its own useProjectMembers
        // instance) can re-fetch and update the breadcrumb / header without
        // a full page reload. Each hook instance is independent, so a
        // custom window event is the simplest way to fan out the update.
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('project:updated', { detail: { projectId: String(projectId) } }))
        }
      } else {
        toast.error('Failed to save settings')
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  return (
    <FeaturePage featureKey="settings" title="Settings">
      <div className="space-y-4">
        {/* Tabs */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm p-1.5 inline-flex gap-1">
          {(['general', 'notifications', 'danger'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold capitalize transition border-none cursor-pointer ${
                tab === t ? 'bg-indigo-600 text-white shadow' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === 'general' && (
          <form
            onSubmit={handleSave}
            className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm p-5 sm:p-6 space-y-4"
          >
            <div>
              <h3 className="text-base font-bold text-gray-900 dark:text-white">General</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">Update the project name, description, and status.</p>
            </div>

            {loading && !initialized ? (
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 py-6">
                <Loader2 size={16} className="animate-spin" />
                Loading project…
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">Project name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => { setName(e.target.value); setDirty(true) }}
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">Description</label>
                  <textarea
                    value={description}
                    onChange={(e) => { setDescription(e.target.value); setDirty(true) }}
                    rows={4}
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900 resize-y"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">Status</label>
                  <div className="flex items-center gap-2">
                    <select
                      value={status}
                      disabled
                      title="Status changes will be available in a future update."
                      className="flex-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-300 cursor-not-allowed"
                    >
                      <option value="active">Active</option>
                      <option value="on_hold">On hold</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                    <span className="text-[11px] text-gray-400 dark:text-gray-500">read-only</span>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-800">
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {dirty ? 'You have unsaved changes' : 'All changes saved'}
                  </span>
                  <button
                    type="submit"
                    disabled={saving || !dirty}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-xl text-sm font-semibold shadow border-none cursor-pointer"
                  >
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} strokeWidth={2.5} />}
                    {saving ? 'Saving…' : 'Save changes'}
                  </button>
                </div>
              </>
            )}
          </form>
        )}

        {tab === 'notifications' && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm p-5 sm:p-6 space-y-4">
            <div>
              <h3 className="text-base font-bold text-gray-900 dark:text-white">Notifications</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">Pick which events should ping you for this project.</p>
            </div>
            {[
              { key: 'messages', label: 'New messages on the board', desc: 'Get notified when someone posts in the message board.' },
              { key: 'todos', label: 'To-do updates', desc: 'When a task is assigned to you or marked complete.' },
              { key: 'files', label: 'File uploads', desc: 'When a teammate uploads a new file.' },
              { key: 'mentions', label: 'Mentions', desc: 'When someone @mentions you in a comment or message.' },
            ].map((row) => (
              <label key={row.key} className="flex items-start gap-3 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer">
                <input
                  type="checkbox"
                  defaultChecked={row.key !== 'files'}
                  className="mt-0.5 w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white text-sm">{row.label}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{row.desc}</p>
                </div>
              </label>
            ))}
            <p className="text-[11px] text-gray-400 dark:text-gray-500 pt-2 border-t border-gray-100 dark:border-gray-800">
              Per-project notification preferences will be saved to your account profile in a future update.
            </p>
          </div>
        )}

        {tab === 'danger' && amOwner && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-rose-200 dark:border-rose-800 shadow-sm p-5 sm:p-6 space-y-4">
            <div>
              <h3 className="text-base font-bold text-rose-700 dark:text-rose-300">Danger zone</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">These actions are permanent. Please be sure.</p>
            </div>
            <div className="flex items-start justify-between gap-4 p-4 rounded-xl bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-800">
              <div>
                <p className="font-semibold text-gray-900 dark:text-white text-sm">
                  {project?.archived_at ? 'Restore archived project' : 'Archive this project'}
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                  {project?.archived_at
                    ? 'The project will become visible in project lists again.'
                    : 'The project is hidden from lists but can be restored by an admin.'}
                </p>
              </div>
              <button
                type="button"
                onClick={project?.archived_at ? handleRestore : handleArchive}
                disabled={archiving || restoring}
                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-lg text-xs font-semibold border-none cursor-pointer shrink-0"
              >
                {archiving ? <Loader2 size={11} className="animate-spin" /> : restoring ? <Loader2 size={11} className="animate-spin" /> : null}
                {archiving ? 'Archiving…' : restoring ? 'Restoring…' : project?.archived_at ? 'Restore' : 'Archive'}
              </button>
            </div>
            <div className="flex items-start justify-between gap-4 p-4 rounded-xl bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-800">
              <div>
                <p className="font-semibold text-gray-900 dark:text-white text-sm">Delete project permanently</p>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">This wipes all messages, files, to-dos, and history.</p>
              </div>
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                disabled={deleting}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-lg text-xs font-semibold border-none cursor-pointer shrink-0"
              >
                <Trash2 size={11} strokeWidth={2.5} />
                Delete
              </button>
            </div>
            <p className="text-[11px] text-gray-400 dark:text-gray-500">
              Danger-zone actions are logged in the project audit trail.
            </p>
          </div>
        )}

        {tab === 'danger' && !amOwner && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-red-200 dark:border-red-900 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
              <h3 className="text-sm font-bold text-red-600 dark:text-red-400">Danger Zone</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">These actions cannot be easily undone.</p>
            </div>
            <div className="p-5 sm:p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">Leave this project</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">You will lose access to all project content. This cannot be undone.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setConfirmLeave(true)}
                  className="shrink-0 px-4 py-2 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-red-600 dark:text-red-400 rounded-xl text-xs font-bold border border-red-200 dark:border-red-800 transition hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                >
                  Leave Project
                </button>
              </div>
            </div>
          </div>
        )}

        <p className="text-[10px] text-gray-400 dark:text-gray-500 text-center">Project ID: {projectId}</p>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={confirmDelete}
        title="Delete this project permanently?"
        description="This will permanently delete all messages, files, to-dos, and the project itself. This action cannot be undone."
        confirmLabel={deleting ? 'Deleting…' : 'Delete project'}
        cancelLabel="Cancel"
        destructive
        onCancel={() => !deleting && setConfirmDelete(false)}
        onConfirm={handleDelete}
      />
      <ConfirmDialog
        open={confirmLeave}
        title="Leave this project?"
        description="You will immediately lose access to all project content. This cannot be undone."
        confirmLabel={leaving ? 'Leaving…' : 'Leave project'}
        cancelLabel="Cancel"
        destructive
        onCancel={() => !leaving && setConfirmLeave(false)}
        onConfirm={handleLeave}
      />
      </div>
    </FeaturePage>
  )
}
