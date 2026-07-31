'use client'
import PageLoader from '@/components/PageLoader'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { ListChecks, MessageCircle, MessageSquare, Smile, Trash2 } from 'lucide-react'
import api from '@/lib/api'
import { validateForm, discussionSchema, discussionMessageSchema } from '@/lib/schemas'
import Scroll from '@/components/Scroll'
import ReactionBar from '@/components/project/ReactionBar'
import type { Reaction } from '@/types/project'

interface DiscussionMessage {
  id: number
  discussion_id: number
  sender_id: number
  first_name: string
  last_name: string
  avatar_url: string | null
  content: string
  created_at: string
  updated_at: string | null
  reactions: Reaction[]
  user_id?: number
  userId?: number
}

export default function DiscussionsPage() {
  const { t } = useTranslation()
  const [discussions, setDiscussions] = useState<any[]>([])
  const [projects, setProjects] = useState<any[]>([])
  const [selectedDiscussion, setSelectedDiscussion] = useState<{ discussion: any; messages: DiscussionMessage[] } | null>(null)
  const [newMessage, setNewMessage] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({ projectId: '', title: '' })
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>({})

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem('user') : null
    if (stored) setUser(JSON.parse(stored))
  }, [])

  useEffect(() => { loadData() }, [])

  const loadData = () => {
    setLoading(true)
    Promise.all([api.get('/discussions'), api.get('/projects')]).then(([discData, projData]) => {
      setDiscussions(discData.discussions || [])
      setProjects(projData.projects || [])
    }).catch(() => {}).finally(() => setLoading(false))
  }

  const openDiscussion = async (id: number) => {
    try {
      const res = await api.get(`/discussions/${id}`)
      setSelectedDiscussion(res)
    } catch (err: any) { toast.error(err.message || t('common.failedToSave')) }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    const valid = validateForm(discussionSchema, createForm)
    if (!valid) return
    try {
      await api.post('/discussions', {
        projectId: valid.projectId,
        title: valid.title,
      })
      setShowCreate(false); setCreateForm({ projectId: '', title: '' })
      toast.success(t('discussions.created')); loadData()
    } catch (err: any) { toast.error(err.message || t('common.failedToSave')) }
  }

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm(t('discussions.deleteConfirm'))) return
    try {
      await api.delete(`/discussions/${id}`)
      toast.success(t('common.deletedSuccessfully'))
      if (selectedDiscussion?.discussion?.id === id) setSelectedDiscussion(null)
      loadData()
    } catch (err: any) { toast.error(err.message || t('common.failedToDelete')) }
  }

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedDiscussion) return
    const valid = validateForm(discussionMessageSchema, { content: newMessage })
    if (!valid) return
    try {
      await api.post(`/discussions/${selectedDiscussion.discussion.id}/messages`, { content: valid.content })
      setNewMessage('')
      toast.success(t('discussions.sent'), { duration: 2000 })
      openDiscussion(selectedDiscussion.discussion.id)
    } catch (err: any) { toast.error(err.message || t('common.failedToSave')) }
  }

  // Toggle or replace a reaction on a discussion message.
  // When oldEmoji is provided the backend treats it as a replacement.
  const handleToggleReaction = async (messageId: number, emoji: string, oldEmoji?: string) => {
    if (!selectedDiscussion) return
    try {
      // Optimistic update: immediately reflect expected result.
      setSelectedDiscussion((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          messages: prev.messages.map((m) => {
            if (m.id !== messageId) return m
            const reactions = [...(m.reactions || [])]

            if (oldEmoji && oldEmoji !== emoji) {
              // Replace: remove old emoji, add new.
              const existingNew = reactions.find((r) => r.emoji === emoji)
              const removed = reactions.filter((r) => r.emoji !== oldEmoji)
              if (existingNew) {
                return {
                  ...m,
                  reactions: removed.map((r) =>
                    r.emoji === emoji ? { ...r, count: r.count + 1, mine: true, users: ['You'] } : r
                  ),
                }
              }
              return { ...m, reactions: [...removed, { emoji, count: 1, mine: true, users: ['You'] }] }
            } else {
              // Toggle: if we have it, remove us; if not, add it.
              const existing = reactions.find((r) => r.emoji === emoji)
              if (existing) {
                const newCount = existing.count - 1
                if (newCount <= 0) {
                  return { ...m, reactions: reactions.filter((r) => r.emoji !== emoji) }
                }
                return {
                  ...m,
                  reactions: reactions.map((r) =>
                    r.emoji === emoji
                      ? { ...r, count: newCount, mine: false, users: r.users.filter((u: string) => u !== 'You') }
                      : r
                  ),
                }
              } else {
                return { ...m, reactions: [...reactions, { emoji, count: 1, mine: true, users: ['You'] }] }
              }
            }
          }),
        }
      })

      const body = oldEmoji && oldEmoji !== emoji ? { emoji, old_emoji: oldEmoji } : { emoji }
      const res = await api.post(
        `/discussions/${selectedDiscussion.discussion.id}/messages/${messageId}/reactions`,
        body
      )
      // Merge server-correct reactions (handles conflicts / concurrent updates).
      setSelectedDiscussion((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          messages: prev.messages.map((m) =>
            m.id === messageId ? { ...m, reactions: res.reactions } : m
          ),
        }
      })
    } catch (err: any) {
      toast.error(err.message || 'Failed to update reaction')
    }
  }

  const currentUserName = (() => {
    if (typeof window === 'undefined') return 'You'
    try {
      const u = JSON.parse(localStorage.getItem('user') || '{}') as any
      const name = [u?.firstName ?? u?.first_name, u?.lastName ?? u?.last_name]
        .filter(Boolean)
        .join(' ')
        .trim()
      return name || u?.email || 'You'
    } catch { return 'You' }
  })()

  const canManage = user.roleName === 'HR Admin' || user.roleName === 'System Admin' || user.roleName === 'Project Manager'

  const chatScrollRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!selectedDiscussion?.messages?.length) return
    const t = setTimeout(() => {
      const el = chatScrollRef.current
      if (!el) return
      const scroller = el.querySelector('.ps') || el
      scroller.scrollTop = scroller.scrollHeight
      const t2 = setTimeout(() => { scroller.scrollTop = scroller.scrollHeight }, 450)
      return () => clearTimeout(t2)
    }, 80)
    return () => clearTimeout(t)
  }, [selectedDiscussion?.messages?.length])

  return (
    <div className="space-y-5 animate-fade-in-up h-full flex flex-col">
      <div className="flex flex-wrap justify-end items-center gap-3">
        <button onClick={() => setShowCreate(true)} className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white hover:shadow-lg rounded-xl text-sm font-bold transition shadow-lg cursor-pointer border-none flex items-center gap-2">
          <span className="text-lg">+</span> {t('discussions.newDiscussion')}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 flex-1 min-h-0 max-h-[calc(100vh-10rem)] overflow-hidden" style={{ gridTemplateRows: "minmax(0, 1fr)" }}>
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden flex flex-col min-h-[500px] lg:min-h-0">
          <div className="bg-indigo-600 hover:bg-indigo-700 px-5 py-4 shrink-0">
            <h3 className="font-bold text-white flex items-center gap-2">
              <ListChecks size={14} strokeWidth={2.25} /> {t('discussions.allDiscussions')}
              <span className="ml-auto bg-white/20 backdrop-blur-sm px-2 py-0.5 rounded-full text-xs">{discussions.length}</span>
            </h3>
          </div>
          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <PageLoader label={t('common.loading')} />
            </div>
          ) : discussions.length === 0 ? (
            <div className="p-12 text-center flex-1 flex items-center justify-center">
              <div>
                <MessageCircle size={48} strokeWidth={1.75} className="text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-bold">{t('discussions.noDiscussions')}</p>
                <p className="text-gray-400 text-sm mt-1">{t('discussions.startDiscussion')}</p>
              </div>
            </div>
          ) : (
            <Scroll containerClassName="flex-1 min-h-0" className="h-full" watch={discussions.length}>
              {discussions.map((d: any) => (
                <div
                  key={d.id}
                  onClick={() => openDiscussion(d.id)}
                  className={`px-5 py-3.5 border-b border-gray-100 cursor-pointer transition ${
                    selectedDiscussion?.discussion?.id === d.id
                      ? 'bg-indigo-50 border-l-4 border-l-indigo-500'
                      : 'bg-white hover:bg-gray-50/50'
                  }`}
                >
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm text-gray-900 mb-0.5 line-clamp-1">{d.title}</div>
                      <div className="text-xs text-gray-500 flex items-center gap-2">
                        <span className="inline-flex items-center gap-1">
                          <div className="w-4 h-4 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center text-[8px] font-bold">
                            {d.first_name?.[0]}{d.last_name?.[0]}
                          </div>
                          {d.first_name} {d.last_name}
                        </span>
                        <span>•</span>
                        <span>{d.message_count} {t('discussions.replies')}</span>
                      </div>
                    </div>
                    {canManage && (
                      <button onClick={(e) => handleDelete(d.id, e)} title={t('common.delete')} className="w-8 h-8 rounded-lg bg-transparent text-red-600 hover:bg-red-50 cursor-pointer border-none transition shrink-0 flex items-center justify-center"><Trash2 size={14} strokeWidth={2.25} /></button>
                    )}
                  </div>
                </div>
              ))}
            </Scroll>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden flex flex-col min-h-[500px] lg:min-h-0">
          {selectedDiscussion ? (
            <>
              <div className="bg-indigo-600 hover:bg-indigo-700 px-5 py-4 flex justify-between items-center shrink-0">
                <h3 className="font-bold text-white flex items-center gap-2 truncate">
                  <MessageSquare size={16} strokeWidth={2.25} /> {selectedDiscussion.discussion.title}
                </h3>
                <button onClick={() => setSelectedDiscussion(null)} className="bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white rounded-lg w-8 h-8 flex items-center justify-center cursor-pointer border-none text-lg leading-none shrink-0">×</button>
              </div>
              <div ref={chatScrollRef} className="flex-1 min-h-0 overflow-hidden bg-gray-50">
                <Scroll containerClassName="h-full" className="h-full" watch={selectedDiscussion.messages?.length}>
                  <div className="p-5 space-y-4">
                    {selectedDiscussion.messages?.map((m: DiscussionMessage, i: number) => {
                      const senderId = m.sender_id ?? m.user_id ?? m.userId
                      const isMe = user.id && senderId && Number(senderId) === Number(user.id)
                      const palettes = ['bg-indigo-600','bg-indigo-700','bg-indigo-500','bg-indigo-800','bg-indigo-600']
                      const otherAvatar = palettes[(senderId || i) % palettes.length]
                      return (
                        <div key={m.id} className={`flex gap-3 animate-msg-in ${isMe ? 'flex-row-reverse' : ''}`} style={{ animationDelay: `${Math.min(i * 0.04, 0.4)}s` }}>
                          <div className={`w-9 h-9 rounded-full ${isMe ? 'bg-indigo-600 hover:bg-indigo-700' : `${otherAvatar}`} text-white flex items-center justify-center text-sm font-bold shrink-0 shadow`}>
                            {m.first_name?.[0]}{m.last_name?.[0]}
                          </div>
                          <div className={`max-w-[75%] ${isMe ? 'items-end' : ''} flex flex-col`}>
                            <div className={`flex items-center gap-2 mb-1 ${isMe ? 'flex-row-reverse' : ''}`}>
                              <span className="font-bold text-sm text-gray-900">{m.first_name} {m.last_name}</span>
                              <span className="text-[10px] text-gray-400">{new Date(m.created_at).toLocaleString()}</span>
                            </div>
                            <div className={`${isMe ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100 border border-violet-100 dark:border-gray-600'} rounded-2xl px-4 py-2.5 text-sm ${isMe ? 'rounded-tr-sm' : 'rounded-tl-sm'} break-words shadow-sm`}>
                              {m.content}
                            </div>
                            {/* Reactions */}
                            <div className="mt-1">
                              <ReactionBar
                                reactions={m.reactions || []}
                                onToggle={(emoji, oldEmoji) => handleToggleReaction(m.id, emoji, oldEmoji)}
                                currentUserName={currentUserName}
                              />
                            </div>
                          </div>
                        </div>
                      )
                    })}
                    {selectedDiscussion.messages?.length === 0 && (
                      <div className="text-center py-10">
                        <MessageCircle size={36} strokeWidth={1.75} className="text-gray-300 mx-auto mb-2" />
                        <p className="text-gray-400">{t('discussions.noMessages')}</p>
                      </div>
                    )}
                  </div>
                </Scroll>
              </div>
              <form onSubmit={handleSendMessage} className="p-3 border-t border-gray-100 flex gap-2 bg-gray-50 shrink-0">
                <input value={newMessage} onChange={e => setNewMessage(e.target.value)} className="flex-1 border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" placeholder={t('discussions.messagePlaceholder')} />
                <button type="submit" className="px-5 py-2 text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl hover:shadow transition border-none cursor-pointer">{t('discussions.send')}</button>
              </form>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center p-12 text-center">
              <div>
                <MessageSquare size={56} strokeWidth={1.75} className="text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-bold">{t('discussions.selectDiscussion')}</p>
                <p className="text-gray-400 text-sm mt-1">{t('discussions.selectDiscussionHint')}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-3xl w-full max-w-md max-h-[90vh] shadow-2xl animate-scale-in flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="bg-indigo-600 hover:bg-indigo-700 px-6 py-4 rounded-t-3xl shrink-0">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-extrabold text-white flex items-center gap-2"><MessageSquare size={18} strokeWidth={2.25} /> {t('discussions.newDiscussion')}</h3>
                <button onClick={() => setShowCreate(false)} className="bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white rounded-lg w-8 h-8 flex items-center justify-center cursor-pointer border-none text-lg leading-none">×</button>
              </div>
            </div>
            <form onSubmit={handleCreate} className="flex flex-col flex-1 min-h-0">
              <Scroll containerClassName="flex-1 min-h-0" className="h-full">
                <div className="p-6 bg-white">
                  <div className="mb-4">
                    <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">{t('discussions.projectLabel')}</label>
                    <select required value={createForm.projectId} onChange={e => setCreateForm({ ...createForm, projectId: e.target.value })} className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100">
                      <option value="">{t('discussions.selectProject')}</option>
                      {projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div className="mb-4">
                    <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">{t('discussions.topicTitle')}</label>
                    <input required value={createForm.title} onChange={e => setCreateForm({ ...createForm, title: e.target.value })} className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" placeholder={t('discussions.topicPlaceholder')} />
                  </div>
                </div>
              </Scroll>
              <div className="border-t border-gray-100 px-6 py-4 flex flex-wrap justify-end gap-2 bg-gray-50 rounded-b-3xl shrink-0">
                <button type="button" onClick={() => setShowCreate(false)} className="px-5 py-2.5 text-sm font-bold bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-xl transition cursor-pointer border-none">{t('common.cancel')}</button>
                <button type="submit" className="px-5 py-2.5 text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white hover:shadow rounded-xl transition cursor-pointer border-none">{t('discussions.createDiscussion')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
