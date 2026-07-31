'use client'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { ClipboardList, Clock as ClockIcon, Eye as EyeIcon, FileText, Flower, Inbox, Leaf, Palmtree, Plane, Settings as SettingsIcon, Sun, Umbrella, Waves } from 'lucide-react'
import api from '@/lib/api'
import { showActionToast } from '@/lib/etherealToast'
import { validateForm, leaveApplySchema, leaveTypeSchema } from '@/lib/schemas'
import Tabs from '@/components/Tabs'

function fmtDate(raw: string | null | undefined): string {
  if (!raw) return ''
  const s = String(raw).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [, m, d] = s.split('-')
    return `${d}/${m}/${s.slice(0, 4)}`
  }
  const d = new Date(s)
  if (isNaN(d.getTime())) return s
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

const BALANCE_ICONS: any[] = [Palmtree, Umbrella, Flower, Sun, Leaf, Waves]

export default function LeavesPage() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<'my' | 'all' | 'types'>('my')
  const [leaveTypes, setLeaveTypes] = useState<any[]>([])
  const [myBalances, setMyBalances] = useState<any[]>([])
  const [requests, setRequests] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showApply, setShowApply] = useState(false)
  const [showTypeModal, setShowTypeModal] = useState(false)
  const [editType, setEditType] = useState<any>(null)
  const [viewRequest, setViewRequest] = useState<any>(null)
  const [form, setForm] = useState({ leaveTypeId: '', startDate: '', endDate: '', reason: '' })
  const [typeForm, setTypeForm] = useState({ name: '', accrual_rate: '0', max_allowed: '0', is_paid: false, carry_over_limit: '0', description: '' })
  const user = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('user') || '{}') : {}

  const isManagerOrHR = user.roleName === 'Project Manager' || user.roleName === 'HR Admin' || user.roleName === 'System Admin'
  const isHRAdmin = user.roleName === 'HR Admin' || user.roleName === 'System Admin'

  useEffect(() => { loadData() }, [])

  const loadData = () => {
    setLoading(true)
    Promise.all([api.get('/leaves/types'), api.get('/leaves/balance'), api.get('/leaves')])
      .then(([typesData, balanceData, requestsData]) => {
        setLeaveTypes(typesData.leaveTypes || [])
        setMyBalances(balanceData.balances || [])
        setRequests(requestsData.leaveRequests || [])
      }).catch(() => {}).finally(() => setLoading(false))
  }

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault()
    const valid = validateForm(leaveApplySchema, form)
    if (!valid) return
    try {
      const res = await api.post('/leaves', {
        leaveTypeId: parseInt(valid.leaveTypeId),
        startDate: valid.startDate,
        endDate: valid.endDate,
        reason: valid.reason || '',
      })
      setShowApply(false)
      setForm({ leaveTypeId: '', startDate: '', endDate: '', reason: '' })
      showActionToast(toast, t, res, t('leaves.submitted')); loadData()
    } catch (err: any) { toast.error(err.message || t('common.failedToSave')) }
  }

  const openAddType = () => {
    setEditType(null)
    setTypeForm({ name: '', accrual_rate: '0', max_allowed: '0', is_paid: false, carry_over_limit: '0', description: '' })
    setShowTypeModal(true)
  }
  const openEditType = (lt: any) => {
    setEditType(lt)
    setTypeForm({
      name: lt.name || '', accrual_rate: String(lt.accrual_rate || '0'),
      max_allowed: String(lt.max_allowed || '0'), is_paid: Boolean(lt.is_paid),
      carry_over_limit: String(lt.carry_over_limit || '0'), description: lt.description || ''
    })
    setShowTypeModal(true)
  }

  const handleTypeSave = async (e: React.FormEvent) => {
    e.preventDefault()
    const valid = validateForm(leaveTypeSchema, typeForm)
    if (!valid) return
    try {
      const payload = {
        name: valid.name,
        accrual_rate: valid.accrual_rate,
        max_allowed: valid.max_allowed,
        is_paid: valid.is_paid,
        carry_over_limit: valid.carry_over_limit,
        description: valid.description || ''
      }
      if (editType) {
        await api.put(`/leaves/types/${editType.id}`, payload); toast.success(t('leaves.submitted'))
      } else {
        await api.post('/leaves/types', payload); toast.success(t('leaves.submitted'))
      }
      setShowTypeModal(false); loadData()
    } catch (err: any) { toast.error(err.message || t('common.failedToSave')) }
  }

  const handleDeleteType = async (id: number) => {
    if (!confirm(t('leaves.approveConfirm'))) return
    try {
      await api.delete(`/leaves/types/${id}`); toast.success(t('common.deletedSuccessfully')); loadData()
    } catch (err: any) { toast.error(err.message || t('common.failedToDelete')) }
  }

  const handleApprove = async (id: number, action: 'approved' | 'rejected') => {
    try {
      const res = await api.put(`/leaves/${id}/approve`, { action })
      showActionToast(toast, t, res, t(action === 'approved' ? 'leaves.approve' : 'leaves.reject')); loadData()
      // Keep the modal in sync if it's open on this request
      setViewRequest((prev: any) => (prev && prev.id === id ? { ...prev, status: action, approved_date: new Date().toISOString() } : prev))
    } catch (err: any) { toast.error(err.message || t('common.failedToSave')) }
  }

  const handleCancel = async (id: number) => {
    if (!confirm(t('leaves.cancelConfirm'))) return
    try {
      const res = await api.put(`/leaves/${id}/cancel`)
      showActionToast(toast, t, res, t('leaves.cancelled')); loadData()
      setViewRequest((prev: any) => (prev && prev.id === id ? { ...prev, status: 'cancelled' } : prev))
    } catch (err: any) { toast.error(err.message || t('common.failedToSave')) }
  }

  const statusKey = (s: string) => `leaves.${s}`
  const statusClass = (s: string) =>
    s === 'approved' ? 'bg-gray-50 text-emerald-700 border border-emerald-200'
    : s === 'rejected' ? 'bg-red-50 text-red-700 border border-red-200'
    : 'bg-gray-50 text-amber-700 border border-amber-200'

  return (
    <div className="space-y-5 animate-fade-in-up">
      {/* Page header */}
      <div className="flex flex-wrap justify-end items-center gap-3">
        <button onClick={() => setShowApply(true)} className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition cursor-pointer border-none flex items-center gap-2">
          <Plane size={14} strokeWidth={2.25} /> {t('leaves.applyLeave')}
        </button>
      </div>

      {/* Tabs */}
      <Tabs
        active={tab}
        onChange={(k) => setTab(k as 'my' | 'all' | 'types')}
        tabs={[
          { key: 'my',    label: t('leaves.myLeaves') },
          { key: 'all',   label: t('leaves.allRequests'), show: isManagerOrHR },
          { key: 'types', label: t('leaves.balance'),     show: isHRAdmin },
        ]}
      />

      {tab === 'my' && (
        <div className="space-y-5">
          {/* Balance cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {myBalances.length === 0 && !loading && (
              <div className="col-span-full bg-white rounded-xl border border-gray-200 p-10 text-center">
                <Palmtree size={48} strokeWidth={1.75} className="text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">{t('dashboard.noLeaveBalances')}</p>
              </div>
            )}
            {myBalances.map((b: any, i: number) => {
              const pct = Math.min(100, (parseFloat(b.current_balance) / b.max_allowed) * 100)
              const Icon = BALANCE_ICONS[i % BALANCE_ICONS.length]
              return (
                <div key={b.id} className="bg-white rounded-xl border border-gray-200 p-5 cursor-pointer card-hover">
                  <div className="w-11 h-11 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center mb-3"><Icon size={22} strokeWidth={2.25} /></div>
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{b.leave_type_name}</div>
                  <div className="flex items-baseline gap-1.5">
                    <div className="text-3xl font-bold text-indigo-600">{b.current_balance}</div>
                    <div className="text-xs text-gray-400 font-medium">/ {b.max_allowed} {t('leaves.days')}</div>
                  </div>
                  <div className="bg-gray-100 rounded-full h-2 mt-3 overflow-hidden">
                    <div className="h-full rounded-full bg-indigo-600" style={{ width: `${pct}%` }}></div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* My leaves table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2"><FileText size={14} strokeWidth={2.25} /> {t('leaves.myLeaves')}</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse min-w-[600px]">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">{t('leaves.leaveType')}</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">{t('leaves.startDate')}</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">{t('leaves.endDate')}</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">{t('leaves.reason')}</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">{t('common.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.filter((r: any) => r.user_id === user.id).map((r: any, i: number) => (
                    <tr key={r.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition">
                      <td className="px-4 py-3 text-sm font-semibold text-gray-800">{r.leave_type_name}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{fmtDate(r.start_date)}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{fmtDate(r.end_date)}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{r.reason || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(r.status)}`}>
                          {t(statusKey(r.status))}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {requests.filter((r: any) => r.user_id === user.id).length === 0 && (
              <div className="p-10 text-center">
                <Inbox size={32} strokeWidth={1.75} className="text-gray-300 mx-auto mb-2" />
                <p className="text-gray-400 text-sm">{t('leaves.noLeaves')}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'all' && isManagerOrHR && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 flex items-center gap-2">
            <ClockIcon size={20} strokeWidth={2.25} className="text-gray-700" />
            <h3 className="font-semibold text-gray-900">{t('leaves.allRequests')}</h3>
            <span className="ml-auto text-xs text-gray-500 bg-gray-100 px-2.5 py-0.5 rounded-full font-semibold">{requests.length}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[700px]">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">{t('employees.firstName')}</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">{t('leaves.leaveType')}</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">{t('leaves.fromDate')}</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">{t('leaves.toDate')}</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">{t('leaves.reason')}</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">{t('common.status')}</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r: any) => (
                  <tr key={r.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold shrink-0">
                          {r.first_name?.[0]}{r.last_name?.[0]}
                        </div>
                        <span className="text-sm font-semibold text-gray-800">{r.first_name} {r.last_name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-gray-800">{r.leave_type_name}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{fmtDate(r.start_date)}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{fmtDate(r.end_date)}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{r.reason || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(r.status)}`}>
                        {t(statusKey(r.status))}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-3 text-sm font-medium items-center">
                        <button
                          onClick={() => setViewRequest(r)}
                          title={t('leaves.viewDetails')}
                          className="text-indigo-600 hover:text-indigo-800 cursor-pointer border-none bg-transparent p-0 flex items-center gap-1"
                        >
                          <EyeIcon size={12} strokeWidth={2.25} /> {t('leaves.view')}
                        </button>
                        {r.status === 'pending' && (
                          <>
                            <span className="text-gray-300">|</span>
                            <button onClick={() => handleApprove(r.id, 'approved')} className="text-indigo-600 hover:text-indigo-800 cursor-pointer border-none bg-transparent p-0">{t('leaves.approve')}</button>
                            <span className="text-gray-300">|</span>
                            <button onClick={() => handleApprove(r.id, 'rejected')} className="text-red-600 hover:text-red-800 cursor-pointer border-none bg-transparent p-0">{t('leaves.reject')}</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {requests.length === 0 && (
            <div className="p-10 text-center">
              <ClipboardList size={32} strokeWidth={1.75} className="text-gray-300 mx-auto mb-2" />
              <p className="text-gray-400 text-sm">{t('leaves.noLeaves')}</p>
            </div>
          )}
        </div>
      )}

      {tab === 'types' && isHRAdmin && (
        <div>
          <div className="flex justify-end">
            <button onClick={openAddType} className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition cursor-pointer border-none flex items-center gap-2">
              <span>+</span> {t('common.add')} {t('leaves.leaveType')}
            </button>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mt-4">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center gap-2">
              <SettingsIcon size={20} strokeWidth={2.25} className="text-gray-700" />
              <h3 className="font-semibold text-gray-900">{t('leaves.title')}</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse min-w-[700px]">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">{t('common.name')}</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">{t('leaves.accrualRate')}</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">{t('leaves.maxAllowed')}</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">{t('leaves.isPaid')}</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">{t('leaves.carryOver')}</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">{t('common.description')}</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {leaveTypes.map((lt: any) => (
                    <tr key={lt.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition">
                      <td className="px-4 py-3 text-sm font-bold text-gray-900">{lt.name}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{lt.accrual_rate} {t('leaves.perMonth')}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-gray-700">{lt.max_allowed} {t('leaves.days')}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${lt.is_paid ? 'bg-gray-50 text-emerald-700 border border-emerald-200' : 'bg-gray-100 text-gray-700 border border-gray-200'}`}>
                          {lt.is_paid ? t('common.yes') : t('common.no')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">{lt.carry_over_limit} {t('leaves.days')}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{lt.description || '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-4 text-sm font-medium">
                          <button onClick={() => openEditType(lt)} className="text-indigo-600 hover:text-indigo-800 cursor-pointer border-none bg-transparent p-0">{t('common.edit')}</button>
                          <button onClick={() => handleDeleteType(lt.id)} className="text-red-600 hover:text-red-800 cursor-pointer border-none bg-transparent p-0">{t('common.delete')}</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {leaveTypes.length === 0 && (
              <div className="p-10 text-center">
                <SettingsIcon size={32} strokeWidth={1.75} className="text-gray-300 mx-auto mb-2" />
                <p className="text-gray-400 text-sm">{t('leaves.noLeaves')}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Apply modal */}
      {showApply && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowApply(false)}>
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl flex flex-col max-h-[calc(100vh-2rem)]" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center shrink-0">
              <h3 className="text-base font-semibold text-gray-900">{t('leaves.applyLeave')}</h3>
              <button onClick={() => setShowApply(false)} className="bg-transparent border-none text-gray-400 hover:text-gray-700 cursor-pointer text-lg leading-none">×</button>
            </div>
            <form onSubmit={handleApply} className="flex flex-col flex-1 min-h-0">
              <div className="p-6 overflow-y-auto  flex-1 min-h-0">
                <div className="mb-4">
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">{t('leaves.leaveType')}</label>
                  <select required value={form.leaveTypeId} onChange={e => setForm({ ...form, leaveTypeId: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500">
                    <option value="">{t('leaves.selectLeaveType')}</option>
                    {leaveTypes.map((lt: any) => <option key={lt.id} value={lt.id}>{lt.name} ({lt.max_allowed} {t('leaves.days')})</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">{t('leaves.startDate')}</label>
                    <input type="date" required value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">{t('leaves.endDate')}</label>
                    <input type="date" required value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                  </div>
                </div>
                <div className="mt-4">
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">{t('leaves.reason')}</label>
                  <textarea value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-y min-h-[80px]" placeholder={t('leaves.reasonPlaceholder')} />
                </div>
              </div>
              <div className="border-t border-gray-200 px-6 py-4 flex flex-wrap justify-end gap-2 bg-gray-50 shrink-0">
                <button type="button" onClick={() => setShowApply(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg transition cursor-pointer">{t('common.cancel')}</button>
                <button type="submit" className="px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition cursor-pointer border-none">{t('leaves.submitLeave')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View request modal */}
      {viewRequest && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setViewRequest(null)}>
          <div className="bg-white rounded-xl w-full max-w-lg shadow-xl flex flex-col max-h-[calc(100vh-2rem)]" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center shrink-0">
              <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                <ClipboardList size={14} strokeWidth={2.25} /> {t('leaves.requestDetails')}
              </h3>
              <button onClick={() => setViewRequest(null)} className="bg-transparent border-none text-gray-400 hover:text-gray-700 cursor-pointer text-lg leading-none">×</button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto  flex-1 min-h-0">
              {/* Employee */}
              <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
                <div className="w-12 h-12 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-base font-bold shrink-0">
                  {viewRequest.first_name?.[0]}{viewRequest.last_name?.[0]}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-gray-900 truncate">{viewRequest.first_name} {viewRequest.last_name}</div>
                  <div className="text-xs text-gray-500 truncate">{viewRequest.email}</div>
                </div>
                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold shrink-0 ${statusClass(viewRequest.status)}`}>
                  {t(statusKey(viewRequest.status))}
                </span>
              </div>

              {/* Details grid */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">{t('leaves.leaveType')}</div>
                  <div className="text-sm font-semibold text-gray-900">{viewRequest.leave_type_name}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">{t('leaves.daysField')}</div>
                  <div className="text-sm font-semibold text-gray-900">
                    {(() => {
                      const s = new Date(viewRequest.start_date).getTime()
                      const e = new Date(viewRequest.end_date).getTime()
                      if (isNaN(s) || isNaN(e)) return '—'
                      return Math.max(1, Math.ceil((e - s) / (1000 * 60 * 60 * 24)) + 1) + ' ' + t('leaves.days')
                    })()}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">{t('leaves.fromDate')}</div>
                  <div className="text-sm font-semibold text-gray-900">{fmtDate(viewRequest.start_date)}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">{t('leaves.toDate')}</div>
                  <div className="text-sm font-semibold text-gray-900">{fmtDate(viewRequest.end_date)}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">{t('leaves.appliedOn')}</div>
                  <div className="text-sm font-semibold text-gray-900">{fmtDate(viewRequest.created_at)}</div>
                </div>
                {viewRequest.approved_date && (
                  <div>
                    <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">{t('leaves.approvedOn')}</div>
                    <div className="text-sm font-semibold text-gray-900">{fmtDate(viewRequest.approved_date)}</div>
                  </div>
                )}
              </div>

              {/* Reason */}
              <div>
                <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">{t('leaves.reason')}</div>
                <div className="text-sm text-gray-800 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 min-h-[40px]">
                  {viewRequest.reason || '—'}
                </div>
              </div>

              {/* Rejection reason */}
              {viewRequest.status === 'rejected' && viewRequest.rejection_reason && (
                <div>
                  <div className="text-[10px] font-bold text-red-600 uppercase tracking-wider mb-1">{t('leaves.rejectionReason')}</div>
                  <div className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    {viewRequest.rejection_reason}
                  </div>
                </div>
              )}

              {/* Approver */}
              {viewRequest.approver_first_name && (
                <div className="text-xs text-gray-500">
                  {t('leaves.approvedBy')}: <span className="font-semibold text-gray-700">{viewRequest.approver_first_name} {viewRequest.approver_last_name}</span>
                </div>
              )}

              {/* Attachment */}
              {viewRequest.attachment_url && (
                <div>
                  <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">{t('leaves.attachmentLabel')}</div>
                  <a href={viewRequest.attachment_url} target="_blank" rel="noopener noreferrer" className="text-sm text-indigo-600 hover:text-indigo-800 underline">
                    {viewRequest.attachment_url}
                  </a>
                </div>
              )}
            </div>

            {/* Footer with actions */}
            <div className="border-t border-gray-200 px-6 py-4 flex flex-wrap justify-end gap-2 bg-gray-50 shrink-0">
              {viewRequest.status === 'pending' && (
                <>
                  <button
                    onClick={() => handleApprove(viewRequest.id, 'rejected')}
                    className="px-4 py-2 text-sm font-medium text-red-700 bg-white border border-red-300 hover:bg-red-50 rounded-lg transition cursor-pointer"
                  >
                    {t('leaves.reject')}
                  </button>
                  <button
                    onClick={() => handleApprove(viewRequest.id, 'approved')}
                    className="px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition cursor-pointer border-none"
                  >
                    {t('leaves.approve')}
                  </button>
                </>
              )}
              {isHRAdmin && viewRequest.status !== 'cancelled' && (
                <button
                  onClick={() => handleCancel(viewRequest.id)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg transition cursor-pointer"
                >
                  {t('leaves.cancelLeave')}
                </button>
              )}
              <button
                onClick={() => setViewRequest(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg transition cursor-pointer"
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Type modal */}
      {showTypeModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowTypeModal(false)}>
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl flex flex-col max-h-[calc(100vh-2rem)]" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center shrink-0">
              <h3 className="text-base font-semibold text-gray-900">{editType ? t('common.edit') : t('common.add')}</h3>
              <button onClick={() => setShowTypeModal(false)} className="bg-transparent border-none text-gray-400 hover:text-gray-700 cursor-pointer text-lg leading-none">×</button>
            </div>
            <form onSubmit={handleTypeSave} className="flex flex-col flex-1 min-h-0">
              <div className="p-6 overflow-y-auto  flex-1 min-h-0">
                <div className="mb-4">
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">{t('common.name')} *</label>
                  <input required value={typeForm.name} onChange={e => setTypeForm({ ...typeForm, name: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" placeholder={t('leaves.typePlaceholder')} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">{t('leaves.accrualRate')}</label>
                    <input type="number" min="0" step="0.5" value={typeForm.accrual_rate} onChange={e => setTypeForm({ ...typeForm, accrual_rate: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">{t('leaves.maxAllowed')}</label>
                    <input type="number" min="0" value={typeForm.max_allowed} onChange={e => setTypeForm({ ...typeForm, max_allowed: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">{t('leaves.carryOver')}</label>
                    <input type="number" min="0" value={typeForm.carry_over_limit} onChange={e => setTypeForm({ ...typeForm, carry_over_limit: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide flex items-center gap-2">
                      <input type="checkbox" checked={typeForm.is_paid} onChange={e => setTypeForm({ ...typeForm, is_paid: e.target.checked })} className="w-4 h-4 accent-indigo-600" />
                      {t('leaves.isPaid')}
                    </label>
                  </div>
                </div>
                <div className="mt-3">
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">{t('common.description')}</label>
                  <textarea value={typeForm.description} onChange={e => setTypeForm({ ...typeForm, description: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-y min-h-[80px]" placeholder={t('common.description')} />
                </div>
              </div>
              <div className="border-t border-gray-200 px-6 py-4 flex flex-wrap justify-end gap-2 bg-gray-50 shrink-0">
                <button type="button" onClick={() => setShowTypeModal(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg transition cursor-pointer">{t('common.cancel')}</button>
                <button type="submit" className="px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition cursor-pointer border-none">{editType ? t('common.saveChanges') : t('common.add')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}