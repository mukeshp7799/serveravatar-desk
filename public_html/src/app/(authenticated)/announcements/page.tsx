'use client'
import PageLoader from '@/components/PageLoader'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { Megaphone, Pencil, Trash2 } from 'lucide-react'
import api from '@/lib/api'
import { validateForm, announcementSchema } from '@/lib/schemas'

export default function AnnouncementsPage() {
  const { t } = useTranslation()
  const [announcements, setAnnouncements] = useState<any[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [editAnnouncement, setEditAnnouncement] = useState<any>(null)
  const [form, setForm] = useState({ title: '', content: '' })
  const [loading, setLoading] = useState(true)
  const user = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('user') || '{}') : {}
  const canPost = user.roleName === 'HR Admin' || user.roleName === 'Project Manager' || user.roleName === 'System Admin'

  useEffect(() => { loadAnnouncements() }, [])

  const loadAnnouncements = () => {
    setLoading(true)
    api.get('/announcements').then(res => setAnnouncements(res.announcements || [])).catch(() => {}).finally(() => setLoading(false))
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    const valid = validateForm(announcementSchema, form)
    if (!valid) return
    try {
      await api.post('/announcements', { title: valid.title, content: valid.content })
      setShowCreate(false)
      setForm({ title: '', content: '' })
      toast.success(t('announcements.published'))
      loadAnnouncements()
    } catch (err: any) { toast.error(err.message || t('common.failedToSave')) }
  }

  const openEdit = (a: any) => {
    setEditAnnouncement(a)
    setForm({ title: a.title || '', content: a.content || '' })
    setShowEdit(true)
  }

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    const valid = validateForm(announcementSchema, form)
    if (!valid) return
    try {
      await api.put(`/announcements/${editAnnouncement.id}`, { title: valid.title, content: valid.content, isActive: true })
      setShowEdit(false); setEditAnnouncement(null)
      toast.success(t('announcements.updated'))
      loadAnnouncements()
    } catch (err: any) { toast.error(err.message || t('common.failedToSave')) }
  }

  const handleDelete = async (id: number) => {
    if (!confirm(t('announcements.deleteConfirm'))) return
    try {
      await api.delete(`/announcements/${id}`)
      toast.success(t('common.deletedSuccessfully'))
      loadAnnouncements()
    } catch (err: any) {
      toast.error(err.message || t('common.failedToDelete'))
    }
  }

  return (
    <div className="space-y-5 animate-fade-in-up">
      <div className="flex flex-wrap justify-end items-center gap-3">
        <button onClick={() => { setForm({ title: '', content: '' }); setShowCreate(true) }} className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white hover:shadow-lg rounded-xl text-sm font-bold transition shadow-lg cursor-pointer border-none flex items-center gap-2">
          <span className="text-lg">+</span> {t('announcements.postNew')}
        </button>
      </div>

      {loading ? (
        <PageLoader label={t('common.loading')} size="lg" />
      ) : announcements.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-16 text-center">
          <Megaphone size={48} strokeWidth={1.75} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-600 font-bold mb-1">{t('announcements.noAnnouncements')}</p>
          <p className="text-gray-400 text-sm">{t('announcements.emptyHint')}</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {announcements.map((a: any) => (
            <div key={a.id} className="group bg-white rounded-2xl border border-gray-100 overflow-hidden hover-lift">
              <div className="relative h-2 bg-indigo-600 hover:bg-indigo-700"></div>
              <div className="p-5 bg-white">
                <div className="flex justify-between items-start mb-3 gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="w-11 h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center text-xl shadow shrink-0"><Megaphone size={20} strokeWidth={2.25} /></div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-extrabold text-gray-900 mb-1">{a.title}</h3>
                      <div className="text-xs text-gray-500 flex items-center gap-2">
                        <div className="inline-flex items-center gap-1">
                          <div className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[9px] font-bold">
                            {a.first_name?.[0]}{a.last_name?.[0]}
                          </div>
                          <span className="font-semibold">{a.first_name} {a.last_name}</span>
                        </div>
                        <span>•</span>
                        <span>{new Date(a.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold bg-gray-50 text-emerald-700 border border-emerald-200">
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-500 mr-1.5 animate-pulse"></span>
                      {t('employees.active')}
                    </span>
                    {canPost && (
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(a)} title={t('common.edit')} className="w-8 h-8 rounded-lg text-indigo-600 hover:bg-indigo-50 cursor-pointer border-none transition flex items-center justify-center"><Pencil size={14} strokeWidth={2.25} /></button>
                        <button onClick={() => handleDelete(a.id)} title={t('common.delete')} className="w-8 h-8 rounded-lg text-red-600 hover:bg-red-50 cursor-pointer border-none transition flex items-center justify-center"><Trash2 size={14} strokeWidth={2.25} /></button>
                      </div>
                    )}
                  </div>
                </div>
                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap bg-gray-50 p-4 rounded-xl border border-gray-200">{a.content}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl animate-scale-in flex flex-col max-h-[calc(100vh-2rem)]" onClick={e => e.stopPropagation()}>
            <div className="bg-indigo-600 hover:bg-indigo-700 px-6 py-4 rounded-t-3xl shrink-0">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-extrabold text-white flex items-center gap-2"><Megaphone size={18} strokeWidth={2.25} /> {t('announcements.postNew')}</h3>
                <button onClick={() => setShowCreate(false)} className="bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white rounded-lg w-8 h-8 flex items-center justify-center cursor-pointer border-none text-lg leading-none">×</button>
              </div>
            </div>
            <form onSubmit={handleCreate} className="flex flex-col flex-1 min-h-0">
              <div className="p-6 bg-white overflow-y-auto  flex-1 min-h-0">
                <div className="mb-4">
                  <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">{t('announcements.titleField')}</label>
                  <input required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-rose-500 focus:ring-4 focus:ring-rose-100" placeholder={t('announcements.titleField')} />
                </div>
                <div className="mb-4">
                  <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">{t('announcements.content')}</label>
                  <textarea required value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} rows={5} className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-rose-500 focus:ring-4 focus:ring-rose-100 resize-y min-h-[120px]" placeholder={t('announcements.content')} />
                </div>
              </div>
              <div className="border-t border-gray-100 px-6 py-4 flex flex-wrap justify-end gap-2 bg-gray-50 rounded-b-3xl shrink-0">
                <button type="button" onClick={() => setShowCreate(false)} className="px-5 py-2.5 text-sm font-bold bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-xl transition cursor-pointer border-none">{t('common.cancel')}</button>
                <button type="submit" className="px-5 py-2.5 text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white hover:shadow rounded-xl transition cursor-pointer border-none">{t('announcements.publish')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEdit && editAnnouncement && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowEdit(false)}>
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl animate-scale-in flex flex-col max-h-[calc(100vh-2rem)]" onClick={e => e.stopPropagation()}>
            <div className="bg-indigo-600 hover:bg-indigo-700 px-6 py-4 rounded-t-3xl shrink-0">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-extrabold text-white flex items-center gap-2"><Pencil size={18} strokeWidth={2.25} /> {t('common.edit')} {t('announcements.title')}</h3>
                <button onClick={() => setShowEdit(false)} className="bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white rounded-lg w-8 h-8 flex items-center justify-center cursor-pointer border-none text-lg leading-none">×</button>
              </div>
            </div>
            <form onSubmit={handleEdit} className="flex flex-col flex-1 min-h-0">
              <div className="p-6 bg-white overflow-y-auto  flex-1 min-h-0">
                <div className="mb-4">
                  <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">{t('announcements.titleField')}</label>
                  <input required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-100" />
                </div>
                <div className="mb-4">
                  <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">{t('announcements.content')}</label>
                  <textarea required value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} rows={5} className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-100 resize-y min-h-[120px]" />
                </div>
              </div>
              <div className="border-t border-gray-100 px-6 py-4 flex flex-wrap justify-end gap-2 bg-gray-50 rounded-b-3xl shrink-0">
                <button type="button" onClick={() => setShowEdit(false)} className="px-5 py-2.5 text-sm font-bold bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-xl transition cursor-pointer border-none">{t('common.cancel')}</button>
                <button type="submit" className="px-5 py-2.5 text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white hover:shadow rounded-xl transition cursor-pointer border-none">{t('common.saveChanges')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
