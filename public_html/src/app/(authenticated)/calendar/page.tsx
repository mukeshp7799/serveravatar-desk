'use client';
import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api'
import { useDateSettings } from '@/contexts/CompanySettingsContext';
import toast from 'react-hot-toast';

const TYPE_COLORS: Record<string, string> = {
  public: '#ef4444', company: '#3b82f6', optional: '#8b5cf6',
  meeting: '#3b82f6', training: '#10b981', celebration: '#f59e0b',
  festival: '#f97316', other: '#6366f1', leave: '#8b5cf6',
  birthday: '#ec4899', anniversary: '#22c55e',
};

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function calcYears(dateStr: string): number {
  if (!dateStr || dateStr === '0000-00-00') return 0
  const datePart = dateStr.includes('T') ? dateStr.slice(0, 10) : dateStr
  const parts = datePart.split('-')
  let d: Date

  if (parts.length === 3) {
    // Detect format: first part > 12 means it's DD/MM/YYYY, not YYYY-MM-DD
    if (Number(parts[0]) > 12 && Number(parts[1]) <= 12) {
      d = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]))
    } else {
      d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
    }
  } else {
    d = new Date(dateStr)
  }

  if (isNaN(d.getTime())) return 0
  return Math.floor((Date.now() - d.getTime()) / 365.25 / 86400000)
}

function yearsLabel(years: number): string {
  if (!years) return ''
  return `${years} year${years > 1 ? 's' : ''}`
}

function fmtDate(dateStr: string): string {
  if (!dateStr) return ''
  // Handle both "2026-08-01" and "2026-08-01T00:00:00.000Z"
  const d = dateStr.includes('T') ? dateStr.slice(0, 10) : dateStr
  const month = parseInt(d.slice(5, 7)) - 1
  const day = parseInt(d.slice(8, 10))
  return `${MONTHS[month]} ${day}`
}

