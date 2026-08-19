'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { Mail, Trash2, UserPlus, Users, Shield, Crown, UserCheck, Clock, Send, X, RefreshCw, LogOut } from 'lucide-react'
import toast from 'react-hot-toast'
import FeaturePage from '@/components/project/FeaturePage'
import EmptyState from '@/components/project/EmptyState'
import ConfirmDialog from '@/components/project/ConfirmDialog'
import MultiSelectDropdown from '@/components/project/MultiSelectDropdown'
import {
  useProjectMembers,
  useActiveUsers,
  memberDisplayName,
  memberInitials,
  memberAvatarColor,
  type ProjectMember,
} from '@/lib/project-members-api'
import { useProjectInvitations, createInvitation } from '@/lib/invitations-api'

/* ──────────────────────────────────────────────────────────────────
 *  Visual styling
 * ────────────────────────────────────────────────────────────────── */

const ROLE_STYLE: Record<string, string> = {
  owner:  'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-800',
  admin:  'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-900/30 dark:text-sky-300 dark:border-sky-800',
  member: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800',
  guest:  'bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700',
}

function roleBadgeClass(roleInProject: string | null | undefined): string {
  if (!roleInProject) return ROLE_STYLE.member
  const key = roleInProject.toLowerCase()
  return ROLE_STYLE[key] || 'bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700'
}

function roleLabel(roleInProject: string | null | undefined, isOwner: boolean): string {
  if (isOwner) return 'Owner'
  if (!roleInProject) return 'Member'
  return roleInProject
}

function roleIcon(roleInProject: string | null | undefined, isOwner: boolean) {
  if (isOwner) return Crown
  const k = (roleInProject || '').toLowerCase()
  if (k === 'admin') return Shield
  if (k === 'guest') return UserCheck
  return UserCheck
}

/* ──────────────────────────────────────────────────────────────────
 *  Email validation
 * ────────────────────────────────────────────────────────────────── */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/* ──────────────────────────────────────────────────────────────────
 *  Page
 * ────────────────────────────────────────────────────────────────── */

const ACCENT = '#4F46E5'


// ─── Pagination bar ──────────────────────────────────────────────────────────
function PaginationBar({ page, total, limit, onPage, onLimitChange }: {
  page: number; total: number; limit: number; onPage: (p: number) => void; onLimitChange: (l: number) => void
}) {
  const totalPages = Math.max(1, Math.ceil(total / limit))
  const start = total === 0 ? 0 : Math.min((page - 1) * limit + 1, total)
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
    <div className="flex flex-wrap items-start sm:items-center justify-between gap-x-6 gap-y-2 px-4 sm:px-5 py-3 border-t border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-b-2xl">
      <p className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap leading-7">
        Showing <span className="font-medium text-gray-700 dark:text-gray-200">{start}</span> to{' '}
        <span className="font-medium text-gray-700 dark:text-gray-200">{end}</span> of{' '}
        <span className="font-medium text-gray-700 dark:text-gray-200">{total}</span> results
      </p>
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400 whitespace-nowrap leading-7">Per page:</span>
          <div className="relative">
            <select
              value={limit}
              onChange={e => onLimitChange(Number(e.target.value))}
              className="appearance-none pl-2 pr-6 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg cursor-pointer focus:outline-none focus:ring-2 transition"
              style={{ '--tw-ring-color': ACCENT, colorScheme: 'normal' } as any}
            >
              {[10, 20, 30, 50].map(o => <option key={o} value={o}>{o}</option>)}
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
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700 transition cursor-pointer bg-transparent"
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
                    : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
                style={page === p ? { backgroundColor: ACCENT } : {}}
              >{p}</button>
            )
          )}
          <button
            onClick={() => onPage(next)} disabled={page >= totalPages}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700 transition cursor-pointer bg-transparent"
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

