'use client'
import { useEffect, useState, useRef } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import {
  User, Lock, Bell, Briefcase, Mail, Phone, MapPin,
  UserCircle, AlertTriangle, Save, KeyRound, RefreshCw,
  Link2, Globe, CheckCircle2, Shield, Bookmark,
} from 'lucide-react'
import api from '@/lib/api'
import { profileSchema, passwordChangeSchema, type ProfileInput, type PasswordChangeInput } from '@/lib/schemas'
import Tabs from '@/components/Tabs'

type NotificationPrefs = {
  leave_updates: boolean
  attendance_reminders: boolean
  company_announcements: boolean
  project_task_notifications: boolean
}

type EmploymentInfo = {
  employee_id: string | null
  department_name: string | null
  designation: string | null
  manager_first_name: string | null
  manager_last_name: string | null
  hire_date: string | null
  status: string | null
  employment_type: string | null
}

export default function ProfilePage() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<'personal' | 'employment'>('personal')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [loaded, setLoaded] = useState(false)

  // Single form for all personal fields
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isDirty, dirtyFields },
  } = useForm<ProfileInput & { socialLinks?: any }>({
    resolver: zodResolver(profileSchema),
    mode: 'onBlur',
  })

  // Password form (separate)
  const {
    register: registerPassword,
    handleSubmit: handlePasswordSubmit,
    reset: resetPassword,
    formState: { errors: passwordErrors },
  } = useForm<PasswordChangeInput>({ resolver: zodResolver(passwordChangeSchema), mode: 'onBlur' })

  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  // Notification preferences
  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs>({
    leave_updates: true,
    attendance_reminders: true,
    company_announcements: true,
    project_task_notifications: true,
  })
  const [notifPrefsChanged, setNotifPrefsChanged] = useState(false)
  const [savingNotif, setSavingNotif] = useState(false)

  // Employment info
  const [empInfo, setEmpInfo] = useState<EmploymentInfo | null>(null)
  const [loadingEmp, setLoadingEmp] = useState(false)

  // Resend verification
  const [resending, setResending] = useState(false)

  // Current user from localStorage
  const [localUser, setLocalUser] = useState<any>(null)

  // Load user from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('user')
      if (stored) setLocalUser(JSON.parse(stored))
    } catch {}
  }, [])

  // Fetch full user data + employment info when localUser is available
  useEffect(() => {
    if (!localUser?.id) return

    // Skip if already loaded successfully
    if (loaded) return

    setLoadingEmp(true)

    // Fetch user data first, then employment data separately
    api.get(`/users/${localUser.id}`)
      .then((userDataRes: any) => {
        const u = userDataRes?.user
        if (!u) throw new Error('User data not found')

        // Set form values using setValue for each field
        setValue('firstName', u.first_name || '')
        setValue('lastName', u.last_name || '')
        setValue('phone', u.phone || '')
        setValue('address', u.address || '')
        setValue('personalEmail', u.personal_email || '')
        setValue('emergencyContactName', u.emergency_contact_name || '')
        setValue('emergencyContactPhone', u.emergency_contact_phone || '')
        setValue('bio', u.bio || '')

        // Social links (parse JSON safely — DB may store "null" string)
        let social: any = {}
        try {
          if (u.social_links) {
            const parsed = typeof u.social_links === 'string'
              ? JSON.parse(u.social_links)
              : u.social_links
            social = (parsed && typeof parsed === 'object') ? parsed : {}
          }
        } catch { social = {} }
        setValue('linkedin', social?.linkedin || '')
        setValue('twitter', social?.twitter || '')
        setValue('github', social?.github || '')
        setValue('website', social?.website || '')

        // Avatar
        setAvatarUrl(u.avatar_url || null)

        // Update localStorage with fresh data
        const mergedUser = {
          ...localUser,
          firstName: u.first_name,
          lastName: u.last_name,
          email: u.email,
          avatarUrl: u.avatar_url,
          emailVerified: !!u.email_verified_at,
        }
        localStorage.setItem('user', JSON.stringify(mergedUser))
        setLocalUser(mergedUser)

        // Return user data so we can chain
        return u
      })
      .then((u: any) => {
        // Now fetch employment data after user data is set
        console.log('[Profile] User data loaded, fetching employment...', u?.id)
        return Promise.all([
          api.get(`/employees/${localUser.id}/profile`),
          api.get('/notification-preferences'),
        ]).then(([empData, notifData]: [any, any]) => {
          console.log('[Profile] Employment API response:', empData?.employee?.designation, empData?.employee?.department_name)
          return { empData, notifData, u }
        })
      })
      .then(({ empData, notifData, u }: { empData: any; notifData: any; u: any }) => {
        console.log('[Profile] Processing employment data, setting state...')
        // Employment info
        const emp = empData?.employee || {}
        setEmpInfo({
          employee_id: emp.employee_id ?? emp.employee_id ?? null,
          department_name: emp.department_name || null,
          designation: emp.designation_name || emp.designation || null,
          manager_first_name: emp.manager_first_name || null,
          manager_last_name: emp.manager_last_name || null,
          hire_date: emp.hire_date || null,
          status: emp.status || null,
          employment_type: emp.employment_type || null,
        })

        // Notification preferences
        if (notifData?.preferences) {
          setNotifPrefs(notifData.preferences)
        }

        console.log('[Profile] All data loaded, empInfo set:', emp.department_name, emp.designation)
        setLoadingEmp(false)
        setLoaded(true)
      })
      .catch((err: any) => {
        console.error('Profile data load error:', err)
        setLoadingEmp(false)
        setLoaded(true)
        toast.error(err?.message || t('common.failedToLoad'))
      })
  }, [localUser?.id])

  const initials = `${localUser?.firstName?.[0] || ''}${localUser?.lastName?.[0] || ''}`.toUpperCase() || '?'

  // Avatar upload
  const handleAvatarClick = () => fileInputRef.current?.click()

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be smaller than 5 MB')
      return
    }
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if (!allowed.includes(file.type)) {
      toast.error('Only JPG, PNG, GIF, or WEBP images are allowed')
      return
    }
    setUploadingAvatar(true)
    const formData = new FormData()
    formData.append('avatar', file)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('/api/users/avatar', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Upload failed')
      const newUrl = data.avatar_url
      setAvatarUrl(newUrl)
      const updatedUser = { ...localUser, avatarUrl: newUrl }
      localStorage.setItem('user', JSON.stringify(updatedUser))
      setLocalUser(updatedUser)
      toast.success(t('settings.profileUpdatedSuccess'))
    } catch (err: any) {
      toast.error(err.message || 'Upload failed')
    } finally {
      setUploadingAvatar(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // Profile save — updates all fields at once
  const onProfileSubmit = async (data: ProfileInput & { socialLinks?: any }) => {
    setSavingProfile(true)
    try {
      const socialLinks: any = {}
      if (data.linkedin) socialLinks.linkedin = data.linkedin
      if (data.twitter) socialLinks.twitter = data.twitter
      if (data.github) socialLinks.github = data.github
      if (data.website) socialLinks.website = data.website

      await api.put(`/users/${localUser.id}`, {
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone || null,
        address: data.address || null,
        personalEmail: data.personalEmail || null,
        emergencyContactName: data.emergencyContactName || null,
        emergencyContactPhone: data.emergencyContactPhone || null,
        bio: data.bio || null,
        socialLinks: Object.keys(socialLinks).length > 0 ? socialLinks : null,
      })

      const updatedUser = {
        ...localUser,
        firstName: data.firstName,
        lastName: data.lastName,
        avatarUrl,
      }
      localStorage.setItem('user', JSON.stringify(updatedUser))
      setLocalUser(updatedUser)
      window.dispatchEvent(new CustomEvent('user-updated', { detail: updatedUser }))
      toast.success(t('settings.profileUpdatedSuccess'))
      reset(data)
    } catch (err: any) {
      toast.error(err.message || t('common.failedToSave'))
    } finally {
      setSavingProfile(false)
    }
  }

  // Password change
  const onPasswordSubmit = async (data: PasswordChangeInput) => {
    setSavingPassword(true)
    try {
      await api.post('/auth/change-password', {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      })
      resetPassword({ currentPassword: '', newPassword: '', confirmPassword: '' })
      toast.success(t('settings.passwordChanged'))
    } catch (err: any) {
      toast.error(err.message || t('common.failedToSave'))
    } finally {
      setSavingPassword(false)
    }
  }

  // Resend verification
  const handleResendVerification = async () => {
    if (resending) return
    setResending(true)
    try {
      const res = await api.post('/auth/resend-verification', {})
      if (res?.sent) {
        toast.success(t('auth.verifyEmailSent') || 'Verification email sent')
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to resend')
    } finally {
      setResending(false)
    }
  }

  // Notification preferences
  const handleNotifChange = (key: keyof NotificationPrefs) => {
    setNotifPrefs(prev => ({ ...prev, [key]: !prev[key] }))
    setNotifPrefsChanged(true)
  }

  const saveNotifPrefs = async () => {
    setSavingNotif(true)
    try {
      await api.put('/notification-preferences', notifPrefs)
      setNotifPrefsChanged(false)
      toast.success(t('settings.saveSuccess'))
    } catch (err: any) {
      toast.error(err.message || t('common.failedToSave'))
    } finally {
      setSavingNotif(false)
    }
  }

  // Watch dirty state for save button
  const watchedFields = watch()

  // ── Shared styles ──────────────────────────────────────────────────────
  const inputCls = (hasErr: boolean) =>
    `w-full border-2 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-4 transition-all ${hasErr
      ? 'border-red-400 focus:border-red-500 focus:ring-red-100 bg-red-50/30'
      : 'border-gray-200 focus:border-indigo-500 focus:ring-indigo-100 bg-white'
    }`

  const labelCls = 'block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider'
  const cardCls = 'bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden'
  const sectionHeadingCls = 'flex items-center gap-2.5 text-sm font-bold text-gray-800 pb-3 mb-4 border-b border-gray-100'

  // Group dirty fields by section
  const basicDirty = isDirty && (
    dirtyFields.firstName || dirtyFields.lastName || dirtyFields.phone ||
    dirtyFields.address || dirtyFields.personalEmail
  )
  const emergencyDirty = isDirty && (dirtyFields.emergencyContactName || dirtyFields.emergencyContactPhone)
  const bioDirty = isDirty && dirtyFields.bio
  const socialDirty = isDirty && (dirtyFields.linkedin || dirtyFields.twitter || dirtyFields.github || dirtyFields.website)
  const anyFormDirty = basicDirty || emergencyDirty || bioDirty || socialDirty

  return (
    <div className="space-y-5 animate-fade-in-up">

      {/* ── Page Header ── */}
      <div>
        <h1 className="text-2xl font-extrabold text-gray-900">{t('profile.myProfile')}</h1>
        <p className="text-sm text-gray-500 mt-0.5">{t('profile.myProfileDesc')}</p>
      </div>

      {/* ── Tabs ── */}
      <Tabs
        active={tab}
        onChange={(k) => { setTab(k as 'personal' | 'employment') }}
        tabs={[
          {
            key: 'personal',
            label: (
              <span className="inline-flex items-center gap-1.5">
                <User size={14} strokeWidth={2.25} />
                {t('profile.personalInfo')}
              </span>
            ),
          },
          {
            key: 'employment',
            label: (
              <span className="inline-flex items-center gap-1.5">
                <Briefcase size={14} strokeWidth={2.25} />
                {t('profile.employmentInfo')}
              </span>
            ),
          },
        ]}
      />

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* ── PERSONAL INFORMATION TAB ── */}
      {tab === 'personal' && (
        <form onSubmit={handleSubmit(onProfileSubmit)}>
          <div className="space-y-5">

            {/* ── Profile Summary Banner ── */}
            <div className={cardCls}>
              <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 px-6 py-5 flex flex-col sm:flex-row sm:items-center gap-5">
                {/* Avatar */}
                <div className="relative shrink-0 self-start">
                  <div
                    onClick={handleAvatarClick}
                    className="w-20 h-20 rounded-2xl bg-white/20 text-white flex items-center justify-center text-2xl font-extrabold shadow-lg cursor-pointer hover:bg-white/30 transition overflow-hidden ring-4 ring-white/30"
                  >
                    {uploadingAvatar ? (
                      <div className="w-full h-full flex items-center justify-center">
                        <RefreshCw size={22} className="animate-spin text-white/80" />
                      </div>
                    ) : avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      initials || <User size={24} strokeWidth={2.25} className="text-white/80" />
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    className="hidden"
                    onChange={handleAvatarChange}
                  />
                  <button
                    type="button"
                    onClick={handleAvatarClick}
                    className="absolute -bottom-1.5 -right-1.5 w-8 h-8 rounded-full bg-indigo-400 border-2 border-white text-white flex items-center justify-center hover:bg-indigo-300 transition cursor-pointer shadow-md"
                    title="Change photo"
                  >
                    <RefreshCw size={13} strokeWidth={2.5} />
                  </button>
                </div>

                {/* User Info */}
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl font-extrabold text-white">
                    {localUser?.firstName} {localUser?.lastName}
                  </h2>
                  <p className="text-indigo-200 text-sm flex items-center gap-1.5 mt-0.5">
                    <Mail size={13} strokeWidth={2.25} /> {localUser?.email}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {localUser?.emailVerified ? (
                      <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold bg-emerald-400/20 text-emerald-100 border border-emerald-400/30">
                        <CheckCircle2 size={10} strokeWidth={2.5} /> {t('profile.emailVerified')}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold bg-amber-400/20 text-amber-100 border border-amber-400/30">
                        <AlertTriangle size={10} strokeWidth={2.5} /> {t('profile.emailNotVerified')}
                      </span>
                    )}
                    <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold bg-white/10 text-indigo-100 border border-white/20 uppercase tracking-wider">
                      {localUser?.roleName}
                    </span>
                  </div>
                </div>

                {/* Quick Stats */}
                <div className="flex gap-3 shrink-0">
                  <div className="bg-white/10 backdrop-blur-sm rounded-xl px-4 py-3 text-center min-w-[100px]">
                    <div className="text-[10px] text-indigo-200 font-medium uppercase tracking-wider">{t('profile.designation')}</div>
                    <div className="text-sm font-bold text-white mt-1 truncate max-w-[120px]">{empInfo?.designation || '—'}</div>
                  </div>
                  <div className="bg-white/10 backdrop-blur-sm rounded-xl px-4 py-3 text-center min-w-[100px]">
                    <div className="text-[10px] text-indigo-200 font-medium uppercase tracking-wider">{t('profile.department')}</div>
                    <div className="text-sm font-bold text-white mt-1 truncate max-w-[120px]">{empInfo?.department_name || '—'}</div>
                  </div>
                </div>
              </div>

              {/* Email Verification Banner */}
              {!localUser?.emailVerified && (
                <div className="mx-5 my-4 p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3">
                  <AlertTriangle size={16} strokeWidth={2.25} className="text-amber-600 shrink-0" />
                  <div className="flex-1 min-w-0 text-sm text-amber-800">{t('profile.verifyEmailNote')}</div>
                  <button
                    type="button"
                    onClick={handleResendVerification}
                    disabled={resending}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition shadow-sm cursor-pointer border-none disabled:opacity-50 shrink-0"
                  >
                    <RefreshCw size={11} strokeWidth={2.5} className={resending ? 'animate-spin' : ''} />
                    {resending ? '...' : t('profile.resendVerification')}
                  </button>
                </div>
              )}
            </div>

            {/* ── Basic Information Form ── */}
            <div className={cardCls}>
              <div className="px-5 py-4 border-b border-gray-100">
                <h3 className={sectionHeadingCls}>
                  <UserCircle size={16} strokeWidth={2.25} className="text-indigo-600" />
                  {t('profile.personalInfo')}
                </h3>
              </div>
              <div className="p-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  <div>
                    <label className={labelCls}>{t('auth.register.firstName')}</label>
                    <input {...register('firstName')} className={inputCls(!!errors.firstName)} />
                    {errors.firstName && <p className="mt-1.5 text-xs text-red-500">{errors.firstName.message}</p>}
                  </div>
                  <div>
                    <label className={labelCls}>{t('auth.register.lastName')}</label>
                    <input {...register('lastName')} className={inputCls(!!errors.lastName)} />
                    {errors.lastName && <p className="mt-1.5 text-xs text-red-500">{errors.lastName.message}</p>}
                  </div>
                  <div>
                    <label className={labelCls}>{t('profile.workEmail')}</label>
                    <input value={localUser?.email || ''} readOnly disabled className="w-full border-2 border-gray-100 rounded-xl px-4 py-3 text-sm bg-gray-50 text-gray-400 cursor-not-allowed" />
                  </div>
                  <div>
                    <label className={labelCls}>{t('profile.personalEmail')}</label>
                    <input type="email" {...register('personalEmail')} className={inputCls(!!errors.personalEmail)} placeholder="personal@example.com" />
                    {errors.personalEmail && <p className="mt-1.5 text-xs text-red-500">{errors.personalEmail.message}</p>}
                  </div>
                  <div>
                    <label className={labelCls}>
                      <Phone size={11} strokeWidth={2.5} className="inline mr-1" />
                      {t('settings.phone')}
                    </label>
                    <input type="tel" {...register('phone')} className={inputCls(!!errors.phone)} placeholder="+91..." />
                    {errors.phone && <p className="mt-1.5 text-xs text-red-500">{errors.phone.message}</p>}
                  </div>
                  <div>
                    <label className={labelCls}>
                      <MapPin size={11} strokeWidth={2.5} className="inline mr-1" />
                      {t('settings.address')}
                    </label>
                    <input {...register('address')} className={inputCls(!!errors.address)} placeholder={t('settings.addressPlaceholder')} />
                    {errors.address && <p className="mt-1.5 text-xs text-red-500">{errors.address.message}</p>}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Emergency Contact ── */}
            <div className={cardCls}>
              <div className="px-5 py-4 border-b border-gray-100">
                <h3 className={sectionHeadingCls}>
                  <Shield size={16} strokeWidth={2.25} className="text-indigo-600" />
                  {t('profile.emergencyContact')}
                </h3>
              </div>
              <div className="p-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  <div>
                    <label className={labelCls}>{t('profile.emergencyContactName')}</label>
                    <input {...register('emergencyContactName')} className={inputCls(!!errors.emergencyContactName)} placeholder="Jane Doe" />
                    {errors.emergencyContactName && <p className="mt-1.5 text-xs text-red-500">{errors.emergencyContactName.message}</p>}
                  </div>
                  <div>
                    <label className={labelCls}>{t('profile.emergencyContactPhone')}</label>
                    <input type="tel" {...register('emergencyContactPhone')} className={inputCls(!!errors.emergencyContactPhone)} placeholder="+91..." />
                    {errors.emergencyContactPhone && <p className="mt-1.5 text-xs text-red-500">{errors.emergencyContactPhone.message}</p>}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Bio ── */}
            <div className={cardCls}>
              <div className="px-5 py-4 border-b border-gray-100">
                <h3 className={sectionHeadingCls}>
                  <Bookmark size={16} strokeWidth={2.25} className="text-indigo-600" />
                  {t('profile.bio')}
                </h3>
              </div>
              <div className="p-5">
                <textarea
                  {...register('bio')}
                  rows={3}
                  className={inputCls(!!errors.bio) + ' resize-y'}
                  placeholder={t('profile.bioPlaceholder')}
                />
                {errors.bio && <p className="mt-1.5 text-xs text-red-500">{errors.bio.message}</p>}
              </div>
            </div>

            {/* ── Social Links ── */}
            <div className={cardCls}>
              <div className="px-5 py-4 border-b border-gray-100">
                <h3 className={sectionHeadingCls}>
                  <Link2 size={16} strokeWidth={2.25} className="text-indigo-600" />
                  {t('profile.socialLinks')}
                </h3>
              </div>
              <div className="p-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  <div>
                    <label className={labelCls}>
                      <span className="inline-block w-5 h-5 rounded bg-[#0077b5] text-white text-[10px] font-extrabold text-center leading-5 mr-1">in</span>
                      LinkedIn
                    </label>
                    <input {...register('linkedin')} className={inputCls(!!errors.linkedin)} placeholder="linkedin.com/in/..." />
                    {errors.linkedin && <p className="mt-1.5 text-xs text-red-500">{errors.linkedin.message}</p>}
                  </div>
                  <div>
                    <label className={labelCls}>
                      <span className="inline-block mr-1">𝕏</span>
                      Twitter / X
                    </label>
                    <input {...register('twitter')} className={inputCls(!!errors.twitter)} placeholder="@username" />
                    {errors.twitter && <p className="mt-1.5 text-xs text-red-500">{errors.twitter.message}</p>}
                  </div>
                  <div>
                    <label className={labelCls}>
                      <span className="inline-block mr-1">⌨</span>
                      GitHub
                    </label>
                    <input {...register('github')} className={inputCls(!!errors.github)} placeholder="username" />
                    {errors.github && <p className="mt-1.5 text-xs text-red-500">{errors.github.message}</p>}
                  </div>
                  <div className="sm:col-span-2 lg:col-span-1">
                    <label className={labelCls}>
                      <Globe size={11} strokeWidth={2.5} className="inline mr-1" />
                      Website
                    </label>
                    <input {...register('website')} className={inputCls(!!errors.website)} placeholder="https://..." />
                    {errors.website && <p className="mt-1.5 text-xs text-red-500">{errors.website.message}</p>}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Account Settings (Password) ── */}
            <div className={cardCls}>
              <div className="px-5 py-4 border-b border-gray-100">
                <h3 className={sectionHeadingCls}>
                  <Lock size={16} strokeWidth={2.25} className="text-indigo-600" />
                  {t('profile.accountSettings')}
                </h3>
              </div>
              <div className="p-5">
                <form onSubmit={handlePasswordSubmit(onPasswordSubmit)}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    <div>
                      <label className={labelCls}>{t('settings.currentPassword')}</label>
                      <input
                        type="password"
                        autoComplete="current-password"
                        {...registerPassword('currentPassword')}
                        className={inputCls(!!passwordErrors.currentPassword)}
                        placeholder="••••••••"
                      />
                      {passwordErrors.currentPassword && <p className="mt-1.5 text-xs text-red-500">{passwordErrors.currentPassword.message}</p>}
                    </div>
                    <div>
                      <label className={labelCls}>{t('settings.newPassword')}</label>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        {...registerPassword('newPassword')}
                        className={inputCls(!!passwordErrors.newPassword)}
                        placeholder="••••••••"
                      />
                      {passwordErrors.newPassword && <p className="mt-1.5 text-xs text-red-500">{passwordErrors.newPassword.message}</p>}
                    </div>
                    <div>
                      <label className={labelCls}>{t('auth.register.confirmPassword')}</label>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        {...registerPassword('confirmPassword')}
                        className={inputCls(!!passwordErrors.confirmPassword)}
                        placeholder="••••••••"
                      />
                      {passwordErrors.confirmPassword && <p className="mt-1.5 text-xs text-red-500">{passwordErrors.confirmPassword.message}</p>}
                    </div>
                  </div>
                  <div className="mt-5 flex items-center gap-3 pt-4 border-t border-gray-100">
                    <button
                      type="submit"
                      disabled={savingPassword}
                      className="px-6 py-2.5 text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition shadow-sm cursor-pointer border-none disabled:opacity-50 inline-flex items-center gap-2"
                    >
                      {savingPassword
                        ? <><RefreshCw size={14} strokeWidth={2.25} className="animate-spin" /> {t('common.saving')}</>
                        : <><Lock size={14} strokeWidth={2.25} /> {t('settings.changePassword')}</>
                      }
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="text-xs text-gray-500 hover:text-indigo-600 cursor-pointer bg-transparent border-none p-0 font-medium"
                    >
                      {showPassword ? '🔒 Hide' : '👁 Show'} passwords
                    </button>
                  </div>
                </form>
              </div>
            </div>

            {/* ── Notification Preferences ── */}
            <div className={cardCls}>
              <div className="px-5 py-4 border-b border-gray-100">
                <h3 className={sectionHeadingCls}>
                  <Bell size={16} strokeWidth={2.25} className="text-indigo-600" />
                  {t('profile.notificationPreferences')}
                </h3>
              </div>
              <div className="p-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[
                    { key: 'leave_updates', label: t('profile.notifLeaveUpdates'), icon: '🏖️', desc: 'Leave approvals & updates' },
                    { key: 'attendance_reminders', label: t('profile.notifAttendanceReminders'), icon: '⏰', desc: 'Clock-in/out reminders' },
                    { key: 'company_announcements', label: t('profile.notifCompanyAnnouncements'), icon: '📢', desc: 'Company news & announcements' },
                    { key: 'project_task_notifications', label: t('profile.notifProjectTaskNotifications'), icon: '📋', desc: 'Task assignments & updates' },
                  ].map(item => (
                    <div key={item.key} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100 hover:border-indigo-200 transition">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{item.icon}</span>
                        <div>
                          <div className="text-sm font-semibold text-gray-800">{item.label}</div>
                          <div className="text-xs text-gray-500">{item.desc}</div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleNotifChange(item.key as keyof NotificationPrefs)}
                        className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors cursor-pointer border-2 shrink-0 ml-3 ${
                          notifPrefs[item.key as keyof NotificationPrefs]
                            ? 'bg-indigo-600 border-indigo-600'
                            : 'bg-gray-200 border-gray-200'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                            notifPrefs[item.key as keyof NotificationPrefs] ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                  ))}
                </div>
                {notifPrefsChanged && (
                  <button
                    type="button"
                    onClick={saveNotifPrefs}
                    disabled={savingNotif}
                    className="mt-5 pt-4 border-t border-gray-100 px-6 py-2.5 text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition shadow-sm cursor-pointer border-none disabled:opacity-50 inline-flex items-center gap-2"
                  >
                    {savingNotif
                      ? <><RefreshCw size={14} strokeWidth={2.25} className="animate-spin" /> {t('common.saving')}</>
                      : <><Save size={14} strokeWidth={2.25} /> {t('settings.save')}</>
                    }
                  </button>
                )}
              </div>
            </div>

            {/* ── Two-Factor Auth (coming soon) ── */}
            <div className={`${cardCls} opacity-60`}>
              <div className="px-5 py-4 border-b border-gray-100">
                <h3 className={sectionHeadingCls}>
                  <Shield size={16} strokeWidth={2.25} className="text-gray-400" />
                  {t('profile.twoFactorAuth')}
                </h3>
              </div>
              <div className="p-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                  <Shield size={22} strokeWidth={2.25} className="text-gray-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-700">{t('profile.twoFactorAuthComing')}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Add an extra layer of security to your account</p>
                </div>
              </div>
            </div>

            {/* ── MAIN SAVE BUTTON (one at the bottom) ── */}
            <div className="sticky bottom-4 z-10 flex justify-end">
              <button
                type="submit"
                disabled={savingProfile || !anyFormDirty}
                className="px-8 py-3 text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl transition shadow-xl cursor-pointer border-none disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
              >
                {savingProfile
                  ? <><RefreshCw size={16} strokeWidth={2.25} className="animate-spin" /> {t('common.saving')}</>
                  : <><Save size={16} strokeWidth={2.25} /> {t('settings.save')}</>
                }
              </button>
            </div>

          </div>
        </form>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* ── EMPLOYMENT INFORMATION TAB ── */}
      {tab === 'employment' && (
        <div className={cardCls}>
          <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 px-6 py-5">
            <h3 className="text-lg font-extrabold text-white flex items-center gap-2">
              <Briefcase size={20} strokeWidth={2.25} />
              {t('profile.employmentInfo')}
            </h3>
            <p className="text-indigo-200 text-sm mt-0.5">Your employment details at the company</p>
          </div>
          <div className="p-5">
            {loadingEmp ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <RefreshCw size={28} strokeWidth={2.25} className="animate-spin text-indigo-500" />
                <p className="text-sm text-gray-500">{t('common.loading')}</p>
              </div>
            ) : empInfo ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Employee ID */}
                <div className="p-5 bg-indigo-50/50 rounded-xl border border-indigo-100">
                  <div className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider mb-2">{t('profile.employeeId')}</div>
                  <div className="text-base font-extrabold text-gray-900">{empInfo.employee_id || '—'}</div>
                </div>
                {/* Department */}
                <div className="p-5 bg-gray-50 rounded-xl border border-gray-100">
                  <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">{t('profile.department')}</div>
                  <div className="text-base font-extrabold text-gray-900">{empInfo.department_name || '—'}</div>
                </div>
                {/* Designation */}
                <div className="p-5 bg-gray-50 rounded-xl border border-gray-100">
                  <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">{t('profile.designation')}</div>
                  <div className="text-base font-extrabold text-gray-900">{empInfo.designation || '—'}</div>
                </div>
                {/* Manager */}
                <div className="p-5 bg-gray-50 rounded-xl border border-gray-100">
                  <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">{t('profile.reportingManager')}</div>
                  <div className="text-base font-extrabold text-gray-900">
                    {empInfo.manager_first_name
                      ? `${empInfo.manager_first_name} ${empInfo.manager_last_name || ''}`.trim()
                      : '—'}
                  </div>
                </div>
                {/* Joining Date */}
                <div className="p-5 bg-gray-50 rounded-xl border border-gray-100">
                  <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">{t('profile.joiningDate')}</div>
                  <div className="text-base font-extrabold text-gray-900">
                    {empInfo.hire_date
                      ? new Date(empInfo.hire_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                      : '—'}
                  </div>
                </div>
                {/* Employment Type */}
                <div className="p-5 bg-gray-50 rounded-xl border border-gray-100">
                  <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">{t('profile.employmentType')}</div>
                  <div>
                    {empInfo.employment_type ? (
                      <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-bold bg-indigo-100 text-indigo-700 border border-indigo-200 uppercase tracking-wider">
                        {empInfo.employment_type}
                      </span>
                    ) : '—'}
                  </div>
                </div>
                {/* Status — full width */}
                <div className="sm:col-span-2 lg:col-span-3 p-5 bg-gray-50 rounded-xl border border-gray-100">
                  <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">{t('profile.employmentStatus')}</div>
                  <div className="flex items-center gap-3">
                    {empInfo.status ? (
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-bold uppercase tracking-wider ${
                        empInfo.status === 'active'
                          ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                          : 'bg-gray-100 text-gray-600 border border-gray-200'
                      }`}>
                        <span className={`w-2 h-2 rounded-full ${empInfo.status === 'active' ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                        {empInfo.status}
                      </span>
                    ) : '—'}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <AlertTriangle size={32} strokeWidth={2.25} className="text-gray-300 mb-3" />
                <p className="text-sm text-gray-500">{t('common.failedToLoad')}</p>
                <button
                  type="button"
                  onClick={() => { setLoaded(false); setLoadingEmp(true); }}
                  className="mt-3 px-4 py-2 text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition cursor-pointer border-none"
                >
                  Try Again
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
