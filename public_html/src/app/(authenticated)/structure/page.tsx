'use client'
import PageLoader from '@/components/PageLoader'
import RequirePermission from '@/components/RequirePermission'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { Building2, Landmark, Hospital, Warehouse } from 'lucide-react'
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

  const onSubmit = (data: StructureInput) => {
    const promise = editItem
      ? api.put(`/departments/${editItem.id}`, { name: data.name }).then(() => toast.success(t('structure.department')))
      : api.post('/departments', { name: data.name }).then(() => toast.success(t('structure.created')))
    promise.catch((err: any) => toast.error(err.message || t('common.failedToSave'))).finally(() => { setShowModal(false); loadData() })
  }

  const handleDelete = async (id: number) => {
    if (!confirm(t('common.confirm'))) return
    try {
      await api.delete(`/departments/${id}`)
      toast.success(t('common.deletedSuccessfully')); loadData()
    } catch (err: any) { toast.error(err.message || t('common.failedToDelete')) }
  }

  const ITEM_ICONS: any[] = [Building2, Landmark, Hospital, Warehouse, Building2, Landmark]
  const label = t('structure.department')

  return (
    <div className="space-y-5 animate-fade-in-up">
      {/* Page header */}
      <div className="flex flex-wrap justify-end items-center gap-3">
        {isAdmin && (
          <button onClick={openCreate} className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition cursor-pointer border-none flex items-center gap-2">
            <span className="text-lg leading-none">+</span> {t('common.add')} {label}
          </button>
        )}
      </div>

      {loading ? (
        <PageLoader label={t('common.loading')} />
      ) : (
        <>
          {/* Cards grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {departments.map((item: any, i: number) => {
              const Icon = ITEM_ICONS[i % ITEM_ICONS.length]
              return (
                <div key={item.id} className="bg-white rounded-xl border border-gray-200 p-4 cursor-pointer card-hover group">
                  <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center text-lg mb-3"><Icon size={20} strokeWidth={2.25} /></div>
                  <div className="font-semibold text-gray-900 text-sm mb-3 truncate">{item.name}</div>
                  {isAdmin && (
                    <div className="flex gap-3 text-xs font-medium">
                      <button onClick={() => openEdit(item)} className="text-indigo-600 hover:text-indigo-800 cursor-pointer border-none bg-transparent p-0">{t('common.edit')}</button>
                      <button onClick={() => handleDelete(item.id)} className="text-red-600 hover:text-red-800 cursor-pointer border-none bg-transparent p-0">{t('common.delete')}</button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mt-4">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center gap-2">
              <h3 className="font-semibold text-gray-900">{t('common.viewAll')} {label}</h3>
              <span className="ml-auto text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{departments.length}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse min-w-[600px]">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">{t('common.name')}</th>
                    {isAdmin && <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">{t('common.actions')}</th>}
                  </tr>
                </thead>
                <tbody>
                  {departments.map((item: any, i: number) => {
                    const Icon = ITEM_ICONS[i % ITEM_ICONS.length]
                    return (
                      <tr key={item.id} className="border-b border-gray-100 last:border-0 row-hover">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center text-base"><Icon size={18} strokeWidth={2.25} /></div>
                            <span className="font-semibold text-gray-900">{item.name}</span>
                          </div>
                        </td>
                        {isAdmin && (
                          <td className="px-4 py-3">
                            <div className="flex gap-4 text-sm font-medium">
                              <button onClick={() => openEdit(item)} className="text-indigo-600 hover:text-indigo-800 cursor-pointer border-none bg-transparent p-0">{t('common.edit')}</button>
                              <button onClick={() => handleDelete(item.id)} className="text-red-600 hover:text-red-800 cursor-pointer border-none bg-transparent p-0">{t('common.delete')}</button>
                            </div>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {departments.length === 0 && (
              <div className="p-10 text-center">
                <div className="text-gray-300 inline-flex mb-2"><Building2 size={32} strokeWidth={1.75} /></div>
                <p className="text-gray-400 text-sm">{t('structure.noDepartments')}</p>
              </div>
            )}
          </div>
        </>
      )}

      {/* Modal */}
      {showModal && (
        <PortalModal>
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl flex flex-col max-h-[calc(100vh-2rem)]" onClick={e => e.stopPropagation()}>
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
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg transition cursor-pointer">{t('common.cancel')}</button>
                <button type="submit" className="px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition cursor-pointer border-none">{editItem ? t('common.saveChanges') : `${t('common.add')} ${label}`}</button>
              </div>
            </form>
          </div>
        </div>
        </PortalModal>
      )}
    </div>
  )
}
