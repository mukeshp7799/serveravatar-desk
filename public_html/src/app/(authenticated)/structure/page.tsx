'use client'
import PageLoader from '@/components/PageLoader'
import RequirePermission from '@/components/RequirePermission'
import ConfirmDialog from '@/components/project/ConfirmDialog'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { Building2, Landmark, Hospital, Warehouse, Users, Calendar, Pencil, Trash2, Plus } from 'lucide-react'
import PortalModal from '@/components/PortalModal';
import api from '@/lib/api'
import { structureSchema, type StructureInput } from '@/lib/schemas'

// NOTE: Designations module was removed in Phase 2 of the RBAC refactor.
// Designation is now a free-text string on `users.designation`, managed
// from the Employee create/edit form.

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
        toast.success(t('structure.department'))
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

  const ITEM_ICONS: any[] = [Building2, Landmark, Hospital, Warehouse, Building2, Landmark]
  const label = t('structure.department')

  // Skeleton card for loading state
  const SkeletonCard = () => (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-slate-100 dark:border-slate-800 animate-pulse">
      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-600 mb-4" />
      <div className="w-3/4 h-5 bg-slate-200 dark:bg-slate-700 rounded-lg mb-2" />
      <div className="w-1/2 h-3 bg-slate-200 dark:bg-slate-700 rounded" />
    </div>
  )

  // Empty state card
  const EmptyStateCard = () => (
    <div className="col-span-full flex flex-col items-center justify-center py-16 px-6 bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl">
      <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
        <Building2 size={32} strokeWidth={1.5} className="text-slate-400" />
      </div>
      <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">No Departments Yet</h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 text-center mb-6 max-w-sm">
        Get started by creating your first department to organize your team members.
      </p>
      {isAdmin && (
        <button
          onClick={openCreate}
          className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition cursor-pointer border-none flex items-center gap-2"
        >
          <Plus size={18} strokeWidth={2.5} />
          Add Department
        </button>
      )}
    </div>
  )

  return (
    <div className="space-y-5 animate-fade-in-up">
      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">Organization Structure</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Manage your company's departments to organize and structure your workforce effectively.</p>
        </div>
        {isAdmin && (
          <button onClick={openCreate} className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition cursor-pointer border-none flex items-center gap-2 shrink-0">
            <Plus size={18} strokeWidth={2.5} />
            {t('common.add')} {label}
          </button>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mt-5 w-full">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : departments.length === 0 ? (
        <EmptyStateCard />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 w-full mt-5">
          {departments.map((item: any, i: number) => {
            const Icon = ITEM_ICONS[i % ITEM_ICONS.length]
            return (
              <div
                key={item.id}
                className="group relative bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm hover:shadow-lg border border-slate-100 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-indigo-800 transition-all duration-300 hover:-translate-y-0.5"
              >
                {/* Icon */}
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mb-4 shadow-md">
                  <Icon size={22} strokeWidth={2} className="text-white" />
                </div>

                {/* Department Name */}
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1 truncate ">
                  {item.name}
                </h3>

                {/* Meta info */}
                <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                  <Calendar size={12} strokeWidth={2} />
                  <span>{item.created_at ? new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'No date'}</span>
                </div>

                {/* Action buttons */}
                {isAdmin && (
                  <div className="absolute top-4 right-4 flex items-center gap-1">
                    <button
                      onClick={() => openEdit(item)}
                      className="w-8 h-8 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/40 flex items-center justify-center cursor-pointer border-none bg-transparent transition-colors"
                      title={t('common.edit')}
                    >
                      <Pencil size={14} strokeWidth={2.25} />
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="w-8 h-8 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/40 flex items-center justify-center cursor-pointer border-none bg-transparent transition-colors"
                      title={t('common.delete')}
                    >
                      <Trash2 size={14} strokeWidth={2.25} />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <PortalModal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm" onClick={() => setShowModal(false)} />
            <div className="relative bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[calc(100vh-2rem)]" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center shrink-0">
              <h3 className="text-base font-semibold text-gray-900">{editItem ? `${t('common.edit')} ${label}` : `${t('common.add')} ${label}`}</h3>
              <button onClick={() => setShowModal(false)} className="bg-transparent border-none text-gray-400 hover:text-gray-700 cursor-pointer text-lg leading-none">×</button>
            </div>
            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-1 min-h-0">
              <div className="p-6 overflow-y-auto  flex-1 min-h-0">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">{label} {t('common.name')} *</label>
                  <input
                    {...register('name')}
                    className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 transition ${errors.name ? 'border-red-400 focus:border-red-500 focus:ring-red-200' : 'border-gray-300 focus:border-indigo-500 focus:ring-indigo-500'}`}
                    placeholder={t('structure.deptPlaceholder')}
                  />
                  {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>}
                </div>
              </div>
              <div className="border-t border-gray-200 px-6 py-4 flex flex-wrap justify-end gap-2 bg-gray-50 shrink-0">
                <button type="button" onClick={() => setShowModal(false)} disabled={saving} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg transition cursor-pointer disabled:opacity-50">{t('common.cancel')}</button>
                <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition cursor-pointer border-none disabled:opacity-50 flex items-center gap-2">
                  {saving && <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>}
                  {saving ? (editItem ? 'Saving...' : 'Adding...') : (editItem ? t('common.saveChanges') : `${t('common.add')} ${label}`)}
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
