'use client'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { showActionToast } from '@/lib/etherealToast'
import { validateForm, taskSchema } from '@/lib/schemas'
import PageLoader from '@/components/PageLoader'
import {
  ClipboardList, Rocket, Search as SearchIcon, CheckCircle2,
  Trash2, Calendar, AlertTriangle, Folder, Hash,
  Eye, EyeOff, X as XIcon, Save, Sparkles, Inbox, Plus as PlusIcon,
} from 'lucide-react'
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  useDraggable, useDroppable,
  DragStartEvent, DragEndEvent, DragOverEvent, pointerWithin,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'

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

/* Relative date label for due dates: "Today", "Tomorrow", "Yesterday",
   "In 3d", "3d ago", or the short date fallback for >7 days. */
function fmtRelative(raw: string | null | undefined, locale: string = 'en'): string {
  if (!raw) return ''
  const d = new Date(raw)
  if (isNaN(d.getTime())) return ''
  // Normalize to start-of-day in local TZ for stable day diffs
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(d)
  target.setHours(0, 0, 0, 0)
  const diffDays = Math.round((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))
  if (diffDays === 0) return locale === 'en' ? 'Today' : ''
  if (diffDays === 1) return locale === 'en' ? 'Tomorrow' : ''
  if (diffDays === -1) return locale === 'en' ? 'Yesterday' : ''
  if (diffDays > 1 && diffDays <= 7) return `In ${diffDays}d`
  if (diffDays < -1 && diffDays >= -7) return `${Math.abs(diffDays)}d ago`
  return fmtDate(raw)
}

function isOverdue(due: string | null | undefined): boolean {
  if (!due) return false
  const d = new Date(due)
  if (isNaN(d.getTime())) return false
  return d.getTime() < Date.now() - 24 * 60 * 60 * 1000
}

