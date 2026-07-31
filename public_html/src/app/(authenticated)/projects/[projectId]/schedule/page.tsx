'use client'

/**
 * Project Schedule — Basecamp-style calendar with Month, Week, Agenda views.
 *
 * Changes from previous version:
 *  - Clicking an event opens an Event Details modal (read-only), NOT the edit form
 *  - The details modal has Edit → opens form, Delete → confirm, Close buttons
 *  - Attendees selector has a "Select All" / "Deselect All" toggle
 *  - Backend already supports multiple events per date (no restriction)
 */

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import toast from 'react-hot-toast'
import {
  CalendarDays, Calendar, CalendarPlus, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Clock,
  Eye, ListChecks, MapPin, Pencil, Plus, Trash2, Users, X, Check,
  CalendarClock, User, Tag, Palette, Globe,
} from 'lucide-react'
import FeaturePage from '@/components/project/FeaturePage'
import EmptyState from '@/components/project/EmptyState'
import ConfirmDialog from '@/components/project/ConfirmDialog'
import api from '@/lib/api'
import {
  useSchedule, type ScheduleEvent, type ScheduleColor, type ScheduleCategory,
  SCHEDULE_COLORS, SCHEDULE_CATEGORIES, COLOR_BG, COLOR_BG_PALE,
} from '@/lib/schedule-api'

interface UserSummary { id: number; first_name: string; last_name: string }

type View = 'month' | 'week' | 'agenda'

// ─── helpers ────────────────────────────────────────────────────────────────

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function startOfMonth(d: Date): Date { return new Date(d.getFullYear(), d.getMonth(), 1) }
function endOfMonth(d: Date): Date { return new Date(d.getFullYear(), d.getMonth() + 1, 0) }
function startOfWeek(d: Date): Date {
  const day = d.getDay()
  const offset = day === 0 ? -6 : 1 - day
  const r = new Date(d)
  r.setDate(d.getDate() + offset)
  r.setHours(0, 0, 0, 0)
  return r
}
function addDays(d: Date, n: number): Date { const r = new Date(d); r.setDate(d.getDate() + n); return r }
function addMonths(d: Date, n: number): Date { const r = new Date(d); r.setMonth(d.getMonth() + n); return r }
function addWeeks(d: Date, n: number): Date { return addDays(d, n * 7) }
function ymd(d: Date): string { return d.toISOString().slice(0, 10) }
function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}
function fmtTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}
function fmtDay(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}
function fmtFull(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}
function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' + fmtTime(iso)
}

function localInputToIso(s: string): string {
  if (!s) return ''
  const d = new Date(s)
  return d.toISOString()
}

// ─── Event Details Modal (read-only view + actions) ────────────────────────

const ATTENDEE_PREVIEW = 3

function AttendeesList({ attendees }: { attendees: ScheduleEvent['attendees'] }) {
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? attendees : attendees.slice(0, ATTENDEE_PREVIEW)
  const remaining = attendees.length - ATTENDEE_PREVIEW
  const hasMore = attendees.length > ATTENDEE_PREVIEW

  return (
    <div>
      <div className="space-y-2">
        {shown.map((a) => (
          <div key={a.user_id} className="flex items-center gap-3 group">
            {/* Avatar */}
            <div className="relative">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 text-white text-[11px] font-bold flex items-center justify-center shadow-sm">
                {(a.first_name || '?')[0]}{(a.last_name || '')[0]}
              </div>
              {/* Online dot */}
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-white dark:border-gray-900" />
            </div>
            {/* Name */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                {a.first_name} {a.last_name}
              </p>
              <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate">{a.email}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Show more / less */}
      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 w-full text-center text-xs font-semibold text-indigo-600 dark:text-indigo-300 hover:text-indigo-800 dark:hover:text-indigo-400 py-1.5 rounded-lg border border-dashed border-indigo-200 dark:border-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition cursor-pointer bg-transparent border-none"
        >
          {expanded ? (
            <span className="inline-flex items-center gap-1">
              <ChevronUp size={12} /> Show less
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <ChevronDown size={12} /> {remaining} more attendee{remaining !== 1 ? 's' : ''}
            </span>
          )}
        </button>
      )}
    </div>
  )
}

function MetaRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0 pt-0.5">
        <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-0.5">{label}</p>
        <div className="text-sm text-gray-900 dark:text-gray-100">{children}</div>
      </div>
    </div>
  )
}

