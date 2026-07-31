'use client'
import PageLoader from '@/components/PageLoader'
import RequirePermission from '@/components/RequirePermission'
import Tabs from '@/components/Tabs'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { Check, KeyRound, Pencil, Plus, Shield, Tag, Trash2 } from 'lucide-react'
import api from '@/lib/api'
import { validateForm, roleSchema } from '@/lib/schemas'

export default function RolesPage() {
  return (
    <RequirePermission permission="admin.roles">
      <RolesPageInner />
    </RequirePermission>
  )
}

function RolesPageInner() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<'roles' | 'permissions'>('roles')
  const [roles, setRoles] = useState<any[]>([])
  const [permissions, setPermissions] = useState<any[]>([])
  const [rolePermissions, setRolePermissions] = useState<Record<number, number[]>>({})
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [editRole, setEditRole] = useState<any>(null)
  const [roleName, setRoleName] = useState('')
  const user = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('user') || '{}') : {}
  const isAdmin = Array.isArray(user.permissions) && user.permissions.includes('admin.roles')

  useEffect(() => { loadData() }, [])

  const loadData = () => {
    setLoading(true)
    api.get('/roles').then(res => {
      setRoles(res.roles || [])
      setPermissions(res.permissions || [])
      const rolePerms: Record<number, number[]> = {}
      const permPromises = (res.roles || []).map((role: any) =>
        api.get(`/roles/${role.id}/permissions`).then((permRes: any) => {
          rolePerms[role.id] = (permRes.permissions || []).map((p: any) => p.id)
        }).catch(() => { rolePerms[role.id] = [] })
      )
      Promise.all(permPromises).then(() => setRolePermissions(rolePerms))
    }).catch(() => {}).finally(() => setLoading(false))
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    const valid = validateForm(roleSchema, { name: roleName })
    if (!valid) return
    try {
      await api.post('/roles', { name: valid.name })
      setShowCreate(false); setRoleName('')
      toast.success(t('roles.allRoles')); loadData()
    } catch (err: any) { toast.error(err.message || t('common.failedToSave')) }
  }

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    const valid = validateForm(roleSchema, { name: roleName })
    if (!valid) return
    try {
      await api.put(`/roles/${editRole!.id}`, { name: valid.name })
      setEditRole(null); setRoleName('')
      toast.success(t('roles.roleSaved')); loadData()
    } catch (err: any) { toast.error(err.message || t('common.failedToSave')) }
  }

  const handleDelete = async (id: number) => {
    if (!confirm(t('roles.deleteConfirm'))) return
    try {
      await api.delete(`/roles/${id}`)
      toast.success(t('roles.roleDeleted')); loadData()
    } catch (err: any) { toast.error(err.message || t('common.failedToDelete')) }
  }

  const handleTogglePermission = async (roleId: number, permId: number, currentlyHas: boolean) => {
    const current = rolePermissions[roleId] || []
    const newPerms = currentlyHas ? current.filter(id => id !== permId) : [...current, permId]
    setRolePermissions(prev => ({ ...prev, [roleId]: newPerms }))
    try {
      await api.put(`/roles/${roleId}/permissions`, { permissionIds: newPerms })
    } catch (err: any) {
      toast.error(err.message || t('common.failedToSave'))
      setRolePermissions(prev => ({ ...prev, [roleId]: current }))
    }
  }

  return (
    <div className="space-y-5 animate-fade-in-up">
      <div className="flex flex-wrap justify-end items-center gap-3">
        {isAdmin && (
          <button onClick={() => { setEditRole(null); setRoleName(''); setShowCreate(true) }} className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white hover:shadow-lg rounded-xl text-sm font-bold transition shadow-lg cursor-pointer border-none flex items-center gap-2">
            <span className="text-lg">+</span> {t('common.add')} {t('roles.title')}
          </button>
        )}
      </div>

      <Tabs
        active={tab}
        onChange={(k) => setTab(k as 'roles' | 'permissions')}
        tabs={[
          { key: 'roles',       label: <span className="inline-flex items-center gap-1.5"><Tag size={14} strokeWidth={2.25} /> {t('roles.title')}</span> },
          { key: 'permissions', label: <span className="inline-flex items-center gap-1.5"><KeyRound size={14} strokeWidth={2.25} /> {t('roles.permissions')}</span> },
        ]}
      />

      {loading ? (
        <PageLoader label={t('common.loading')} size="lg" />
      ) : tab === 'roles' ? (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="bg-indigo-600 hover:bg-indigo-700 px-5 py-4">
            <h3 className="font-bold text-white flex items-center gap-2"><Tag size={16} strokeWidth={2.25} /> {t('roles.allRoles')} <span className="ml-auto bg-white/20 backdrop-blur-sm px-2 py-0.5 rounded-full text-xs">{roles.length}</span></h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[600px]">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wider whitespace-nowrap">{t('roles.roleName')}</th>
                  {isAdmin && <th className="text-left px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wider whitespace-nowrap">{t('common.actions')}</th>}
                </tr>
              </thead>
              <tbody>
                {roles.map((r: any) => (
                  <tr key={r.id} className="border-b border-gray-100 row-hover">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center text-base font-bold shadow`}>
                          <Shield size={16} strokeWidth={2.25} />
                        </div>
                        <div>
                          <div className="font-extrabold text-gray-900">{r.name}</div>
                          <div className="text-xs text-gray-500">Role ID: {r.id}</div>
                        </div>
                      </div>
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3">
                        <div className="flex gap-1.5">
                          <button onClick={() => { setEditRole(r); setRoleName(r.name); setShowCreate(true) }} className="px-3 py-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-800 rounded-lg transition cursor-pointer border-none inline-flex items-center gap-1"><Pencil size={12} strokeWidth={2.25} /> {t('common.edit')}</button>
                          <button onClick={() => handleDelete(r.id)} className="px-3 py-1.5 text-xs font-bold text-red-600 hover:text-red-800 rounded-lg transition cursor-pointer border-none inline-flex items-center gap-1"><Trash2 size={12} strokeWidth={2.25} /> {t('common.delete')}</button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {roles.length === 0 && (
            <div className="p-10 text-center">
              <Tag size={36} strokeWidth={1.75} className="text-gray-300 mx-auto mb-2" />
              <p className="text-gray-400">{t('roles.noRoles')}</p>
            </div>
          )}
        </div>
      ) : (
        <div>
          {roles.map((role: any) => {
            const rolePerms = rolePermissions[role.id] || []
            return (
              <div key={role.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden mb-4">
                <div className={`bg-indigo-600 hover:bg-indigo-700 px-5 py-4`}>
                  <h3 className="font-bold text-white flex items-center gap-2">
                    <Shield size={14} strokeWidth={2.25} /> {role.name}
                    <span className="ml-auto bg-white/20 backdrop-blur-sm px-2.5 py-0.5 rounded-full text-xs">{rolePerms.length} / {permissions.length} {t('roles.permissions')}</span>
                  </h3>
                </div>
                <div className="p-5 bg-white grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
                  {permissions.map((perm: any) => {
                    const has = rolePerms.includes(perm.id)
                    return (
                      <label
                        key={perm.id}
                        className={`flex items-center gap-2.5 py-2 px-3 rounded-xl cursor-pointer text-sm transition border ${
                          has
                            ? 'bg-gray-50 border-gray-200 font-bold shadow-sm'
                            : 'bg-white border-gray-200 hover:border-violet-300 hover:bg-gray-50/30'
                        }`}
                      >
                        <div className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 transition ${has ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : 'bg-gray-100 border-2 border-gray-300'}`}>
                          {has && <Check size={12} strokeWidth={2.5} />}
                        </div>
                        <input
                          type="checkbox"
                          checked={has}
                          onChange={() => isAdmin && handleTogglePermission(role.id, perm.id, has)}
                          disabled={!isAdmin}
                          className="sr-only"
                        />
                        <span className={has ? 'text-gray-600' : 'text-gray-700'}>{perm.name}</span>
                      </label>
                    )
                  })}
                </div>
              </div>
            )
          })}
          {roles.length === 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
              <Shield size={36} strokeWidth={1.75} className="text-gray-300 mx-auto mb-2" />
              <p className="text-gray-400">{t('roles.noRoles')}</p>
            </div>
          )}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl animate-scale-in flex flex-col max-h-[calc(100vh-2rem)]" onClick={e => e.stopPropagation()}>
            <div className="bg-indigo-600 hover:bg-indigo-700 px-6 py-4 rounded-t-3xl shrink-0">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-extrabold text-white flex items-center gap-2">{editRole ? <><Pencil size={18} strokeWidth={2.25} /> {t('common.edit')}</> : <><Plus size={18} strokeWidth={2.25} /> {t('common.add')}</>}</h3>
                <button onClick={() => setShowCreate(false)} className="bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white rounded-lg w-8 h-8 flex items-center justify-center cursor-pointer border-none text-lg leading-none">×</button>
              </div>
            </div>
            <form onSubmit={editRole ? handleEdit : handleCreate} className="flex flex-col flex-1 min-h-0">
              <div className="p-6 bg-white overflow-y-auto  flex-1 min-h-0">
                <div className="mb-4">
                  <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">{t('roles.roleName')} *</label>
                  <input required value={roleName} onChange={e => setRoleName(e.target.value)} className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100" placeholder={t('roles.roleNamePlaceholder')} />
                </div>
              </div>
              <div className="border-t border-gray-100 px-6 py-4 flex flex-wrap justify-end gap-2 bg-gray-50 rounded-b-3xl shrink-0">
                <button type="button" onClick={() => setShowCreate(false)} className="px-5 py-2.5 text-sm font-bold bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-xl transition cursor-pointer border-none">{t('common.cancel')}</button>
                <button type="submit" className="px-5 py-2.5 text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white hover:shadow rounded-xl transition cursor-pointer border-none">{editRole ? t('common.saveChanges') : t('roles.title')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
