"use client";
import { useState } from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import Link from "next/link";
import api from "@/lib/api";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ThemeSelector from "@/components/ThemeSelector";
import { loginSchema, type LoginInput } from "@/lib/schemas";
import {
  Sparkles, Mail, Lock, Eye, EyeOff, ArrowRight,
  Users, Briefcase, Palmtree, ListChecks, MessageSquare,
} from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useTranslation();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    mode: "onBlur",
  });

  const showPwd = watch("password") !== undefined;
  const [showPwdText, setShowPwdText] = useState(false);

  const onSubmit = async (data: LoginInput) => {
    try {
      const result = await api.post("/auth/login", data);
      api.setToken(result.token);
      localStorage.setItem("user", JSON.stringify(result.user));
      const nextUrl = searchParams.get('next');
      const pendingToken = localStorage.getItem('pending_invitation_token');
      localStorage.removeItem('pending_invitation_token');
      if (pendingToken) {
        router.push(`/invitation-confirm/${pendingToken}`);
      } else {
        const redirectTo = (nextUrl && nextUrl.startsWith('/')) ? nextUrl : '/dashboard';
        router.push(redirectTo);
      }
    } catch (err: any) {
      toast.error(err.message || t("auth.login.loginFailed"));
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 auth-bg-base"></div>
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-400 rounded-full filter blur-3xl opacity-30 animate-float-slow auth-glow-a"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-500 rounded-full filter blur-3xl opacity-20 animate-pulse-slow auth-glow-b"></div>

      <div className="absolute top-4 right-4 z-30 flex items-center gap-2">
        <div className="bg-white/30 backdrop-blur-md border border-white/50 rounded-2xl shadow-lg dark:bg-white/10 dark:border-white/20">
          <ThemeSelector />
        </div>
        <div className="bg-white/30 backdrop-blur-md border border-white/50 rounded-2xl shadow-lg dark:bg-white/10 dark:border-white/20">
          <LanguageSwitcher compact />
        </div>
      </div>

      <div className="relative z-10 w-full max-w-5xl grid md:grid-cols-2 gap-8 items-center">
        {/* Left side — branding */}
        <div className="hidden md:block text-white animate-fade-in-up">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white shadow-lg">
              <Sparkles size={28} strokeWidth={2.25} />
            </div>
            <div>
              <h1 className="text-2xl font-bold">{t('app.name')}</h1>
              <p className="text-white/80 text-sm">{t('app.tagline')}</p>
            </div>
          </div>
          <h2 className="text-5xl font-extrabold leading-tight mb-4">
            {t('auth.login.heroTitle1')}<br />
            <span className="text-indigo-600 against-auth-bg">
              {t('auth.login.heroTitle2')}
            </span><br />
            {t('auth.login.heroTitle3')}
          </h2>
          <p className="text-white/80 text-lg mb-8 max-w-md">
            {t('auth.login.heroSubtitle')}
          </p>
          <div className="flex flex-wrap gap-3">
            <span className="px-4 py-2 rounded-full bg-white/15 backdrop-blur-sm text-sm font-medium inline-flex items-center gap-2"><Users size={14} strokeWidth={2.25} /> {t('auth.login.featureHr')}</span>
            <span className="px-4 py-2 rounded-full bg-white/15 backdrop-blur-sm text-sm font-medium inline-flex items-center gap-2"><Briefcase size={14} strokeWidth={2.25} /> {t('auth.login.featureProjects')}</span>
            <span className="px-4 py-2 rounded-full bg-white/15 backdrop-blur-sm text-sm font-medium inline-flex items-center gap-2"><Palmtree size={14} strokeWidth={2.25} /> {t('auth.login.featureLeaves')}</span>
            <span className="px-4 py-2 rounded-full bg-white/15 backdrop-blur-sm text-sm font-medium inline-flex items-center gap-2"><ListChecks size={14} strokeWidth={2.25} /> {t('auth.login.featureTasks')}</span>
            <span className="px-4 py-2 rounded-full bg-white/15 backdrop-blur-sm text-sm font-medium inline-flex items-center gap-2"><MessageSquare size={14} strokeWidth={2.25} /> {t('auth.login.featureDiscussions')}</span>
          </div>
        </div>

        {/* Right side — login form glass card */}
        <div className="glass rounded-3xl p-8 sm:p-10 shadow-2xl animate-scale-in">
          {/* Mobile logo */}
          <div className="md:hidden flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white">
              <Sparkles size={24} strokeWidth={2.25} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">{t('app.name')}</h1>
              <p className="text-gray-500 text-xs">{t('app.tagline')}</p>
            </div>
          </div>

          <div className="mb-7">
            <h2 className="text-3xl font-extrabold text-gray-900 mb-1 inline-flex items-center gap-2">
              {t('auth.login.title')} <Sparkles size={18} strokeWidth={2.25} className="text-indigo-500" />
            </h2>
            <p className="text-gray-500 text-sm">{t('auth.login.subtitle')}</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Email field */}
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5 uppercase tracking-wide">
                {t("auth.login.email")}
              </label>
              <div className="relative">
                <Mail size={16} strokeWidth={2.25} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  type="email"
                  className={`w-full border-2 bg-white/70 dark:bg-gray-800 rounded-xl pl-11 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 transition ${errors.email ? "border-red-400 focus:ring-red-100 dark:focus:ring-red-900" : "border-gray-200 dark:border-gray-700 focus:border-indigo-500 focus:ring-indigo-100 dark:focus:ring-indigo-900"}`}
                  placeholder={t("auth.login.emailPlaceholder")}
                  autoComplete="username"
                  {...register("email")}
                />
              </div>
              {errors.email && (
                <p className="mt-1 text-xs text-red-500">{errors.email.message}</p>
              )}
            </div>

            {/* Password field */}
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5 uppercase tracking-wide">
                {t("auth.login.password")}
              </label>
              <div className="relative">
                <Lock size={16} strokeWidth={2.25} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  type={showPwdText ? "text" : "password"}
                  className={`w-full border-2 bg-white/70 dark:bg-gray-800 rounded-xl pl-11 pr-11 py-2.5 text-sm focus:outline-none focus:ring-2 transition ${errors.password ? "border-red-400 focus:ring-red-100 dark:focus:ring-red-900" : "border-gray-200 dark:border-gray-700 focus:border-indigo-500 focus:ring-indigo-100 dark:focus:ring-indigo-900"}`}
                  placeholder={t("auth.login.passwordPlaceholder")}
                  autoComplete="current-password"
                  {...register("password")}
                />
                <button
                  type="button"
                  onClick={() => setShowPwdText(!showPwdText)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 bg-transparent border-none cursor-pointer"
                >
                  {showPwdText ? <EyeOff size={16} strokeWidth={2.25} /> : <Eye size={16} strokeWidth={2.25} />}
                </button>
              </div>
              {errors.password && (
                <p className="mt-1 text-xs text-red-500">{errors.password.message}</p>
              )}
              {/* Forgot password link */}
              <div className="mt-2 text-right">
                <Link href="/forgot-password" className="text-xs font-medium text-indigo-500 hover:text-indigo-600 no-underline">
                  Forgot your password?
                </Link>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-base font-bold transition-all cursor-pointer bg-indigo-600 hover:bg-indigo-700 text-white hover:shadow-2xl hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed border-none mt-2"
            >
              {isSubmitting ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  {t("auth.login.submitting")}
                </>
              ) : (
                <>
                  {t("auth.login.submit")}
                  <ArrowRight size={16} strokeWidth={2.25} />
                </>
              )}
            </button>
          </form>

          <div className="mt-5 text-center">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t("auth.login.noAccount")}{" "}
              <Link href="/register" className="font-bold text-indigo-600 hover:text-indigo-700 no-underline">
                {t("auth.login.createOne")} <ArrowRight size={14} strokeWidth={2.25} className="inline-block ml-0.5" />
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Need React for useState

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
