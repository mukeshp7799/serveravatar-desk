'use client'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { KeyRound, Lock, Save, User } from 'lucide-react'
import api from '@/lib/api'
import { validateForm, profileSchema, passwordChangeSchema } from '@/lib/schemas'
import Tabs from '@/components/Tabs'

export default function SettingsPage() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<'profile' | 'password'>('profile')
  const [profile, setProfile] = useState({ firstName: '', lastName: '', phone: '', address: '' })
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [loading, setLoading] = useState(false)
  const user = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('user') || '{}') : {}

  useEffect(() => {
    if (user.id) {
      api.get(`/users/${user.id}`).then(res => {
        const u = res.user
        setProfile({
          firstName: u.first_name || '',
          lastName: u.last_name || '',
          phone: u.phone || '',
          address: u.address || '',
        })
      }).catch(() => {})
    }
  }, [user.id])

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    const valid = validateForm(profileSchema, profile)
    if (!valid) return
    setLoading(true)
    try {
      await api.put(`/users/${user.id}`, {
        firstName: valid.firstName, lastName: valid.lastName,
        phone: valid.phone || null, address: valid.address || null,
      })
      const updatedUser = { ...user, firstName: valid.firstName, lastName: valid.lastName }
      localStorage.setItem('user', JSON.stringify(updatedUser))
      toast.success(t('settings.profileUpdatedSuccess'))
    } catch (err: any) {
      toast.error(err.message || t('common.failedToSave'))
    } finally {
      setLoading(false)
    }
  }

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    const valid = validateForm(passwordChangeSchema, passwordForm)
    if (!valid) return
    setLoading(true)
    try {
      await api.post('/auth/change-password', {
        currentPassword: valid.currentPassword, newPassword: valid.newPassword,
      })
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
      toast.success(t('settings.passwordChanged'))
    } catch (err: any) {
      toast.error(err.message || t('common.failedToSave'))
    } finally { setLoading(false) }
  }

  const initials = `${profile.firstName?.[0] || ''}${profile.lastName?.[0] || ''}`.toUpperCase()

  return (
    <div className="space-y-5 animate-fade-in-up">
      <Tabs
        active={tab}
        onChange={(k) => { setTab(k as 'profile' | 'password') }}
        tabs={[
          { key: 'profile',  label: <span className="inline-flex items-center gap-1.5"><User size={14} strokeWidth={2.25} /> {t('settings.profile')}</span> },
          { key: 'password', label: <span className="inline-flex items-center gap-1.5"><Lock size={14} strokeWidth={2.25} /> {t('settings.changePassword')}</span> },
        ]}
      />

      {tab === 'profile' && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden max-w-2xl">
          <div className="bg-indigo-600 hover:bg-indigo-700 px-5 py-4">
            <h3 className="font-bold text-white flex items-center gap-2"><User size={18} strokeWidth={2.25} /> {t('settings.myProfile')}</h3>
          </div>
          <div className="p-6 bg-white">
            <div className="flex items-center gap-4 mb-6 p-4 bg-gray-50 rounded-xl border border-gray-200">
              <div className="w-16 h-16 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center text-xl font-extrabold shadow">
                {initials || <User size={20} strokeWidth={2.25} className="text-white/80" />}
              </div>
              <div className="flex-1">
                <div className="font-extrabold text-base text-gray-900">{profile.firstName} {profile.lastName}</div>
                <div className="text-sm text-gray-500">{user.email}</div>
                <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 mt-1.5 uppercase tracking-wider">
                  {user.roleName}
                </span>
              </div>
            </div>
            <form onSubmit={handleProfileUpdate}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">{t('auth.register.firstName')}</label>
                  <input value={profile.firstName} onChange={e => setProfile({ ...profile, firstName: e.target.value })} required className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">{t('auth.register.lastName')}</label>
                  <input value={profile.lastName} onChange={e => setProfile({ ...profile, lastName: e.target.value })} required className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100" />
                </div>
              </div>
              <div className="mt-3">
                <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">{t('settings.phone')}</label>
                <input type="tel" value={profile.phone} onChange={e => setProfile({ ...profile, phone: e.target.value })} className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100" placeholder="+91..." />
              </div>
              <div className="mt-3">
                <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">{t('settings.address')}</label>
                <textarea value={profile.address} onChange={e => setProfile({ ...profile, address: e.target.value })} rows={3} className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 resize-y min-h-[80px]" placeholder={t('settings.addressPlaceholder')} />
              </div>
              <button type="submit" disabled={loading} className="mt-5 px-5 py-2.5 text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white hover:shadow rounded-xl transition cursor-pointer border-none disabled:opacity-50 inline-flex items-center gap-1.5">
                {loading ? <>{t('common.saving')}</> : <><Save size={14} strokeWidth={2.25} /> {t('settings.save')}</>}
              </button>
            </form>
          </div>
        </div>
      )}

      {tab === 'password' && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden max-w-lg">
          <div className="bg-indigo-600 hover:bg-indigo-700 px-5 py-4">
            <h3 className="font-bold text-white flex items-center gap-2"><Lock size={18} strokeWidth={2.25} /> {t('settings.changePassword')}</h3>
          </div>
          <div className="p-6 bg-white">
            <form onSubmit={handlePasswordChange}>
              <div className="mb-4">
                <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">{t('settings.currentPassword')}</label>
                <input type="password" required value={passwordForm.currentPassword} onChange={e => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })} className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-rose-500 focus:ring-4 focus:ring-rose-100" />
              </div>
              <div className="mb-4">
                <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">{t('settings.newPassword')}</label>
                <input type="password" required minLength={6} value={passwordForm.newPassword} onChange={e => setPasswordForm({ ...passwordForm, newPassword: e.target.value })} className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-rose-500 focus:ring-4 focus:ring-rose-100" />
              </div>
              <div className="mb-4">
                <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">{t('auth.register.confirmPassword')}</label>
                <input type="password" required minLength={6} value={passwordForm.confirmPassword} onChange={e => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })} className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-rose-500 focus:ring-4 focus:ring-rose-100" />
              </div>
              <button type="submit" disabled={loading} className="px-5 py-2.5 text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white hover:shadow rounded-xl transition cursor-pointer border-none disabled:opacity-50 inline-flex items-center gap-1.5">
                {loading ? <>{t('common.loading')}</> : <><KeyRound size={14} strokeWidth={2.25} /> {t('settings.changePassword')}</>}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
