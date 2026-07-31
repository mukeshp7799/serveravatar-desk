'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import toast from 'react-hot-toast'
import {
  MessageSquare, Plus, X, Send, ChevronRight,
  MessageCircle, Trash2, Clock,
} from 'lucide-react'
import FeaturePage from '@/components/project/FeaturePage'
import ReactionBar from '@/components/project/ReactionBar'
import api from '@/lib/api'
import { fmtRelative } from '@/components/project/format'
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
}

interface Discussion {
  id: number
  project_id: number
  title: string
  created_by_user_id: number
  first_name: string
  last_name: string
  avatar_url: string | null
  message_count: number
  created_at: string
}

const AVATAR_COLORS = [
  'bg-indigo-500', 'bg-violet-500', 'bg-purple-500',
  'bg-pink-500', 'bg-rose-500', 'bg-cyan-500',
]

function getAvatarColor(id: number) {
  return AVATAR_COLORS[id % AVATAR_COLORS.length]
}

function getInitials(first?: string, last?: string) {
  return `${(first?.[0] || '?').toUpperCase()}${(last?.[0] || '?').toUpperCase()}`
}

function Avatar({ id, first, last, url, size = 'md' }: {
  id: number; first?: string; last?: string; url?: string | null; size?: 'sm' | 'md'
}) {
  const sz = size === 'sm' ? 'w-8 h-8 text-[10px]' : 'w-10 h-10 text-xs'
  const color = getAvatarColor(id)
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className={`${sz} rounded-full object-cover ring-2 ring-white shrink-0`} />
  }
  return (
    <div className={`${sz} ${color} rounded-full flex items-center justify-center text-white font-bold ring-2 ring-white shrink-0`}>
      {getInitials(first, last)}
    </div>
  )
}