// formatDate moved inside component for context-awareness
function sameDay(a: Date, b: Date) { return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate(); }
function fmtLong(d: string, tz: string = 'UTC') {
  if (!d) return '—';
  try {
    const datePart = d.includes('T') ? d.slice(0, 10) : d;
    const parts = datePart.split('-');
    let localDate: Date;

    if (parts.length === 3) {
      const [y, m, day] = parts.map(Number);
      if (![y, m, day].some(isNaN)) {
        // DD/MM/YYYY — company stores dates in this display format.
        // Detect by checking: first part (day) <= 31 AND second part (month) <= 12 AND first part > 12 (to avoid ambiguity with YYYY-MM-DD where year can be <= 12).
        if (Number(parts[0]) > 12 && Number(parts[0]) <= 31 && Number(parts[1]) >= 1 && Number(parts[1]) <= 12) {
          localDate = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
        // YYYY-MM-DD: year > 31 (clearly a year, not a day)
        } else {
          // YYYY-MM-DD — parse in local timezone to avoid UTC-shift issues
          localDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        }
      } else {
        return d;
      }
    } else {
      return d;
    }

    return localDate.toLocaleDateString('en-US', { timeZone: tz || 'UTC', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  } catch { return d; }
}

interface CalItem { type: string; title: string; subtitle?: string; color: string; item: any; date?: string; }

// ─── Unified Item Modal (Detail + Edit) ─────────────────────────────
function ItemModal({ item, onClose, onSave, canManage, defaultMode }: {
  item: CalItem;
  onClose: () => void;
  onSave: () => void;
  canManage: boolean;
  defaultMode?: 'view' | 'edit';
}) {
  const [mode, setMode] = useState<'view' | 'edit'>(defaultMode || 'view');
  const [saving, setSaving] = useState(false);
  const isHoliday = item.type === 'holiday';
  const isEvent = item.type === 'event';
  const isLeave = item.type === 'leave';
  const isBirthday = item.type === 'birthday';
  const isAnniversary = item.type === 'anniversary';

  // Holiday form state
  const [hForm, setHForm] = useState({
    name: item.item?.name || '',
    date: item.item?.date?.slice(0,10) || '',
    holiday_type: item.item?.holiday_type || 'company',
    description: item.item?.description || '',
  });

  // Event form state
  const [eForm, setEForm] = useState({
    title: item.item?.title || '',
    description: item.item?.description || '',
    start_date: item.item?.start_date?.slice(0,10) || '',
    end_date: item.item?.end_date?.slice(0,10) || '',
    all_day: item.item?.all_day !== undefined ? Boolean(item.item?.all_day) : true,
    category: item.item?.category || 'other',
    color: item.item?.color || '#6366f1',
    location: item.item?.location || '',
  });

  const canEdit = canManage && (isHoliday || isEvent);

  const handleSave = async () => {
    if (isHoliday) {
      if (!hForm.name || !hForm.date) return;
      setSaving(true);
      try {
        if (item.item?.id) await api.put(`/calendar/holidays/${item.item.id}`, hForm);
        else await api.post('/calendar/holidays', hForm);
        onSave();
      } catch { toast.error('Failed to save holiday'); }
      setSaving(false);
    } else if (isEvent) {
      if (!eForm.title || !eForm.start_date) return;
      setSaving(true);
      try {
        if (item.item?.id) await api.put(`/calendar/events/${item.item.id}`, eForm);
        else await api.post('/calendar/events', eForm);
        onSave();
      } catch { toast.error('Failed to save event'); }
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this item?')) return;
    try {
      if (isHoliday) await api.delete(`/calendar/holidays/${item.item.id}`);
      else if (isEvent) await api.delete(`/calendar/events/${item.item.id}`);
      onSave();
    } catch { toast.error('Failed to delete'); }
  };

  const typeLabels: Record<string, string> = {
    holiday: 'Holiday', event: 'Event', leave: 'Leave',
    birthday: 'Birthday', anniversary: 'Work Anniversary',
  };

  // ── View Mode ──────────────────────────────────────────────────────
  if (mode === 'view') {
    return createPortal((
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
          {/* Color header */}
          <div className="h-2 rounded-t-2xl" style={{ backgroundColor: item.color }} />

          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {typeLabels[item.type] || item.type}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {canEdit && item.item?.id && mode === 'view' && (
                <button onClick={() => setMode('edit')} className="px-3 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition cursor-pointer border-0">
                  Edit
                </button>
              )}
              <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition cursor-pointer bg-transparent border-0">✕</button>
            </div>
          </div>

          <div className="p-6 space-y-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">{item.title}</h2>
              {item.subtitle && <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 capitalize">{item.subtitle}</p>}
            </div>

            {/* Holiday fields */}
            {isHoliday && item.item && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Date</div>
                    <div className="text-sm font-semibold text-gray-900 dark:text-white">{fmtLong(item.item.date)}</div>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Type</div>
                    <div className="text-sm font-semibold capitalize text-gray-900 dark:text-white">{item.item.holiday_type}</div>
                  </div>
                </div>
                {item.item.description && (
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Description</div>
                    <div className="text-sm text-gray-700 dark:text-gray-300">{item.item.description}</div>
                  </div>
                )}
              </>
            )}

            {/* Event fields */}
            {isEvent && item.item && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Start Date</div>
                    <div className="text-sm font-semibold text-gray-900 dark:text-white">{fmtLong(item.item.start_date)}</div>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">End Date</div>
                    <div className="text-sm font-semibold text-gray-900 dark:text-white">{item.item.end_date ? fmtLong(item.item.end_date) : '—'}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Category</div>
                    <div className="text-sm font-semibold capitalize text-gray-900 dark:text-white">{item.item.category}</div>
                  </div>
                  {item.item.location && (
                    <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                      <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Location</div>
                      <div className="text-sm font-semibold text-gray-900 dark:text-white">{item.item.location}</div>
                    </div>
                  )}
                </div>
                {item.item.description && (
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Description</div>
                    <div className="text-sm text-gray-700 dark:text-gray-300">{item.item.description}</div>
                  </div>
                )}
              </>
            )}

            {/* Leave fields */}
            {isLeave && item.item && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3">
                    <div className="text-xs text-purple-600 dark:text-purple-400 mb-1">Employee</div>
                    <div className="text-sm font-semibold text-gray-900 dark:text-white">{item.item.first_name} {item.item.last_name}</div>
                  </div>
                  <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3">
                    <div className="text-xs text-purple-600 dark:text-purple-400 mb-1">Leave Type</div>
                    <div className="text-sm font-semibold text-gray-900 dark:text-white">{item.item.leave_type}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3">
                    <div className="text-xs text-purple-600 dark:text-purple-400 mb-1">From</div>
                    <div className="text-sm font-semibold text-gray-900 dark:text-white">{fmtLong(item.item.start_date)}</div>
                  </div>
                  <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3">
                    <div className="text-xs text-purple-600 dark:text-purple-400 mb-1">To</div>
                    <div className="text-sm font-semibold text-gray-900 dark:text-white">{fmtLong(item.item.end_date)}</div>
                  </div>
                </div>
              </>
            )}

            {/* Birthday fields */}
            {isBirthday && item.item && (
              <div className="bg-pink-50 dark:bg-pink-900/20 rounded-lg p-3">
                <div className="text-xs text-pink-600 dark:text-pink-400 mb-1">Date of Birth</div>
                <div className="text-sm font-semibold text-gray-900 dark:text-white">{fmtLong(item.item.date_of_birth)}</div>
              </div>
            )}

            {/* Anniversary fields */}
            {isAnniversary && item.item && (
              <>
                <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3">
                  <div className="text-xs text-green-600 dark:text-green-400 mb-1">Joining Date</div>
                  <div className="text-sm font-semibold text-gray-900 dark:text-white">{fmtLong(item.item.hire_date)}</div>
                </div>
                {item.item.years && (
                  <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3">
                    <div className="text-xs text-green-600 dark:text-green-400 mb-1">Years at Company</div>
                    <div className="text-sm font-bold text-green-700 dark:text-green-300">{item.item.years} year{item.item.years > 1 ? 's' : ''} 🎉</div>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700 flex gap-2 justify-end">
            {canEdit && item.item?.id && (
              <button onClick={handleDelete} className="px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition cursor-pointer border border-red-300 dark:border-red-700 bg-transparent mr-auto">Delete</button>
            )}
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition cursor-pointer border border-gray-300 dark:border-gray-600 bg-transparent">Close</button>
          </div>
        </div>
      </div>
    ), typeof document !== 'undefined' ? document.body : null);
  }

  // ── Edit Mode ──────────────────────────────────────────────────────
  return createPortal((
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">
            {isHoliday ? (item.item?.id ? 'Edit Holiday' : 'Add Holiday') : ''}
            {isEvent ? (item.item?.id ? 'Edit Event' : 'Add Event') : ''}
          </h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition cursor-pointer bg-transparent border-0">✕</button>
        </div>

        {/* Holiday Edit Form */}
        {isHoliday && (
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Holiday Name *</label>
              <input value={hForm.name} onChange={e => setHForm(p => ({...p, name: e.target.value}))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Date *</label>
              <input type="date" value={hForm.date} onChange={e => setHForm(p => ({...p, date: e.target.value}))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Type</label>
              <select value={hForm.holiday_type} onChange={e => setHForm(p => ({...p, holiday_type: e.target.value}))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="public">Public Holiday</option>
                <option value="company">Company Holiday</option>
                <option value="optional">Optional Holiday</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Description</label>
              <textarea value={hForm.description} onChange={e => setHForm(p => ({...p, description: e.target.value}))}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          </div>
        )}

        {/* Event Edit Form */}
        {isEvent && (
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Event Title *</label>
              <input value={eForm.title} onChange={e => setEForm(p => ({...p, title: e.target.value}))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Category</label>
              <select value={eForm.category} onChange={e => setEForm(p => ({...p, category: e.target.value}))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="meeting">Meeting</option>
                <option value="training">Training</option>
                <option value="celebration">Celebration</option>
                <option value="festival">Festival</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Start Date *</label>
                <input type="date" value={eForm.start_date} onChange={e => setEForm(p => ({...p, start_date: e.target.value}))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">End Date</label>
                <input type="date" value={eForm.end_date} onChange={e => setEForm(p => ({...p, end_date: e.target.value}))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Color</label>
              <div className="flex gap-2 items-center">
                <input type="color" value={eForm.color} onChange={e => setEForm(p => ({...p, color: e.target.value}))}
                  className="w-10 h-10 rounded cursor-pointer border border-gray-300 dark:border-gray-600" />
                <input value={eForm.color} onChange={e => setEForm(p => ({...p, color: e.target.value}))}
                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Location</label>
              <input value={eForm.location} onChange={e => setEForm(p => ({...p, location: e.target.value}))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Description</label>
              <textarea value={eForm.description} onChange={e => setEForm(p => ({...p, description: e.target.value}))}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
              <input type="checkbox" checked={eForm.all_day} onChange={e => setEForm(p => ({...p, all_day: e.target.checked}))}
                className="rounded border-gray-300 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500 w-4 h-4" />
              All day event
            </label>
          </div>
        )}

        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex gap-2 justify-end">
          <button onClick={() => item.item?.id ? setMode('view') : onClose()} className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition cursor-pointer border border-gray-300 dark:border-gray-600 bg-transparent">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition disabled:opacity-50 cursor-pointer border-0">
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  ), typeof document !== 'undefined' ? document.body : null);
}

// ─── Main Calendar Page ────────────────────────────────────────────
export default function CalendarPage() {

  const { timezone, date_format } = useDateSettings();
  const formatDate = (d: Date): string => {
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const pattern = date_format || 'YYYY-MM-DD';
    return pattern
      .replace('YYYY', String(y)).replace('YY', String(y).slice(-2))
      .replace('MM', String(m).padStart(2,'0')).replace('M', String(m))
      .replace('DD', String(day).padStart(2,'0')).replace('D', String(day));
  };
  const [view, setView] = useState<'month'|'week'|'day'|'agenda'>('month');
  const [current, setCurrent] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [data, setData] = useState<any>({ holidays:[], events:[], leaves:[], birthdays:[], anniversaries:[] });
  const [filters, setFilters] = useState({ holiday: true, event: true, leave: true, birthday: true, anniversary: true });
  const [loading, setLoading] = useState(false);
  const [detailItem, setDetailItem] = useState<CalItem | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);

  const canManageHolidays = permissions.includes('calendar.manage_holidays') || permissions.includes('hr.manage_all');
  const canManageEvents = permissions.includes('calendar.manage_events') || permissions.includes('hr.manage_all');
  const canManage = canManageHolidays || canManageEvents;

  const fetchCalendar = useCallback(async () => {
    setLoading(true);
    try {
      const y = current.getFullYear(), m = current.getMonth() + 1;
      const [viewData, userData] = await Promise.all([
        api.get(`/calendar/view?year=${y}&month=${m}`),
        api.get('/auth/me'),
      ]);
      setData(viewData);
      setPermissions(userData.user?.permissions || []);
    } catch (e) { console.error('Calendar fetch error:', e); }
    setLoading(false);
  }, [current]);

  useEffect(() => { fetchCalendar(); }, [fetchCalendar]);

  const getDaysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
  const getFirstDayOfMonth = (y: number, m: number) => new Date(y, m, 1).getDay();

  const buildCalendarDays = () => {
    const y = current.getFullYear(), m = current.getMonth();
    const daysInMonth = getDaysInMonth(y, m);
    const firstDay = getFirstDayOfMonth(y, m);
    const days: Date[] = [];
    const prevM = m === 0 ? 11 : m - 1;
    const prevY = m === 0 ? y - 1 : y;
    const prevDays = getDaysInMonth(prevY, prevM);
    for (let i = firstDay - 1; i >= 0; i--) days.push(new Date(prevY, prevM, prevDays - i));
    for (let d = 1; d <= daysInMonth; d++) days.push(new Date(y, m, d));
    const nextM = m === 11 ? 0 : m + 1;
    const nextY = m === 11 ? y + 1 : y;
    const remaining = 42 - days.length;
    for (let d = 1; d <= remaining; d++) days.push(new Date(nextY, nextM, d));
    return days;
  };

  const getItemsForDay = (day: Date): CalItem[] => {
    const ds = formatDate(day);
    const items: CalItem[] = [];
    if (filters.holiday) data.holidays.filter(h => h.date === ds).forEach(h => items.push({ type:'holiday', title:h.name, subtitle:h.holiday_type, color:TYPE_COLORS[h.holiday_type]||TYPE_COLORS.holiday, item:h }));
    if (filters.event && Array.isArray(data.events)) {
      data.events.filter(e => {
        const s = (e.start_date||'').slice(0,10), en = (e.end_date||e.start_date||'').slice(0,10);
        if (ds >= s && ds <= en) items.push({ type:'event', title:e.title, subtitle:e.category, color:e.color||TYPE_COLORS[e.category]||TYPE_COLORS.event, item:e });
      });
    }
    if (filters.leave) data.leaves.filter(l => ds >= l.start_date && ds <= l.end_date).forEach(l => items.push({ type:'leave', title:`${l.first_name} ${l.last_name}`, subtitle:l.leave_type, color:l.leave_color||TYPE_COLORS.leave, item:l }));
    if (filters.birthday) data.birthdays.filter(b => { if(!b.date_of_birth||b.date_of_birth==='0000-00-00')return false; const bd=b.date_of_birth.includes('T')?new Date(b.date_of_birth):new Date(b.date_of_birth+'T00:00:00'); return bd.getMonth()===day.getMonth()&&bd.getDate()===day.getDate(); }).forEach(b => { const age=calcYears(b.date_of_birth); items.push({ type:'birthday', title:`${b.first_name} ${b.last_name}'s Birthday`, subtitle: age > 0 ? `Turning ${age}` : 'Birthday', color:TYPE_COLORS.birthday, item:{...b, years: age} }); });
    if (filters.anniversary) data.anniversaries.filter(a => { if(!a.hire_date||a.hire_date==='0000-00-00')return false; const hd=a.hire_date.includes('T')?new Date(a.hire_date):new Date(a.hire_date+'T00:00:00'); return hd.getMonth()===day.getMonth()&&hd.getDate()===day.getDate(); }).forEach(a => { const yrs=calcYears(a.hire_date); items.push({ type:'anniversary', title:`${a.first_name} ${a.last_name}'s Work Anniversary`, subtitle: yearsLabel(yrs)||'Work Anniversary', color:TYPE_COLORS.anniversary, item:{...a, years: yrs} }); });
    return items;
  };

  const prevPeriod = () => setCurrent(d => { const n = new Date(d); if(view==='month')n.setMonth(n.getMonth()-1);else if(view==='week')n.setDate(n.getDate()-7);else if(view==='day')n.setDate(n.getDate()-1);return n; });
  const nextPeriod = () => setCurrent(d => { const n = new Date(d); if(view==='month')n.setMonth(n.getMonth()+1);else if(view==='week')n.setDate(n.getDate()+7);else if(view==='day')n.setDate(n.getDate()+1);return n; });
  const goToday = () => { setCurrent(new Date()); setSelectedDate(new Date()); };

  const getPeriodLabel = () => {
    if (view==='month') return `${MONTHS[current.getMonth()]} ${current.getFullYear()}`;
    if (view==='week') { const start=new Date(current);start.setDate(current.getDate()-current.getDay());const end=new Date(start);end.setDate(start.getDate()+6);return `${start.getDate()} ${MONTHS[start.getMonth()]} – ${end.getDate()} ${MONTHS[end.getMonth()]} ${end.getFullYear()}`; }
    if (view==='day') return `${DAYS[current.getDay()]}, ${current.getDate()} ${MONTHS[current.getMonth()]} ${current.getFullYear()}`;
    return `${MONTHS[current.getMonth()]} ${current.getFullYear()}`;
  };

  const calendarDays = buildCalendarDays();
  const today = new Date();
  const isToday = (d: Date) => sameDay(d, today);
  const isSelected = (d: Date) => selectedDate ? sameDay(d, selectedDate) : false;

  const weekDays = () => { const start=new Date(current);start.setDate(current.getDate()-current.getDay());return Array.from({length:7},(_,i)=>{const d=new Date(start);d.setDate(start.getDate()+i);return d;}); };

  const getWeekItems = (day: Date): CalItem[] => {
    const ds = formatDate(day);
    const items: CalItem[] = [];
    if (filters.holiday) data.holidays.filter(h=>h.date===ds).forEach(h=>items.push({type:'holiday',title:h.name,subtitle:h.holiday_type,color:TYPE_COLORS[h.holiday_type]||TYPE_COLORS.holiday,item:h}));
    if (filters.event) data.events.filter(e=>{const s=(e.start_date||'').slice(0,10),en=(e.end_date||e.start_date||'').slice(0,10);if(ds>=s&&ds<=en)items.push({type:'event',title:e.title,subtitle:e.category,color:e.color||TYPE_COLORS[e.category]||TYPE_COLORS.event,item:e});});
    if (filters.leave) data.leaves.filter(l=>ds>=l.start_date&&ds<=l.end_date).forEach(l=>items.push({type:'leave',title:`${l.first_name} ${l.last_name}`,subtitle:l.leave_type,color:l.leave_color||TYPE_COLORS.leave,item:l}));
    if (filters.birthday) data.birthdays.filter(b=>{if(!b.date_of_birth||b.date_of_birth==='0000-00-00')return false;const bd=b.date_of_birth.includes('T')?new Date(b.date_of_birth):new Date(b.date_of_birth+'T00:00:00');return bd.getMonth()===day.getMonth()&&bd.getDate()===day.getDate();}).forEach(b=>{const age=calcYears(b.date_of_birth);items.push({type:'birthday',title:`${b.first_name} ${b.last_name}'s Birthday`,subtitle:age>0?`Turning ${age}`:'Birthday',color:TYPE_COLORS.birthday,item:{...b,years:age}})});
    if (filters.anniversary) data.anniversaries.filter(a=>{if(!a.hire_date||a.hire_date==='0000-00-00')return false;const hd=a.hire_date.includes('T')?new Date(a.hire_date):new Date(a.hire_date+'T00:00:00');return hd.getMonth()===day.getMonth()&&hd.getDate()===day.getDate();}).forEach(a=>{const yrs=calcYears(a.hire_date);items.push({type:'anniversary',title:`${a.first_name} ${a.last_name}'s Work Anniversary`,subtitle:yearsLabel(yrs)||'Work Anniversary',color:TYPE_COLORS.anniversary,item:{...a,years:yrs}})});
    return items;
  };

  const getAllAgendaItems = (): CalItem[] => {
    const y=current.getFullYear(),m=current.getMonth();
    const items: CalItem[] = [];
    if(filters.holiday) data.holidays.forEach(h=>{const raw=h.date||'';const day=raw.includes('T')?raw.slice(8,10):raw.slice(8,10);items.push({ date:day, rawDate:raw, type:'holiday', title:h.name, subtitle:h.holiday_type, color:TYPE_COLORS[h.holiday_type]||TYPE_COLORS.holiday, item:h } as CalItem);});
    if(filters.event) data.events.forEach(e=>{const raw=e.start_date||'';const day=raw.includes('T')?raw.slice(8,10):raw.slice(8,10);items.push({ date:day, rawDate:raw, type:'event', title:e.title, subtitle:e.category, color:e.color||TYPE_COLORS[e.category]||TYPE_COLORS.event, item:e } as CalItem);});
    if(filters.leave) data.leaves.forEach(l=>{const raw=l.start_date||'';const day=raw.includes('T')?raw.slice(8,10):raw.slice(8,10);items.push({ date:day, rawDate:raw, type:'leave', title:`${l.first_name} ${l.last_name}`, subtitle:l.leave_type, color:l.leave_color||TYPE_COLORS.leave, item:l } as CalItem);});
    if(filters.birthday) data.birthdays.forEach(b=>{if(!b.date_of_birth||b.date_of_birth==='0000-00-00')return;const age=calcYears(b.date_of_birth);const dob=b.date_of_birth.includes('T')?b.date_of_birth:b.date_of_birth+'T00:00:00';const d=new Date(dob);const day=String(d.getDate()).padStart(2,'0');items.push({ date:day, rawDate:dob, type:'birthday', title:`${b.first_name} ${b.last_name}'s Birthday`, subtitle:age>0?`Turning ${age}`:'Birthday', color:TYPE_COLORS.birthday, item:{...b,years:age} } as CalItem);});
    if(filters.anniversary) data.anniversaries.forEach(a=>{if(!a.hire_date||a.hire_date==='0000-00-00')return;const yrs=calcYears(a.hire_date);const hd=a.hire_date.includes('T')?a.hire_date:a.hire_date+'T00:00:00';const d=new Date(hd);const day=String(d.getDate()).padStart(2,'0');items.push({ date:day, rawDate:hd, type:'anniversary', title:`${a.first_name} ${a.last_name}'s Work Anniversary`, subtitle:yearsLabel(yrs)||'Work Anniversary', color:TYPE_COLORS.anniversary, item:{...a,years:yrs} } as CalItem);});
    return items.sort((a,b)=>(a.date||'').localeCompare(b.date||''));
  };

  const handleDayClick = (day: Date) => {
    setSelectedDate(day);
    setCurrent(day);
    setView('day');
  };

  return (
    <div className="w-full px-3 sm:px-4 py-5 sm:py-6 space-y-3 sm:space-y-4 animate-fade-in-up">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Company Calendar</h1>
          <span className={`px-2 py-0.5 text-xs rounded-full ${loading?'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300':'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'}`}>{loading?'Loading...':'Live'}</span>
        </div>
        <div className="flex items-center gap-2">
          {canManageHolidays && (
            <button onClick={() => setDetailItem({ type:'holiday', title:'', color:TYPE_COLORS.holiday, item:{ name:'', date:'', holiday_type:'company', description:'' } })}
              className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg transition cursor-pointer border-0">+ Holiday</button>
          )}
          {canManageEvents && (
            <button onClick={() => setDetailItem({ type:'event', title:'', color:TYPE_COLORS.event, item:{ title:'', description:'', start_date:'', end_date:'', all_day:true, category:'other', color:'#6366f1', location:'' } })}
              className="px-3 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition cursor-pointer border-0">+ Event</button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        {[{key:'holiday',label:'Holidays',color:'#ef4444'},{key:'event',label:'Events',color:'#3b82f6'},{key:'leave',label:'Leaves',color:'#8b5cf6'},{key:'birthday',label:'Birthdays',color:'#ec4899'},{key:'anniversary',label:'Anniversaries',color:'#22c55e'}].map(f=>(
          <label key={f.key} className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300 cursor-pointer select-none">
            <input type="checkbox" checked={filters[f.key as keyof typeof filters]} onChange={e=>setFilters(p=>({...p,[f.key]:e.target.checked}))}
              className="rounded border-gray-300 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500 w-4 h-4"/>
            <span className="w-2 h-2 rounded-full" style={{backgroundColor:f.color}}/>{f.label}
          </label>
        ))}
      </div>

      {/* View Tabs + Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-gray-800 rounded-xl shadow-sm p-1.5 border border-gray-200 dark:border-gray-700">
        <div className="flex gap-1">
          {(['month','week','day','agenda'] as const).map(v=>(
            <button key={v} onClick={()=>setView(v)}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition cursor-pointer border-0 ${view===v?'bg-indigo-600 text-white':'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
              {v.charAt(0).toUpperCase()+v.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={prevPeriod} className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition cursor-pointer border border-gray-300 dark:border-gray-600 bg-transparent">‹ Prev</button>
          <button onClick={goToday} className="px-3 py-1.5 text-sm text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition cursor-pointer border-0 font-medium">Today</button>
          <button onClick={nextPeriod} className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition cursor-pointer border border-gray-300 dark:border-gray-600 bg-transparent">Next ›</button>
          <span className="text-sm font-semibold text-gray-900 dark:text-white ml-2">{getPeriodLabel()}</span>
        </div>
      </div>

      {/* Month View */}
      {view==='month'&&(
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="grid grid-cols-7">
            {DAYS.map(d=><div key={d} className="py-2 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">{d}</div>)}
            {calendarDays.map((day,i)=>{
              const isCurrentMonth=day.getMonth()===current.getMonth();
              const items=getItemsForDay(day);
              return(
                <div key={i} className={`min-h-[90px] p-1.5 border-b border-r border-gray-100 dark:border-gray-700/50 ${isCurrentMonth?'':'bg-gray-50 dark:bg-gray-800/50'} ${isToday(day)?'bg-indigo-50 dark:bg-indigo-900/10':''} ${isSelected(day)?'ring-2 ring-inset ring-indigo-500':''}`}>
                  <div onClick={() => items.length > 0 ? handleDayClick(day) : null}
                    className={`text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full cursor-pointer transition ${isToday(day)?'bg-indigo-600 text-white':isCurrentMonth?'text-gray-900 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700':'text-gray-400 dark:text-gray-600'} ${items.length > 0 ? 'cursor-pointer' : 'cursor-default'}`}>
                    {day.getDate()}
                  </div>
                  <div className="space-y-0.5 overflow-hidden">
                    {items.slice(0,3).map((item,j)=>(
                      <div key={j} onClick={(e) => { e.stopPropagation(); setDetailItem(item); }}
                        className="text-xs truncate rounded px-1 py-0.5 cursor-pointer hover:opacity-80 text-white" style={{backgroundColor:item.color+'cc'}}>{item.title}</div>
                    ))}
                    {items.length>3&&<div className="text-xs text-gray-500 dark:text-gray-400 pl-1 cursor-pointer" onClick={() => { setSelectedDate(day); setView('day'); }}>+{items.length-3} more</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Week View */}
      {view==='week'&&(
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="grid grid-cols-7 border-b border-gray-200 dark:border-gray-700">
            {weekDays().map((day,i)=>(
              <div key={i} className={`py-2 text-center border-r border-gray-100 dark:border-gray-700/50 last:border-r-0 ${isToday(day)?'bg-indigo-50 dark:bg-indigo-900/10':''} ${isSelected(day)?'ring-2 ring-inset ring-indigo-500':''}`}>
                <div className="text-xs text-gray-500 dark:text-gray-400">{DAYS[day.getDay()]}</div>
                <div onClick={() => getWeekItems(day).length > 0 ? handleDayClick(day) : null}
                  className={`text-sm font-bold cursor-pointer hover:text-indigo-600 ${isToday(day)?'text-indigo-600 dark:text-indigo-400':'text-gray-900 dark:text-white'}`}>{day.getDate()}</div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {weekDays().map((day,i)=>{
              const items=getWeekItems(day);
              return(
                <div key={i} className={`min-h-[120px] p-1.5 border-r border-gray-100 dark:border-gray-700/50 last:border-r-0 ${isToday(day)?'bg-indigo-50/30 dark:bg-indigo-900/5':''}`}>
                  {items.map((item,j)=>(
                    <div key={j} onClick={() => setDetailItem(item)}
                      className="text-xs truncate rounded px-1.5 py-1 mb-1 cursor-pointer hover:opacity-80 text-white" style={{backgroundColor:item.color+'dd'}}>{item.title}</div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Day View */}
      {view==='day'&&(
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <button onClick={() => setView('month')} className="text-sm text-indigo-600 hover:underline cursor-pointer bg-transparent border-0 font-medium">← Back to Month</button>
            {selectedDate && (
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                {DAYS[selectedDate.getDay()]}, {MONTHS[selectedDate.getMonth()]} {selectedDate.getDate()}, {selectedDate.getFullYear()}
              </span>
            )}
          </div>
          {getItemsForDay(current).length===0?(
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 text-center text-gray-500 dark:text-gray-400">No events on this day</div>
          ):(
            getItemsForDay(current).map((item,i)=>(
              <div key={i} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 flex items-start gap-3 hover:shadow-md transition cursor-pointer" onClick={() => setDetailItem(item)}>
                <div className="w-1 h-full min-h-[40px] rounded-full" style={{backgroundColor:item.color}}/>
                <div className="flex-1">
                  <div className="font-semibold text-gray-900 dark:text-white">{item.title}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 capitalize">{item.type}{item.subtitle?` · ${item.subtitle}`:''}</div>
                  {item.item.description && <div className="text-sm text-gray-600 dark:text-gray-300 mt-1">{item.item.description}</div>}
                  {item.item.location && <div className="text-xs text-gray-400 mt-1">📍 {item.item.location}</div>}
                </div>
                <div className="text-xs text-indigo-500 dark:text-indigo-400">View →</div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Agenda View */}
      {view==='agenda'&&(
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
            {getAllAgendaItems().length===0?(<div className="p-8 text-center text-gray-500 dark:text-gray-400">No items for this month</div>):(
              getAllAgendaItems().map((item: any,i)=>(
                <div key={i} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition cursor-pointer" onClick={() => setDetailItem(item)}>
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0" style={{backgroundColor:item.color}}>{item.date}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 dark:text-white truncate">{item.title}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 capitalize">{item.type}{item.subtitle?` • ${item.subtitle}`:''}</div>
                  </div>
                  <div className="text-xs text-gray-400 shrink-0">{fmtDate(item.rawDate)}{item.type==='leave' && item.item?.end_date && item.item.end_date!==item.item.start_date ? ` – ${fmtDate(item.item.end_date)}` : ''}</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Unified Modal: Detail + Edit */}
      {detailItem && (
        <ItemModal
          item={detailItem}
          onClose={() => setDetailItem(null)}
          onSave={() => { setDetailItem(null); fetchCalendar(); }}
          canManage={canManage}
          defaultMode={detailItem.item?.id ? 'view' : 'edit'}
        />
      )}
    </div>
  );
}
