'use client'

/**
 * MentionBadge — renders inline highlighted @mention spans within plain-text
 * or HTML content. Used in read-only comment / message displays so that
 * @mentions are visually distinct from regular text.
 *
 * Usage:
 *   <MentionBadge content="@mukesh.prajapati was here" members={activeMembers} />
 *
 * Or for HTML content (the badge is transparent — it just adds the class):
 *   <MentionBadge content={htmlString} members={activeMembers} html />
 */

import { memberAvatarColor, memberInitials } from '@/lib/project-members-api'
import type { ActiveMember } from './MentionInput'

export type { ActiveMember }

interface MentionBadgeProps {
  /** Raw text or HTML content to render with highlighted @mentions. */
  content: string
  /** Active project members list — used to resolve usernames to display names. */
  members: ActiveMember[]
  /**
   * Set to `true` when `content` contains HTML markup (e.g. from TipTap / rich-text editors).
   * The component applies `mention-inline` CSS class to matched spans without
   * changing HTML structure.
   */
  html?: boolean
  /**
   * Optional callback — called when a mention badge is clicked with the mentioned
   * user's id (e.g. to navigate to their profile). If omitted, the badge has
   * no pointer cursor.
   */
  onMentionClick?: (userId: number | string) => void
}

/** Normalise a user to a @-mention username. */
function mentionUsername(m: ActiveMember): string {
  const first = (m.first_name || '').trim().toLowerCase().replace(/\s+/g, '.')
  const last = (m.last_name || '').trim().toLowerCase().replace(/\s+/g, '.')
  if (first || last) return `${first}.${last}`.replace(/^\.|\.$/g, '')
  return (m.email || '').toLowerCase().split('@')[0] || ''
}

/** Build a map of username → member for fast lookup. */
function buildUsernameMap(members: ActiveMember[]): Map<string, ActiveMember> {
  const map = new Map<string, ActiveMember>()
  for (const m of members) {
    map.set(mentionUsername(m), m)
    // Also store space-separated variant.
    const sp = mentionUsername(m).replace(/\./g, ' ')
    map.set(sp, m)
  }
  return map
}

/**
 * Highlight @mention tokens in plain-text content.
 * Returns an array of React nodes with mention spans replaced by badges.
 */
export function highlightMentions(
  content: string,
  members: ActiveMember[],
  onMentionClick?: (userId: number | string) => void
): React.ReactNode[] {
  if (!content) return []
  const map = buildUsernameMap(members)
  const RE = /@([a-zA-Z][a-zA-Z0-9._-]{1,49})/g
  const nodes: React.ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  let key = 0

  // Reset state
  RE.lastIndex = 0

  while ((m = RE.exec(content)) !== null) {
    // Text before the mention
    if (m.index > last) {
      nodes.push(content.slice(last, m.index))
    }

    const rawUsername = m[1].toLowerCase()
    const member = map.get(rawUsername) || map.get(rawUsername.replace(/\./g, ' '))

    if (member) {
      const colorCls = memberAvatarColor(member as any)
      const initials = memberInitials(member as any)
      const displayName = [member.first_name, member.last_name].filter(Boolean).join(' ').trim() ||
        member.email ||
        rawUsername

      nodes.push(
        <span
          key={`mention-${key++}`}
          className={`inline-flex items-center gap-0.5 px-1 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-900/40
            text-indigo-700 dark:text-indigo-300 font-medium text-xs
            ${onMentionClick ? 'cursor-pointer hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition' : ''}`}
          onClick={() => onMentionClick && onMentionClick(member.id)}
          title={`@${mentionUsername(member)}`}
        >
          <span
            className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[8px] font-bold text-white ${colorCls}`}
          >
            {member.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={member.avatar_url}
                alt=""
                className="w-full h-full rounded-full object-cover"
              />
            ) : (
              initials
            )}
          </span>
          @{displayName}
        </span>
      )
    } else {
      // Unknown mention — render as plain text
      nodes.push(`@${m[1]}`)
    }

    last = m.index + m[0].length
  }

  // Remaining text
  if (last < content.length) {
    nodes.push(content.slice(last))
  }

  return nodes
}

/**
 * Highlight @mention tokens within HTML content by wrapping @mentions in a span.
 * For use with pre-sanitised HTML from rich-text editors.
 */
export function highlightMentionsHtml(
  content: string,
  members: ActiveMember[],
  onMentionClick?: (userId: number | string) => void
): string {
  if (!content) return content
  const map = buildUsernameMap(members)
  const RE = /@([a-zA-Z][a-zA-Z0-9._-]{1,49})/g

  return content.replace(RE, (match, username) => {
    const rawUsername = (username || '').toLowerCase()
    const member = map.get(rawUsername) || map.get(rawUsername.replace(/\./g, ' '))
    if (!member) return match

    const colorCls = memberAvatarColor(member as any)
    const initials = memberInitials(member as any)
    const displayName =
      [member.first_name, member.last_name].filter(Boolean).join(' ').trim() ||
      member.email ||
      rawUsername

    const avatar = member.avatar_url
      ? `<img src="${member.avatar_url}" alt="" class="w-4 h-4 rounded-full object-cover" />`
      : `<span class="inline-flex items-center justify-center w-4 h-4 rounded-full text-[8px] font-bold text-white ${colorCls}">${initials}</span>`

    const clickAttr = onMentionClick ? ` data-mention-user-id="${member.id}"` : ''
    return `<span class="mention-inline"${clickAttr}>${avatar} @${displayName}</span>`
  })
}

export default function MentionBadge({
  content,
  members,
  html = false,
  onMentionClick,
}: MentionBadgeProps) {
  if (!content) return null

  if (html) {
    // For HTML content, we return a dangerouslySetInnerHTML-compatible string
    // but since we can't use that attribute here, we return the processed HTML.
    // The parent should use `dangerouslySetInnerHTML`. This component just
    // exports the highlight function for that case.
    return null
  }

  const nodes = highlightMentions(content, members, onMentionClick)
  return <>{nodes}</>
}