function TaskCard({ task, users, onDelete, onAssign, onClick, isOverlay = false }: {
  task: any
  users: any[]
  onDelete: (id: number) => void
  onAssign: (taskId: number, userId: number) => void
  onClick?: (task: any) => void
  isOverlay?: boolean
}) {
  const { t } = useTranslation()
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `task-${task.id}` })
  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging && !isOverlay ? 0.35 : 1,
  }
  const priorityMeta: Record<string, { color: string; bg: string; key: string }> = {
    urgent: { color: '#EF4444', bg: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300', key: 'tasks.urgent' },
    high:   { color: '#F59E0B', bg: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300', key: 'tasks.high' },
    medium: { color: '#3B82F6', bg: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300', key: 'tasks.medium' },
    low:    { color: '#9CA3AF', bg: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300', key: 'tasks.low' },
  }
  const priority = priorityMeta[task.priority] || priorityMeta.medium
  const initials = task.first_name && task.last_name
    ? `${task.first_name[0]}${task.last_name[0]}`.toUpperCase()
    : null
  const overdue = task.status !== 'done' && isOverdue(task.due_date)
  const dueSoon = task.status !== 'done' && task.due_date && !overdue
  const dueRel = fmtRelative(task.due_date)
  const assigneeColor = `hsl(${((task.assigned_to_user_id || task.id) * 47) % 360}, 65%, 55%)`

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative bg-white dark:bg-gray-800 rounded-xl border-2 transition-all touch-none overflow-hidden ${
        isOverlay
          ? 'shadow-2xl border-indigo-500 cursor-grabbing ring-4 ring-indigo-300/50 rotate-2 scale-[1.03]'
          : isDragging
            ? 'border-indigo-400 dark:border-indigo-500 cursor-grabbing opacity-60'
            : overdue
              ? 'border-red-200 dark:border-red-900/60 hover:border-red-400 dark:hover:border-red-500 cursor-grab hover:shadow-md hover:-translate-y-0.5'
              : 'border-gray-100 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-500 cursor-grab hover:shadow-md hover:-translate-y-0.5'
      }`}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        if (transform) return
        onClick?.(task)
      }}
    >
      {/* Overdue left accent bar */}
      {overdue && (
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-red-400 to-red-600" aria-hidden="true" />
      )}

      <div className="p-3">
        {/* Top row: priority badge + task ID + delete */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide ${priority.bg}`}>
              <span className="w-1.5 h-1.5 rounded-full mr-1" style={{ backgroundColor: priority.color }} />
              {t(priority.key)}
            </span>
            <span className="text-[9px] font-mono font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider shrink-0">
              #{task.id}
            </span>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(task.id) }}
            title={t('common.delete')}
            data-tooltip-id="app-tooltip"
            data-tooltip-content={`${t('common.delete')} "${task.description}"`}
            data-tooltip-place="left"
            className="opacity-0 group-hover:opacity-100 transition w-6 h-6 rounded-md bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50 text-red-500 dark:text-red-300 cursor-pointer border-none flex items-center justify-center text-xs shrink-0"
          ><Trash2 size={12} strokeWidth={2.25} /></button>
        </div>

        {/* Description */}
        <p className={`text-sm leading-snug mb-2.5 line-clamp-3 ${
          task.status === 'done'
            ? 'text-gray-400 dark:text-gray-500 line-through decoration-gray-300 dark:decoration-gray-600'
            : 'text-gray-800 dark:text-gray-100 font-medium'
        }`}>
          {task.description}
        </p>

        {/* Due date row */}
        {task.due_date && (
          <div className="flex items-center gap-1.5 mb-2">
            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
              overdue
                ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
                : dueSoon
                  ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
            }`}>
              <span>{overdue ? <AlertTriangle size={11} strokeWidth={2.5} /> : <Calendar size={11} strokeWidth={2.25} />}</span>
              <span>{overdue ? `${dueRel || fmtDate(task.due_date)} (overdue)` : dueRel || fmtDate(task.due_date)}</span>
            </span>
          </div>
        )}

        {/* Footer: assignee + list */}
        <div className="flex items-center justify-between gap-2 pt-2 mt-1 border-t border-gray-100 dark:border-gray-700/60">
          {initials ? (
            <div className="flex items-center gap-1.5 min-w-0">
              <div
                className="w-6 h-6 rounded-full text-white text-[9px] font-bold flex items-center justify-center shrink-0 ring-2 ring-white dark:ring-gray-800"
                style={{ backgroundColor: assigneeColor }}
                title={`${task.first_name} ${task.last_name}`}
              >{initials}</div>
              <span className="text-[10px] text-gray-600 dark:text-gray-300 truncate font-medium">{task.first_name}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 text-[10px] text-gray-400 dark:text-gray-500 italic">
              <span className="w-6 h-6 rounded-full border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center text-[10px]">?</span>
              <span>{t('tasks.unassigned')}</span>
            </div>
          )}
          {task.list_name && (
            <span className="text-[10px] text-gray-400 dark:text-gray-500 truncate max-w-[90px] inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-50 dark:bg-gray-700/50">
              <Folder size={10} strokeWidth={2.25} />
              <span className="truncate">{task.list_name}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function KanbanColumn({ column, tasks, users, onDelete, onAssign, onAddTask, onClickTask }: {
  column: any; tasks: any[]; users: any[]; onDelete: any; onAssign: any; onAddTask: any; onClickTask: any
}) {
  const { t } = useTranslation()
  const { isOver, setNodeRef } = useDroppable({ id: `col-${column.key}` })
  return (
    <div className="flex flex-col w-full min-w-0 bg-gray-50/40 dark:bg-gray-900/40 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
      <div className="px-3 py-2.5 flex items-center gap-2 bg-indigo-600">
        <column.Icon size={14} strokeWidth={2.5} />
        <span className="text-xs font-extrabold text-white uppercase tracking-wider flex-1 min-w-0 truncate">{t(`tasks.${column.key === 'in_progress' ? 'inProgress' : column.key === 'review' ? 'inReview' : column.key}`)}</span>
        <span className="text-[10px] font-extrabold text-white bg-white/25 backdrop-blur-sm rounded-full px-1.5 py-0.5">{tasks.length}</span>
        <button onClick={() => onAddTask(column.key)} title={t('common.add')} data-tooltip-id="app-tooltip" data-tooltip-content={`${t('common.add')} ${t(`tasks.${column.key === 'in_progress' ? 'inProgress' : column.key === 'review' ? 'inReview' : column.key}`)} ${t('tasks.task').toLowerCase()}`} className="w-7 h-7 rounded-lg bg-white/25 backdrop-blur-md hover:bg-white/40 text-white cursor-pointer border-none transition shrink-0 flex items-center justify-center"><PlusIcon size={16} strokeWidth={2.5} /></button>
      </div>
      <div ref={setNodeRef} className="flex-1 min-h-0">
        <div className={`flex flex-col gap-2.5 p-2.5 ${isOver ? 'bg-indigo-50/30 dark:bg-indigo-900/10' : ''}`}>
          {tasks.map((task, i) => (
            <div key={task.id} className="animate-card-in" style={{ animationDelay: `${Math.min(i * 0.04, 0.4)}s` }}>
              <TaskCard task={task} users={users} onDelete={onDelete} onAssign={onAssign} onClick={onClickTask} />
            </div>
          ))}
          {tasks.length === 0 && (
            <div className="flex flex-col items-center justify-center h-28 text-xs text-gray-400 italic border-2 border-dashed border-gray-300 rounded-xl gap-1.5 py-6 px-3 text-center">
              <Inbox size={28} strokeWidth={1.75} className="text-gray-300 dark:text-gray-600" />
              <span>{t('tasks.noTasks')}</span>
              <button onClick={() => onAddTask(column.key)} className="not-italic font-semibold text-xs text-indigo-600 hover:text-indigo-700 underline-offset-2 hover:underline inline-flex items-center gap-1 cursor-pointer bg-transparent border-none"><PlusIcon size={12} strokeWidth={2.5} /> {t('common.add')}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function TaskDetailDrawer({ task, users, projects, lists, onClose, onUpdate, onDelete }: any) {
  const { t } = useTranslation()
  const [desc, setDesc] = useState(task.description || '')
  const [projectId, setProjectId] = useState(task.project_id || '')
  const [listId, setListId] = useState(task.todo_list_id || '')
  const [status, setStatus] = useState(task.status || 'todo')
  const [priority, setPriority] = useState(task.priority || 'medium')
  const [assignedTo, setAssignedTo] = useState(task.assigned_to_user_id || '')
  const [dueDate, setDueDate] = useState(task.due_date || '')
  const [saving, setSaving] = useState(false)
  const [availableLists, setAvailableLists] = useState<any[]>(lists)

  useEffect(() => {
    if (projectId && projectId !== task.project_id) {
      api.get(`/projects/${projectId}`).then((r: any) => setAvailableLists(r.todoLists || [])).catch(() => setAvailableLists([]))
    } else {
      setAvailableLists(lists)
    }
  }, [projectId])

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await api.put(`/tasks/${task.id}`, {
        description: desc.trim(),
        projectId: projectId ? parseInt(projectId) : null,
        todoListId: listId ? parseInt(listId) : null,
        status, priority,
        assignedToUserId: assignedTo ? parseInt(assignedTo) : null,
        dueDate: dueDate || null,
      })
      onUpdate(task.id, { description: desc, project_id: projectId, todo_list_id: listId, status, priority, assigned_to_user_id: assignedTo, due_date: dueDate })
      showActionToast(toast, t, res, t('common.savedSuccessfully'))
      onClose()
    } catch (e: any) { toast.error(e.message || t('common.failedToSave')) }
    finally { setSaving(false) }
  }
  const handleDelete = () => {
    if (confirm(t('tasks.deleteConfirm'))) { onDelete(task.id); onClose() }
  }

  const COLUMNS_LOCAL = [
    { key: 'todo', label: t('tasks.todo') },
    { key: 'in_progress', label: t('tasks.inProgress') },
    { key: 'review', label: t('tasks.inReview') },
    { key: 'done', label: t('tasks.done') },
  ]

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="flex-1 bg-black/40 dark:bg-black/60" />
      <div className="w-full max-w-md bg-white dark:bg-gray-800 shadow-2xl flex flex-col max-h-screen sm:max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700 shrink-0">
          <span className="font-semibold text-gray-800 dark:text-gray-100">{t('tasks.editTask')}</span>
          <button onClick={onClose} className="bg-transparent border-none text-2xl text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer leading-none" data-tooltip-id="app-tooltip" data-tooltip-content={t('common.close')}><XIcon size={20} strokeWidth={2.25} /></button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto  flex-1 min-h-0">
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">{t('tasks.description')}</label>
            <textarea className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:bg-gray-700 dark:text-gray-100" rows={3} value={desc} onChange={e => setDesc(e.target.value)} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">{t('common.status')}</label>
              <select className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:bg-gray-700 dark:text-gray-100" value={status} onChange={e => setStatus(e.target.value)}>
                {COLUMNS_LOCAL.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">{t('tasks.priority')}</label>
              <select className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:bg-gray-700 dark:text-gray-100" value={priority} onChange={e => setPriority(e.target.value)}>
                <option value="low">{t('tasks.low')}</option>
                <option value="medium">{t('tasks.medium')}</option>
                <option value="high">{t('tasks.high')}</option>
                <option value="urgent">{t('tasks.urgent')}</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">{t('projects.title')}</label>
              <select className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:bg-gray-700 dark:text-gray-100" value={projectId} onChange={e => { setProjectId(e.target.value); setListId('') }}>
                <option value="">- {t('common.none')} -</option>
                {projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">{t('tasks.taskList')}</label>
              <select className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:bg-gray-700 dark:text-gray-100" value={listId} onChange={e => setListId(e.target.value)} disabled={!projectId}>
                <option value="">- {t('common.none')} -</option>
                {availableLists.map((tl: any) => <option key={tl.id} value={tl.id}>{tl.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">{t('tasks.assignee')}</label>
              <select className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:bg-gray-700 dark:text-gray-100" value={assignedTo} onChange={e => setAssignedTo(e.target.value)}>
                <option value="">- {t('tasks.unassigned')} -</option>
                {users.map((u: any) => <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">{t('tasks.dueDate')}</label>
              <input type="date" className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:bg-gray-700 dark:text-gray-100" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="border-t border-gray-100 dark:border-gray-700 px-5 py-4 flex items-center justify-between gap-2 bg-white dark:bg-gray-800 shrink-0">
          <button onClick={handleDelete} data-tooltip-id="app-tooltip" data-tooltip-content="⚠️ This will permanently delete the task" className="rounded-xl px-4 py-2 text-sm bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/50 cursor-pointer border-none">{t('common.delete')}</button>
          <div className="flex gap-2">
            <button onClick={onClose} data-tooltip-id="app-tooltip" data-tooltip-content={t('tasks.editTask')} className="rounded-xl px-4 py-2 text-sm bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 cursor-pointer border-none">{t('common.cancel')}</button>
            <button onClick={handleSave} disabled={saving} data-tooltip-id="app-tooltip" data-tooltip-content="Save changes to this task" className="rounded-xl px-5 py-2 text-sm bg-indigo-600 text-white hover:bg-indigo-700 cursor-pointer border-none font-medium disabled:opacity-50">{saving ? t('common.loading') + '...' : t('common.save')}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function NewTaskModal({ projects, lists, show, defaultStatus, onClose, onCreated, refreshLists }: any) {
  const { t } = useTranslation()
  const [form, setForm] = useState({ projectId: '', listId: '', description: '', assignedToUserId: '', dueDate: '', priority: 'medium', status: defaultStatus })
  const [employees, setEmployees] = useState<any[]>([])
  const [showNewList, setShowNewList] = useState(false)
  const [newListName, setNewListName] = useState('')
  const [loading, setLoading] = useState(false)
  const [creatingList, setCreatingList] = useState(false)

  useEffect(() => {
    if (show) {
      setForm(f => ({ ...f, status: defaultStatus }))
      api.get('/users').then(r => setEmployees(r.users || [])).catch(() => {})
    }
  }, [show, defaultStatus])

  const handleCreateList = async () => {
    if (creatingList) return
    if (!form.projectId || !newListName.trim()) return
    setCreatingList(true)
    try {
      const r: any = await api.post(`/projects/${form.projectId}/todolists`, { name: newListName.trim() })
      const newId = r?.todolist?.id || r?.id
      // Refresh parent's lists for this project, then select the new one
      if (refreshLists) {
        const fresh = await refreshLists(parseInt(form.projectId))
        if (newId && fresh) {
          const found = fresh.find((tl: any) => tl.id === newId)
          if (found) setForm(f => ({ ...f, listId: String(found.id) }))
          else if (fresh.length > 0) setForm(f => ({ ...f, listId: String(fresh[0].id) }))
        } else if (fresh && fresh.length > 0) {
          setForm(f => ({ ...f, listId: String(fresh[0].id) }))
        }
      }
      setNewListName('')
      setShowNewList(false)
      toast.success(t('common.savedSuccessfully'))
    } catch (err: any) {
      toast.error(err.message || t('common.failedToSave'))
    } finally {
      setCreatingList(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const valid = validateForm(taskSchema, form)
    if (!valid) return
    setLoading(true)
    try {
      const res = await api.post('/tasks', {
        todoListId: parseInt(valid.listId),
        description: valid.description.trim(),
        assignedToUserId: valid.assignedToUserId ? parseInt(valid.assignedToUserId) : null,
        dueDate: valid.dueDate || null,
        priority: valid.priority || 'medium',
        status: valid.status || 'todo',
      })
      showActionToast(toast, t, res, t('tasks.createTask'))
      onCreated(res.task || res)
      onClose()
      setForm({ projectId: '', listId: '', description: '', assignedToUserId: '', dueDate: '', priority: 'medium', status: 'todo' })
    } catch (err: any) { toast.error(err.message || t('common.failedToSave')) }
    finally { setLoading(false) }
  }

  if (!show) return null
  const availableLists = form.projectId ? (lists[parseInt(form.projectId)] || []) : []
  // Auto-show the new-list input when the selected project has no todolists
  const autoShowNewList = form.projectId && availableLists.length === 0
  const isAddingList = showNewList || autoShowNewList
  const COLUMNS_LOCAL = [
    { key: 'todo', label: t('tasks.todo') },
    { key: 'in_progress', label: t('tasks.inProgress') },
    { key: 'review', label: t('tasks.inReview') },
    { key: 'done', label: t('tasks.done') },
  ]

  return (
    <div className="fixed inset-0 z-50 bg-black/40 dark:bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[calc(100vh-2rem)]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700 shrink-0">
          <span className="font-semibold text-gray-800 dark:text-gray-100">{t('tasks.createTask')}</span>
          <button onClick={onClose} data-tooltip-id="app-tooltip" data-tooltip-content={t('common.close')} className="bg-transparent border-none text-2xl text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer leading-none"><XIcon size={20} strokeWidth={2.25} /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="p-5 space-y-4 overflow-y-auto  flex-1 min-h-0">
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">{t('projects.title')}</label>
              <select className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:bg-gray-700 dark:text-gray-100" value={form.projectId} onChange={e => setForm(f => ({ ...f, projectId: e.target.value, listId: '' }))}>
                <option value="">- {t('common.selectAll')} -</option>
                {projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            {form.projectId && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">{t('tasks.taskList')}</label>
                {availableLists.length > 0 && !showNewList ? (
                  <div className="flex gap-2">
                    <select className="flex-1 border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:bg-gray-700 dark:text-gray-100" value={form.listId} onChange={e => setForm(f => ({ ...f, listId: e.target.value }))}>
                      <option value="">- {t('common.selectAll')} -</option>
                      {availableLists.map((tl: any) => <option key={tl.id} value={tl.id}>{tl.name}</option>)}
                    </select>
                    <button type="button" data-tooltip-id="app-tooltip" data-tooltip-content={`+ ${t('common.add')} ${t('tasks.taskList')}`} className="shrink-0 rounded-xl px-3 py-2.5 text-sm bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 cursor-pointer border-none" onClick={() => setShowNewList(true)}>+ {t('common.add')}</button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {availableLists.length === 0 && !showNewList && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 italic px-1">{t('tasks.noLists')}</div>
                    )}
                    <div className="flex gap-2">
                      <input
                        autoFocus
                        className="flex-1 border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:bg-gray-700 dark:text-gray-100"
                        placeholder={t('tasks.taskList')}
                        value={newListName}
                        onChange={e => setNewListName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCreateList() } }}
                      />
                      <button
                        type="button"
                        disabled={creatingList || !newListName.trim() || !form.projectId}
                        onClick={handleCreateList}
                        className="shrink-0 rounded-xl px-3 py-2.5 text-sm bg-indigo-600 text-white hover:bg-indigo-700 cursor-pointer border-none disabled:opacity-50"
                      >
                        {creatingList ? t('common.loading') : t('common.add')}
                      </button>
                      {availableLists.length > 0 && (
                        <button
                          type="button"
                          className="shrink-0 rounded-xl px-3 py-2.5 text-sm bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 cursor-pointer border-none"
                          onClick={() => { setShowNewList(false); setNewListName('') }}
                        >×</button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">{t('tasks.description')}</label>
              <textarea className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:bg-gray-700 dark:text-gray-100" rows={3} placeholder={t('discussions.writeReply')} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">{t('common.status')}</label>
                <select className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:bg-gray-700 dark:text-gray-100" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                  {COLUMNS_LOCAL.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">{t('tasks.priority')}</label>
                <select className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:bg-gray-700 dark:text-gray-100" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                  <option value="low">{t('tasks.low')}</option>
                  <option value="medium">{t('tasks.medium')}</option>
                  <option value="high">{t('tasks.high')}</option>
                  <option value="urgent">{t('tasks.urgent')}</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">{t('tasks.dueDate')}</label>
                <input type="date" className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:bg-gray-700 dark:text-gray-100" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">{t('tasks.assignee')}</label>
                <select className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:bg-gray-700 dark:text-gray-100" value={form.assignedToUserId} onChange={e => setForm(f => ({ ...f, assignedToUserId: e.target.value }))}>
                  <option value="">- {t('common.none')} -</option>
                  {employees.map((emp: any) => <option key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 shrink-0">
            <button type="button" data-tooltip-id="app-tooltip" data-tooltip-content={t('tasks.createTask')} className="rounded-xl px-4 py-2.5 text-sm bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 cursor-pointer border-none" onClick={onClose}>{t('common.cancel')}</button>
            <button type="submit" disabled={loading || !form.projectId || !form.listId} data-tooltip-id="app-tooltip" data-tooltip-content="Create a new task in this project" className="rounded-xl px-5 py-2.5 text-sm bg-indigo-600 text-white hover:bg-indigo-700 cursor-pointer border-none font-medium disabled:opacity-50">
              {loading ? t('common.loading') : t('tasks.createTask')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function TasksPage() {
  const { t } = useTranslation()
  const [tasks, setTasks] = useState<any[]>([])
  const [projects, setProjects] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [lists, setLists] = useState<Record<number, any[]>>({})
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [defaultStatus, setDefaultStatus] = useState('todo')
  const [editingTask, setEditingTask] = useState<any | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [filterProject, setFilterProject] = useState<string>('')
  const [filterAssignee, setFilterAssignee] = useState<string>('')
  const [filterPriority, setFilterPriority] = useState<string>('')
  const [filterSearch, setFilterSearch] = useState<string>('')
  const [showCompleted, setShowCompleted] = useState<boolean>(true)

  const COLUMNS = [
    { key: 'todo',        Icon: ClipboardList },
    { key: 'in_progress', Icon: Rocket },
    { key: 'review',      Icon: SearchIcon },
    { key: 'done',        Icon: CheckCircle2 },
  ]

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [t, p, u] = await Promise.all([api.get('/tasks'), api.get('/projects'), api.get('/users')])
      setTasks(t.tasks || []); setProjects(p.projects || []); setUsers(u.users || [])
      const projectsList = p.projects || []
      const listsByProject: Record<number, any[]> = {}
      await Promise.all(projectsList.map(async (proj: any) => {
        try { const r = await api.get(`/projects/${proj.id}`); listsByProject[proj.id] = r.todoLists || [] }
        catch { listsByProject[proj.id] = [] }
      }))
      setLists(listsByProject)
    } catch (e: any) { toast.error(e.message || t('common.failedToSave')) }
    finally { setLoading(false) }
  }

  // Refetch todolists for a single project and update the parent's lists state.
  // Returns the fresh array so the modal can auto-select the newly-created list.
  const refreshLists = async (projectId: number): Promise<any[]> => {
    try {
      const r: any = await api.get(`/projects/${projectId}`)
      const fresh = r.todoLists || []
      setLists(prev => ({ ...prev, [projectId]: fresh }))
      return fresh
    } catch {
      return []
    }
  }

  const filteredTasks = useMemo(() => {
    return tasks.filter((tk: any) => {
      if (!showCompleted && tk.status === 'done') return false
      if (filterProject && String(tk.project_id) !== filterProject) return false
      if (filterAssignee && String(tk.assigned_to_user_id) !== filterAssignee) return false
      if (filterPriority && tk.priority !== filterPriority) return false
      if (filterSearch && filterSearch.trim()) {
        const q = filterSearch.trim().toLowerCase()
        const hay = `${tk.description || ''} ${tk.first_name || ''} ${tk.last_name || ''} ${tk.list_name || ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [tasks, filterProject, filterAssignee, filterPriority, filterSearch, showCompleted])

  const byStatus = useMemo(() => {
    const map: Record<string, any[]> = {}
    COLUMNS.forEach(c => { map[c.key] = [] })
    filteredTasks.forEach((tk: any) => { if (map[tk.status]) map[tk.status].push(tk); else map.todo.push(tk) })
    return map
  }, [filteredTasks])

  const openTask = tasks.find((tk: any) => `task-${tk.id}` === activeId)

  const handleAssign = async (taskId: number, userId: number) => {
    const usr = users.find((u: any) => String(u.id) === String(userId))
    const snap = [...tasks]
    setTasks(prev => prev.map(t => String(t.id) === String(taskId) ? { ...t, assigned_to_user_id: userId, first_name: usr?.first_name, last_name: usr?.last_name } : t))
    try { const res = await api.put(`/tasks/${taskId}`, { assignedToUserId: userId }); showActionToast(toast, t, res, t('common.savedSuccessfully')) }
    catch (err: any) { setTasks(snap); toast.error(err.message || t('common.failedToSave')) }
  }

  const handleStatusChange = async (id: number, status: string) => {
    const snap = [...tasks]
    setTasks(prev => prev.map(t => String(t.id) === String(id) ? { ...t, status } : t))
    try { await api.put(`/tasks/${id}`, { status }) }
    catch (err: any) { setTasks(snap); toast.error(err.message) }
  }

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/tasks/${id}`)
      setTasks(prev => prev.filter(t => String(t.id) !== String(id)))
      toast.success(t('common.deletedSuccessfully'))
    } catch (err: any) { toast.error(err.message) }
  }

  const handleDragStart = (event: DragStartEvent) => setActiveId(String(event.active.id))
  const resolveDropStatus = (overId: string, taskList: any[]): string | null => {
    if (!overId) return null
    if (overId.startsWith('col-')) return overId.replace('col-', '')
    if (overId.startsWith('task-')) {
      const overTaskId = parseInt(overId.replace('task-', ''))
      const overTask = taskList.find((t: any) => Number(t.id) === overTaskId)
      return overTask ? overTask.status : null
    }
    return null
  }
  const handleDragOver = (_event: DragOverEvent) => {}
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)
    if (!over) return
    const activeIdStr = String(active.id)
    if (!activeIdStr.startsWith('task-')) return
    const taskId = parseInt(activeIdStr.replace('task-', ''))
    const task = tasks.find((t: any) => Number(t.id) === taskId)
    if (!task) return
    const newStatus = resolveDropStatus(String(over.id), tasks)
    if (!newStatus || newStatus === task.status) return
    await handleStatusChange(taskId, newStatus)
  }

  const openCreate = (status: string = 'todo') => { setDefaultStatus(status); setShowCreate(true) }
  const handleTaskCreated = (newTask: any) => { if (newTask?.id) setTasks(prev => [...prev, newTask]); else loadData() }
  const handleTaskUpdated = (id: number, patch: any) => setTasks(prev => prev.map(t => String(t.id) === String(id) ? { ...t, ...patch } : t))

  const hasFilters = !!(filterProject || filterAssignee || filterPriority || filterSearch)

  return (
    <div className="max-w-full space-y-4 animate-fade-in-up">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
          {/* Search input */}
          <div className="relative w-full sm:w-64">
            <SearchIcon size={14} strokeWidth={2.25} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="search"
              value={filterSearch}
              onChange={e => setFilterSearch(e.target.value)}
              placeholder={`${t('common.search')}...`}
              className="w-full border border-gray-200 dark:border-gray-600 rounded-xl pl-9 pr-3 py-2.5 text-sm bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition"
            />
          </div>
          <select className="w-full sm:w-auto border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition cursor-pointer" value={filterProject} onChange={e => setFilterProject(e.target.value)}>
            <option value="">{t('projects.allProjects')}</option>
            {projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select className="w-full sm:w-auto border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition cursor-pointer" value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)}>
            <option value="">{t('tasks.assignee')} — {t('common.all')}</option>
            {users.map((u: any) => <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>)}
          </select>
          <select className="w-full sm:w-auto border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition cursor-pointer" value={filterPriority} onChange={e => setFilterPriority(e.target.value)}>
            <option value="">{t('tasks.priority')} — {t('common.all')}</option>
            <option value="urgent">{t('tasks.urgent')}</option>
            <option value="high">{t('tasks.high')}</option>
            <option value="medium">{t('tasks.medium')}</option>
            <option value="low">{t('tasks.low')}</option>
          </select>
          {/* Show/hide completed toggle */}
          <button
            onClick={() => setShowCompleted(s => !s)}
            title={showCompleted ? 'Hide completed tasks' : 'Show completed tasks'}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-bold border transition cursor-pointer shrink-0 ${
              showCompleted
                ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300'
                : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400'
            }`}
          >
            <span>{showCompleted ? <Eye size={12} strokeWidth={2.25} /> : <EyeOff size={12} strokeWidth={2.25} />}</span>
            <span className="hidden sm:inline">{showCompleted ? 'Showing done' : 'Hiding done'}</span>
          </button>
          {hasFilters && (
            <button onClick={() => { setFilterProject(''); setFilterAssignee(''); setFilterPriority(''); setFilterSearch('') }} className="text-sm text-indigo-500 dark:text-indigo-400 hover:underline font-medium px-2 py-2.5 cursor-pointer bg-transparent border-none">
              {t('common.clear')}
            </button>
          )}
        </div>
        <button onClick={() => openCreate('todo')} data-tooltip-id="app-tooltip" data-tooltip-content={`+ ${t('tasks.newTask')}`} className="w-full sm:w-auto px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white hover:shadow-lg rounded-xl text-sm font-bold transition shadow cursor-pointer border-none flex items-center justify-center gap-2 shrink-0">
          <PlusIcon size={16} strokeWidth={2.5} /> {t('tasks.newTask')}
        </button>
      </div>

      {loading ? (
        <PageLoader label={t('common.loading')} />
      ) : tasks.length === 0 ? (
        <div className="text-center py-20">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-500 dark:text-indigo-400 mb-3"><ClipboardList size={32} strokeWidth={1.75} /></div>
          <div className="font-semibold text-gray-600 dark:text-gray-300 mb-1">{t('tasks.noTasks')}</div>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
          <div className="pb-4 overflow-x-auto">
            <div className="grid grid-cols-4 gap-3 min-w-[940px] items-stretch">
              {COLUMNS.map((col) => (
                <div key={col.key} className="min-w-[220px] flex">
                  <KanbanColumn column={col} tasks={byStatus[col.key] || []} users={users} onDelete={handleDelete} onAssign={handleAssign} onAddTask={openCreate} onClickTask={setEditingTask} />
                </div>
              ))}
            </div>
          </div>
          <DragOverlay>{openTask ? <div className="w-72 sm:w-80 rotate-2"><TaskCard task={openTask} users={users} onDelete={handleDelete} onAssign={handleAssign} isOverlay /></div> : null}</DragOverlay>
        </DndContext>
      )}

      <NewTaskModal projects={projects} lists={lists} show={showCreate} defaultStatus={defaultStatus} onClose={() => setShowCreate(false)} onCreated={handleTaskCreated} refreshLists={refreshLists} />

      {editingTask && (
        <TaskDetailDrawer task={editingTask} users={users} projects={projects} lists={Object.values(lists).flat()} onClose={() => setEditingTask(null)} onUpdate={handleTaskUpdated} onDelete={handleDelete} />
      )}
    </div>
  )
}
