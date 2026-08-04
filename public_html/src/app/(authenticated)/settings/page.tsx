'use client'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { KeyRound, Lock, Save, User } from 'lucide-react'
import api from '@/lib/api'
import { profileSchema, passwordChangeSchema, type ProfileInput, type PasswordChangeInput } from '@/lib/schemas'
import Tabs from '@/components/Tabs'

export default function SettingsPage() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<'profile' | 'password'>('profile')
  const {
    register: registerProfile,
    handleSubmit: handleProfileSubmit,
    reset: resetProfile,
    formState: { errors: profileErrors },
  } = useForm<ProfileInput>({ resolver: zodResolver(profileSchema), mode: 'onBlur' })
  const {
    register: registerPassword,
    handleSubmit: handlePasswordSubmit,
    reset: resetPassword,
    formState: { errors: passwordErrors },
  } = useForm<PasswordChangeInput>({ resolver: zodResolver(passwordChangeSchema), mode: 'onBlur' })
  const [loading, setLoading] = useState(false)
  const user = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('user') || '{}') : {}

  useEffect(() => {
    if (user.id) {
      api.get(`/users/${user.id}`).then(res => {
        const u = res.user
        resetProfile({
          firstName: u.first_name || '',
          lastName: u.last_name || '',
          phone: u.phone || '',
          address: u.address || '',
        })
      }).catch(() => {})
    }
  }, [user.id])

  const onProfileSubmit = async (data: ProfileInput) => {
    setLoading(true)
    try {
      await api.put(`/users/${user.id}`, {
        firstName: data.firstName, lastName: data.lastName,
        phone: data.phone || null, address: data.address || null,
      })
      const updatedUser = { ...user, firstName: data.firstName, lastName: data.lastName }
      localStorage.setItem('user', JSON.stringify(updatedUser))
      toast.success(t('settings.profileUpdatedSuccess'))
    } catch (err: any) {
      toast.error(err.message || t('common.failedToSave'))
    } finally {
      setLoading(false)
    }
  }

  const onPasswordSubmit = async (data: PasswordChangeInput) => {
    setLoading(true)
    try {
      await api.post('/auth/change-password', {
        currentPassword: data.currentPassword, newPassword: data.newPassword,
      })
      resetPassword({ currentPassword: '', newPassword: '', confirmPassword: '' })
      toast.success(t('settings.passwordChanged'))
    } catch (err: any) {
      toast.error(err.message || t('common.failedToSave'))
    } finally { setLoading(false) }
  }

  const initials = `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase()

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
                <div className="font-extrabold text-base text-gray-900">{user.firstName} {user.lastName}</div>
                <div className="text-sm text-gray-500">{user.email}</div>
                <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 mt-1.5 uppercase tracking-wider">
                  {user.roleName}
                </span>
              </div>
            </div>
            <form onSubmit={handleProfileSubmit(onProfileSubmit)}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">{t('auth.register.firstName')}</label>
                  <input
                    {...registerProfile('firstName')}
                    className={`w-full border-2 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-4 transition ${profileErrors.firstName ? 'border-red-400 focus:border-red-500 focus:ring-red-100' : 'border-gray-200 focus:border-indigo-500 focus:ring-indigo-100'}`}
                  />
                  {profileErrors.firstName && <p className="mt-1 text-xs text-red-500">{profileErrors.firstName.message}</p>}
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">{t('auth.register.lastName')}</label>
                  <input
                    {...registerProfile('lastName')}
                    className={`w-full border-2 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-4 transition ${profileErrors.lastName ? 'border-red-400 focus:border-red-500 focus:ring-red-100' : 'border-gray-200 focus:border-indigo-500 focus:ring-indigo-100'}`}
                  />
                  {profileErrors.lastName && <p className="mt-1 text-xs text-red-500">{profileErrors.lastName.message}</p>}
                </div>
              </div>
              <div className="mt-3">
                <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">{t('settings.phone')}</label>
                <input
                    type="tel"
                    {...registerProfile('phone')}
                    className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                    placeholder="+91..."
                  />
              </div>
              <div className="mt-3">
                <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">{t('settings.address')}</label>
                <textarea
                    {...registerProfile('address')}
                    rows={3}
                    className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 resize-y min-h-[80px]"
                    placeholder={t('settings.addressPlaceholder')}
                  />
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
            <form onSubmit={handlePasswordSubmit(onPasswordSubmit)}>
              <div className="mb-4">
                <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">{t('settings.currentPassword')}</label>
                <input
                    type="password"
                    {...registerPassword('currentPassword')}
                    className={`w-full border-2 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-4 transition ${passwordErrors.currentPassword ? 'border-red-400 focus:border-red-500 focus:ring-red-100' : 'border-gray-200 focus:border-rose-500 focus:ring-rose-100'}`}
                  />
                  {passwordErrors.currentPassword && <p className="mt-1 text-xs text-red-500">{passwordErrors.currentPassword.message}</p>}
              </div>
              <div className="mb-4">
                <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">{t('settings.newPassword')}</label>
                <input
                    type="password"
                    {...registerPassword('newPassword')}
                    className={`w-full border-2 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-4 transition ${passwordErrors.newPassword ? 'border-red-400 focus:border-red-500 focus:ring-red-100' : 'border-gray-200 focus:border-rose-500 focus:ring-rose-100'}`}
                  />
                  {passwordErrors.newPassword && <p className="mt-1 text-xs text-red-500">{passwordErrors.newPassword.message}</p>}
              </div>
              <div className="mb-4">
                <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">{t('auth.register.confirmPassword')}</label>
                <input
                    type="password"
                    {...registerPassword('confirmPassword')}
                    className={`w-full border-2 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-4 transition ${passwordErrors.confirmPassword ? 'border-red-400 focus:border-red-500 focus:ring-red-100' : 'border-gray-200 focus:border-rose-500 focus:ring-rose-100'}`}
                  />
                  {passwordErrors.confirmPassword && <p className="mt-1 text-xs text-red-500">{passwordErrors.confirmPassword.message}</p>}
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