export default function DiscussionsPage() {
  const params = useParams<{ projectId: string }>()
  const projectId = params.projectId

  const [discussions, setDiscussions] = useState<Discussion[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [createTitle, setCreateTitle] = useState('')
  const [creating, setCreating] = useState(false)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [threadData, setThreadData] = useState<{ discussion: Discussion; messages: DiscussionMessage[] } | null>(null)
  const [loadingThread, setLoadingThread] = useState(false)
  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem('user') : null
    if (stored) setUser(JSON.parse(stored))
  }, [])

  const loadDiscussions = () => {
    setLoading(true)
    api.get('/discussions?projectId=' + projectId).then((res: any) => {
      setDiscussions(res.discussions || [])
    }).catch(() => {
      toast.error('Failed to load discussions')
    }).finally(() => {
      setLoading(false)
    })
  }

  useEffect(() => { loadDiscussions() }, [projectId])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!createTitle.trim()) return
    setCreating(true)
    try {
      await api.post('/discussions', {
        projectId: Number(projectId),
        title: createTitle.trim(),
      })
      toast.success('Discussion created!')
      setShowCreate(false)
      setCreateTitle('')
      loadDiscussions()
    } catch (err: any) {
      toast.error(err.message || 'Failed to create discussion')
    } finally {
      setCreating(false)
    }
  }

  const openThread = async (id: number) => {
    if (expandedId === id) { setExpandedId(null); setThreadData(null); return }
    setExpandedId(id)
    setLoadingThread(true)
    try {
      const res = await api.get(`/discussions/${id}`)
      setThreadData(res)
    } catch {
      toast.error('Failed to load thread')
      setExpandedId(null)
    } finally {
      setLoadingThread(false)
    }
  }

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMessage.trim() || !threadData) return
    setSending(true)
    try {
      await api.post(`/discussions/${threadData.discussion.id}/messages`, {
        content: newMessage.trim(),
      })
      setNewMessage('')
      toast.success('Reply sent!')
      openThread(threadData.discussion.id)
    } catch (err: any) {
      toast.error(err.message || 'Failed to send reply')
    } finally {
      setSending(false)
    }
  }

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('Delete this discussion?')) return
    try {
      await api.delete(`/discussions/${id}`)
      toast.success('Discussion deleted')
      if (expandedId === id) { setExpandedId(null); setThreadData(null) }
      loadDiscussions()
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete')
    }
  }

  const handleToggleReaction = async (messageId: number, emoji: string, oldEmoji?: string) => {
    if (!threadData) return
    const body = oldEmoji ? { emoji, old_emoji: oldEmoji } : { emoji }
    try {
      const res = await api.post(
        `/discussions/${threadData.discussion.id}/messages/${messageId}/reactions`,
        body
      )
      setThreadData((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          messages: prev.messages.map((m) =>
            m.id === messageId ? { ...m, reactions: res.reactions } : m
          ),
        }
      })
    } catch {
      toast.error('Failed to update reaction')
    }
  }

  const currentUserName = (() => {
    if (!user) return 'You'
    const name = [user.firstName || user.first_name, user.lastName || user.last_name]
      .filter(Boolean).join(' ').trim()
    return name || user.email || 'You'
  })()

  const isAdmin = Array.isArray(user?.permissions) && user.permissions.includes('discussions.create')

  const messageEndRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (threadData?.messages?.length && messageEndRef.current) {
      setTimeout(() => {
        messageEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
      }, 100)
    }
  }, [threadData?.messages?.length])

  return (
    <FeaturePage featureKey="message-board" title="Discussions">
      <div className="space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <MessageCircle size={15} strokeWidth={2} />
            <span>{discussions.length} discussion{discussions.length !== 1 ? 's' : ''}</span>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition shadow-sm hover:shadow cursor-pointer border-none"
          >
            <Plus size={15} strokeWidth={2.5} />
            New Discussion
          </button>
        </div>

        {/* Discussion list */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="flex flex-col items-center gap-3 text-gray-400">
              <div className="w-8 h-8 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
              <span className="text-sm">Loading discussions…</span>
            </div>
          </div>
        ) : discussions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-gray-100 shadow-sm">
            <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mb-4">
              <MessageSquare size={28} strokeWidth={1.75} className="text-indigo-400" />
            </div>
            <h3 className="text-base font-bold text-gray-700 mb-1">No discussions yet</h3>
            <p className="text-sm text-gray-400 mb-5 text-center max-w-xs">
              Start a conversation with your team about any topic, decision, or idea.
            </p>
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition shadow-sm cursor-pointer border-none"
            >
              <Plus size={15} strokeWidth={2.5} />
              Start First Discussion
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {discussions.map((d) => (
              <div key={d.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden transition-all">
                {/* Discussion row */}
                <button
                  onClick={() => openThread(d.id)}
                  className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-50/60 transition text-left cursor-pointer"
                >
                  <Avatar id={d.created_by_user_id} first={d.first_name} last={d.last_name} url={d.avatar_url} />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-gray-900 truncate">{d.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-gray-500">{d.first_name} {d.last_name}</span>
                      <span className="text-gray-300">·</span>
                      <span className="text-xs text-gray-400 flex items-center gap-1">
                        <Clock size={10} strokeWidth={2} />
                        {fmtRelative(d.created_at)}
                      </span>
                      <span className="text-gray-300">·</span>
                      <span className="text-xs text-gray-400 flex items-center gap-1">
                        <MessageSquare size={10} strokeWidth={2} />
                        {d.message_count} {d.message_count === 1 ? 'reply' : 'replies'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {isAdmin && (
                      <button
                        onClick={(e) => handleDelete(d.id, e)}
                        className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-300 hover:text-rose-500 hover:bg-rose-50 transition cursor-pointer border-none bg-transparent"
                        title="Delete discussion"
                      >
                        <Trash2 size={14} strokeWidth={2} />
                      </button>
                    )}
                    <ChevronRight
                      size={18}
                      strokeWidth={2}
                      className={`text-gray-300 transition-transform duration-200 ${expandedId === d.id ? 'rotate-90' : ''}`}
                    />
                  </div>
                </button>

                {/* Expanded thread */}
                {expandedId === d.id && (
                  <div className="border-t border-gray-100 bg-gray-50/40">
                    {loadingThread ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="w-6 h-6 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
                      </div>
                    ) : threadData ? (
                      <div className="flex flex-col" style={{ maxHeight: '60vh' }}>
                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                          {threadData.messages.length === 0 ? (
                            <div className="text-center py-6 text-sm text-gray-400">
                              No replies yet — be the first!
                            </div>
                          ) : (
                            threadData.messages.map((m, i) => {
                              const senderId = m.sender_id
                              const isMe = user?.id && Number(senderId) === Number(user.id)
                              const otherColor = getAvatarColor(senderId || i)
                              return (
                                <div key={m.id} className={`flex gap-3 ${isMe ? 'flex-row-reverse' : ''}`}>
                                  <Avatar id={senderId || 0} first={m.first_name} last={m.last_name} url={m.avatar_url} size="sm" />
                                  <div className={`max-w-[80%] flex flex-col ${isMe ? 'items-end' : ''}`}>
                                    <div className={`flex items-center gap-2 mb-1 ${isMe ? 'flex-row-reverse' : ''}`}>
                                      <span className="text-xs font-semibold text-gray-700">{m.first_name} {m.last_name}</span>
                                      <span className="text-[10px] text-gray-400">{fmtRelative(m.created_at)}</span>
                                    </div>
                                    <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm ${
                                      isMe
                                        ? 'bg-indigo-600 text-white rounded-br-sm'
                                        : 'bg-white text-gray-800 border border-gray-100 rounded-bl-sm'
                                    }`}>
                                      {m.content}
                                    </div>
                                    {m.reactions?.length > 0 && (
                                      <div className="mt-1">
                                        <ReactionBar
                                          reactions={m.reactions}
                                          onToggle={(emoji, oldEmoji) => handleToggleReaction(m.id, emoji, oldEmoji)}
                                          currentUserName={currentUserName}
                                        />
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )
                            })
                          )}
                          <div ref={messageEndRef} />
                        </div>

                        {/* Reply composer */}
                        <form onSubmit={handleSend} className="shrink-0 px-4 py-3 border-t border-gray-200 bg-white flex gap-2 items-end">
                          <div className="flex-1 relative">
                            <textarea
                              value={newMessage}
                              onChange={(e) => setNewMessage(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend(e) }
                              }}
                              placeholder="Write a reply…"
                              rows={1}
                              className="w-full resize-none rounded-xl border border-gray-200 px-4 py-2.5 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition"
                              style={{ minHeight: '42px', maxHeight: '120px' }}
                            />
                          </div>
                          <button
                            type="submit"
                            disabled={sending || !newMessage.trim()}
                            className="shrink-0 w-10 h-10 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center justify-center transition border-none cursor-pointer"
                          >
                            {sending
                              ? <div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                              : <Send size={15} strokeWidth={2.5} />
                            }
                          </button>
                        </form>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Discussion Modal */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowCreate(false)}
        >
          <div
            className="bg-white rounded-3xl w-full max-w-md shadow-2xl animate-scale-in overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bg-indigo-600 px-6 py-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
                  <MessageSquare size={18} strokeWidth={2} className="text-white" />
                </div>
                <div>
                  <h2 className="text-white font-bold text-base">New Discussion</h2>
                  <p className="text-indigo-200 text-xs">Start a team conversation</p>
                </div>
              </div>
              <button
                onClick={() => setShowCreate(false)}
                className="w-9 h-9 bg-white/20 hover:bg-white/30 rounded-xl flex items-center justify-center text-white transition cursor-pointer border-none"
              >
                <X size={16} strokeWidth={2.5} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleCreate} className="p-6">
              <div className="mb-5">
                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-2">
                  Discussion Topic
                </label>
                <input
                  autoFocus
                  value={createTitle}
                  onChange={(e) => setCreateTitle(e.target.value)}
                  placeholder="e.g., Sprint planning approach for next quarter"
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition"
                  maxLength={200}
                />
              </div>

              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="px-5 py-2.5 text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition cursor-pointer border-none"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !createTitle.trim()}
                  className="px-6 py-2.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-xl transition cursor-pointer border-none flex items-center gap-2"
                >
                  {creating
                    ? <div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                    : <Plus size={14} strokeWidth={2.5} />
                  }
                  Create Discussion
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </FeaturePage>
  )
}
