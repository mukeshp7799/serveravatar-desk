'use client'
import PageLoader from '@/components/PageLoader'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import api from '@/lib/api'
import { validateForm, employeeSchema, employeeCreateSchema } from '@/lib/schemas'

export default function EmployeesPage() {
  const { t } = useTranslation()
  const [employees, setEmployees] = useState<any[]>([])
  const [departments, setDepartments] = useState<any[]>([])
  const [designations, setDesignations] = useState<any[]>([])
  const [roles, setRoles] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [filterDept, setFilterDept] = useState('')
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editEmployee, setEditEmployee] = useState<any>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const [deleteSuccess, setDeleteSuccess] = useState('')
  const [formError, setFormError] = useState('')
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', password: '',
    employeeId: '', departmentId: '', designationId: '', managerId: '',
    roleId: '', hireDate: '', status: 'active'
  })

  const user = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('user') || '{}') : {}
  const canManage = user.roleName === 'HR Admin' || user.roleName === 'System Admin'

  useEffect(() => {
    Promise.all([
      api.get('/users'), api.get('/departments'), api.get('/designations'), api.get('/roles'),
    ]).then(([usersData, deptsData, desigsData, rolesData]) => {
      setEmployees(usersData.users || [])
      setDepartments(deptsData.departments || [])
      setDesignations(desigsData.designations || [])
      setRoles(rolesData.roles || [])
    }).catch(console.error).finally(() => setLoading(false))
  }, [])

  const filtered = employees.filter((e: any) => {
    if (search && !`${e.first_name} ${e.last_name} ${e.email}`.toLowerCase().includes(search.toLowerCase())) return false
    if (filterDept && e.department_id != filterDept) return false
    return true
  })

  const openCreate = () => {
    setEditEmployee(null)
    setForm({ firstName: '', lastName: '', email: '', password: '', employeeId: '', departmentId: '', designationId: '', managerId: '', roleId: '', hireDate: '', status: 'active' })
    setFormError(''); setShowModal(true)
  }

  const openEdit = (e: any) => {
    setEditEmployee(e)
    setForm({
      firstName: e.first_name || '', lastName: e.last_name || '',
      email: e.email || '', password: '',
      // API returns *_id as numbers but the zod schema expects strings (with
      // optional .optional() — undefined ≠ missing). Coerce explicitly so
      // null IDs become '' (not the number 0) and existing IDs become
      // stringified numbers that parseInt() can round-trip in handleSave.
      employeeId: e.employee_id == null ? '' : String(e.employee_id),
      departmentId: e.department_id == null ? '' : String(e.department_id),
      designationId: e.designation_id == null ? '' : String(e.designation_id),
      managerId: e.reporting_manager_id == null ? '' : String(e.reporting_manager_id),
      roleId: e.role_id == null ? '' : String(e.role_id),
      hireDate: e.hire_date || '', status: e.status || 'active'
    })
    setFormError(''); setShowModal(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault(); setFormError('')
    const valid = validateForm(editEmployee ? employeeSchema : employeeCreateSchema, form)
    if (!valid) return
    try {
      if (editEmployee) {
        await api.put(`/users/${editEmployee.id}`, {
          firstName: valid.firstName, lastName: valid.lastName, phone: '', address: '',
          dateOfBirth: '', emergencyContactName: '', emergencyContactPhone: '',
          departmentId: valid.departmentId ? parseInt(valid.departmentId) : null,
          designationId: valid.designationId ? parseInt(valid.designationId) : null,
          managerId: valid.managerId ? parseInt(valid.managerId) : null,
          roleId: valid.roleId ? parseInt(valid.roleId) : null,
          status: valid.status || 'active'
        })
      } else {
        await api.post('/auth/register', {
          email: valid.email, password: valid.password,
          firstName: valid.firstName, lastName: valid.lastName,
          employeeId: valid.employeeId,
          departmentId: valid.departmentId ? parseInt(valid.departmentId) : null,
          designationId: valid.designationId ? parseInt(valid.designationId) : null,
          managerId: valid.managerId ? parseInt(valid.managerId) : null,
          roleId: valid.roleId ? parseInt(valid.roleId) : 1,
          hireDate: valid.hireDate || null
        })
      }
      setShowModal(false)
      const res = await api.get('/users'); setEmployees(res.users || [])
    } catch (err: any) { setFormError(err.message || t('employees.failedToSave')) }
  }

  const handleDelete = async (id: number) => {
    setDeleteId(id); setDeleteError(''); setDeleteSuccess('')
    try {
      await api.delete(`/users/${id}`)
      setDeleteSuccess('✅ ' + t('employees.deletedSuccess'))
      setDeleteId(null)
      const res = await api.get('/users'); setEmployees(res.users || [])
      setTimeout(() => setDeleteSuccess(''), 3000)
    } catch (err: any) {
      setDeleteError(err.message || t('employees.failedToDelete'))
      setDeleteId(null); setTimeout(() => setDeleteError(''), 5000)
    }
  }

  return (
    <div className="space-y-5 animate-fade-in-up">
      <div className="flex flex-wrap justify-end items-center gap-3">
        <button onClick={openCreate} className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white hover:shadow-lg rounded-xl text-sm font-bold transition shadow-lg cursor-pointer border-none flex items-center gap-2">
          <span className="text-lg">+</span> {t('employees.addEmployee')}
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
          <input
            type="text"
            className="w-full border-2 border-gray-200 rounded-xl pl-10 pr-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition"
            placeholder={t('employees.searchPlaceholder')}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          className="border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 min-w-[180px]"
          value={filterDept}
          onChange={e => setFilterDept(e.target.value)}
        >
          <option value="">{t('common.allDepartments')}</option>
          {departments.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        {(search || filterDept) && (
          <button
            onClick={() => { setSearch(''); setFilterDept('') }}
            className="px-3 py-2.5 text-sm font-semibold text-gray-600 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 rounded-xl transition"
          >
            ✕ {t('employees.clearFilters')}
          </button>
        )}
      </div>

      {deleteError && (
        <div className="bg-red-50 border border-red-200 text-rose-700 p-3 rounded-xl text-sm flex items-center gap-2">
          <span>⚠️</span> {deleteError}
        </div>
      )}
      {deleteSuccess && (
        <div className="bg-gray-50 border border-emerald-200 text-emerald-700 p-3 rounded-xl text-sm flex items-center gap-2">
          <span>✅</span> {deleteSuccess}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {loading ? (
          <PageLoader label={t('common.loading')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[640px]">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-700 uppercase tracking-wider whitespace-nowrap">{t('employees.cols.name')}</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-700 uppercase tracking-wider whitespace-nowrap">{t('employees.cols.id')}</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-700 uppercase tracking-wider whitespace-nowrap">{t('employees.cols.dept')}</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-700 uppercase tracking-wider whitespace-nowrap">{t('employees.cols.desig')}</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-700 uppercase tracking-wider whitespace-nowrap">{t('employees.cols.mgr')}</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-700 uppercase tracking-wider whitespace-nowrap">{t('employees.cols.status')}</th>
                  {canManage && <th className="text-left px-4 py-3 text-xs font-bold text-gray-700 uppercase tracking-wider whitespace-nowrap">{t('employees.cols.actions')}</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((e: any, i: number) => (
                  <tr key={e.id} className={`border-b border-gray-100 hover:bg-gray-50 transition ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center text-sm font-bold shrink-0 shadow">
                          {e.first_name?.[0]}{e.last_name?.[0]}
                        </div>
                        <div>
                          <div className="font-bold text-gray-900">{e.first_name} {e.last_name}</div>
                          <div className="text-xs text-gray-500">{e.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm font-mono text-gray-700">{e.employee_id || '—'}</td>
                    <td className="px-4 py-3 text-sm">
                      {e.department_name ? <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 px-2.5 py-1 rounded-full text-xs font-bold">{e.department_name}</span> : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">{e.designation_name || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{e.manager_first_name ? `${e.manager_first_name} ${e.manager_last_name}` : '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ${e.status === 'active' ? 'bg-gray-50 text-emerald-700 border border-emerald-200' : 'bg-indigo-50 text-indigo-700 border border-indigo-200'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${e.status === 'active' ? 'bg-gray-500' : 'bg-gray-400'}`}></span>
                        {e.status === 'active' ? t('employees.active') : t('employees.inactive')}
                      </span>
                    </td>
                    {canManage && (
                      <td className="px-4 py-3">
                        <div className="flex gap-1.5">
                          <button onClick={() => openEdit(e)} title={t('common.edit')} className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200 cursor-pointer border-none text-sm font-bold transition">✏️</button>
                          <button onClick={() => handleDelete(e.id)} title={t('common.delete')} className="w-8 h-8 rounded-lg text-red-600 hover:text-red-800 cursor-pointer border-none text-sm font-bold transition">🗑️</button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="p-12 text-center">
            <div className="text-5xl mb-3">👤</div>
            <p className="text-gray-500 font-semibold">{t('employees.noEmployees')}</p>
            <p className="text-gray-400 text-sm mt-1">{t('employees.tryAdjustingFilters')}</p>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-3xl w-full max-w-xl shadow-2xl animate-scale-in flex flex-col max-h-[calc(100vh-2rem)]" onClick={e => e.stopPropagation()}>
            <div className={`border-b border-gray-200 px-6 py-4 bg-white shrink-0`}>
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-extrabold text-gray-900">{editEmployee ? `✏️ ${t('employees.editEmployee')}` : `➕ ${t('employees.addNewEmployee')}`}</h3>
                <button onClick={() => setShowModal(false)} className="bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg w-8 h-8 flex items-center justify-center cursor-pointer border-none text-lg leading-none">×</button>
              </div>
            </div>
            <form onSubmit={handleSave} className="flex flex-col flex-1 min-h-0">
              <div className="p-6 bg-white overflow-y-auto  flex-1 min-h-0">
                {formError && (
                  <div className="bg-red-50 border border-red-200 text-rose-700 p-3 rounded-xl mb-4 text-sm flex items-center gap-2">
                    <span>⚠️</span> {formError}
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">{t('employees.firstName')} *</label>
                    <input className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" required value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">{t('employees.lastName')} *</label>
                    <input className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" required value={form.lastName} onChange={e => setForm({ ...form, lastName: e.target.value })} />
                  </div>
                </div>
                <div className="mt-3">
                  <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">{t('auth.register.email')} *</label>
                  <input type="email" className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                </div>
                {!editEmployee && (
                  <div className="mt-3">
                    <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">{t('auth.register.password')} *</label>
                    <input type="password" className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" required value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder={t('employees.passwordPlaceholder')} />
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">{t('employees.employeeId')}</label>
                    <input className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" value={form.employeeId} onChange={e => setForm({ ...form, employeeId: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">{t('employees.hireDate')}</label>
                    <input type="date" className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" value={form.hireDate} onChange={e => setForm({ ...form, hireDate: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">{t('employees.department')}</label>
                    <select className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" value={form.departmentId} onChange={e => setForm({ ...form, departmentId: e.target.value })}>
                      <option value="">{t('employees.selectDepartment')}</option>
                      {departments.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">{t('employees.designation')}</label>
                    <select className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" value={form.designationId} onChange={e => setForm({ ...form, designationId: e.target.value })}>
                      <option value="">{t('employees.selectDesignation')}</option>
                      {designations.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">{t('employees.manager')}</label>
                    <select className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" value={form.managerId} onChange={e => setForm({ ...form, managerId: e.target.value })}>
                      <option value="">{t('employees.selectManager')}</option>
                      {employees.filter((e: any) => e.id !== editEmployee?.id).map((e: any) => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">{t('employees.role')}</label>
                    <select className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" value={form.roleId} onChange={e => setForm({ ...form, roleId: e.target.value })}>
                      <option value="">{t('employees.selectRole')}</option>
                      {roles.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="mt-3">
                  <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">{t('employees.status')}</label>
                  <select className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                    <option value="active">{t('employees.active')}</option>
                    <option value="inactive">{t('employees.inactive')}</option>
                  </select>
                </div>
              </div>
              <div className="border-t border-gray-100 px-6 py-4 flex flex-wrap justify-end gap-2 bg-gray-50 rounded-b-3xl shrink-0">
                <button type="button" onClick={() => setShowModal(false)} className="px-5 py-2.5 text-sm font-bold bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-xl transition cursor-pointer border-none">{t('employees.cancel')}</button>
                <button type="submit" className="px-5 py-2.5 text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white hover:rounded-xl transition cursor-pointer border-none">{editEmployee ? t('employees.save') : t('employees.add')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
