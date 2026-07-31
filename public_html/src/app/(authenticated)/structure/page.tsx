'use client'
import PageLoader from '@/components/PageLoader'
import Tabs from '@/components/Tabs'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { Award, Building2, Crown, Gem, Hospital, Landmark, Star, Target, Trophy, Warehouse } from 'lucide-react'
import api from '@/lib/api'
import { validateForm, structureSchema } from '@/lib/schemas'

export default function StructurePage() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<'departments' | 'designations'>('departments')
  const [departments, setDepartments] = useState<any[]>([])
  const [designations, setDesignations] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState<any>(null)
  const [itemName, setItemName] = useState('')
  const user = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('user') || '{}') : {}
  const isAdmin = Array.isArray(user.permissions) && user.permissions.includes('admin.departments')

  useEffect(() => { loadData() }, [])

  const loadData = () => {
    setLoading(true)
    Promise.all([api.get('/departments'), api.get('/designations')])
      .then(([deptData, desigData]) => {
        setDepartments(deptData.departments || [])
        setDesignations(desigData.designations || [])
      }).catch(() => {}).finally(() => setLoading(false))
  }

  const openCreate = () => { setEditItem(null); setItemName(''); setShowModal(true) }
  const openEdit = (item: any) => { setEditItem(item); setItemName(item.name || ''); setShowModal(true) }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    const valid = validateForm(structureSchema, { name: itemName })
    if (!valid) return
    try {
      const path = tab === 'departments' ? 'departments' : 'designations'
      if (editItem) {
        await api.put(`/${path}/${editItem.id}`, { name: valid.name })
        toast.success(t(tab === 'departments' ? 'structure.department' : 'structure.designation'))
      } else {
        await api.post(`/${path}`, { name: valid.name })
        toast.success(t('structure.created'))
      }
      setShowModal(false); loadData()
    } catch (err: any) { toast.error(err.message || t('common.failedToSave')) }
  }

  const handleDelete = async (id: number) => {
    if (!confirm(t('common.confirm'))) return
    try {
      const path = tab === 'departments' ? 'departments' : 'designations'
      await api.delete(`/${path}/${id}`)
      toast.success(t('common.deletedSuccessfully')); loadData()
    } catch (err: any) { toast.error(err.message || t('common.failedToDelete')) }
  }

  const list = tab === 'departments' ? departments : designations
  const label = tab === 'departments' ? t('structure.department') : t('structure.designation')
  const tabLabel = tab === 'departments' ? t('structure.tabDepartments') : t('structure.tabDesignations')
  const placeholder = tab === 'departments' ? t('structure.deptPlaceholder') : t('structure.desigPlaceholder')

  const DEPT_ICONS: any[] = [Building2, Landmark, Hospital, Warehouse, Building2, Landmark]
  const DESIG_ICONS: any[] = [Award, Star, Trophy, Crown, Gem, Target]
  const ITEM_ICONS = tab === 'departments' ? DEPT_ICONS : DESIG_ICONS

  // ── INDIGO CALM THEME ─────────────────────────────────────
  // Primary:   indigo-600 #4F46E5  (buttons, active tabs, icons, links)
  // Surfaces:  white cards, gray-50 page bg, gray-100 borders
  // Text:      gray-900 / gray-600 / gray-500
  // Semantic:  red-600 for delete, emerald-600 for success, amber-600 for warning
  // No gradients. No pastel backgrounds. Single accent color throughout.

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

      {/* Tabs */}
      <Tabs
        active={tab}
        onChange={(k) => setTab(k as 'departments' | 'designations')}
        tabs={[
          { key: 'departments',  label: <span className="inline-flex items-center gap-1.5"><Building2 size={14} strokeWidth={2.25} /> {t('structure.tabDepartments')}</span> },
          { key: 'designations', label: <span className="inline-flex items-center gap-1.5"><Award size={14} strokeWidth={2.25} /> {t('structure.tabDesignations')}</span> },
        ]}
      />

      {loading ? (
        <PageLoader label={t('common.loading')} />
      ) : (
        <>
          {/* Cards grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {list.map((item: any, i: number) => {
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
              <h3 className="font-semibold text-gray-900">{t('common.viewAll')} {tabLabel}</h3>
              <span className="ml-auto text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{list.length}</span>
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
                  {list.map((item: any, i: number) => {
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
            {list.length === 0 && (
              <div className="p-10 text-center">
                <div className="text-gray-300 inline-flex mb-2">{tab === 'departments' ? <Building2 size={32} strokeWidth={1.75} /> : <Award size={32} strokeWidth={1.75} />}</div>
                <p className="text-gray-400 text-sm">{tab === 'departments' ? t('structure.noDepartments') : t('structure.noDesignations')}</p>
              </div>
            )}
          </div>
        </>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl flex flex-col max-h-[calc(100vh-2rem)]" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center shrink-0">
              <h3 className="text-base font-semibold text-gray-900">{editItem ? `${t('common.edit')} ${label}` : `${t('common.add')} ${label}`}</h3>
              <button onClick={() => setShowModal(false)} className="bg-transparent border-none text-gray-400 hover:text-gray-700 cursor-pointer text-lg leading-none">×</button>
            </div>
            <form onSubmit={handleSave} className="flex flex-col flex-1 min-h-0">
              <div className="p-6 overflow-y-auto  flex-1 min-h-0">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">{label} {t('common.name')} *</label>
                  <input required value={itemName} onChange={e => setItemName(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" placeholder={placeholder} />
                </div>
              </div>
              <div className="border-t border-gray-200 px-6 py-4 flex flex-wrap justify-end gap-2 bg-gray-50 shrink-0">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg transition cursor-pointer">{t('common.cancel')}</button>
                <button type="submit" className="px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition cursor-pointer border-none">{editItem ? t('common.saveChanges') : `${t('common.add')} ${label}`}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}