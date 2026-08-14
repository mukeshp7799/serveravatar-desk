'use client'
import PortalModal from '@/components/PortalModal';
import ConfirmDialog from '@/components/project/ConfirmDialog';
import PageLoader from '@/components/PageLoader'
import ReactionBar from '@/components/project/ReactionBar'
import { useEffect, useState, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { Megaphone, Pencil, Trash2, Bell, Users, ShieldCheck, UserCheck, Calendar, Clock, X, Pin, PinOff, RotateCcw } from 'lucide-react'
import api from '@/lib/api'
import { useDateSettings } from '@/contexts/CompanySettingsContext'
import { announcementSchema, announcementFormSchema, type AnnouncementInput, type AnnouncementFormData } from '@/lib/schemas'
import type { Reaction } from '@/types/project'

type AnnTab = 'all' | 'my' | 'drafts' | 'archived'
const LIMIT_OPTIONS = [10, 20, 30, 50] as const

interface AnnReactions {
  emojis: { emoji: string; count: number; users?: string[] }[]
  total: number
  userEmojis: string[]
}

interface Announcement {
  id: number
  title: string
  content: string
  priority: 'low' | 'normal' | 'high' | 'urgent'
  status: 'draft' | 'published' | 'archived'
  publish_date: string | null
  expiry_date: string | null
  audience_target: 'everyone' | 'departments' | 'roles' | 'employees'
  target_ids: number[]
  posted_by: number
  poster_name: string
  created_at: string
  updated_at: string
  reactions: AnnReactions
  is_owner: boolean
  is_pinned: boolean
  can_edit?: boolean
}

interface Lookups {
  departments: { id: number; name: string }[]
  roles: { id: number; name: string }[]
  employees: { id: number; first_name: string; last_name: string; email: string; department_name: string }[]
}

const priorityColors: Record<string, string> = {
  low: 'bg-gray-100 text-gray-600 border-gray-200',
  normal: 'bg-blue-50 text-blue-700 border-blue-200',
  high: 'bg-amber-50 text-amber-700 border-amber-200',
  urgent: 'bg-red-50 text-red-700 border-red-200',
}
const priorityBadge: Record<string, string> = {
  low: 'Low', normal: 'Normal', high: 'High', urgent: 'Urgent',
}
const statusColors: Record<string, string> = {
  draft: 'bg-gray-50 text-gray-600 border-gray-200',
  published: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  archived: 'bg-orange-50 text-orange-700 border-orange-200',
}
const audienceIcon: Record<string, any> = {
  everyone: Bell, departments: Users, roles: ShieldCheck, employees: UserCheck,
}
const audienceLabel: Record<string, string> = {
  everyone: 'Everyone', departments: 'Departments', roles: 'Roles', employees: 'Selected People',
}

function AnnouncementCard({
 ann, onEdit, onDelete, onReact, onPin, onRestore, currentUserId, canManage }: {
  ann: Announcement
  onEdit: (a: Announcement) => void
  onDelete: (id: number) => void
  onReact: (id: number, emoji: string, oldEmoji?: string) => Promise<void>
  onPin: (id: number) => void
  onRestore: (id: number) => void
  currentUserId: number
  canManage: boolean
}) {
  const { t } = useTranslation()
  const { date_format } = useDateSettings();
  const fmtDate = (raw: string | Date | null | undefined): string => {
    if (!raw) return '';
    const d = typeof raw === 'string' ? new Date(raw) : raw;
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const pattern = date_format || 'YYYY-MM-DD';
    return pattern
      .replace('YYYY', String(y)).replace('YY', String(y).slice(-2))
      .replace('MM', String(m).padStart(2,'0')).replace('M', String(m))
      .replace('DD', String(day).padStart(2,'0')).replace('D', String(day));
  };

  const reactionRef = useRef<HTMLDivElement>(null)
  const AudienceIcon = audienceIcon[ann.audience_target] || Bell
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const reactions: Reaction[] = ann.reactions.emojis.map(e => ({
    emoji: e.emoji,
    count: e.count,
    users: e.users || [],
    mine: ann.reactions.userEmojis.includes(e.emoji),
  }))

  const handleReactionToggle = async (emoji: string, oldEmoji?: string) => {
    if (oldEmoji && oldEmoji !== emoji) {
      await onReact(ann.id, emoji, oldEmoji)
    } else {
      await onReact(ann.id, emoji)
    }
  }

  const bgColor = ann.priority === 'urgent' ? 'bg-red-500'
    : ann.priority === 'high' ? 'bg-amber-400'
    : ann.priority === 'normal' ? 'bg-indigo-500' : 'bg-gray-300'

  const iconBg = ann.priority === 'urgent' ? 'bg-red-500'
    : ann.priority === 'high' ? 'bg-amber-500'
    : ann.priority === 'normal' ? 'bg-indigo-600' : 'bg-gray-500'

  return (
    <div className={`bg-white rounded-2xl border overflow-hidden hover:shadow-md transition-shadow group ${ann.is_pinned ? 'border-amber-300 shadow-amber-100' : 'border-gray-100'}`}>
      <div className={`h-1 ${bgColor}`} />
      <div className="p-4 sm:p-5">
        {/* Header row */}
        <div className="flex flex-col sm:flex-row justify-between items-start gap-2 sm:gap-3 mb-3">
          {/* Left: icon + badges + title + meta */}
          <div className="flex items-start gap-2 sm:gap-3 flex-1 min-w-0 w-full">
            <div className={`relative w-9 h-9 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center text-white shadow shrink-0 ${iconBg}`}>
              <Megaphone size={16} strokeWidth={2.25} />
              {ann.is_pinned && (
                <div className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-amber-500 rounded-full flex items-center justify-center shadow">
                  <Pin size={8} strokeWidth={3} className="text-white" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              {/* Badges row */}
              <div className="flex flex-wrap items-center gap-1.5 mb-1">
                {ann.is_pinned && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">
                    <Pin size={9} /> Pinned
                  </span>
                )}
                <span className={`inline-flex items-center rounded-full px-1.5 sm:px-2.5 py-0.5 text-[10px] sm:text-xs font-bold border ${priorityColors[ann.priority]}`}>
                  {priorityBadge[ann.priority]}
                </span>
                <span className={`inline-flex items-center gap-0.5 sm:gap-1 rounded-full px-1.5 sm:px-2.5 py-0.5 text-[10px] sm:text-xs font-bold border ${statusColors[ann.status]}`}>
                  {ann.status === 'published' ? <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> : null}
                  {ann.status.charAt(0).toUpperCase() + ann.status.slice(1)}
                </span>
                {ann.audience_target !== 'everyone' && (
                  <span className="hidden xs:inline-flex items-center gap-0.5 text-[10px] sm:text-xs text-gray-500" title={audienceLabel[ann.audience_target]}>
                    <AudienceIcon size={11} />
                  </span>
                )}
              </div>
              {/* Title */}
              <h3 className="text-sm sm:text-base font-extrabold text-gray-900 leading-tight truncate">{ann.title}</h3>
              {/* Meta row */}
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] sm:text-xs text-gray-500 mt-0.5">
                <div className="flex items-center gap-0.5 sm:gap-1">
                  <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[8px] sm:text-[9px] font-bold shrink-0">
                    {ann.poster_name?.[0] || '?'}
                  </div>
                  <span className="font-semibold truncate max-w-[80px] sm:max-w-none">{ann.poster_name}</span>
                </div>
                <span>•</span>
                <span>{fmtDate(ann.created_at)}</span>
              </div>
            </div>
          </div>
          {/* Action buttons */}
          {(canManage || ann.is_owner) && (
            <div className="flex items-center gap-1 shrink-0 ml-auto sm:ml-0">
              <div className="flex gap-0.5">
                {canManage && (
                  <button onClick={() => onPin(ann.id)} title={ann.is_pinned ? 'Unpin' : 'Pin'}
                    className="w-7 h-7 rounded-lg text-amber-600 hover:bg-amber-50 cursor-pointer border-none transition flex items-center justify-center">
                    {ann.is_pinned ? <PinOff size={13} strokeWidth={2.25} /> : <Pin size={13} strokeWidth={2.25} />}
                  </button>
                )}
                {ann.status === 'archived' && canManage && (
                  <button onClick={() => onRestore(ann.id)} title="Restore"
                    className="w-7 h-7 rounded-lg text-emerald-600 hover:bg-emerald-50 cursor-pointer border-none transition flex items-center justify-center">
                    <RotateCcw size={13} strokeWidth={2.25} />
                  </button>
                )}
                <button onClick={() => onEdit(ann)} title="Edit"
                  className="w-7 h-7 rounded-lg text-indigo-600 hover:bg-indigo-50 cursor-pointer border-none transition flex items-center justify-center">
                  <Pencil size={13} strokeWidth={2.25} />
                </button>
                <button onClick={() => setShowDeleteConfirm(true)} title="Archive"
                  className="w-7 h-7 rounded-lg text-red-600 hover:bg-red-50 cursor-pointer border-none transition flex items-center justify-center">
                  <Trash2 size={13} strokeWidth={2.25} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Content */}
        <p className="text-xs sm:text-sm text-gray-700 leading-relaxed whitespace-pre-wrap bg-gray-50 p-3 sm:p-4 rounded-xl border border-gray-100 mb-2 sm:mb-3 line-clamp-3">
          {ann.content}
        </p>

        {/* Footer: reactions + expiry */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div className="relative w-full sm:w-auto overflow-hidden" ref={reactionRef}>
            <ReactionBar
              reactions={reactions}
              onToggle={handleReactionToggle}
              disabled={ann.status !== 'published' && ann.status !== 'archived'}
              disabledTooltipMessage="Reactions are available only after this announcement is published."
              currentUserName=""
            />
          </div>
          {ann.expiry_date && (
            <span className="hidden sm:flex items-center gap-1 text-[10px] sm:text-xs text-gray-400 shrink-0" title="Expires">
              <Clock size={11} /> {new Date(ann.expiry_date) < new Date() ? 'Expired' : 'Expires ' + fmtDate(ann.expiry_date)}
            </span>
          )}
        </div>

        <ConfirmDialog
          open={showDeleteConfirm}
          title={t('announcements.deleteTitle')}
          description={t('announcements.deleteConfirm')}
          confirmLabel={t('common.delete') || 'Delete'}
          destructive
          onConfirm={() => { setShowDeleteConfirm(false); onDelete(ann.id); }}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      </div>
    </div>
  )
}

function CreateEditModal({ ann, lookups, onClose, onSaved }: {
  ann?: Announcement | null; lookups: Lookups; onClose: () => void; onSaved: () => void;
}) {
  const { t } = useTranslation()
  const {
    register, handleSubmit, reset, watch, setValue, formState: { errors },
  } = useForm<AnnouncementFormData>({
    resolver: zodResolver(announcementFormSchema),
    mode: 'onBlur',
    defaultValues: ann ? {
      title: ann.title, content: ann.content,
      priority: ann.priority, status: ann.status,
      audience_target: ann.audience_target,
      target_ids: ann.target_ids || [],
      publish_date: ann.publish_date ? ann.publish_date.slice(0, 16) : '',
      expiry_date: ann.expiry_date ? ann.expiry_date.slice(0, 16) : '',
      is_pinned: ann.is_pinned,
    } : {
      title: '', content: '', priority: 'normal', status: 'draft',
      audience_target: 'everyone', target_ids: [], publish_date: '', expiry_date: '', is_pinned: false,
    }
  })

  const selectedAudience = watch('audience_target')
  const selectedTargets = watch('target_ids') || []
  const isPinned = watch('is_pinned')

  const toggleTarget = (id: number) => {
    const current = selectedTargets || []
    const updated = current.includes(id) ? current.filter(x => x !== id) : [...current, id]
    setValue('target_ids', updated)
  }

  const onSubmit = async (data: AnnouncementFormData) => {
    try {
      const payload = {
        title: data.title, content: data.content,
        priority: data.priority, status: data.status,
        audience_target: data.audience_target,
        target_ids: data.audience_target === 'everyone' ? [] : (data.target_ids || []),
        publish_date: data.publish_date || null,
        expiry_date: data.expiry_date || null,
        is_pinned: data.is_pinned || false,
      }
      if (ann?.id) {
        await api.put(`/announcements/${ann.id}`, payload)
        toast.success(t('announcements.updated'))
      } else {
        await api.post('/announcements', payload)
        toast.success(ann ? t('announcements.updated') : t('announcements.published'))
      }
      onSaved()
    } catch (err: any) {
      toast.error(err.message || t('common.failedToSave'))
      onClose()
    }
  }

  return (
    <PortalModal>
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl animate-scale-in flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="bg-indigo-600 px-6 py-4 rounded-t-3xl shrink-0">
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-extrabold text-white flex items-center gap-2">
              <Megaphone size={18} strokeWidth={2.25} />
              {ann ? t('common.edit') + ' ' + t('announcements.title') : t('announcements.postNew')}
            </h3>
            <button onClick={onClose} className="bg-white/20 hover:bg-white/30 text-white rounded-lg w-8 h-8 flex items-center justify-center cursor-pointer border-none text-lg">×</button>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="p-6 overflow-y-auto flex-1 space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wide">{t('announcements.titleField')} *</label>
              <input {...register('title')} className={`w-full border-2 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-4 transition ${errors.title ? 'border-red-400 focus:border-red-500' : 'border-gray-200 focus:border-indigo-500 focus:ring-indigo-100'}`} placeholder="Announcement title..." />
              {errors.title && <p className="mt-1 text-xs text-red-500">{errors.title.message as string}</p>}
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wide">{t('announcements.content')} *</label>
              <textarea {...register('content')} rows={5}
                className={`w-full border-2 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-4 resize-y min-h-[120px] transition ${errors.content ? 'border-red-400' : 'border-gray-200 focus:border-indigo-500 focus:ring-indigo-100'}`}
                placeholder="Write your announcement content..." />
              {errors.content && <p className="mt-1 text-xs text-red-500">{errors.content.message as string}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Priority</label>
                <select {...register('priority')} className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100">
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Status</label>
                <select {...register('status')} className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100">
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
            </div>

            {/* Pin toggle */}
            <div className="flex items-center justify-between bg-amber-50 rounded-xl p-3 border border-amber-200">
              <div className="flex items-center gap-2">
                <Pin size={14} className="text-amber-600" />
                <span className="text-xs font-bold text-amber-800">Pin this announcement</span>
                <span className="text-xs text-amber-600">(pinned announcements appear at the top)</span>
              </div>
              <button
                type="button"
                onClick={() => setValue('is_pinned', !isPinned)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${isPinned ? 'bg-amber-500' : 'bg-gray-300'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${isPinned ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
              <input type="hidden" {...register('is_pinned')} />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Audience</label>
              <div className="grid grid-cols-2 gap-2 mb-2">
                {(['everyone', 'departments', 'roles', 'employees'] as const).map(a => {
                  const Icon = audienceIcon[a]
                  return (
                    <button key={a} type="button" onClick={() => setValue('audience_target', a)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer
                        ${selectedAudience === a ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
                      <Icon size={14} /> {audienceLabel[a]}
                    </button>
                  )
                })}
              </div>
              <input type="hidden" {...register('audience_target')} />
            </div>
            {selectedAudience !== 'everyone' && (
              <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
                <label className="block text-xs font-bold text-gray-600 mb-2">
                  Select {selectedAudience === 'departments' ? 'Departments' : selectedAudience === 'roles' ? 'Roles' : 'People'}
                </label>
                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                  {selectedAudience === 'departments' && lookups.departments.map(d => (
                    <button key={d.id} type="button" onClick={() => toggleTarget(d.id)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition cursor-pointer
                        ${selectedTargets.includes(d.id) ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-gray-300 text-gray-700 hover:bg-indigo-50'}`}>
                      {d.name}
                    </button>
                  ))}
                  {selectedAudience === 'roles' && lookups.roles.map(r => (
                    <button key={r.id} type="button" onClick={() => toggleTarget(r.id)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition cursor-pointer
                        ${selectedTargets.includes(r.id) ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-gray-300 text-gray-700 hover:bg-indigo-50'}`}>
                      {r.name}
                    </button>
                  ))}
                  {selectedAudience === 'employees' && lookups.employees.map(e => (
                    <button key={e.id} type="button" onClick={() => toggleTarget(e.id)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition cursor-pointer
                        ${selectedTargets.includes(e.id) ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-gray-300 text-gray-700 hover:bg-indigo-50'}`}>
                      {e.first_name} {e.last_name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1"><Calendar size={11} className="inline mr-1" />Publish Date</label>
                <input type="datetime-local" {...register('publish_date')}
                  className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1"><Clock size={11} className="inline mr-1" />Expiry Date</label>
                <input type="datetime-local" {...register('expiry_date')}
                  className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100" />
              </div>
            </div>
          </div>
          <div className="border-t border-gray-100 px-6 py-4 flex flex-wrap justify-end gap-2 bg-gray-50 rounded-b-3xl shrink-0">
            <button type="button" onClick={onClose} className="px-5 py-2.5 text-sm font-bold bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-xl transition cursor-pointer border-none">{t('common.cancel')}</button>
            <button type="submit" className="px-5 py-2.5 text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition cursor-pointer border-none">
              {ann ? t('common.saveChanges') : t('announcements.publish')}
            </button>
          </div>
        </form>
      </div>
    </div>
    </PortalModal>
  )
}

export default function AnnouncementsPage() {
  const { t } = useTranslation()

  const { date_format } = useDateSettings();
  const fmtDate = (raw: string | Date | null | undefined): string => {
    if (!raw) return '';
    const d = typeof raw === 'string' ? new Date(raw) : raw;
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const pattern = date_format || 'YYYY-MM-DD';
    return pattern
      .replace('YYYY', String(y)).replace('YY', String(y).slice(-2))
      .replace('MM', String(m).padStart(2,'0')).replace('M', String(m))
      .replace('DD', String(day).padStart(2,'0')).replace('D', String(day));
  };

  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<AnnTab>('all')
  const [showCreate, setShowCreate] = useState(false)
  const [editAnn, setEditAnn] = useState<Announcement | null>(null)
  const [lookups, setLookups] = useState<Lookups>({ departments: [], roles: [], employees: [] })
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [limit, setLimit] = useState(10)
  const user = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('user') || '{}') : {}
  const userPerms: string[] = Array.isArray(user.permissions) ? user.permissions : []
  const canPost = userPerms.includes('announcements.create')
  const canManage = userPerms.includes('announcements.manage')

  const loadAnnouncements = async (pageNum = 1, explicitLimit?: number) => {
    setLoading(true)
    try {
      const effectiveLimit = explicitLimit !== undefined ? explicitLimit : limit
      const params = new URLSearchParams({ page: String(pageNum), limit: String(effectiveLimit) })
      if (tab === 'all') params.set('admin', '1')
      if (tab === 'drafts') params.set('scope', 'drafts')
      if (tab === 'archived') params.set('scope', 'archived')
      if (tab === 'my') params.set('scope', 'my')
      const res = await api.get(`/announcements?${params.toString()}`)
      setAnnouncements(res.announcements || [])
      setTotal(res.total || 0)
      setPage(pageNum)
    } catch { toast.error(t('common.failedToLoad')) }
    finally { setLoading(false) }
  }

  const loadLookups = async () => {
    try {
      const res = await api.get('/announcements/lookups')
      setLookups(res)
    } catch {}
  }

  useEffect(() => { loadAnnouncements(1); loadLookups() }, [tab])

  const handleReact = async (annId: number, emoji: string, oldEmoji?: string) => {
    try {
      const body = oldEmoji ? { emoji, old_emoji: oldEmoji } : { emoji }
      const res = await api.post(`/announcements/${annId}/reactions`, body)
      const newReactions = res.reactions || []
      const userEmojis = newReactions.filter((r: any) => r.mine).map((r: any) => r.emoji)
      const total = newReactions.reduce((s: number, r: any) => s + r.count, 0)
      setAnnouncements(prev => prev.map(a => {
        if (a.id !== annId) return a
        return { ...a, reactions: { ...a.reactions, emojis: newReactions, userEmojis, total } }
      }))
    } catch { toast.error('Failed to react') }
  }

  const handlePin = async (id: number) => {
    try {
      const res = await api.patch(`/announcements/${id}/pin`)
      const newPinned = res.is_pinned
      setAnnouncements(prev => prev.map(a => a.id === id ? { ...a, is_pinned: newPinned } : a))
      toast.success(newPinned ? t('announcements.pinned') : t('announcements.unpinned'))
    } catch (err: any) { toast.error(err.message || 'Failed to update pin') }
  }

  const handleRestore = async (id: number) => {
    if (!confirm(t('announcements.restoreConfirm') as string)) return
    try {
      await api.post(`/announcements/${id}/restore`)
      toast.success(t('announcements.restored'))
      loadAnnouncements(page)
    } catch (err: any) { toast.error(err.message || 'Failed to restore announcement') }
  }

  const handleDelete = async (id: number) => {
    if (!confirm(t('announcements.deleteConfirm') as string)) return
    try {
      await api.delete(`/announcements/${id}`)
      toast.success(t('common.deletedSuccessfully') as string)
      loadAnnouncements(page)
    } catch (err: any) { toast.error(err.message || (t('common.failedToDelete') as string)) }
  }

  const handleEdit = (ann: Announcement) => { setEditAnn(ann); setShowCreate(false) }

  const tabs: { key: AnnTab; label: string; show?: boolean }[] = [
    { key: 'all', label: 'All' },
    { key: 'my', label: 'My Announcements', show: canPost },
    { key: 'drafts', label: 'Drafts', show: canPost },
    { key: 'archived', label: 'Archived' },
  ]

  const pages = Math.ceil(total / limit)

  return (
    <div className="space-y-5 animate-fade-in-up">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">{t('announcements.title') || 'Announcements'}</h1>
          <p className="text-sm text-gray-500 mt-0.5">Company-wide announcements, updates, and notices</p>
        </div>
        {canPost && (
          <button onClick={() => { setEditAnn(null); setShowCreate(true); }}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition shadow-lg cursor-pointer border-none flex items-center gap-2">
            <span className="text-lg">+</span> {t('announcements.postNew')}
          </button>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-1.5 flex gap-1 flex-wrap">
        {tabs.filter(tb => tb.show !== false).map(tb => (
          <button key={tb.key} onClick={() => setTab(tb.key)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition cursor-pointer border-none
              ${tab === tb.key ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-600 hover:bg-gray-100 bg-transparent'}`}>
            {tb.label}
          </button>
        ))}
      </div>

      {loading ? (
        <PageLoader label={t('common.loading')} size="lg" />
      ) : announcements.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-16 text-center">
          <Megaphone size={48} strokeWidth={1.75} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-600 font-bold mb-1">No announcements yet</p>
          <p className="text-gray-400 text-sm">Check back later or create a new announcement.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {announcements.map((ann: Announcement) => (
            <AnnouncementCard
              key={ann.id}
              ann={ann}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onReact={handleReact}
              onPin={handlePin}
              onRestore={handleRestore}
              currentUserId={user.id}
              canManage={canManage}
            />
          ))}
        </div>
      )}

      {(
        <div className="flex flex-wrap items-start sm:items-center justify-between gap-x-6 gap-y-2 px-4 sm:px-5 py-3 border-t border-gray-100 bg-white rounded-b-2xl">
          <p className="text-xs text-gray-500 whitespace-nowrap leading-7">
            Showing <span className="font-medium text-gray-700">{Math.min((page - 1) * limit + 1, total)}</span> to{' '}
            <span className="font-medium text-gray-700">{Math.min(page * limit, total)}</span> of{' '}
            <span className="font-medium text-gray-700">{total.toLocaleString()}</span> results
          </p>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-400 whitespace-nowrap leading-7">Per page:</span>
              <div className="relative">
                <select
                  value={limit}
                  onChange={e => { const newLimit = Number(e.target.value); setLimit(newLimit); setPage(1); loadAnnouncements(1, newLimit) }}
                  className="appearance-none pl-2 pr-6 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg cursor-pointer focus:outline-none focus:ring-2 transition"
                  style={{ '--tw-ring-color': '#4F46E5', colorScheme: 'normal' } as any}
                >
                  {LIMIT_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
                <span className="pointer-events-none absolute inset-y-0 right-1.5 flex items-center text-gray-400">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => { setPage(p => Math.max(1, p - 1)); loadAnnouncements(page - 1) }}
                disabled={page === 1}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 transition cursor-pointer bg-transparent"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              {Array.from({ length: pages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === pages || Math.abs(p - page) <= 1)
                .reduce<(number | string)[]>((acc, p, idx, arr) => {
                  if (idx > 0 && Number(p) - Number(arr[idx - 1]) > 1) acc.push('...')
                  acc.push(p)
                  return acc
                }, [])
                .map((p, i) =>
                  p === '...' ? (
                    <span key={`e-${i}`} className="w-8 h-8 flex items-center justify-center text-xs text-gray-400">…</span>
                  ) : (
                    <button key={p} onClick={() => { setPage(Number(p)); loadAnnouncements(Number(p)) }}
                      className={`w-8 h-8 flex items-center justify-center rounded-lg text-xs font-semibold transition cursor-pointer border ${
                        page === p
                          ? 'text-white border-transparent'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                      style={page === p ? { backgroundColor: '#4F46E5' } : {}}
                    >{p}</button>
                  )
                )}
              <button
                onClick={() => { setPage(p => Math.min(pages, p + 1)); loadAnnouncements(page + 1) }}
                disabled={page === pages}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 transition cursor-pointer bg-transparent"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreate && (
        <CreateEditModal ann={null} lookups={lookups}
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); loadAnnouncements(1); }} />
      )}
      {editAnn && (
        <CreateEditModal ann={editAnn} lookups={lookups}
          onClose={() => setEditAnn(null)}
          onSaved={() => { setEditAnn(null); loadAnnouncements(page); }} />
      )}
    </div>
  )
}
