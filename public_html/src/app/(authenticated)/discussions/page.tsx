'use client'

import PageLoader from '@/components/PageLoader'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import {
  ListChecks, MessageCircle, MessageSquare, Smile, Trash2,
  Search, Plus, X, Send, Clock, ChevronRight, RotateCw,
  ArrowLeft, AtSign, Filter, Users,
} from 'lucide-react'
import PortalModal from '@/components/PortalModal'
import api from '@/lib/api'
import { discussionSchema, type DiscussionInput } from '@/lib/schemas'
import Scroll from '@/components/Scroll'
import ReactionBar from '@/components/project/ReactionBar'
import MentionInput from '@/components/MentionInput'
import { highlightMentions } from '@/components/MentionBadge'
import type { Reaction } from '@/types/project'
import type { ActiveMember } from '@/components/MentionInput'

/* ─── ACCENT color ─────────────────────────────────────────────── */
const ACCENT = '#4F46E5'

/* ─── Pagination Bar (same pattern as other index pages) ─────────── */
function PaginationBar({ page, total, limit, onPage, onLimitChange }: {
  page: number; total: number; limit: number
  onPage: (p: number) => void
  onLimitChange: (l: number) => void
}) {
  const totalPages = Math.max(1, Math.ceil(total / limit))
  const start = Math.min((page - 1) * limit + 1, total)
  const end   = Math.min(page * limit, total)

  const getPages = (): (number | '...')[] => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
    const pages: (number | '...')[] = []
    const showLeft  = page > 3
    const showRight = page < totalPages - 2
    pages.push(1, 2)
    if (showLeft)  pages.push('...')
    const startPage = showLeft  ? (showRight ? page - 1 : totalPages - 3) : 3
    const endPage   = showRight ? (showLeft  ? page + 1 : 4)              : totalPages - 1
    for (let p = startPage; p <= endPage; p++) pages.push(p)
    if (showRight) pages.push('...')
    pages.push(totalPages)
    return [...new Set(pages)].sort((a, b) =>
      a === '...' || b === '...' ? 0 : (a as number) - (b as number)
    ) as (number | '...')[]
  }

  const pages = getPages()
  const prev  = Math.max(1, page - 1)
  const next  = Math.min(totalPages, page + 1)

  return (
    <div className="flex flex-wrap items-start sm:items-center justify-between gap-x-6 gap-y-2 px-4 sm:px-5 py-3 border-t border-gray-100 bg-white rounded-b-2xl">
      <p className="text-xs text-gray-500 whitespace-nowrap leading-7">
        Showing <span className="font-medium text-gray-700">{start}</span> to{' '}
        <span className="font-medium text-gray-700">{end}</span> of{' '}
        <span className="font-medium text-gray-700">{total}</span> results
      </p>
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400 whitespace-nowrap leading-7">Per page:</span>
          <div className="relative">
            <select
              value={limit}
              onChange={e => onLimitChange(Number(e.target.value))}
              className="appearance-none pl-2 pr-6 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg cursor-pointer focus:outline-none focus:ring-2 transition"
              style={{ colorScheme: 'normal' } as any}
            >
              {[8, 12, 24, 48].map(o => <option key={o} value={o}>{o}</option>)}
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
            onClick={() => onPage(prev)} disabled={page <= 1}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 transition cursor-pointer bg-transparent"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          {pages.map((p, i) =>
            p === '...' ? (
              <span key={`ellipsis-${i}`} className="w-8 h-8 flex items-center justify-center text-gray-400">…</span>
            ) : (
              <button key={p} onClick={() => onPage(p as number)}
                className={`w-8 h-8 rounded-lg text-xs font-semibold transition cursor-pointer border ${
                  page === p
                    ? 'text-white border-transparent'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
                style={page === p ? { backgroundColor: ACCENT } : {}}
              >{p}</button>
            )
          )}
          <button
            onClick={() => onPage(next)} disabled={page >= totalPages}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 transition cursor-pointer bg-transparent"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─── Shared avatar helpers ─────────────────────────────────────── */
const AVATAR_COLORS = [
  'bg-indigo-500', 'bg-violet-500', 'bg-purple-500',
  'bg-pink-500', 'bg-rose-500', 'bg-cyan-500',
]
function getAvatarColor(id: number) {
  return AVATAR_COLORS[id % AVATAR_COLORS.length]
}
function getInitials(first = '', last = '') {
  return `${(first[0] || '?').toUpperCase()}${(last[0] || '?').toUpperCase()}`
}
function Avatar({
  id, first, last, url, size = 'md', className = '', title,
}: {
  id: number; first?: string; last?: string; url?: string | null
  size?: 'xs' | 'sm' | 'md' | 'lg'; className?: string; title?: string
}) {
  const sz = { xs: 'w-6 h-6 text-[9px]', sm: 'w-8 h-8 text-[10px]', md: 'w-10 h-10 text-xs', lg: 'w-12 h-12 text-sm' }[size]
  const color = getAvatarColor(id)
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" data-tooltip-id="app-tooltip" data-tooltip-content={title || ''} className={`${sz} rounded-full object-cover ring-2 ring-white shrink-0 ${className}`} />
  ) : (
    <div data-tooltip-id="app-tooltip" data-tooltip-content={title || ''} className={`${sz} ${color} rounded-full flex items-center justify-center text-white font-bold ring-2 ring-white shrink-0 ${className}`}>
      {getInitials(first, last)}
    </div>
  )
}

/* ─── Relative time formatter ──────────────────────────────────── */
function fmtRelative(dateStr: string) {
  const d = new Date(dateStr)
  const now = Date.now()
  const diff = now - d.getTime()
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString()
}

/* ─── Types ────────────────────────────────────────────────────── */
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

interface Discussion {
  id: number
  project_id: number | null
  title: string
  created_by_user_id: number
  first_name: string
  last_name: string
  avatar_url: string | null
  message_count: number
  has_mention?: boolean | number
  created_at: string
  project_name?: string
}

/* ─── Constants ────────────────────────────────────────────────── */
const TABS = ['all', 'mine', 'mentions'] as const
type Tab = typeof TABS[number]
/* ─────────────────────────────────────────────────────────────────
 *  Discussion List Item
 * ──────────────────────────────────────────────────────────────── */
function DiscussionRow({
  d,
  user,
  isActive,
  onClick,
  onDelete,
}: {
  d: Discussion
  user: any
  isActive: boolean
  onClick: () => void
  onDelete: (e: React.MouseEvent) => void
}) {
  const canDelete = user.id === d.created_by_user_id || (Array.isArray(user.permissions) && user.permissions.includes('discussions.delete'))
  return (
    <div
      onClick={onClick}
      className={`group flex items-start gap-3 px-4 py-3.5 border-b border-gray-100 cursor-pointer transition-all duration-150
        ${isActive
          ? 'bg-indigo-50 border-l-4 border-l-indigo-600'
          : 'bg-white hover:bg-gray-50/60 border-l-4 border-l-transparent'
        }`}
    >
      {/* Avatar */}
      <Avatar
        id={d.created_by_user_id}
        first={d.first_name}
        last={d.last_name}
        url={d.avatar_url}
        size="sm"
        className="mt-0.5"
        title={d.first_name ? `${d.first_name} ${d.last_name}`.trim() : ''}
      />

      {/* Main content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <p className="font-semibold text-sm text-gray-900 line-clamp-1 leading-snug">{d.title}</p>
            {!!d.has_mention && (
              <span className="shrink-0 w-5 h-5 rounded-full bg-indigo-100 border border-indigo-200 flex items-center justify-center" title="You were mentioned">
                <span className="text-indigo-600 text-[10px] font-bold leading-none">@</span>
              </span>
            )}
          </div>
        </div>

        {/* Meta row */}
        <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 mt-1">
          <span className="text-xs text-gray-400 flex items-center gap-0.5">
            <Clock size={10} strokeWidth={2} />
            {fmtRelative(d.created_at)}
          </span>
          <span className="text-gray-300">·</span>
          <span className="text-xs text-gray-400 flex items-center gap-0.5">
            <MessageSquare size={10} strokeWidth={2} />
            {d.message_count} {d.message_count === 1 ? 'reply' : 'replies'}
          </span>
          {d.project_name && (
            <>
              <span className="text-gray-300">·</span>
              <span className="text-xs px-1.5 py-0.5 rounded-md bg-violet-50 text-violet-600 font-medium border border-violet-100">
                {d.project_name}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
        {canDelete && (
          <button
            onClick={onDelete}
            data-tooltip-id="app-tooltip" data-tooltip-content="Delete discussion"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 transition cursor-pointer border-none bg-transparent"
          >
            <Trash2 size={13} strokeWidth={2} />
          </button>
        )}
        <ChevronRight size={15} strokeWidth={2} className="text-gray-300" />
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────
 *  Message Bubble
 * ──────────────────────────────────────────────────────────────── */
function MessageBubble({
  m,
  user,
  activeMembers,
  onToggleReaction,
  onDeleteMessageDispatch,
  currentUserName,
}: {
  m: DiscussionMessage
  user: any
  activeMembers: ActiveMember[]
  onToggleReaction: (messageId: number, emoji: string, oldEmoji?: string) => void
  onDeleteMessageDispatch: (messageId: number) => void
  currentUserName: string
}) {
  const senderId = m.sender_id ?? m.user_id ?? m.userId
  const isMe = user.id && senderId && Number(senderId) === Number(user.id)
  const otherColor = getAvatarColor(senderId || 0)
  const isIndigo = isMe

  return (
    <div className={`flex gap-2.5 animate-msg-in ${isMe ? 'flex-row-reverse' : ''}`}>
      <Avatar
        id={senderId || 0}
        first={m.first_name}
        last={m.last_name}
        url={m.avatar_url}
        size="sm"
        className="mt-1 shrink-0"
        title={m.first_name ? `${m.first_name} ${m.last_name}`.trim() : ''}
      />
      <div className={`max-w-[80%] flex flex-col ${isMe ? 'items-end' : ''}`}>
        <div className={`flex items-center gap-2 mb-1 ${isMe ? 'flex-row-reverse' : ''}`}>
          <span className="text-xs font-semibold text-gray-700 sr-only">{m.first_name} {m.last_name}</span>
          <span className="text-[10px] text-gray-400">{new Date(m.created_at).toLocaleString()}</span>
        </div>
        <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm ${
          isMe
            ? 'bg-indigo-600 text-white rounded-br-sm'
            : 'bg-white text-gray-800 border border-gray-100 rounded-bl-sm'
        }`}>
          {highlightMentions(m.content || '', activeMembers)}
        </div>
        <div className="mt-1 flex items-center gap-2">
          <ReactionBar
            reactions={m.reactions || []}
            onToggle={(emoji, oldEmoji) => onToggleReaction(m.id, emoji, oldEmoji)}
            currentUserName={currentUserName}
          />
          {isMe && (
            <button
              type="button"
              onClick={() => onDeleteMessageDispatch(m.id)}
              className="inline-flex items-center justify-center w-6 h-6 rounded-full text-gray-400 hover:text-red-500 hover:bg-red-50 transition cursor-pointer border-none bg-transparent"
              data-tooltip-id="app-tooltip" data-tooltip-content="Delete message"
            >
              <Trash2 size={12} strokeWidth={2} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────
 *  Conversation Panel
 * ──────────────────────────────────────────────────────────────── */
function ConversationPanel({
  thread,
  user,
  activeMembers,
  onClose,
  onToggleReaction,
  onDeleteMessageDispatch,
  onSendMessage,
  sending,
}: {
  thread: { discussion: Discussion; messages: DiscussionMessage[] } | null
  user: any
  activeMembers: ActiveMember[]
  onClose: () => void
  onToggleReaction: (messageId: number, emoji: string, oldEmoji?: string) => void
  onDeleteMessageDispatch: (messageId: number) => void
  onSendMessage: (content: string) => Promise<void>
  sending: boolean
}) {
  const { t } = useTranslation()
  const [message, setMessage] = useState('')
  const chatScrollRef = useRef<HTMLDivElement>(null)
  const messageEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!thread?.messages?.length) return
    const t2 = setTimeout(() => {
      if (messageEndRef.current) {
        messageEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' })
      }
    }, 100)
    return () => clearTimeout(t2)
  }, [thread?.messages?.length])

  const currentUserName = (() => {
    const name = [user?.firstName || user?.first_name, user?.lastName || user?.last_name]
      .filter(Boolean).join(' ').trim()
    return name || user?.email || 'You'
  })()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!message.trim()) return
    const content = message.trim()
    setMessage('')
    await onSendMessage(content)
  }

  if (!thread) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white rounded-2xl border border-gray-100">
        <div className="text-center p-8">
          <MessageSquare size={48} strokeWidth={1.5} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-semibold text-sm">{t('discussions.selectDiscussion')}</p>
          <p className="text-gray-400 text-xs mt-1">{t('discussions.selectDiscussionHint')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col bg-white rounded-2xl border border-gray-100 overflow-hidden min-h-0 flex-1">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-3 flex items-center gap-3 shrink-0">
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition cursor-pointer border-none shrink-0"
          data-tooltip-id="app-tooltip" data-tooltip-content="Back"
        >
          <ArrowLeft size={15} strokeWidth={2.5} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="font-bold text-white text-sm truncate">{thread.discussion.title}</h3>
            {!!thread.discussion.has_mention && (
              <span className="shrink-0 w-5 h-5 rounded-full bg-white/20 border border-white/30 flex items-center justify-center" title="You were mentioned">
                <span className="text-white text-[10px] font-bold leading-none">@</span>
              </span>
            )}
          </div>
          {thread.discussion.project_name && (
            <p className="text-indigo-200 text-[11px] truncate">{thread.discussion.project_name}</p>
          )}
        </div>
      </div>

      {/* Messages */}
      <div ref={chatScrollRef} className="flex-1 min-h-0 overflow-hidden bg-gray-50">
        <Scroll containerClassName="h-full" className="h-full discussions-chat-scroll" watch={thread.messages?.length}>
          <div className="p-4 space-y-5">
            {thread.messages?.length === 0 && (
              <div className="text-center py-10">
                <MessageCircle size={36} strokeWidth={1.5} className="text-gray-300 mx-auto mb-2" />
                <p className="text-gray-400 text-sm">{t('discussions.noMessages')}</p>
              </div>
            )}
            {thread.messages?.map((m, i) => (
              <MessageBubble
                key={m.id}
                m={m}
                user={user}
                activeMembers={activeMembers}
                onToggleReaction={onToggleReaction}
                onDeleteMessageDispatch={(id) => onDeleteMessageDispatch(id)}
                currentUserName={currentUserName}
              />
            ))}
            <div ref={messageEndRef} />
          </div>
        </Scroll>
      </div>

      {/* Composer */}
      <form onSubmit={handleSubmit} className="shrink-0 px-3 py-3 border-t border-gray-100 bg-white flex gap-2 items-end">
        <div className="flex-1 relative">
          <MentionInput
            projectId="all"
            fetchAllUsers={true}
            value={message}
            onChange={setMessage}
            placeholder={t('discussions.messagePlaceholder') || 'Write a reply… @ to mention'}
            rows={2}
            disabled={sending}
            className="text-sm"
            dropdownAbove
          />
        </div>
        <button
          type="submit"
          disabled={sending || !message.trim()}
          className="shrink-0 w-10 h-10 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center justify-center transition border-none cursor-pointer"
        >
          {sending
            ? <div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" />
            : <Send size={15} strokeWidth={2.5} />
          }
        </button>
      </form>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────
 *  Main Page
 * ──────────────────────────────────────────────────────────────── */
export default function DiscussionsPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('all')
  const [search, setSearch] = useState('')
  const [projectFilter, setProjectFilter] = useState<number | 'all'>('all')
  const [discussions, setDiscussions] = useState<Discussion[]>([])
  const [projects, setProjects] = useState<any[]>([])
  const [activeMembers, setActiveMembers] = useState<ActiveMember[]>([])
  const [selectedDiscussion, setSelectedDiscussion] = useState<{ discussion: Discussion; messages: DiscussionMessage[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [loadingThread, setLoadingThread] = useState(false)
  const [sending, setSending] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const filterRef = useRef<HTMLDivElement>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'discussion'; id: number; title: string } | { type: 'message'; id: number } | null>(null)
  const [user, setUser] = useState<any>(null)
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 30, totalPages: 0 })
  const [loadingMore, setLoadingMore] = useState(false)
  const listBottomRef = useRef<HTMLDivElement>(null)

  // Detect mobile viewport
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Close filter dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (showFilters && filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setShowFilters(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showFilters])

  // Restore selection from URL on mount (read directly from window to avoid useSearchParams/Suspense requirement)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const id = params.get('id')
    if (id) {
      openDiscussion(Number(id))
    }
  }, []) // only on mount

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem('user') : null
    if (stored) setUser(JSON.parse(stored))
  }, [])

  useEffect(() => {
    api.get('/projects').then((res: any) => {
      setProjects(res.projects || [])
    }).catch(() => {})
  }, [])

  // Load active members for mention highlighting
  useEffect(() => {
    api.get('/users/active').then((res: any) => {
      setActiveMembers(Array.isArray(res.users) ? res.users.map((u: any) => ({
        id: u.id,
        first_name: u.first_name,
        last_name: u.last_name,
        email: u.email,
        avatar_url: u.avatar_url,
      })) : [])
    }).catch(() => {})
  }, [])

  // Load discussions (server-side paginated)
  const loadDiscussions = (page = 1) => {
    if (page > 1) setLoadingMore(true)
    else setLoading(true)
    const params = new URLSearchParams()
    if (projectFilter !== 'all') params.set('projectId', String(projectFilter))
    if (search.trim()) params.set('search', search.trim())
    params.set('page', String(page))
    params.set('limit', String(pagination.limit))

    const endpoint = tab === 'mentions' ? '/discussions/mentions' : '/discussions'

    api.get(`${endpoint}${params.size ? '?' + params.toString() : ''}`).then((res: any) => {
      let list: Discussion[] = res.discussions || []

      // Client-side filter for 'mine' tab (server doesn't know about it)
      if (tab === 'mine' && user?.id) {
        list = list.filter((d: Discussion) => d.created_by_user_id === user.id)
      }

      if (page === 1) {
        setDiscussions(list)
      } else {
        setDiscussions(prev => [...prev, ...list])
      }

      setPagination(res.pagination || { total: 0, page: 1, limit: pagination.limit, totalPages: 0 })
    }).catch(() => {}).finally(() => {
      setLoading(false)
      setLoadingMore(false)
      setIsRefreshing(false)
    })
  }

  // Re-fetch when filters change (resets to page 1)
  useEffect(() => {
    if (!user?.id) return
    const timer = setTimeout(() => loadDiscussions(1), 300) // debounce search
    return () => clearTimeout(timer)
  }, [tab, projectFilter, search, user?.id])

  // Infinite scroll — load more when sentinel enters viewport
  useEffect(() => {
    const el = listBottomRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (!entry.isIntersecting) return
        if (loadingMore) return                   // already loading — prevent duplicate calls
        const { page, totalPages } = pagination
        if (page >= totalPages) return          // no more pages
        loadDiscussions(page + 1)
      },
      { rootMargin: '120px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [pagination.page, pagination.totalPages, loadingMore])

  const openDiscussion = async (id: number) => {
    setLoadingThread(true)
    try {
      const res = await api.get(`/discussions/${id}`)
      setSelectedDiscussion(res)
      // Update URL without reload
      const url = new URL(window.location.href)
      url.searchParams.set('id', String(id))
      window.history.replaceState({}, '', url.toString())
    } catch (err: any) {
      toast.error(err.message || t('common.failedToLoad'))
    } finally {
      setLoadingThread(false)
    }
  }

  // Pagination handlers
  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return
    try {
      if (deleteTarget.type === 'message') {
        await api.delete(`/discussions/${selectedDiscussion?.discussion.id}/messages/${deleteTarget.id}`)
        setSelectedDiscussion(prev => {
          if (!prev) return prev
          return { ...prev, messages: prev.messages.filter(m => m.id !== deleteTarget.id) }
        })
      } else {
        await api.delete(`/discussions/${deleteTarget.id}`)
        if (selectedDiscussion?.discussion?.id === deleteTarget.id) {
          setSelectedDiscussion(null)
          const url = new URL(window.location.href)
          url.searchParams.delete('id')
          window.history.replaceState({}, '', url.toString())
        }
        loadDiscussions(1)
      }
      toast.success(t('common.deletedSuccessfully'))
    } catch (err: any) {
      toast.error(err.message || 'Permission denied')
    } finally {
      setDeleteTarget(null)
    }
  }

  const handleSendMessage = async (content: string) => {
    if (!selectedDiscussion) return
    setSending(true)
    try {
      await api.post(`/discussions/${selectedDiscussion.discussion.id}/messages`, { content })
      // Reload thread
      const res = await api.get(`/discussions/${selectedDiscussion.discussion.id}`)
      setSelectedDiscussion(res)
      loadDiscussions(1)
    } catch (err: any) {
      toast.error(err.message || t('common.failedToSave'))
    } finally {
      setSending(false)
    }
  }

  const handleToggleReaction = async (messageId: number, emoji: string, oldEmoji?: string) => {
    if (!selectedDiscussion) return
    const body = oldEmoji && oldEmoji !== emoji ? { emoji, old_emoji: oldEmoji } : { emoji }
    // Optimistic update
    setSelectedDiscussion(prev => {
      if (!prev) return prev
      return {
        ...prev,
        messages: prev.messages.map(m =>
          m.id === messageId ? { ...m, reactions: [] } : m
        )
      }
    })
    try {
      const res = await api.post(
        `/discussions/${selectedDiscussion.discussion.id}/messages/${messageId}/reactions`,
        body
      )
      setSelectedDiscussion(prev => {
        if (!prev) return prev
        return {
          ...prev,
          messages: prev.messages.map(m =>
            m.id === messageId ? { ...m, reactions: res.reactions } : m
          )
        }
      })
    } catch {
      toast.error('Failed to update reaction')
      // Reload thread on error
      const res = await api.get(`/discussions/${selectedDiscussion.discussion.id}`)
      setSelectedDiscussion(res)
    }
  }

  const handleDeleteMessage = async (messageId: number) => {
    if (!selectedDiscussion) return
    try {
      await api.delete(`/discussions/${selectedDiscussion.discussion.id}/messages/${messageId}`)
      setSelectedDiscussion(prev => {
        if (!prev) return prev
        return {
          ...prev,
          messages: prev.messages.filter(m => m.id !== messageId)
        }
      })
      toast.success(t('common.deletedSuccessfully'))
    } catch (err: any) {
      toast.error(err.message || t('common.failedToDelete'))
    }
  }

  const handleCreateSubmit = async (data: DiscussionInput) => {
    try {
      const res = await api.post('/discussions', {
        projectId: data.projectId ? Number(data.projectId) : undefined,
        title: data.title,
      })
      setShowCreate(false)
      reset()
      toast.success(t('discussions.created'))
      loadDiscussions(1)
      if (res.id) {
        await openDiscussion(res.id)
        const url = new URL(window.location.href)
        url.searchParams.set('id', String(res.id))
        window.history.replaceState({}, '', url.toString())
      }
    } catch (err: any) {
      toast.error(err.message || t('common.failedToSave'))
    }
  }

  const currentUserName = (() => {
    if (!user) return 'You'
    const name = [user.firstName || user.first_name, user.lastName || user.last_name]
      .filter(Boolean).join(' ').trim()
    return name || user.email || 'You'
  })()

  const canManage = Array.isArray(user?.permissions) && user.permissions.includes('discussions.create')

  // Form for new discussion
  const { register, handleSubmit: handleCreate, reset, formState: { errors } } = useForm<DiscussionInput>({
    resolver: zodResolver(discussionSchema),
    mode: 'onBlur',
    defaultValues: { projectId: '', title: '' },
  })

  return (
    <div className="space-y-5 animate-fade-in-up h-full flex flex-col">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-xl flex items-center justify-center shadow-sm">
            <MessageSquare size={18} strokeWidth={2} className="text-white" />
          </div>
          <div>
            <h1 className="font-extrabold text-gray-900 text-lg leading-tight">Discussions</h1>
            <p className="text-xs text-gray-500">{pagination.total} {tab === 'all' ? 'total' : tab === 'mine' ? 'my' : 'mentioned'} discussions</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">

          {/* New Discussion */}
          {canManage && (
            <button
              onClick={() => setShowCreate(true)}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition shadow-sm hover:shadow cursor-pointer border-none flex items-center gap-2 shrink-0"
            >
              <Plus size={15} strokeWidth={2.5} />
              <span className="hidden sm:inline">New Discussion</span>
            </button>
          )}

          {/* Refresh */}
          <button
            onClick={() => { setIsRefreshing(true); loadDiscussions(1) }}
            disabled={loading}
            className="w-9 h-9 flex items-center justify-center text-gray-500 hover:text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition cursor-pointer border-none shrink-0"
            data-tooltip-id="app-tooltip" data-tooltip-content="Refresh"
          >
            <RotateCw size={15} strokeWidth={2} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ── Main content: list + panel ─────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-5 gap-5 flex-1 min-h-0 max-h-[calc(100vh-10rem)]" style={{ gridTemplateRows: 'minmax(0, 1fr)' }}>

        {/* Discussion List */}
        <div className={`col-span-1 md:col-span-1 lg:col-span-1 xl:col-span-2 bg-white rounded-2xl border border-gray-100 flex flex-col min-h-0 h-full ${isMobile && selectedDiscussion ? 'hidden' : ''}`}>
          {/* List header: tabs */}
          <div className="px-3 py-2 border-b border-gray-100 shrink-0 bg-gray-50/50">
            <div className="flex items-center gap-1 bg-white rounded-xl p-0.5 w-full">
              {(['all', 'mine', 'mentions'] as Tab[]).map((t_) => (
                <button
                  key={t_}
                  onClick={() => setTab(t_)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer border-none ${
                    tab === t_
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {t_ === 'all' ? 'All' : t_ === 'mine' ? 'My' : 'Mentions'}
                </button>
              ))}
            </div>
          </div>

          {/* Search + Filter panel */}
          <div className="px-3 py-2 border-b border-gray-100 shrink-0 bg-gray-50/50">
            <div className="flex items-center gap-2">
              {/* Search */}
              <div className="relative flex-1">
                <Search size={13} strokeWidth={2} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search discussions…"
                  className="pl-8 pr-7 py-1.5 text-xs border border-gray-200 rounded-lg bg-white text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-1.5 focus:ring-indigo-500 focus:border-transparent w-full"
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer p-0 border-none bg-transparent"
                    data-tooltip-id="app-tooltip" data-tooltip-content="Clear search"
                  >
                    <X size={12} strokeWidth={2.5} />
                  </button>
                )}
              </div>

              {/* Filter toggle */}
              <div className="relative shrink-0">
                <button
                  onClick={() => setShowFilters(prev => !prev)}
                  className={`h-7 px-2 flex items-center gap-1.5 rounded-lg border text-xs transition cursor-pointer border-none ${showFilters ? 'bg-indigo-600 text-white' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}
                  data-tooltip-id="app-tooltip"
                  data-tooltip-content={projectFilter === 'all' ? 'All Projects' : (projects.find((p: any) => p.id === projectFilter)?.name || 'Filter')}
                >
                  <Filter size={12} strokeWidth={2} />
                </button>

                {/* Project filter dropdown */}
                {showFilters && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setShowFilters(false)} aria-hidden />
                    <div className="absolute left-0 top-full mt-1 w-44 bg-white rounded-xl shadow-xl border border-gray-200 z-40 py-1 animate-scale-in">
                      <button
                        type="button"
                        onClick={() => { setProjectFilter('all'); setShowFilters(false) }}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-xs transition cursor-pointer border-none ${projectFilter === 'all' ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-gray-700 hover:bg-indigo-50 hover:text-indigo-700'}`}
                      >
                        All Projects
                      </button>
                      {projects.map((p: any) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => { setProjectFilter(p.id); setShowFilters(false) }}
                          className={`w-full flex items-center gap-2 px-3 py-2 text-xs transition cursor-pointer border-none ${projectFilter === p.id ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-gray-700 hover:bg-indigo-50 hover:text-indigo-700'}`}
                        >
                          {p.name}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

          </div>

          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <PageLoader label={t('common.loading')} />
            </div>
          ) : discussions.length === 0 ? (
            <div className="flex-1 flex items-center justify-center p-8 text-center">
              <div>
                <MessageCircle size={40} strokeWidth={1.5} className="text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-semibold text-sm mb-1">
                  {tab === 'mentions' ? 'No mentions yet' : 'No discussions yet'}
                </p>
                <p className="text-gray-400 text-xs">
                  {tab === 'mentions'
                    ? 'You will see discussions where you are @mentioned here.'
                    : 'Start a new discussion to get the conversation going.'}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col flex-1 min-h-0">
              <Scroll containerClassName="flex-1 min-h-0" className="h-full discussions-chat-scroll" watch={discussions.length}>
                {discussions.map(d => (
                  <DiscussionRow
                    key={d.id}
                    d={d}
                    user={user}
                    isActive={selectedDiscussion?.discussion?.id === d.id}
                    onClick={() => openDiscussion(d.id)}
                    onDelete={(e) => { e.stopPropagation(); setDeleteTarget({ type: 'discussion', id: d.id, title: d.title }) }}
                  />
                ))}
                {/* Infinite scroll sentinel */}
                <div ref={listBottomRef} className="shrink-0 flex items-center justify-center py-3">
                  {loadingMore && (
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <div className="w-4 h-4 border-2 border-gray-300 border-t-indigo-600 rounded-full animate-spin" />
                      <span>Loading more…</span>
                    </div>
                  )}
                  {!loadingMore && pagination.page >= pagination.totalPages && discussions.length > 0 && (
                    <span className="text-xs text-gray-400">No more discussions</span>
                  )}
                </div>
              </Scroll>
            </div>
          )}
        </div>

        {/* Conversation Panel */}
        <div className={`col-span-1 md:col-span-1 lg:col-span-1 xl:col-span-3 ${isMobile ? (selectedDiscussion ? 'flex' : 'hidden') : 'flex'} flex-col min-h-0 flex-1`}
        >
          <ConversationPanel
            thread={selectedDiscussion}
            user={user}
            activeMembers={activeMembers}
            onClose={() => {
              setSelectedDiscussion(null)
              const url = new URL(window.location.href)
              url.searchParams.delete('id')
              window.history.replaceState({}, '', url.toString())
            }}
            onToggleReaction={handleToggleReaction}
            onDeleteMessageDispatch={(id) => setDeleteTarget({ type: 'message', id })}
            onSendMessage={handleSendMessage}
            sending={sending}
          />
        </div>
      </div>

      {/* ── Delete Confirmation Modal ─────────────────────────── */}
      {deleteTarget && (
        <PortalModal>
          <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setDeleteTarget(null)}>
            <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl animate-scale-in" onClick={e => e.stopPropagation()}>
              <div className="p-6 text-center">
                <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
                  <Trash2 size={24} className="text-red-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">
                  {deleteTarget.type === 'discussion' ? 'Delete Discussion?' : 'Delete Message?'}
                </h3>
                <p className="text-sm text-gray-500">
                  {deleteTarget.type === 'discussion'
                    ? <>This will permanently delete "<span className="font-semibold">{deleteTarget.title}</span>" and all its messages. This action cannot be undone.</>
                    : 'This message will be permanently deleted. This action cannot be undone.'}
                </p>
              </div>
              <div className="flex gap-3 px-6 pb-6">
                <button onClick={() => setDeleteTarget(null)} className="flex-1 px-4 py-2.5 text-sm font-bold bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-xl transition cursor-pointer border-none">
                  Cancel
                </button>
                <button onClick={handleDeleteConfirm} className="flex-1 px-4 py-2.5 text-sm font-bold bg-red-600 hover:bg-red-700 text-white rounded-xl transition cursor-pointer border-none">
                  Delete
                </button>
              </div>
            </div>
          </div>
        </PortalModal>
      )}

      {/* ── New Discussion Modal ─────────────────────────────── */}
      {showCreate && (
        <PortalModal>
          <div
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => { setShowCreate(false); reset() }}
          >
            <div
              className="bg-white rounded-3xl w-full max-w-md shadow-2xl animate-scale-in overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              {/* Modal header */}
              <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                    <MessageSquare size={18} strokeWidth={2} className="text-white" />
                  </div>
                  <div>
                    <h2 className="text-white font-bold text-base">New Discussion</h2>
                    <p className="text-indigo-200 text-xs">Start a team conversation</p>
                  </div>
                </div>
                <button
                  onClick={() => { setShowCreate(false); reset() }}
                  className="w-9 h-9 bg-white/20 hover:bg-white/30 rounded-xl flex items-center justify-center text-white transition cursor-pointer border-none"
                >
                  <X size={16} strokeWidth={2.5} />
                </button>
              </div>

              {/* Form */}
              <form
                onSubmit={handleCreate(handleCreateSubmit as any)}
                className="p-6"
              >
                <div className="mb-5">
                  <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-2">
                    Topic <span className="text-red-500">*</span>
                  </label>
                  <input
                    {...register('title')}
                    autoFocus
                    placeholder="e.g., Sprint planning approach for next quarter"
                    className={`w-full border-2 rounded-xl px-4 py-3 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 transition ${
                      errors.title
                        ? 'border-red-400 focus:border-red-500 focus:ring-red-100'
                        : 'border-gray-200 focus:border-indigo-400 focus:ring-indigo-100'
                    }`}
                    maxLength={200}
                  />
                  {errors.title && (
                    <p className="mt-1 text-xs text-red-500">{errors.title.message}</p>
                  )}
                </div>

                <div className="mb-6">
                  <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-2">
                    Project <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <select
                    {...register('projectId')}
                    className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition cursor-pointer"
                  >
                    <option value="">No project — general discussion</option>
                    {projects.map((p: any) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  {errors.projectId && (
                    <p className="mt-1 text-xs text-red-500">{errors.projectId.message}</p>
                  )}
                </div>

                <div className="flex gap-3 justify-end">
                  <button
                    type="button"
                    onClick={() => { setShowCreate(false); reset() }}
                    className="px-5 py-2.5 text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition cursor-pointer border-none"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition cursor-pointer border-none flex items-center gap-2"
                  >
                    <Plus size={14} strokeWidth={2.5} />
                    Create Discussion
                  </button>
                </div>
              </form>
            </div>
          </div>
        </PortalModal>
      )}
    </div>
  )
}