function EventDetailsModal({
  event,
  members,
  onClose,
  onEdit,
  onDelete,
}: {
  event: ScheduleEvent | null
  members: UserSummary[]
  onClose: () => void
  onEdit: (e: ScheduleEvent) => void
  onDelete: (e: ScheduleEvent) => void
}) {
  if (!event) return null

  const colorKey = event.color as ScheduleColor
  const categoryKey = event.category as ScheduleCategory
  const isMultiDay = ymd(new Date(event.start_at)) !== ymd(new Date(event.end_at))

  // Gradient class for the event color
  const gradClass: Record<ScheduleColor, string> = {
    sky:    'from-sky-400 to-blue-500',
    emerald:'from-emerald-400 to-teal-500',
    amber:  'from-amber-400 to-orange-500',
    rose:   'from-rose-400 to-pink-500',
    violet: 'from-violet-400 to-purple-500',
    indigo: 'from-indigo-400 to-violet-500',
  }
  const gradient = gradClass[colorKey] || gradClass.sky

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col animate-fade-in-up"
      >
        {/* ── Hero header with gradient ── */}
        <div className={`relative bg-gradient-to-r ${gradient} px-6 pt-6 pb-8`}>
          {/* Pattern overlay */}
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-3 right-6 w-32 h-32 rounded-full bg-white" />
            <div className="absolute bottom-2 left-4 w-20 h-20 rounded-full bg-white" />
          </div>

          {/* Category + close */}
          <div className="flex items-start justify-between mb-4">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-white/20 text-white backdrop-blur-sm border border-white/30">
              {event.category}
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/40 text-white flex items-center justify-center border-none cursor-pointer backdrop-blur-sm transition"
            >
              <X size={15} />
            </button>
          </div>

          {/* Title */}
          <h2 className="text-xl font-extrabold text-white drop-shadow-sm mb-2 pr-8 leading-tight">
            {event.title}
          </h2>

          {/* Date/time row */}
          <div className="flex items-center gap-3 text-white/90 text-sm">
            <div className="flex items-center gap-1.5 bg-white/20 backdrop-blur-sm rounded-lg px-2.5 py-1">
              <CalendarClock size={13} strokeWidth={2.5} />
              <span className="font-semibold">
                {event.all_day
                  ? `${new Date(event.start_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}${isMultiDay ? ` – ${new Date(event.end_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : ''}`
                  : `${fmtTime(event.start_at)} – ${fmtTime(event.end_at)}`
                }
              </span>
            </div>
            {event.all_day && (
              <span className="bg-white/20 backdrop-blur-sm rounded-lg px-2.5 py-1 text-xs font-semibold">All-day</span>
            )}
          </div>
        </div>

        {/* ── Body: two-column layout ── */}
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-gray-100 dark:divide-gray-800">

            {/* ── Left column: main info ── */}
            <div className="sm:col-span-2 p-5 space-y-4">

              {/* Description */}
              {event.description && (
                <div>
                  <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">About</p>
                  <div className="bg-gray-50 dark:bg-gray-800/60 rounded-xl p-3">
                    <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">{event.description}</p>
                  </div>
                </div>
              )}

              {/* Meta details */}
              <div className="space-y-3">
                {/* Date */}
                <MetaRow icon={<CalendarDays size={14} strokeWidth={2.25} className="text-gray-500" />} label="Date">
                  <span>
                    {new Date(event.start_at).toLocaleDateString(undefined, { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })}
                    {isMultiDay && (
                      <span className="text-gray-500 dark:text-gray-400"> — {new Date(event.end_at).toLocaleDateString(undefined, { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })}</span>
                    )}
                  </span>
                </MetaRow>

                {/* Time */}
                {!event.all_day && (
                  <MetaRow icon={<Clock size={14} strokeWidth={2.25} className="text-gray-500" />} label="Time">
                    {fmtTime(event.start_at)} — {fmtTime(event.end_at)}
                  </MetaRow>
                )}

                {/* Location */}
                {event.location && (
                  <MetaRow icon={<MapPin size={14} strokeWidth={2.25} className="text-gray-500" />} label="Location">
                    <span className="inline-flex items-center gap-1">
                      <Globe size={12} className="text-gray-400" />
                      {event.location}
                    </span>
                  </MetaRow>
                )}

                {/* Color */}
                <MetaRow icon={<Palette size={14} strokeWidth={2.25} className="text-gray-500" />} label="Color">
                  <div className="flex items-center gap-2">
                    <div className={`w-4 h-4 rounded-full shadow-sm ${COLOR_BG[colorKey]}`} />
                    <span className="capitalize font-medium">{colorKey}</span>
                  </div>
                </MetaRow>

                {/* Created by */}
                {event.created_by && (
                  <MetaRow icon={<User size={14} strokeWidth={2.25} className="text-gray-500" />} label="Created by">
                    <span className="inline-flex items-center gap-1.5">
                      <div className="w-5 h-5 rounded-full bg-gradient-to-br from-gray-400 to-gray-500 text-white text-[8px] font-bold flex items-center justify-center">
                        {event.created_by.first_name[0]}{event.created_by.last_name[0]}
                      </div>
                      {event.created_by.first_name} {event.created_by.last_name}
                    </span>
                  </MetaRow>
                )}

                {/* Timestamps */}
                <MetaRow icon={<Globe size={14} strokeWidth={2.25} className="text-gray-500" />} label="Activity">
                  <div className="text-xs text-gray-500 dark:text-gray-400 space-y-0.5">
                    <p>Created {fmtDateTime(event.created_at)}</p>
                    {event.updated_at && <p>Updated {fmtDateTime(event.updated_at)}</p>}
                  </div>
                </MetaRow>
              </div>
            </div>

            {/* ── Right column: attendees sidebar ── */}
            <div className="p-5 bg-gray-50 dark:bg-gray-800/30">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center">
                  <Users size={13} className="text-indigo-600 dark:text-indigo-300" strokeWidth={2.25} />
                </div>
                <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Attendees
                  <span className="ml-1.5 font-normal text-gray-400 dark:text-gray-500">({event.attendees.length})</span>
                </p>
              </div>

              {event.attendees.length > 0 ? (
                <AttendeesList attendees={event.attendees} />
              ) : (
                <div className="text-center py-6">
                  <Users size={28} className="mx-auto text-gray-300 dark:text-gray-600 mb-2" strokeWidth={1.5} />
                  <p className="text-xs text-gray-400 dark:text-gray-500 italic">No attendees added</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Footer actions ── */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 shrink-0">
          <button
            type="button"
            onClick={() => onDelete(event)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-rose-600 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/30 hover:bg-rose-100 dark:hover:bg-rose-900/50 rounded-xl border border-rose-200 dark:border-rose-800 cursor-pointer transition"
          >
            <Trash2 size={14} strokeWidth={2.25} />
            Delete
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-semibold text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl border border-gray-200 dark:border-gray-700 cursor-pointer transition"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => { onClose(); onEdit(event) }}
              className="inline-flex items-center gap-1.5 px-5 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl cursor-pointer shadow-sm transition"
            >
              <Pencil size={13} strokeWidth={2.25} />
              Edit event
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Event modal (create / edit) ────────────────────────────────────────────

function EventModal({
  open,
  initial,
  members,
  onClose,
  onSave,
}: {
  open: boolean
  initial: Partial<ScheduleEvent> | null
  members: UserSummary[]
  onClose: () => void
  onSave: (input: {
    title: string
    description: string | null
    start_at: string
    end_at: string
    all_day: boolean
    location: string | null
    color: ScheduleColor
    category: ScheduleCategory
    attendee_ids: number[]
  }) => Promise<void>
}) {
  const toLocalInput = (iso?: string) => {
    if (!iso) return ''
    const d = new Date(iso)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
  const toLocalDate = (iso?: string) => {
    if (!iso) return ''
    const d = new Date(iso)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  }

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [allDay, setAllDay] = useState(false)
  const [startDate, setStartDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endDate, setEndDate] = useState('')
  const [endTime, setEndTime] = useState('')
  const [location, setLocation] = useState('')
  const [color, setColor] = useState<ScheduleColor>('sky')
  const [category, setCategory] = useState<ScheduleCategory>('meeting')
  const [attendeeIds, setAttendeeIds] = useState<number[]>([])
  const [submitting, setSubmitting] = useState(false)

  // Hydrate on open / when initial changes
  useEffect(() => {
    if (!open) return
    const now = new Date()
    const defStart = initial?.start_at ? new Date(initial.start_at) : now
    const defEnd = initial?.end_at ? new Date(initial.end_at) : new Date(defStart.getTime() + 60 * 60 * 1000)
    setTitle(initial?.title || '')
    setDescription(initial?.description || '')
    setAllDay(!!initial?.all_day)
    setStartDate(toLocalDate(initial?.start_at || defStart.toISOString()))
    setStartTime(toLocalInput(initial?.start_at || defStart.toISOString()).slice(11))
    setEndDate(toLocalDate(initial?.end_at || defEnd.toISOString()))
    setEndTime(toLocalInput(initial?.end_at || defEnd.toISOString()).slice(11))
    setLocation(initial?.location || '')
    setColor((initial?.color as ScheduleColor) || 'sky')
    setCategory((initial?.category as ScheduleCategory) || 'meeting')
    setAttendeeIds(initial?.attendees?.map((a) => a.user_id) || [])
  }, [open, initial])

  if (!open) return null

  const allSelected = members.length > 0 && attendeeIds.length === members.length

  const handleSelectAll = () => {
    if (allSelected) {
      setAttendeeIds([])
    } else {
      setAttendeeIds(members.map((m) => m.id))
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !startDate || !endDate) return
    setSubmitting(true)
    try {
      const startIso = allDay
        ? new Date(`${startDate}T00:00:00`).toISOString()
        : localInputToIso(`${startDate}T${startTime || '00:00'}`)
      const endIso = allDay
        ? new Date(`${endDate}T23:59:59`).toISOString()
        : localInputToIso(`${endDate}T${endTime || '23:59'}`)
      await onSave({
        title: title.trim(),
        description: description.trim() || null,
        start_at: startIso,
        end_at: endIso,
        all_day: allDay,
        location: location.trim() || null,
        color,
        category,
        attendee_ids: attendeeIds,
      })
      onClose()
    } catch (err: any) {
      toast.error(err.message || 'Failed to save event')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-xl p-5 w-full max-w-lg max-h-[90vh] overflow-y-auto space-y-3 animate-fade-in-up"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-gray-900 dark:text-white">
            {initial?.id ? 'Edit event' : 'New event'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 inline-flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg border-none cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        <input
          autoFocus
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Event title"
          className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900"
        />

        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          rows={2}
          className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900 resize-none"
        />

        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            checked={allDay}
            onChange={(e) => setAllDay(e.target.checked)}
            className="rounded text-indigo-600"
          />
          All-day event
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
              Start {allDay ? 'date' : ''}
            </label>
            <input
              type={allDay ? 'date' : 'datetime-local'}
              value={allDay ? startDate : `${startDate}T${startTime}`}
              onChange={(e) => {
                const v = e.target.value
                if (allDay) setStartDate(v)
                else {
                  const [d, t] = v.split('T')
                  setStartDate(d || '')
                  setStartTime(t || '')
                }
              }}
              className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
              End {allDay ? 'date' : ''}
            </label>
            <input
              type={allDay ? 'date' : 'datetime-local'}
              value={allDay ? endDate : `${endDate}T${endTime}`}
              onChange={(e) => {
                const v = e.target.value
                if (allDay) setEndDate(v)
                else {
                  const [d, t] = v.split('T')
                  setEndDate(d || '')
                  setEndTime(t || '')
                }
              }}
              className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
            Location
          </label>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Where is this happening?"
            className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as ScheduleCategory)}
              className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:border-indigo-500"
            >
              {SCHEDULE_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
              Color
            </label>
            <div className="flex flex-wrap gap-1.5">
              {SCHEDULE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={c}
                  onClick={() => setColor(c)}
                  className={`w-6 h-6 rounded-full ${COLOR_BG[c]} border-2 transition cursor-pointer ${
                    color === c ? 'border-gray-900 dark:border-white scale-110' : 'border-transparent hover:scale-105'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        {members.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Attendees ({attendeeIds.length} of {members.length})
              </label>
              <button
                type="button"
                onClick={handleSelectAll}
                className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold rounded-lg transition border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 cursor-pointer bg-transparent border-none"
              >
                {allSelected ? (
                  <><X size={10} /> Deselect all</>
                ) : (
                  <><Check size={10} /> Select all</>
                )}
              </button>
            </div>
            <div className="max-h-36 overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-2 space-y-1">
              {members.map((m) => {
                const checked = attendeeIds.includes(m.id)
                return (
                  <label
                    key={m.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) =>
                        setAttendeeIds((ids) =>
                          e.target.checked ? [...ids, m.id] : ids.filter((i) => i !== m.id)
                        )
                      }
                      className="rounded text-indigo-600"
                    />
                    <div className="w-5 h-5 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 text-white text-[8px] font-bold flex items-center justify-center shrink-0">
                      {m.first_name[0]}{m.last_name[0]}
                    </div>
                    <span className="text-gray-700 dark:text-gray-300">
                      {m.first_name} {m.last_name}
                    </span>
                  </label>
                )
              })}
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl border-none cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!title.trim() || !startDate || !endDate || submitting}
            className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-xl border-none cursor-pointer shadow"
          >
            {submitting ? 'Saving…' : initial?.id ? 'Save changes' : 'Create event'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Agenda view ────────────────────────────────────────────────────────────

function AgendaView({
  events,
  today,
  onView,
}: {
  events: ScheduleEvent[]
  today: Date
  onView: (e: ScheduleEvent) => void
}) {
  const sorted = [...events].sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())
  const groups: Record<string, { label: string; date: Date; events: ScheduleEvent[] }> = {}
  for (const e of sorted) {
    const d = new Date(e.start_at)
    const key = ymd(d)
    if (!groups[key]) {
      groups[key] = { label: fmtFull(e.start_at), date: d, events: [] }
    }
    groups[key].events.push(e)
  }
  const todayKey = ymd(today)
  const upcoming = Object.entries(groups).filter(([k]) => k >= todayKey).sort(([a], [b]) => (a < b ? -1 : 1))
  const past = Object.entries(groups).filter(([k]) => k < todayKey).sort(([a], [b]) => (a < b ? 1 : -1))
  const ordered = [...upcoming, ...past]

  return (
    <div className="space-y-6">
      {ordered.length === 0 && (
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-12">No events yet</p>
      )}
      {ordered.map(([key, g]) => {
        const isToday = key === todayKey
        return (
          <div key={key}>
            <h3 className={`text-xs uppercase tracking-wider font-bold mb-2 flex items-center gap-2 ${isToday ? 'text-indigo-600 dark:text-indigo-300' : 'text-gray-500 dark:text-gray-400'}`}>
              {g.label}
              {isToday && (
                <span className="px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-[10px]">
                  Today
                </span>
              )}
            </h3>
            {/* Multiple events per date — each shown individually */}
            <div className="space-y-2">
              {g.events.map((ev) => (
                <EventCard key={ev.id} event={ev} onView={onView} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Month view ─────────────────────────────────────────────────────────────

function MonthView({
  cursor,
  events,
  today,
  onPrev,
  onNext,
  onCreate,
  onView,
}: {
  cursor: Date
  events: ScheduleEvent[]
  today: Date
  onPrev: () => void
  onNext: () => void
  onCreate: (date: Date) => void
  onView: (e: ScheduleEvent) => void
}) {
  const grid: Date[] = []
  const first = startOfMonth(cursor)
  const gridStart = startOfWeek(first)
  for (let i = 0; i < 42; i++) grid.push(addDays(gridStart, i))

  const eventsByDate: Record<string, ScheduleEvent[]> = {}
  for (const e of events) {
    const s = new Date(e.start_at)
    s.setHours(0, 0, 0, 0)
    const en = new Date(e.end_at)
    en.setHours(0, 0, 0, 0)
    for (let d = new Date(s); d <= en; d = addDays(d, 1)) {
      const k = ymd(d)
      ;(eventsByDate[k] ||= []).push(e)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={onPrev}
          aria-label="Previous month"
          className="w-9 h-9 inline-flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 border-none bg-transparent cursor-pointer"
        >
          <ChevronLeft size={16} />
        </button>
        <h3 className="text-base font-bold text-gray-900 dark:text-white">
          {cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </h3>
        <button
          onClick={onNext}
          aria-label="Next month"
          className="w-9 h-9 inline-flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 border-none bg-transparent cursor-pointer"
        >
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-px bg-gray-200 dark:bg-gray-700 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700">
        {DOW.map((d) => (
          <div
            key={d}
            className="bg-gray-50 dark:bg-gray-800 text-center py-2 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400"
          >
            {d}
          </div>
        ))}
        {grid.map((d) => {
          const inMonth = d.getMonth() === cursor.getMonth()
          const k = ymd(d)
          const isToday = isSameDay(d, today)
          const dayEvents = eventsByDate[k] || []
          return (
            <div
              key={k}
              onDoubleClick={() => onCreate(d)}
              className={`bg-white dark:bg-gray-900 min-h-[88px] p-1.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition ${inMonth ? '' : 'opacity-40'}`}
            >
              <div className="flex items-center justify-between mb-1">
                <span
                  className={`text-[11px] font-semibold ${
                    isToday
                      ? 'inline-flex items-center justify-center w-5 h-5 rounded-full bg-indigo-600 text-white'
                      : 'text-gray-700 dark:text-gray-300'
                  }`}
                >
                  {d.getDate()}
                </span>
              </div>
              <div className="space-y-0.5">
                {dayEvents.slice(0, 3).map((ev) => {
                  const isStart = ymd(new Date(ev.start_at)) === k
                  return (
                    <button
                      key={`${ev.id}-${k}`}
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onView(ev) }}
                      className={`w-full text-left px-1.5 py-0.5 rounded text-[10px] font-semibold truncate border ${COLOR_BG_PALE[ev.color as ScheduleColor]}`}
                      title={ev.title}
                    >
                      {!isStart && ev.all_day ? '↳' : !isStart ? '↳' : ev.all_day ? '' : fmtTime(ev.start_at) + ' '}{ev.title}
                    </button>
                  )
                })}
                {dayEvents.length > 3 && (
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 px-1 font-medium">
                    +{dayEvents.length - 3} more
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400 text-center">
        Double-click a day to add an event • Click an event to view details
      </p>
    </div>
  )
}

// ─── Week view ──────────────────────────────────────────────────────────────

function WeekView({
  cursor,
  events,
  today,
  onPrev,
  onNext,
  onCreate,
  onView,
}: {
  cursor: Date
  events: ScheduleEvent[]
  today: Date
  onPrev: () => void
  onNext: () => void
  onCreate: (date: Date) => void
  onView: (e: ScheduleEvent) => void
}) {
  const ws = startOfWeek(cursor)
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i))
  const eventsByDate: Record<string, ScheduleEvent[]> = {}
  for (const e of events) {
    const s = new Date(e.start_at)
    s.setHours(0, 0, 0, 0)
    const en = new Date(e.end_at)
    en.setHours(0, 0, 0, 0)
    for (let d = new Date(s); d <= en; d = addDays(d, 1)) {
      const k = ymd(d)
      ;(eventsByDate[k] ||= []).push(e)
    }
  }
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={onPrev}
          aria-label="Previous week"
          className="w-9 h-9 inline-flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 border-none bg-transparent cursor-pointer"
        >
          <ChevronLeft size={16} />
        </button>
        <h3 className="text-base font-bold text-gray-900 dark:text-white">
          {days[0].toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} –{' '}
          {days[6].toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
        </h3>
        <button
          onClick={onNext}
          aria-label="Next week"
          className="w-9 h-9 inline-flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 border-none bg-transparent cursor-pointer"
        >
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-7 gap-2">
        {days.map((d) => {
          const k = ymd(d)
          const dayEvents = eventsByDate[k] || []
          const isToday = isSameDay(d, today)
          return (
            <div
              key={k}
              onDoubleClick={() => onCreate(d)}
              className={`bg-white dark:bg-gray-900 rounded-xl border min-h-[180px] p-2 cursor-pointer hover:border-indigo-300 dark:hover:border-indigo-700 transition ${
                isToday
                  ? 'border-indigo-500 dark:border-indigo-700 ring-2 ring-indigo-100 dark:ring-indigo-900/40'
                  : 'border-gray-200 dark:border-gray-700'
              }`}
            >
              <div className="text-center mb-2">
                <p className="text-[10px] uppercase tracking-wider font-bold text-gray-500 dark:text-gray-400">
                  {d.toLocaleDateString(undefined, { weekday: 'short' })}
                </p>
                <p
                  className={`text-lg font-bold ${
                    isToday ? 'text-indigo-600 dark:text-indigo-300' : 'text-gray-900 dark:text-white'
                  }`}
                >
                  {d.getDate()}
                </p>
              </div>
              <div className="space-y-1">
                {dayEvents.slice(0, 4).map((ev) => {
                  const isStart = ymd(new Date(ev.start_at)) === k
                  return (
                    <button
                      key={`${ev.id}-${k}`}
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onView(ev) }}
                      className={`w-full text-left px-1.5 py-1 rounded text-[10px] font-semibold border ${COLOR_BG_PALE[ev.color as ScheduleColor]}`}
                      title={ev.title}
                    >
                      {isStart && !ev.all_day && <Clock size={9} className="inline mr-0.5" />}{' '}
                      {ev.title}
                    </button>
                  )
                })}
                {dayEvents.length > 4 && (
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 font-medium">
                    +{dayEvents.length - 4} more
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Event card (agenda) ────────────────────────────────────────────────────

function EventCard({ event, onView }: { event: ScheduleEvent; onView: (e: ScheduleEvent) => void }) {
  return (
    <div
      className={`bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm p-4 hover:shadow-md hover:-translate-y-0.5 transition cursor-pointer border-l-4 group`}
      style={{ borderLeftColor: undefined }}
      onClick={() => onView(event)}
    >
      <div className="flex items-start gap-4">
        <div
          className={`shrink-0 w-14 h-14 rounded-xl flex flex-col items-center justify-center font-bold border ${COLOR_BG_PALE[event.color as ScheduleColor]}`}
        >
          {event.all_day ? (
            <>
              <CalendarDays size={20} />
              <span className="text-[9px] uppercase tracking-wider mt-0.5">All-day</span>
            </>
          ) : (
            <>
              <span className="text-[10px] uppercase tracking-wider">{fmtTime(event.start_at)}</span>
              <span className="text-lg leading-none">{new Date(event.start_at).getDate()}</span>
            </>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 dark:text-white truncate">{event.title}</p>
          {!event.all_day && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {fmtTime(event.start_at)} – {fmtTime(event.end_at)}
            </p>
          )}
          {event.location && (
            <p className="text-xs text-gray-500 dark:text-gray-400 inline-flex items-center gap-1">
              <MapPin size={10} /> {event.location}
            </p>
          )}
          {event.description && (
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 line-clamp-1">{event.description}</p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${COLOR_BG_PALE[event.color as ScheduleColor]}`}
            >
              {event.category}
            </span>
            {event.attendees.length > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400">
                <Users size={10} /> {event.attendees.length}
              </span>
            )}
          </div>
        </div>
        <Eye size={16} className="opacity-0 group-hover:opacity-100 text-indigo-500 shrink-0 mt-1 transition" />
      </div>
    </div>
  )
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function SchedulePage() {
  const params = useParams<{ projectId: string }>()
  const projectId = params.projectId
  const store = useSchedule(projectId, { pollMs: 0 })
  const [view, setView] = useState<View>('agenda')
  const [cursor, setCursor] = useState<Date>(new Date())
  const today = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])

  // Event modal state (create/edit form)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<ScheduleEvent | null>(null)

  // Event details modal state (read-only view)
  const [detailsEvent, setDetailsEvent] = useState<ScheduleEvent | null>(null)

  // Delete confirmation
  const [pendingDelete, setPendingDelete] = useState<ScheduleEvent | null>(null)

  // Project members (synced with current project members)
  const [members, setMembers] = useState<UserSummary[]>([])

  useEffect(() => {
    let cancelled = false
    api.get(`/projects/${projectId}`).then((r: any) => {
      if (cancelled) return
      const ms = (r.members || []).map((m: any) => ({
        id: m.user_id,
        first_name: m.first_name,
        last_name: m.last_name,
      }))
      setMembers(ms)
    }).catch(() => {/* non-fatal */})
    return () => { cancelled = true }
  }, [projectId])

  // Open details modal (from calendar click)
  const openDetails = (ev: ScheduleEvent) => {
    setDetailsEvent(ev)
  }

  // Open create form (from double-click or New Event button)
  const openCreate = (date?: Date) => {
    setEditing(null)
    if (date) {
      const s = new Date(date)
      s.setHours(9, 0, 0, 0)
      const e = new Date(date)
      e.setHours(10, 0, 0, 0)
      setEditing({
        start_at: s.toISOString(),
        end_at: e.toISOString(),
        color: 'sky',
        category: 'event',
      } as any)
    }
    setModalOpen(true)
  }

  // Open edit form (from details modal → Edit button)
  const openEditForm = (ev: ScheduleEvent) => {
    setEditing(ev)
    setModalOpen(true)
  }

  const handleSave = async (input: any) => {
    try {
      if (editing?.id) {
        await store.update(editing.id, input)
        toast.success('Event updated')
      } else {
        await store.create(input)
        toast.success('Event created')
      }
    } catch (e: any) {
      toast.error(e.message || 'Failed to save event')
      throw e
    }
  }

  const upcoming = store.events.filter((e) => new Date(e.end_at) >= today)
  const next = [...upcoming].sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())[0]

  return (
    <FeaturePage featureKey="schedule" title="Schedule">
      <div className="space-y-4">
        {/* Toolbar */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white">Project schedule</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {store.events.length} events total · {upcoming.length} upcoming
              {next && (
                <span className="ml-2 text-indigo-600 dark:text-indigo-300 font-semibold">
                  Next: {next.title} ({fmtDay(next.start_at)})
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* View toggle */}
            <div className="inline-flex rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              {([
                ['month', 'Month', CalendarDays],
                ['week', 'Week', Calendar],
                ['agenda', 'Agenda', ListChecks],
              ] as [View, string, any][]).map(([v, label, Icon]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  className={`px-3 py-2 text-xs font-semibold inline-flex items-center gap-1.5 border-none cursor-pointer transition ${
                    view === v
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <Icon size={12} /> {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => openCreate()}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow border-none cursor-pointer"
            >
              <CalendarPlus size={14} strokeWidth={2.5} />
              New event
            </button>
          </div>
        </div>

        {/* Body */}
        {store.loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4 h-20 animate-pulse"
              />
            ))}
          </div>
        ) : store.events.length === 0 && view !== 'month' && view !== 'week' ? (
          <EmptyState
            iconName="Calendar"
            title="Nothing scheduled yet"
            description="Add a meeting, milestone, or release date to start the calendar."
            actionLabel="Add first event"
            onAction={() => openCreate()}
          />
        ) : view === 'month' ? (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm p-4">
            <MonthView
              cursor={cursor}
              events={store.events}
              today={today}
              onPrev={() => setCursor((c) => addMonths(c, -1))}
              onNext={() => setCursor((c) => addMonths(c, 1))}
              onCreate={(d) => openCreate(d)}
              onView={openDetails}
            />
          </div>
        ) : view === 'week' ? (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm p-4">
            <WeekView
              cursor={cursor}
              events={store.events}
              today={today}
              onPrev={() => setCursor((c) => addWeeks(c, -1))}
              onNext={() => setCursor((c) => addWeeks(c, 1))}
              onCreate={(d) => openCreate(d)}
              onView={openDetails}
            />
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm p-4">
            <AgendaView events={store.events} today={today} onView={openDetails} />
          </div>
        )}
      </div>

      {/* Details modal — shows on event click */}
      <EventDetailsModal
        event={detailsEvent}
        members={members}
        onClose={() => setDetailsEvent(null)}
        onEdit={openEditForm}
        onDelete={(e) => setPendingDelete(e)}
      />

      {/* Create / Edit form modal */}
      <EventModal
        open={modalOpen}
        initial={editing}
        members={members}
        onClose={() => { setModalOpen(false); setEditing(null) }}
        onSave={handleSave}
      />

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete event?"
        description={`"${pendingDelete?.title}" will be permanently removed from the schedule.`}
        confirmLabel="Delete event"
        destructive
        onConfirm={async () => {
          if (!pendingDelete) return
          try {
            await store.remove(pendingDelete.id)
            toast.success('Event deleted')
          } catch (err: any) {
            toast.error(err.message || 'Failed to delete event')
          } finally {
            setPendingDelete(null)
            setDetailsEvent(null)
          }
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </FeaturePage>
  )
}
