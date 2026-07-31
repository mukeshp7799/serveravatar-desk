'use client'
import { useEffect, useState, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import ThemeSelector from '../../components/ThemeSelector'
import LanguageSwitcher from '../../components/LanguageSwitcher'
import Scroll from '../../components/Scroll'
import api from '../../lib/api'
import {
  LayoutDashboard, Users, Palmtree, Network, ShieldCheck,
  FolderKanban, ListChecks, MessageSquare, Megaphone, Bell,
  Settings as SettingsIcon,
  Menu, X as XIcon, LogOut, Sparkles,
  PanelLeftClose, PanelLeftOpen, Mail, AlertTriangle, RefreshCw,
} from 'lucide-react'

// Nav keys use i18n keys for the label. We translate them inside the component.
const navConfig = [
  { sectionKey: 'nav.main' },
  { href: '/dashboard', labelKey: 'nav.dashboard', Icon: LayoutDashboard },
  { sectionKey: 'nav.hrManagement' },
  { href: '/employees', labelKey: 'nav.employees', Icon: Users },
  { href: '/leaves', labelKey: 'nav.leaves', Icon: Palmtree },
  { href: '/structure', labelKey: 'nav.departments', Icon: Network },
  { href: '/roles', labelKey: 'nav.roles', Icon: ShieldCheck },
  { sectionKey: 'nav.projects' },
  { href: '/projects', labelKey: 'nav.projectsLink', Icon: FolderKanban },
  { href: '/discussions', labelKey: 'nav.discussions', Icon: MessageSquare },
  { sectionKey: 'nav.company' },
  { href: '/announcements', labelKey: 'nav.announcements', Icon: Megaphone },
]

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { t } = useTranslation()
  const [user, setUser] = useState<any>(null)
  const [unreadCount, setUnreadCount] = useState(0)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  // Restore sidebar collapsed state from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('sidebarCollapsed')
      if (stored === 'true') setCollapsed(true)
    } catch {}
  }, [])
  // Persist on change
  useEffect(() => {
    try { localStorage.setItem('sidebarCollapsed', String(collapsed)) } catch {}
  }, [collapsed])
  const profileRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const token = localStorage.getItem('token')
    const storedUser = localStorage.getItem('user')
    if (!token) { router.replace('/login'); return }
    if (storedUser) setUser(JSON.parse(storedUser))
  }, [router])

  // Fetch unread notifications count (goes through api so 401s auto-logout)
  useEffect(() => {
    if (!user) return
    import('@/lib/api').then(({ default: api }) => {
      api.get('/notifications')
        .then((data: any) => {
          const unread = data.unreadCount || 0
          setUnreadCount(unread)
        })
        .catch(() => { /* api already handled 401 by redirecting to /login */ })
    })
  }, [user, pathname])

  // Resend verification email
  const [resending, setResending] = useState(false)
  const handleResendVerification = async () => {
    if (resending) return
    setResending(true)
    try {
      const res = await api.post('/auth/resend-verification', {})
      if (res?.sent) {
        if (res.previewUrl) {
          toast.success(
            (t as any)('auth.verifyEmailPreview', 'Verification email sent') +
              ` — preview: ${res.previewUrl}`,
            { duration: 8000 }
          )
        } else {
          toast.success(t('auth.verifyEmailSent') || 'Verification email sent')
        }
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to resend verification email')
    } finally {
      setResending(false)
    }
  }

  // Detect mobile viewport
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  useEffect(() => { setMobileMenuOpen(false); setProfileOpen(false) }, [pathname])

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  useEffect(() => {
    document.body.style.overflow = mobileMenuOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [mobileMenuOpen])

  const handleLogout = () => {
    localStorage.removeItem('token'); localStorage.removeItem('user')
    router.push('/login')
  }

  if (!user) return null

  const initials = `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase()
  const currentPage = navConfig.find(n => 'href' in n && pathname.startsWith(n.href as string))

  // Solid indigo (was previously a gradient — now uses Indigo Calm theme)
  const pageBg = 'bg-indigo-600'

  return (
    <div className="flex min-h-screen">
      {/* Persistent banner: unverified email */}
      {user && user.emailVerified === false && (
        <div className="fixed top-0 left-0 right-0 z-[60] bg-amber-50 dark:bg-amber-950/90 border-b border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-100 px-4 py-2.5 flex items-center gap-3 shadow-sm">
          <AlertTriangle size={18} strokeWidth={2.25} className="shrink-0 text-amber-600 dark:text-amber-300" />
          <div className="flex-1 min-w-0 text-xs sm:text-sm font-medium">
            <span className="hidden sm:inline">Your email address <strong className="font-bold">{user.email}</strong> is not verified. </span>
            <span className="sm:hidden">Email not verified. </span>
            Please check your inbox for the verification link.
          </div>
          <button
            type="button"
            onClick={handleResendVerification}
            disabled={resending}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition shadow-sm cursor-pointer border-none disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            <RefreshCw size={12} strokeWidth={2.5} className={resending ? 'animate-spin' : ''} />
            {resending ? 'Sending…' : 'Resend verification email'}
          </button>
        </div>
      )}
      {/* Mobile Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar with vibrant gradient */}
      <aside
        className={[
          'flex flex-col shrink-0 h-screen bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 border-r border-gray-200 dark:border-gray-800',
          'transition-[width] duration-300 ease-out',
          collapsed ? 'w-68' : 'w-280',
          isMobile
            ? mobileMenuOpen
              ? 'fixed inset-y-0 left-0 z-50 translate-x-0'
              : 'fixed inset-y-0 left-0 z-50 -translate-x-full'
            : 'fixed inset-y-0 left-0 z-30'
        ].join(' ')}
      >
        {/* Header */}
        <div className="relative border-b border-gray-200 dark:border-gray-800 h-16 shrink-0 flex items-center justify-between gap-2 px-3">
          <div className="flex items-center gap-2.5 min-w-0 overflow-hidden">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center text-xl shadow shrink-0">
              <Sparkles size={18} strokeWidth={2.25} />
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <div className="font-bold text-base text-gray-900 dark:text-white leading-tight truncate">{t('app.name')}</div>
                <div className="text-[10px] text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wider truncate">{t('app.tagline')}</div>
              </div>
            )}
          </div>
          {/* Collapse toggle (desktop only) */}
          {!isMobile && !collapsed && (
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              aria-label="Collapse sidebar"
              data-tooltip-id="app-tooltip"
              data-tooltip-content="Collapse sidebar"
              className="header-icon-btn shrink-0"
            >
              <PanelLeftClose size={16} strokeWidth={2.25} />
            </button>
          )}
          {/* Mobile close */}
          {isMobile && mobileMenuOpen && (
            <button
              onClick={() => setMobileMenuOpen(false)}
              aria-label={t('common.close')}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer bg-transparent border-none text-lg leading-none"
            >
              <XIcon size={18} strokeWidth={2.25} />
            </button>
          )}
        </div>
        {/* Floating expand button (collapsed desktop mode) */}
        {!isMobile && collapsed && (
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            aria-label="Expand sidebar"
            data-tooltip-id="app-tooltip"
            data-tooltip-content="Expand sidebar"
            className="absolute -right-4 top-20 z-50 w-8 h-8 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white border-2 border-white dark:border-gray-800 shadow-lg flex items-center justify-center cursor-pointer transition-colors hover:scale-110"
          >
            <PanelLeftOpen size={15} strokeWidth={2.5} />
          </button>
        )}

        {/* Nav wrapped in PerfectScrollbar */}
        <Scroll containerClassName="flex-1 min-h-0" className="h-full" watch={pathname}>
          <nav className={`${collapsed ? 'px-1.5' : 'px-2'} py-2 flex flex-col items-stretch gap-0.5`}>
            {navConfig.map((item, i) =>
              'sectionKey' in item ? (
                collapsed ? (
                  <div key={`s${i}`} className="border-t border-gray-100 dark:border-gray-800 my-2" data-tooltip-id="app-tooltip" data-tooltip-content={t(item.sectionKey as string)} />
                ) : (
                  <div key={`s${i}`} className="uppercase tracking-wider text-gray-400 dark:text-gray-500 px-3.5 pt-5 pb-2 text-[10px] font-bold">{t(item.sectionKey as string)}</div>
                )
              ) : (
                <Link
                  key={item.href}
                  href={item.href as string}
                  {...(collapsed ? { 'data-tooltip-id': 'app-tooltip', 'data-tooltip-content': t(item.labelKey as string) } : {})}
                  className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3 px-3.5'} w-full h-11 rounded-xl no-underline transition-all relative ${
                    pathname.startsWith(item.href as string)
                      ? 'bg-indigo-600 text-white font-medium shadow'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'
                  }`}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <span className={`${collapsed ? '' : 'w-7 h-7'} rounded-lg shrink-0 flex items-center justify-center ${
                    pathname.startsWith(item.href as string)
                      ? `${collapsed ? '' : 'bg-white/30'}`
                      : collapsed ? '' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                  }`}>
                    <item.Icon size={collapsed ? 18 : 14} strokeWidth={2.25} />
                  </span>
                  {!collapsed && <span className="flex-1 truncate">{t(item.labelKey as string)}</span>}
                  {!collapsed && item.href === '/notifications' && unreadCount > 0 && (
                    <span className="bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow">
                      {unreadCount}
                    </span>
                  )}
                  {collapsed && item.href === '/notifications' && unreadCount > 0 && (
                    <span className="absolute top-1 right-1.5 bg-rose-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center shadow ring-2 ring-white dark:ring-gray-900 px-1">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </Link>
              )
            )}
          </nav>
        </Scroll>

        {/* Footer */}
        <div className={`relative border-t border-gray-200 dark:border-gray-800 ${collapsed ? 'px-1.5' : 'px-3'} py-3 shrink-0 flex flex-col gap-2 ${collapsed ? 'items-center' : ''}`}>
          <div {...(collapsed ? { 'data-tooltip-id': 'app-tooltip', 'data-tooltip-content': `${user.firstName} ${user.lastName} — ${user.roleName}` } : {})} className={`flex items-center ${collapsed ? '' : 'gap-3'} shrink-0`}>
            <div className={`w-10 h-10 rounded-full ${pageBg} text-white flex items-center justify-center text-sm font-bold shrink-0 ring-2 ring-white dark:ring-gray-800 shadow`}>
              {initials}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold truncate text-gray-900 dark:text-white">{user.firstName} {user.lastName}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{user.roleName}</div>
              </div>
            )}
          </div>
          <button
            onClick={handleLogout}
            {...(collapsed ? { 'data-tooltip-id': 'app-tooltip', 'data-tooltip-content': t('header.logout') } : {})}
            className={`flex items-center ${collapsed ? 'justify-center' : 'justify-center gap-2'} ${collapsed ? 'w-10 h-10 rounded-xl' : 'w-full rounded-xl px-3 py-2'} text-gray-700 dark:text-gray-300 ${collapsed ? 'bg-gray-100 dark:bg-gray-800 hover:bg-rose-100 dark:hover:bg-rose-900/50 hover:text-rose-600 dark:hover:text-rose-400' : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700'} transition-all cursor-pointer border border-gray-200 dark:border-gray-700`}
          >
            <LogOut size={collapsed ? 16 : 14} strokeWidth={2.25} />
            {!collapsed && <span className="text-xs font-semibold">{t('header.logout')}</span>}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className={`flex flex-col flex-1 min-w-0 h-screen transition-[margin] duration-300 ease-out ${!isMobile ? (collapsed ? 'ml-68' : 'ml-280') : ''} ${user?.emailVerified === false ? 'pt-[52px]' : ''}`}>
        {/* Top bar with gradient accent */}
        <header className="sticky top-0 z-20 glass border-b border-white/40 flex items-center justify-between h-16 px-4 sm:px-6 shrink-0 min-w-0">
          <div className="flex items-center gap-3">
            {isMobile && (
              <button
                className="w-10 h-10 flex items-center justify-center rounded-xl text-gray-700 hover:bg-white/60 cursor-pointer bg-white/40 border border-white/60 text-lg leading-none shadow-sm"
                onClick={() => setMobileMenuOpen(true)}
                aria-label={t('common.openMenu')}
              >
                <Menu size={18} strokeWidth={2.25} />
              </button>
            )}
            {/* Page-name pill removed; mobile menu button is the only left-side control. */}
          </div>
          <div className="flex items-center gap-2">
            <ThemeSelector />
            <LanguageSwitcher />
            <Link
              href="/notifications"
              data-tooltip-id="app-tooltip"
              data-tooltip-content={t('nav.notifications')}
              className="header-icon-btn relative"
            >
              <Bell size={18} strokeWidth={2.25} />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-rose-500 text-white rounded-full min-w-[18px] h-[18px] text-[10px] flex items-center justify-center font-bold shadow ring-2 ring-white dark:ring-gray-900 px-1">{unreadCount > 9 ? '9+' : unreadCount}</span>
              )}
            </Link>
            <div ref={profileRef} className="relative">
              <button
                type="button"
                onClick={() => setProfileOpen(!profileOpen)}
                aria-haspopup="menu"
                aria-expanded={profileOpen}
                aria-label={`${user.firstName} ${user.lastName} — ${user.roleName}`}
                className={`header-icon-btn ${profileOpen ? 'is-open' : ''} !p-0 overflow-hidden`}
              >
                <div className={`w-full h-full rounded-xl ${pageBg} text-white flex items-center justify-center text-xs font-bold shrink-0`}>
                  {initials}
                </div>
              </button>
              {profileOpen && (
                <div className="absolute top-full right-0 mt-2 glass rounded-2xl shadow-2xl z-50 min-w-60 overflow-hidden animate-scale-in border border-white/60">
                  <div className="px-4 py-3 bg-indigo-600 text-white border-b border-indigo-700">
                    <div className="font-bold text-sm">{user.firstName} {user.lastName}</div>
                    <div className="text-xs text-white/80 truncate">{user.email}</div>
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold bg-white/20 backdrop-blur-sm text-white mt-1.5 uppercase tracking-wider">
                      {user.roleName}
                    </span>
                  </div>
                  <div className="py-1">
                    <Link href="/settings" onClick={() => setProfileOpen(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-gray-700 no-underline text-sm hover:bg-indigo-50 transition">
                      <SettingsIcon size={14} strokeWidth={2.25} /> {t('header.settings')}
                    </Link>
                    <button onClick={handleLogout} className="flex items-center gap-2.5 w-full px-4 py-2.5 bg-transparent cursor-pointer text-sm text-rose-600 hover:bg-red-50 transition font-medium">
                      <LogOut size={14} strokeWidth={2.25} /> {t('header.logout')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 min-w-0 overflow-hidden h-[calc(100vh-4rem)]">
          <Scroll containerClassName="h-full" className="h-full" watch={pathname}>
            <div className="p-4 sm:p-6 max-w-full">{children}</div>
          </Scroll>
        </main>
      </div>
    </div>
  )
}
