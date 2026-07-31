'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { AlertCircle, BarChart3, Calendar, Circle, CircleDot, ClipboardList, Folder, Trash2, User, Zap } from 'lucide-react'
import api from '@/lib/api'
import { validateForm, taskSchema } from '@/lib/schemas'

export default function TaskDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const { t } = useTranslation()
  const [task, setTask] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [projects, setProjects] = useState<any[]>([])
  const [todoLists, setTodoLists] = useState<any[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({ projectId: '', todoListId: '', description: '', assignedToUserId: '', dueDate: '', priority: 'medium' })
  const [showNewList, setShowNewList] = useState(false)
  const [newListName, setNewListName] = useState('')

  useEffect(() => { loadTask(); loadProjects() }, [id])

  const loadTask = async () => {
    setLoading(true)
    try {
      const [tasksRes] = await Promise.all([api.get('/tasks')])
      const allTasks = tasksRes.tasks || []
      const found = allTasks.find((t: any) => String(t.id) === String(id))
      if (!found) { toast.error(t('tasksDetail.taskNotFound')); setLoading(false); return }
      setTask(found)
      if (found.project_id) {
        const projRes = await api.get(`/projects/${found.project_id}`)
        setTodoLists(projRes.todoLists || [])
      }
    } catch (e: any) { toast.error(e.message || t('common.failedToSave')) } finally { setLoading(false) }
  }

  const loadProjects = async () => {
    try {
      const res = await api.get('/projects')
      setProjects(res.projects || [])
    } catch {}
  }

  const handleUpdate = async (field: string, value: any) => {
    if (!task) return
    try {
      const updated = { ...task, [field]: value }
      await api.put(`/tasks/${task.id}`, { [field]: value })
      setTask(updated); toast.success(t('common.savedSuccessfully'), { duration: 2000 })
    } catch (err: any) { toast.error(err.message || t('common.failedToSave')) }
  }

  const handleDelete = async () => {
    if (!task || !confirm(t('tasks.deleteConfirm'))) return
    try { await api.delete(`/tasks/${task.id}`); router.push('/tasks') }
    catch (err: any) { toast.error(err.message || t('common.failedToDelete')) }
  }

  const loadTodoListsForProject = async (projectId: number) => {
    setCreateForm(f => ({ ...f, projectId: String(projectId), todoListId: '' }))
    const res = await api.get(`/projects/${projectId}`)
    setTodoLists(res.todoLists || [])
    setShowNewList(false)
  }

  const handleCreateList = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!createForm.projectId || !newListName.trim()) return
    try {
      await api.post(`/projects/${createForm.projectId}/todolists`, { name: newListName })
      setNewListName(''); setShowNewList(false)
      await loadTodoListsForProject(parseInt(createForm.projectId))
      toast.success(t('common.savedSuccessfully'), { duration: 2000 })
    } catch (err: any) { toast.error(err.message || t('common.failedToSave')) }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    // map todoListId → listId so the same schema works
    const valid = validateForm(taskSchema, { ...createForm, listId: createForm.todoListId })
    if (!valid) return
    try {
      await api.post('/tasks', {
        todoListId: parseInt(valid.listId),
        description: valid.description.trim(),
        assignedToUserId: valid.assignedToUserId ? parseInt(valid.assignedToUserId) : null,
        dueDate: valid.dueDate || null, priority: valid.priority || 'medium',
      })
      setShowCreate(false)
      setCreateForm({ projectId: '', todoListId: '', description: '', assignedToUserId: '', dueDate: '', priority: 'medium' })
      setTodoLists([])
      toast.success(t('common.savedSuccessfully'))
    } catch (err: any) { toast.error(err.message || t('common.failedToSave')) }
  }

  const statusOptions = [
    { value: 'todo', emoji: '⬜', key: 'tasks.todo' },
    { value: 'in_progress', emoji: '⬜', key: 'tasks.in_progress' },
    { value: 'review', emoji: '⬜', key: 'tasks.review' },
    { value: 'done', emoji: '⬜', key: 'tasks.done' },
  ]

  const priorityOptions = [
    { value: 'low',    Icon: Circle,     key: 'tasks.low',    color: '#9CA3AF' },
    { value: 'medium', Icon: CircleDot,  key: 'tasks.medium', color: '#3B82F6' },
    { value: 'high',   Icon: CircleDot,  key: 'tasks.high',   color: '#F59E0B' },
    { value: 'urgent', Icon: AlertCircle,key: 'tasks.urgent', color: '#DC2626' },
  ]

  const currentStatus = statusOptions.find(s => s.value === task?.status) || statusOptions[0]
  const currentPriority = priorityOptions.find(p => p.value === task?.priority) || priorityOptions[1]

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
      </div>
    )
  }
  if (!task) return null

  return (
    <div className="max-w-5xl mx-auto space-y-5 animate-fade-in-up">
      <div>
        <Link href="/tasks" className="inline-flex items-center gap-1.5 text-sm font-bold text-indigo-600 hover:text-indigo-700 no-underline">
          ← {t('tasksDetail.backToTasks')}
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className={`bg-indigo-600 px-5 py-3`}>
              <div className="flex items-center gap-2 text-white text-sm font-bold uppercase tracking-wider">
                <span className="text-base">{currentStatus.emoji}</span>
                <span>{t(currentStatus.key)}</span>
              </div>
            </div>
            <div className="p-6 bg-white">
              <div className="flex items-start justify-between gap-3 mb-5">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-4 h-4 rounded-full shrink-0 shadow" style={{ backgroundColor: currentPriority.color }} />
                  <h1 className="text-2xl font-extrabold text-gray-900 leading-snug">{task.description}</h1>
                </div>
                <button onClick={handleDelete} className="px-3 py-1.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white hover:shadow rounded-xl transition border-none cursor-pointer shrink-0 inline-flex items-center gap-1"><Trash2 size={12} strokeWidth={2.25} /> {t('common.delete')}</button>
              </div>

              <div className="text-xs text-gray-500 mb-5 flex items-center gap-2">
                <span className="font-bold inline-flex items-center gap-1"><Folder size={12} strokeWidth={2.25} /> {task.project_name || '—'}</span>
                <span className="text-gray-300">→</span>
                <span className="font-bold inline-flex items-center gap-1"><ClipboardList size={12} strokeWidth={2.25} /> {task.list_name || '—'}</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">{t('common.status')}</label>
                  <select value={task.status} onChange={e => handleUpdate('status', e.target.value)} className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100">
                    {statusOptions.map(s => <option key={s.value} value={s.value}>{s.emoji} {t(s.key)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">{t('tasks.priority')}</label>
                  <select value={task.priority} onChange={e => handleUpdate('priority', e.target.value)} className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100">
                    {priorityOptions.map(p => <option key={p.value} value={p.value}>{'●'} {t(p.key)}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div className="bg-indigo-50 p-3 rounded-xl border border-indigo-100">
                  <div className="text-xs font-bold text-indigo-700 uppercase tracking-wider mb-1.5 inline-flex items-center gap-1"><User size={12} strokeWidth={2.25} /> {t('tasks.assignee')}</div>
                  {task.assigned_to_user_id ? (
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center text-xs font-bold shrink-0">
                        {task.first_name?.[0]}{task.last_name?.[0]}
                      </div>
                      <span className="font-bold text-gray-800">{task.first_name} {task.last_name}</span>
                    </div>
                  ) : <span className="text-gray-400 italic">{t('tasks.unassigned')}</span>}
                </div>
                <div className="bg-amber-50 p-3 rounded-xl border border-amber-100">
                  <div className="text-xs font-bold text-amber-700 uppercase tracking-wider mb-1.5 inline-flex items-center gap-1"><Calendar size={12} strokeWidth={2.25} /> {t('tasks.dueDate')}</div>
                  {task.due_date ? <span className="font-bold text-gray-800">{task.due_date}</span> : <span className="text-gray-400 italic">{t('tasksDetail.dueDateLabel')} —</span>}
                </div>
                <div className="bg-indigo-50 p-3 rounded-xl border border-indigo-100">
                  <div className="text-xs font-bold text-cyan-700 uppercase tracking-wider mb-1.5 inline-flex items-center gap-1"><Folder size={12} strokeWidth={2.25} /> {t('projects.title')}</div>
                  <span className="font-bold text-gray-800">{task.project_name || '—'}</span>
                </div>
                <div className="bg-gray-50 p-3 rounded-xl border border-gray-200">
                  <div className="text-xs font-bold text-violet-700 uppercase tracking-wider mb-1.5 inline-flex items-center gap-1"><ClipboardList size={12} strokeWidth={2.25} /> {t('discussions.topic')}</div>
                  <span className="font-bold text-gray-800">{task.list_name || '—'}</span>
                </div>
              </div>

            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="bg-indigo-600 hover:bg-indigo-700 px-5 py-3.5 flex items-center gap-2">
              <Zap size={20} strokeWidth={2.25} className="text-white" />
              <h3 className="font-bold text-white">{t('tasks.newTask')}</h3>
              <button onClick={() => setShowCreate(!showCreate)} className="ml-auto text-xs font-bold text-white bg-white/20 hover:bg-white/30 backdrop-blur-sm px-3 py-1 rounded-full transition border-none cursor-pointer">
                {showCreate ? `− ${t('common.cancel')}` : `+ ${t('tasks.addTask')}`}
              </button>
            </div>
            {showCreate && (
              <div className="p-5 bg-white">
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">{t('projects.title')}</label>
                      <select value={createForm.projectId} onChange={e => loadTodoListsForProject(parseInt(e.target.value))} className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100">
                        <option value="">— {t('common.selectAll')} —</option>
                        {projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">{t('tasks.title')}</label>
                      {!showNewList ? (
                        <div className="flex gap-2">
                          <select value={createForm.todoListId} onChange={e => setCreateForm(f => ({ ...f, todoListId: e.target.value }))} className="flex-1 border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100">
                            <option value="">— {t('common.selectAll')} —</option>
                            {todoLists.map((tl: any) => <option key={tl.id} value={tl.id}>{tl.name}</option>)}
                          </select>
                          <button onClick={() => setShowNewList(true)} className="px-3 py-2 text-xs font-bold bg-indigo-100 text-indigo-700 rounded-xl cursor-pointer border-none">+</button>
                        </div>
                      ) : (
                        <form onSubmit={handleCreateList} className="flex gap-2">
                          <input autoFocus required value={newListName} onChange={e => setNewListName(e.target.value)} className="flex-1 border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" placeholder={t('tasks.taskName')} />
                          <button type="submit" className="px-3 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl cursor-pointer border-none">{t('common.add')}</button>
                          <button type="button" onClick={() => { setShowNewList(false); setNewListName('') }} className="px-2 py-2 text-xs bg-gray-100 text-gray-600 rounded-xl cursor-pointer border-none">×</button>
                        </form>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">{t('tasks.description')}</label>
                    <textarea value={createForm.description} onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))} rows={2} className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100 resize-y min-h-[60px]" placeholder={t('discussions.writeReply')} />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">{t('tasks.priority')}</label>
                      <select value={createForm.priority} onChange={e => setCreateForm(f => ({ ...f, priority: e.target.value }))} className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100">
                        <option value="low">{t('tasks.low')}</option>
                        <option value="medium">{t('tasks.medium')}</option>
                        <option value="high">{t('tasks.high')}</option>
                        <option value="urgent">{t('tasks.urgent')}</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">{t('tasks.dueDate')}</label>
                      <input type="date" value={createForm.dueDate} onChange={e => setCreateForm(f => ({ ...f, dueDate: e.target.value }))} className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">{t('tasks.assignee')} ID</label>
                      <input type="number" value={createForm.assignedToUserId} onChange={e => setCreateForm(f => ({ ...f, assignedToUserId: e.target.value }))} className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" placeholder={t('tasks.assignee')} />
                    </div>
                  </div>
                  <button onClick={handleCreate} disabled={!createForm.projectId || !createForm.todoListId || !createForm.description.trim()} className="w-full px-4 py-2.5 text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white hover:shadow rounded-xl transition cursor-pointer border-none disabled:opacity-50">
                    + {t('tasks.createTask')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-5">
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="bg-indigo-600 hover:bg-indigo-700 px-5 py-3">
              <h3 className="font-bold text-white text-sm inline-flex items-center gap-1.5"><BarChart3 size={14} strokeWidth={2.25} /> {t('tasksDetail.taskTitle')}</h3>
            </div>
            <div className="p-5 bg-white space-y-3 text-sm">
              <div className="flex justify-between items-center pb-2 border-b border-gray-100">
                <span className="text-gray-500 font-semibold">{t('tasks.priority')}</span>
                <span className="font-extrabold" style={{ color: currentPriority.color }}>{t(currentPriority.key)}</span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-gray-100">
                <span className="text-gray-500 font-semibold">{t('common.status')}</span>
                <span className="font-extrabold text-gray-800">{t(currentStatus.key)}</span>
              </div>
              {task.due_date && (
                <div className="flex justify-between items-center pb-2 border-b border-gray-100">
                  <span className="text-gray-500 font-semibold">{t('tasks.dueDate')}</span>
                  <span className="font-bold text-gray-800">{task.due_date}</span>
                </div>
              )}
              {task.created_at && (
                <div className="flex justify-between items-center pb-2 border-b border-gray-100">
                  <span className="text-gray-500 font-semibold">{t('tasksDetail.createdBy')}</span>
                  <span className="font-bold text-gray-800 text-xs">{task.created_at?.split('T')[0]}</span>
                </div>
              )}
              {task.updated_at && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-500 font-semibold">Updated</span>
                  <span className="font-bold text-gray-800 text-xs">{task.updated_at?.split('T')[0]}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
