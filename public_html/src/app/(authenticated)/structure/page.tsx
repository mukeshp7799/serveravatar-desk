'use client'
import PageLoader from '@/components/PageLoader'
import RequirePermission from '@/components/RequirePermission'
import ConfirmDialog from '@/components/project/ConfirmDialog'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import {
  Building2, Landmark, Hospital, Warehouse, Users, Calendar,
  Pencil, Trash2, Plus, Network, ChevronRight,
} from 'lucide-react'
import PortalModal from '@/components/PortalModal'
import api from '@/lib/api'
import { structureSchema, type StructureInput } from '@/lib/schemas'

// NOTE: Designations module was removed in Phase 2 of the RBAC refactor.
// Designation is now a free-text string on `users.designation`, managed
// from the Employee create/edit form.

// Color palette for department cards — cycles through 6 themes
const DEPT_THEMES = [
  { icon: 'from-indigo-500 to-purple-600',   bg: 'bg-indigo-50',        text: 'text-indigo-600',    badge: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  { icon: 'from-emerald-500 to-teal-600',     bg: 'bg-emerald-50',       text: 'text-emerald-600',  badge: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  { icon: 'from-amber-500 to-orange-600',      bg: 'bg-amber-50',         text: 'text-amber-600',    badge: 'bg-amber-100 text-amber-700 border-amber-200' },
  { icon: 'from-rose-500 to-pink-600',        bg: 'bg-rose-50',          text: 'text-rose-600',     badge: 'bg-rose-100 text-rose-700 border-rose-200' },
  { icon: 'from-violet-500 to-purple-600',    bg: 'bg-violet-50',        text: 'text-violet-600',   badge: 'bg-violet-100 text-violet-700 border-violet-200' },
  { icon: 'from-cyan-500 to-blue-600',        bg: 'bg-cyan-50',          text: 'text-cyan-600',     badge: 'bg-cyan-100 text-cyan-700 border-cyan-200' },
]

const ITEM_ICONS = [Building2, Landmark, Hospital, Warehouse, Building2, Landmark]

function fmtDate(raw: string | null | undefined): string {
  if (!raw) return '—'
  const s = String(raw).trim()
  const dateStr = s.split(/T|\s/)[0]
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return s
  const [y, m, d] = dateStr.split('-').map(Number)
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${d} ${months[m - 1]}, ${y}`
}

export default function StructurePage() {
  return (
    <RequirePermission permission="admin.departments">
      <StructurePageInner />
    </RequirePermission>
  )
}

function StructurePageInner() {
  const { t } = useTranslation()
  const [departments, setDepartments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState<any>(null)
  const [confirmDelete, setConfirmDelete] = useState<{ id: number; name: string } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [saving, setSaving] = useState(false)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<StructureInput>({
    resolver: zodResolver(structureSchema),
    mode: 'onBlur',
  })
  const user = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('user') || '{}') : {}
  const isAdmin = Array.isArray(user.permissions) && user.permissions.includes('admin.departments')

  useEffect(() => { loadData() }, [])

  const loadData = () => {
    setLoading(true)
    api.get('/departments')
      .then((deptData) => setDepartments(deptData.departments || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  const openCreate = () => { setEditItem(null); reset({ name: '' }); setShowModal(true) }
  const openEdit = (item: any) => { setEditItem(item); reset({ name: item.name || '' }); setShowModal(true) }

  const onSubmit = async (data: StructureInput) => {
    setSaving(true)
    try {
      if (editItem) {
        await api.put(`/departments/${editItem.id}`, { name: data.name })
        toast.success(t('common.savedChanges'))
      } else {
        await api.post('/departments', { name: data.name })
        toast.success(t('structure.created'))
      }
      setShowModal(false)
      loadData()
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err.message || t('common.failedToSave'))
      setShowModal(false)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = (id: number) => {
    const item = departments.find(d => d.id === id)
    setConfirmDelete({ id, name: item?.name || 'this department' })
  }

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return
    setDeleting(true)
    try {
      await api.delete(`/departments/${confirmDelete.id}`)
      setConfirmDelete(null)
      toast.success(t('common.deletedSuccessfully'))
      loadData()
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err.message || t('common.failedToDelete'))
      setConfirmDelete(null)
    } finally {
      setDeleting(false)
    }
  }

  const label = t('structure.department')

  // Skeleton card
  const SkeletonCard = () => (
    <div className="bg-white dark:bg-slate-900 rounded-xl p-3 shadow-sm border border-slate-100 dark:border-slate-800 animate-pulse">
      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-600 mb-2" />
      <div className="w-3/4 h-3 bg-slate-200 dark:bg-slate-700 rounded-xl mb-1" />
      <div className="w-1/2 h-2 bg-slate-100 dark:bg-slate-700 rounded-lg" />
    </div>
  )

  // Empty state
  const EmptyState = () => (
    <div className="col-span-full flex flex-col items-center justify-center py-20 px-6 bg-white dark:bg-slate-900 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">
      {/* Illustration */}
      <div className="relative mb-8">
        <div className="w-24 h-24 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 flex items-center justify-center">
          <Network size={40} strokeWidth={1.5} className="text-slate-400" />
        </div>
        {/* Floating dots decoration */}
        <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-indigo-400 opacity-60" />
        <div className="absolute -bottom-2 -left-3 w-4 h-4 rounded-full bg-violet-400 opacity-40" />
        <div className="absolute top-1/2 -right-4 w-3 h-3 rounded-full bg-emerald-400 opacity-50" />
      </div>
      <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">No Departments Yet</h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 text-center mb-8 max-w-xs leading-relaxed">
        Build your organization's structure by creating departments. Each department helps organize team members and streamline management.
      </p>
      {isAdmin && (
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-sm font-bold transition shadow-lg shadow-indigo-200 dark:shadow-indigo-900/50 cursor-pointer border-none"
        >
          <Plus size={18} strokeWidth={2.5} />
          Create First Department
        </button>
      )}
    </div>
  )

  return (
    <div className="space-y-6">

      {/* ── Page Header ── */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-extrabold text-slate-900 dark:text-white leading-tight">Organization Structure</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Manage your organization's departments</p>
        </div>
        {isAdmin && (
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition cursor-pointer border-none shrink-0"
          >
            <Plus size={14} strokeWidth={2.5} />
            Add Department
          </button>
        )}
      </div>

      {/* ── Department Cards Grid ── */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 w-full">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : departments.length === 0 ? (
        <div className="grid grid-cols-1 gap-3 w-full">
          <EmptyState />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2 sm:gap-3 w-full">
          {departments.map((item: any, i: number) => {
            const theme = DEPT_THEMES[i % DEPT_THEMES.length]
            const Icon = ITEM_ICONS[i % ITEM_ICONS.length]
            return (
              <div
                key={item.id}
                className="group relative bg-white dark:bg-slate-900 rounded-xl p-3 shadow-sm hover:shadow-xl border border-slate-100 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-indigo-700 transition-all duration-300 flex flex-col animate-fade-in-up"
              >
                {/* Top-right actions (always visible) */}
                {isAdmin && (
                  <div className="absolute top-2 right-2 flex items-center gap-0.5">
                    <button
                      onClick={() => openEdit(item)}
                      className="w-7 h-7 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/50 flex items-center justify-center cursor-pointer border-none bg-white/80 dark:bg-slate-700/80 shadow-sm transition-colors"
                      title={t('common.edit')}
                    >
                      <Pencil size={11} strokeWidth={2.5} />
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="w-7 h-7 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/50 flex items-center justify-center cursor-pointer border-none bg-white/80 dark:bg-slate-700/80 shadow-sm transition-colors"
                      title={t('common.delete')}
                    >
                      <Trash2 size={11} strokeWidth={2.25} />
                    </button>
                  </div>
                )}

                {/* Icon block */}
                <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${theme.icon} flex items-center justify-center mb-2 shadow-lg group-hover:scale-105 group-hover:shadow-xl transition-all duration-300`}>
                  <Icon size={14} strokeWidth={2} className="text-white" />
                </div>

                {/* Department name */}
                <h3 className="text-xs font-extrabold text-slate-900 dark:text-white mb-1 pr-8 leading-tight">
                  {item.name}
                </h3>

                {/* Divider */}
                <div className="flex-1" />

                {/* Meta footer */}
                <div className="flex flex-wrap items-center justify-between gap-1 pt-2 border-t border-slate-100 dark:border-slate-800">
                  {/* Member count placeholder */}
                  <div className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold border ${theme.badge}`}>
                    <Users size={9} strokeWidth={2.5} />
                    Team
                  </div>
                  {/* Date */}
                  <div className="flex items-center gap-1 text-[9px] text-slate-400 dark:text-slate-500 font-medium">
                    <Calendar size={9} strokeWidth={2} />
                    <span>{fmtDate(item.created_at)}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Modal ── */}
      {showModal && (
        <PortalModal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm" onClick={() => setShowModal(false)} />
            <div
              className="relative bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[calc(100vh-2rem)] overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              {/* Modal header with gradient */}
              <div className={`px-7 py-5 bg-gradient-to-r from-indigo-600 to-violet-600 flex justify-between items-center shrink-0`}>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                    <Network size={18} strokeWidth={2} className="text-white" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">
                      {editItem ? 'Edit Department' : 'Create Department'}
                    </h3>
                    <p className="text-indigo-200 text-xs mt-0.5">
                      {editItem ? 'Update the department name below' : 'Add a new department to your organization'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="w-8 h-8 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center text-white/80 hover:text-white cursor-pointer border-none transition-colors text-lg leading-none"
                >
                  ×
                </button>
              </div>

              <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-1 min-h-0">
                <div className="p-7 flex-1 min-h-0">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-2 uppercase tracking-widest">
                      Department Name <span className="text-red-400">*</span>
                    </label>
                    <input
                      {...register('name')}
                      autoFocus
                      className={`w-full border-2 rounded-xl px-4 py-3 text-sm font-medium transition-all focus:outline-none focus:ring-4 ${
                        errors.name
                          ? 'border-red-400 bg-red-50/50 dark:bg-red-900/10 focus:border-red-500 focus:ring-red-100 dark:focus:ring-red-900/30'
                          : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:border-indigo-500 focus:ring-indigo-100 dark:focus:ring-indigo-900/30'
                      }`}
                      placeholder="e.g. Human Resources, Engineering, Marketing"
                    />
                    {errors.name && (
                      <p className="mt-2 text-xs text-red-500 font-medium">{errors.name.message}</p>
                    )}
                    <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                      Choose a clear, descriptive name for this department.
                    </p>
                  </div>
                </div>
                <div className="border-t border-slate-100 dark:border-slate-800 px-7 py-5 flex items-center justify-end gap-3 bg-slate-50/50 dark:bg-slate-800/50 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    disabled={saving}
                    className="px-5 py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600 rounded-xl transition cursor-pointer disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-6 py-2.5 text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition cursor-pointer border-none disabled:opacity-50 inline-flex items-center gap-2 shadow-md shadow-indigo-200 dark:shadow-indigo-900/40"
                  >
                    {saving ? (
                      <>
                        <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                        </svg>
                        {editItem ? 'Saving…' : 'Creating…'}
                      </>
                    ) : (
                      <>
                        <Plus size={15} strokeWidth={2.5} />
                        {editItem ? 'Save Changes' : `Create Department`}
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </PortalModal>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={confirmDelete !== null}
        title={`Delete Department "${confirmDelete?.name}"?`}
        description="This action cannot be undone. The department and all associated data will be permanently removed."
        confirmLabel="Delete"
        destructive
        loading={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  )
}
