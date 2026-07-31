'use client'
import PageLoader from '@/components/PageLoader'
import ConfirmDialog from '@/components/project/ConfirmDialog'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Briefcase, Calendar, Check, Folder, Gem, Pencil, Rocket, Sparkles, Target, Trash2, User, X as XIcon, Zap } from 'lucide-react'
import api from '@/lib/api'
import { validateForm, projectSchema } from '@/lib/schemas'

function fmtDate(raw: string | null | undefined): string {
  if (!raw) return ''
  const s = String(raw).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [, m, d] = s.split('-')
    return `${d}/${m}/${s.slice(0, 4)}`
  }
  const d = new Date(s)
  if (isNaN(d.getTime())) return s
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

const PROJECT_ICONS: any[] = [Rocket, Gem, Zap, Target, Sparkles, Sparkles, Rocket, Briefcase]

export default function ProjectsPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const STATUS_STYLES: Record<string, { labelKey: string; bg: string; text: string; dot: string }> = {
    active:    { labelKey: 'projects.active',    bg: 'bg-gray-50 text-emerald-700 border border-emerald-200', text: 'text-emerald-700', dot: 'bg-gray-500' },
    completed: { labelKey: 'projects.completed', bg: 'bg-gray-50 text-sky-700 border border-sky-200',     text: 'text-sky-700',     dot: 'bg-gray-500' },
    on_hold:   { labelKey: 'projects.onHold',    bg: 'bg-gray-50 text-amber-700 border border-amber-200',   text: 'text-amber-700',   dot: 'bg-gray-500' },
    cancelled: { labelKey: 'projects.cancelled', bg: 'bg-red-50 text-red-700 border border-red-200',    text: 'text-rose-700',    dot: 'bg-red-500' },
  }

  const [projects, setProjects] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [editProject, setEditProject] = useState<any>(null)
  const [form, setForm] = useState({ name: '', description: '' })
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)

  const user = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('user') || '{}') : {}
  const canManage = Array.isArray(user.permissions) && user.permissions.includes('projects.create')

  useEffect(() => { loadProjects() }, [])

  const loadProjects = () => {
    setLoading(true)
    api.get('/projects').then(res => setProjects(res.projects || [])).catch(() => {}).finally(() => setLoading(false))
  }

  const openCreate = () => {
    setEditProject(null)
    setForm({ name: '', description: '' })
    setShowCreate(true)
  }

  const openEdit = (p: any) => {
    setEditProject(p)
    setForm({ name: p.name || '', description: p.description || '' })
    setShowCreate(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    const valid = validateForm(projectSchema, form)
    if (!valid) return
    // The owner / manager is always derived from the authenticated session on
    // the server side — we never send owner / managerId from the client.
    const payload = {
      name: valid.name,
      description: valid.description || '',
    }
    try {
      if (editProject) {
        await api.put(`/projects/${editProject.id}`, payload)
        toast.success(t('common.savedSuccessfully'))
      } else {
        await api.post('/projects', payload)
        toast.success(t('projects.created'))
      }
      setShowCreate(false); loadProjects()
    } catch (err: any) { toast.error(err.message || t('common.failedToSave')) }
  }

  const handleDelete = async (id: number) => {
    setConfirmDeleteId(id)
  }

  const confirmDelete = async () => {
    if (!confirmDeleteId) return
    try {
      await api.delete(`/projects/${confirmDeleteId}`)
      toast.success(t('common.deletedSuccessfully')); loadProjects()
    } catch (err: any) { toast.error(err.message || t('common.failedToDelete')) } finally {
      setConfirmDeleteId(null)
    }
  }

  const openProject = (id: number) => {
    router.push(`/projects/${id}`)
  }

  return (
    <div className="space-y-5 animate-fade-in-up">
      <div className="flex flex-wrap justify-end items-center gap-3">
        {canManage && (
          <button onClick={openCreate} className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white hover:shadow-lg rounded-xl text-sm font-bold transition shadow-lg cursor-pointer border-none flex items-center gap-2">
            <span className="text-lg">+</span> {t('projects.newProject')}
          </button>
        )}
      </div>

      {loading ? (
        <PageLoader label={t('common.loading')} size="lg" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {projects.map((p: any, i: number) => {
            const progress = p.total_tasks > 0 ? Math.round((p.completed_tasks / p.total_tasks) * 100) : 0
            const CardIcon = PROJECT_ICONS[i % PROJECT_ICONS.length]
            const status = STATUS_STYLES[p.status] || STATUS_STYLES.active
            return (
              <div
                key={p.id}
                onClick={() => openProject(p.id)}
                className="group relative overflow-hidden rounded-2xl bg-white border border-gray-100 card-hover cursor-pointer"
              >
                <div className="h-1 bg-indigo-600"></div>
                <div className="relative h-16 bg-indigo-50 border-b border-indigo-100 overflow-hidden">
                  <div className="absolute inset-0 opacity-30">
                    <div className="absolute -top-4 -right-4 w-24 h-24 rounded-full bg-indigo-100"></div>
                    <div className="absolute -bottom-4 -left-4 w-20 h-20 rounded-full bg-indigo-100"></div>
                  </div>
                  <div className="relative p-4 flex items-start justify-between h-full">
                    <div className="text-indigo-600"><CardIcon size={28} strokeWidth={2} /></div>
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ${status.bg} bg-white/90`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${status.dot} mr-1.5`}></span>
                      {t(status.labelKey)}
                    </span>
                  </div>
                </div>

                <div className="p-5">
                  <h3 className="text-base font-extrabold text-gray-900 mb-1.5 line-clamp-1">{p.name}</h3>
                  <p className="text-sm text-gray-500 mb-3 line-clamp-2 min-h-[40px]">{p.description || '—'}</p>
                  <div className="text-xs text-gray-500 mb-3 flex flex-wrap gap-x-2 gap-y-0.5">
                    <span className="inline-flex items-center gap-1"><User size={12} strokeWidth={2.25} /> {p.first_name} {p.last_name}</span>
                    {p.start_date && (
                      <>
                        <span className="text-gray-300">•</span>
                        <span className="inline-flex items-center gap-1"><Calendar size={12} strokeWidth={2.25} /> {fmtDate(p.start_date)}{p.end_date ? ` - ${fmtDate(p.end_date)}` : ''}</span>
                      </>
                    )}
                  </div>
                  <div className="mb-2">
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-gray-500 font-semibold">{t('projects.projectProgress')}</span>
                      <span className="font-bold text-indigo-600">{progress}%</span>
                    </div>
                    <div className="bg-gray-100 rounded-full h-2 overflow-hidden">
                      <div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${progress}%` }}></div>
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 font-semibold inline-flex items-center gap-1">
                    <Check size={12} strokeWidth={2.5} /> {p.completed_tasks} / {p.total_tasks} {t('projects.projectTasks')}
                  </div>
                </div>
                {canManage && (
                  <div className="flex gap-1.5 px-5 pb-5 pt-0 border-t border-gray-100 pt-3">
                    <button onClick={(e) => { e.stopPropagation(); openEdit(p) }} className="flex-1 px-3 py-1.5 text-xs font-bold bg-pink-100 text-pink-700 hover:bg-pink-200 rounded-lg transition cursor-pointer border-none inline-flex items-center justify-center gap-1"><Pencil size={12} strokeWidth={2.25} /> {t('common.edit')}</button>
                    <button onClick={(e) => { e.stopPropagation(); handleDelete(p.id) }} className="flex-1 px-3 py-1.5 text-xs font-bold text-red-600 hover:text-red-800 rounded-lg transition cursor-pointer border-none inline-flex items-center justify-center gap-1"><Trash2 size={12} strokeWidth={2.25} /> {t('common.delete')}</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      {!loading && projects.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-16 text-center">
          <Folder size={48} strokeWidth={1.75} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-600 font-bold mb-1">{t('projects.noProjects')}</p>
          <p className="text-gray-400 text-sm">{t('projects.createFirst')}</p>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl animate-scale-in flex flex-col max-h-[calc(100vh-2rem)]" onClick={e => e.stopPropagation()}>
            <div className={`border-b border-gray-200 px-6 py-4 bg-white shrink-0`}>
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-extrabold text-gray-900 inline-flex items-center gap-2">{editProject ? <><Pencil size={18} strokeWidth={2.25} /> {t('projects.editProject')}</> : <><Rocket size={18} strokeWidth={2.25} /> {t('projects.newProject')}</>}</h3>
                <button onClick={() => setShowCreate(false)} data-tooltip-id="app-tooltip" data-tooltip-content={`✕ ${t('common.close')}`} className="bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg w-8 h-8 flex items-center justify-center cursor-pointer border-none"><XIcon size={20} strokeWidth={2.25} /></button>
              </div>
            </div>
            <form onSubmit={handleSave} className="flex flex-col flex-1 min-h-0">
              <div className="p-6 bg-white overflow-y-auto  flex-1 min-h-0">
                <div className="mb-4">
                  <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">{t('projects.projectName')} *</label>
                  <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-pink-500 focus:ring-4 focus:ring-pink-100" placeholder={t('projects.projectName')} />
                </div>
                <div className="mb-4">
                  <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">{t('common.description')}</label>
                  <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-pink-500 focus:ring-4 focus:ring-pink-100 resize-y min-h-[80px]" placeholder={t('common.description')} />
                </div>
              </div>
              <div className="border-t border-gray-100 px-6 py-4 flex flex-wrap justify-end gap-2 bg-gray-50 rounded-b-3xl shrink-0">
                <button type="button" onClick={() => setShowCreate(false)} className="px-5 py-2.5 text-sm font-bold bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-xl transition cursor-pointer border-none">{t('common.cancel')}</button>
                <button type="submit" className="px-5 py-2.5 text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white hover:shadow rounded-xl transition cursor-pointer border-none">{editProject ? t('common.saveChanges') : t('projects.createProject')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDeleteId !== null}
        title={t('projects.deleteConfirm').replace('Are you sure you want to delete this project?', 'Delete Project').replace('Are you sure you want to delete this project', 'Delete Project')}
        description={t('projects.deleteConfirm')}
        confirmLabel={t('common.delete')}
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  )
}