export default function TeamPage() {
  const params = useParams<{ projectId: string }>()
  const projectId = params.projectId

  const router = useRouter()
  const { project, members, loading, error, initialized, refetch, addMember, removeMember, leaveProject, isOwner, canManageTeam } = useProjectMembers(projectId)
  const { invitations, loading: loadingInv, error: invError, refetch: refetchInv, resend, cancel } = useProjectInvitations(projectId)

  // "Add member" form state
  const [showAdd, setShowAdd] = useState(false)
  const [selectedUserIds, setSelectedUserIds] = useState<Array<string | number>>([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [addingBatch, setAddingBatch] = useState(false)

  // Remove-confirmation state (owner removing a member)
  const [confirmRemove, setConfirmRemove] = useState<ProjectMember | null>(null)
  const [removing, setRemoving] = useState(false)

  // Leave-project confirmation state (member leaving)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [leaving, setLeaving] = useState(false)

  // Current user ID
  const currentUserId = useMemo(() => {
    if (typeof window === 'undefined') return null
    try { return (JSON.parse(localStorage.getItem('user') || '{}') as any)?.id ?? null } catch { return null }
  }, [])

  const isCurrentUserOwner = project ? Number(project.manager_id) === Number(currentUserId) : false

  // Cancel-confirmation state
  const [confirmCancel, setConfirmCancel] = useState<number | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [resendingId, setResendingId] = useState<number | null>(null)

  // Pagination state
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)

  // Reset to page 1 whenever limit changes
  useEffect(() => { setPage(1) }, [limit])

  const totalMembers = members.length
  const paginatedMembers = members.slice((page - 1) * limit, page * limit)

  /* ── Picker options ──────────────────────────────────────────── */

  // Active users NOT already on this project
  const { users: activeUsers, loading: loadingUsers } = useActiveUsers()
  const pickerOptions = useMemo(() => {
    const memberUserIdSet = new Set(members.map((m) => String(m.user_id)))
    return activeUsers
      .filter((u) => !memberUserIdSet.has(String(u.id)))
      .map((u) => {
        const name = `${(u.first_name || '').trim()} ${(u.last_name || '').trim()}`.trim() || u.email || 'Unknown'
        return {
          id: u.id,
          label: name,
          initials: memberInitials({
            user_id: u.id,
            first_name: u.first_name,
            last_name: u.last_name,
            email: u.email,
          } as ProjectMember),
          subtitle: u.email || '',
        }
      })
  }, [activeUsers, members])


  /* ── Handlers ────────────────────────────────────────────────── */

  const handleSelectAll = (filteredIds: Array<string | number>, select: boolean) => {
    if (select) {
      const currentSet = new Set(selectedUserIds.map(String))
      const newIds = filteredIds.filter((id) => !currentSet.has(String(id)))
      setSelectedUserIds((prev) => [...prev, ...newIds])
    } else {
      const filteredSet = new Set(filteredIds.map(String))
      setSelectedUserIds((prev) => prev.filter((id) => !filteredSet.has(String(id))))
    }
  }

  const handleAddMembers = async () => {
    if (selectedUserIds.length === 0) {
      toast.error('No members selected')
      return
    }
    setAddingBatch(true)
    setBusy(true)
    try {
      let addedCount = 0
      let failedCount = 0
      for (const userId of selectedUserIds) {
        const ok = await addMember({ userId })
        if (ok) addedCount++
        else failedCount++
      }
      if (addedCount > 0) {
        toast.success(`${addedCount} ${addedCount === 1 ? 'member' : 'members'} added to the project`)
        setSelectedUserIds([])
      }
      if (failedCount > 0) {
        toast.error(`Failed to add ${failedCount} ${failedCount === 1 ? 'member' : 'members'}`)
      }
    } finally {
      setBusy(false)
      setAddingBatch(false)
    }
  }

  const handleInviteByEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    const email = inviteEmail.trim()
    if (!email) { toast.error('Please enter an email address'); return }
    if (!EMAIL_RE.test(email)) { toast.error('That email does not look valid'); return }
    setBusy(true)
    try {
      const result = await createInvitation(projectId, email)
      if (result?.status === 'added_directly') {
        toast.success(`${email} has been added to the project`)
      } else {
        toast.success(`Invite sent to ${email}`)
      }
      setInviteEmail('')
      await refetchInv()
    } catch (err: any) {
      toast.error(err?.message || 'Failed to invite member')
    } finally {
      setBusy(false)
    }
  }

  const handleConfirmRemove = async () => {
    if (!confirmRemove) return
    setRemoving(true)
    try {
      const ok = await removeMember(confirmRemove.user_id)
      if (ok) {
        toast.success(`${memberDisplayName(confirmRemove)} removed from the project`)
        setConfirmRemove(null)
      } else {
        toast.error(error || 'Failed to remove member')
      }
    } finally {
      setRemoving(false)
    }
  }

  const handleLeaveProject = async () => {
    setLeaving(true)
    try {
      const ok = await leaveProject()
      if (ok) {
        toast.success('You have left the project')
        setConfirmLeave(false)
        // Navigate to dashboard — skip refetch since we just left the project
        // (calling refetch here would 403 on requireProjectMember and revoke the token)
        router.push('/projects')
      } else {
        toast.error('Failed to leave project')
      }
    } finally {
      setLeaving(false)
    }
  }

  const handleResend = async (invitationId: number) => {
    setResendingId(invitationId)
    try {
      const ok = await resend(invitationId)
      if (ok) toast.success('Invitation resent successfully')
      else toast.error('Failed to resend invitation')
    } finally {
      setResendingId(null)
    }
  }

  const handleConfirmCancel = async () => {
    if (confirmCancel === null) return
    setCancelling(true)
    try {
      const ok = await cancel(confirmCancel)
      if (ok) {
        toast.success('Invitation cancelled')
        setConfirmCancel(null)
      } else {
        toast.error('Failed to cancel invitation')
      }
    } finally {
      setCancelling(false)
    }
  }

  /* ── Render ──────────────────────────────────────────────────── */

  const pendingInvitations = invitations.filter((i) => i.status === 'pending')
  const pendingInvitationEmails = new Set(pendingInvitations.map((i) => i.email.toLowerCase()))
  const hasInvitations = invitations.length > 0

  return (
    <FeaturePage featureKey="team" title="Team Members">
      <div className="space-y-4">
        {/* Header card */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white">Team members</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {totalMembers} {totalMembers === 1 ? 'person' : 'people'} have access to this project
              {project?.name ? ` · ${project.name}` : ''}
            </p>
          </div>
          {canManageTeam && (
            <button
              type="button"
              onClick={() => setShowAdd((v) => !v)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow border-none cursor-pointer"
            >
              <UserPlus size={14} strokeWidth={2.5} />
              {showAdd ? 'Close' : 'Add member'}
            </button>
          )}
        </div>

        {/* Add-member card */}
        {showAdd && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-indigo-200 dark:border-indigo-800 shadow-sm p-4 sm:p-5 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">Add a member</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Pick an existing user from the directory, or invite someone by email.
              </p>
            </div>

            {/* Existing-user picker */}
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                Existing user
              </label>
              <MultiSelectDropdown
                options={pickerOptions}
                selected={selectedUserIds}
                onChange={setSelectedUserIds}
                onSelectAll={handleSelectAll}
                showSelectAll
                placeholder={loadingUsers ? 'Loading users…' : 'Search by name or email…'}
                label=""
                compact
              />
              {selectedUserIds.length > 0 && (
                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    <span className="font-semibold text-indigo-600 dark:text-indigo-400">{selectedUserIds.length}</span>
                    {' '}{selectedUserIds.length === 1 ? 'member' : 'members'} selected
                  </p>
                  <button
                    type="button"
                    disabled={addingBatch || busy}
                    onClick={handleAddMembers}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-xl text-sm font-semibold shadow border-none cursor-pointer"
                  >
                    <UserPlus size={14} strokeWidth={2.5} />
                    {addingBatch ? 'Adding…' : 'Add Members'}
                  </button>
                </div>
              )}
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1.5">
                Already-on-the-project users are filtered out automatically.
              </p>
            </div>

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center" aria-hidden>
                <div className="w-full border-t border-gray-200 dark:border-gray-700" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-white dark:bg-gray-900 px-3 text-[11px] uppercase tracking-wider font-semibold text-gray-400 dark:text-gray-500">
                  Or invite by email
                </span>
              </div>
            </div>

            {/* Email invite */}
            <form onSubmit={handleInviteByEmail} className="space-y-2">
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5" htmlFor="invite-email">
                Email address
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  id="invite-email"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="flex-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900"
                />
                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-xl text-sm font-semibold shadow border-none cursor-pointer"
                >
                  <Mail size={14} strokeWidth={2.5} />
                  Send invite
                </button>
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                External members receive an invitation link and can join after accepting.
              </p>
            </form>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && !initialized && (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4 h-20 animate-shimmer" />
            ))}
          </div>
        )}

        {/* Members list */}
        {initialized && members.length === 0 && !loading ? (
          <EmptyState
            iconName="Users"
            title="No members yet"
            description="Invite people to this project to start collaborating."
            actionLabel="Add first member"
            onAction={() => setShowAdd(true)}
          />
        ) : null}

        {/* Pending Invitations section */}
        {canManageTeam && initialized && pendingInvitations.length > 0 && (
          <>
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-amber-200 dark:border-amber-800 shadow-sm overflow-hidden">
              <div className="px-4 sm:px-5 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
                <Clock size={14} strokeWidth={2.25} className="text-amber-600 dark:text-amber-400" />
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">Pending invitations</h3>
                <span className="ml-auto text-xs font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-800">
                  {pendingInvitations.length}
                </span>
              </div>
              <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                {pendingInvitations.map((inv) => (
                  <li key={inv.id} className="px-4 sm:px-5 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition group">
                    {/* Avatar placeholder */}
                    <span className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 text-sm font-bold flex items-center justify-center shrink-0">
                      {inv.email.slice(0, 2).toUpperCase()}
                    </span>
                    {/* Identity */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-gray-900 dark:text-white truncate">{inv.email}</p>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800">
                          <Clock size={9} strokeWidth={2.5} />
                          Pending
                        </span>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700">
                          {inv.roleInProject || 'Member'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5 mt-0.5 truncate">
                        <Mail size={11} strokeWidth={2.25} className="shrink-0" />
                        <span className="truncate">Invited by {inv.inviterName}</span>
                        {inv.isExpired && (
                          <span className="text-rose-500 text-[10px] font-semibold ml-1">· Expired</span>
                        )}
                      </p>
                    </div>
                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleResend(inv.id)}
                        disabled={resendingId === inv.id || inv.isExpired}
                        title="Resend invitation"
                        data-tooltip-id="app-tooltip"
                        data-tooltip-content={inv.isExpired ? 'Invitation expired' : 'Resend invitation'}
                        className="w-8 h-8 inline-flex items-center justify-center text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed bg-transparent border-none cursor-pointer"
                      >
                        <RefreshCw size={14} strokeWidth={2.25} className={resendingId === inv.id ? 'animate-spin' : ''} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmCancel(inv.id)}
                        title="Cancel invitation"
                        className="w-8 h-8 inline-flex items-center justify-center text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-lg transition bg-transparent border-none cursor-pointer"
                      >
                        <X size={14} strokeWidth={2.25} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}

        {/* Members list */}
        {initialized && members.length > 0 && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {paginatedMembers.map((m) => {
                const ownerFlag = isOwner(m)
                const display = memberDisplayName(m)
                const initials = memberInitials(m)
                const RoleIcon = roleIcon(m.role_in_project, ownerFlag)
                const badge = roleBadgeClass(m.role_in_project)
                const label = roleLabel(m.role_in_project, ownerFlag)

                return (
                  <li
                    key={String(m.user_id)}
                    className="px-4 sm:px-5 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition group"
                  >
                    {/* Avatar */}
                    {m.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.avatar_url} alt={display} className="w-10 h-10 rounded-full object-cover shrink-0" />
                    ) : (
                      <span className={`w-10 h-10 rounded-full ${memberAvatarColor(m)} text-white text-sm font-bold flex items-center justify-center shrink-0`}>
                        {initials}
                      </span>
                    )}

                    {/* Identity */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-gray-900 dark:text-white truncate">{display}</p>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${badge}`}>
                          <RoleIcon size={10} strokeWidth={2.5} />
                          {label}
                        </span>
                        {(pendingInvitationEmails.has((m.email || '').toLowerCase())) && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800">
                            Pending
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5 mt-0.5 truncate">
                        <Mail size={11} strokeWidth={2.25} className="shrink-0" />
                        <span className="truncate">{m.email || '—'}</span>
                        {m.department && (
                          <>
                            <span aria-hidden>·</span>
                            <span className="truncate">{m.department}</span>
                          </>
                        )}
                      </p>
                    </div>

                    {/* Action: Owner removes member, OR member leaves project */}
                    {canManageTeam && (() => {
                      const isSelf = Number(m.user_id) === Number(currentUserId)
                      if (isCurrentUserOwner && !ownerFlag) {
                        // Owner can remove other members (but not themselves)
                        return (
                          <button
                            type="button"
                            onClick={() => setConfirmRemove(m)}
                            aria-label={`Remove ${display}`}
                            className="opacity-0 group-hover:opacity-100 w-8 h-8 inline-flex items-center justify-center text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-lg transition bg-transparent border-none cursor-pointer shrink-0"
                          >
                            <Trash2 size={14} strokeWidth={2.25} />
                          </button>
                        )
                      }
                      if (isSelf && !isCurrentUserOwner) {
                        // Non-owner member can leave the project
                        return (
                          <button
                            type="button"
                            onClick={() => setConfirmLeave(true)}
                            aria-label="Leave project"
                            className="opacity-0 group-hover:opacity-100 w-8 h-8 inline-flex items-center justify-center text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-lg transition bg-transparent border-none cursor-pointer shrink-0"
                          >
                            <LogOut size={14} strokeWidth={2.25} />
                          </button>
                        )
                      }
                      return null
                    })()}
                  </li>
                )
              })}
            </ul>
            <PaginationBar
              page={page}
              total={totalMembers}
              limit={limit}
              onPage={setPage}
              onLimitChange={setLimit}
            />
          </div>
        )}

        {/* Error banner */}

        {error && members.length > 0 && (
          <div className="bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 rounded-xl px-4 py-2.5 text-xs flex items-center justify-between gap-3">
            <span>{error}</span>
            <button type="button" onClick={() => refetch()} className="text-rose-700 dark:text-rose-300 font-semibold underline bg-transparent border-none cursor-pointer">
              Retry
            </button>
          </div>
        )}

        {/* Invitation error */}
        {invError && (
          <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 rounded-xl px-4 py-2.5 text-xs">
            {invError}
          </div>
        )}
      </div>

      {/* Remove-confirmation dialog */}
      <ConfirmDialog
        open={!!confirmRemove}
        title="Remove this member?"
        description={
          confirmRemove
            ? `${memberDisplayName(confirmRemove)} will lose access to ${project?.name || 'this project'} and all of its content. You can re-add them later.`
            : ''
        }
        confirmLabel={removing ? 'Removing…' : 'Remove member'}
        cancelLabel="Cancel"
        destructive
        onCancel={() => (removing ? null : setConfirmRemove(null))}
        onConfirm={handleConfirmRemove}
      />

      {/* Leave-project confirmation dialog */}
      <ConfirmDialog
        open={confirmLeave}
        title="Leave this project?"
        description={`You will lose access to ${project?.name || 'this project'} and all of its content. You can be re-invited later.`}
        confirmLabel={leaving ? 'Leaving…' : 'Leave project'}
        cancelLabel="Cancel"
        destructive
        onCancel={() => (leaving ? null : setConfirmLeave(false))}
        onConfirm={handleLeaveProject}
      />

      {/* Cancel-invitation confirmation dialog */}
      <ConfirmDialog
        open={confirmCancel !== null}
        title="Cancel this invitation?"
        description="The invitation will be voided and the person will no longer be able to join using this link."
        confirmLabel={cancelling ? 'Cancelling…' : 'Cancel invitation'}
        cancelLabel="Keep invitation"
        destructive
        onCancel={() => (cancelling ? null : setConfirmCancel(null))}
        onConfirm={handleConfirmCancel}
      />
    </FeaturePage>
  )
}
