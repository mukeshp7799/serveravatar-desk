"use client";
import { useState, Suspense } from "react";
import { useParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import api from "@/lib/api";
import Link from "next/link";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ThemeSelector from "@/components/ThemeSelector";
import { z } from "zod";
import {
  Sparkles, Lock, Eye, EyeOff, ArrowRight, CheckCircle,
  Shield, ArrowLeft, LogIn, AlertTriangle,
} from "lucide-react";

const resetSchema = z.object({
  newPassword: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string().min(1, 'Please confirm your password'),
}).refine(d => d.newPassword === d.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});
type ResetInput = z.infer<typeof resetSchema>;

function ResetForm() {
  const params = useParams();
  const { t } = useTranslation();
  const token = (params?.token as string) || "";
  const [done, setDone] = useState(false);
  const [showPwdText, setShowPwdText] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetInput>({
    resolver: zodResolver(resetSchema),
    mode: "onBlur",
  });

  const onSubmit = async (data: ResetInput) => {
    try {
      await api.post("/auth/reset-password", { token, newPassword: data.newPassword });
      setDone(true);
    } catch (err: any) {
      toast.error(err.message || t("auth.reset.errorGeneric"));
    }
  };

  if (!token) {
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

          {/* Left side — error branding */}
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
              Oops! Something<br />
              <span className="text-indigo-600 against-auth-bg">Went Wrong</span>
            </h2>
            <p className="text-white/80 text-lg mb-8 max-w-md">
              The password reset link appears to be invalid or has expired. Don&apos;t worry — you can request a new one.
            </p>
            <div className="flex flex-wrap gap-3">
              <span className="px-4 py-2 rounded-full bg-white/15 backdrop-blur-sm text-sm font-medium inline-flex items-center gap-2">
                <Shield size={14} strokeWidth={2.25} /> Secure Link Required
              </span>
              <span className="px-4 py-2 rounded-full bg-white/15 backdrop-blur-sm text-sm font-medium inline-flex items-center gap-2">
                <AlertTriangle size={14} strokeWidth={2.25} /> Link May Have Expired
              </span>
            </div>
          </div>

          {/* Right side — error glass card */}
          <div className="glass rounded-3xl p-8 sm:p-10 shadow-2xl animate-scale-in">
            <div className="md:hidden flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white">
                <Sparkles size={24} strokeWidth={2.25} />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">{t('app.name')}</h1>
                <p className="text-gray-500 text-xs">{t('app.tagline')}</p>
              </div>
            </div>

            <div className="flex justify-center mb-5">
              <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center">
                <AlertTriangle size={32} strokeWidth={2.25} className="text-red-400" />
              </div>
            </div>

            <div className="mb-7 text-center">
              <h2 className="text-2xl font-extrabold text-gray-900 dark:text-white mb-1 inline-flex items-center gap-2">
                {t("auth.reset.errorInvalid")} <AlertTriangle size={20} strokeWidth={2.25} className="text-red-400" />
              </h2>
              <p className="text-gray-500 text-sm">{t("auth.forgot.successMessage")}</p>
            </div>

            <div className="border-t border-gray-200 dark:border-gray-700 mb-5" />

            <Link
              href="/forgot-password"
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-bold transition-all bg-indigo-600 hover:bg-indigo-700 text-white hover:shadow-xl hover:scale-[1.01] active:scale-[0.99] no-underline"
            >
              <ArrowLeft size={14} strokeWidth={2.25} />
              {t("auth.reset.backToLogin")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (done) {
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

          {/* Left side — success branding */}
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
              All Set!<br />
              <span className="text-indigo-600 against-auth-bg">Welcome Back</span>
            </h2>
            <p className="text-white/80 text-lg mb-8 max-w-md">
              Your password has been reset successfully. Sign in with your new password and continue managing your workspace.
            </p>
            <div className="flex flex-wrap gap-3">
              <span className="px-4 py-2 rounded-full bg-white/15 backdrop-blur-sm text-sm font-medium inline-flex items-center gap-2">
                <Shield size={14} strokeWidth={2.25} /> Account Secured
              </span>
              <span className="px-4 py-2 rounded-full bg-white/15 backdrop-blur-sm text-sm font-medium inline-flex items-center gap-2">
                <CheckCircle size={14} strokeWidth={2.25} /> Password Updated
              </span>
              <span className="px-4 py-2 rounded-full bg-white/15 backdrop-blur-sm text-sm font-medium inline-flex items-center gap-2">
                <LogIn size={14} strokeWidth={2.25} /> Ready to Go
              </span>
            </div>
          </div>

          {/* Right side — success glass card */}
          <div className="glass rounded-3xl p-8 sm:p-10 shadow-2xl animate-scale-in">
            <div className="md:hidden flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white">
                <Sparkles size={24} strokeWidth={2.25} />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">{t('app.name')}</h1>
                <p className="text-gray-500 text-xs">{t('app.tagline')}</p>
              </div>
            </div>

            <div className="flex justify-center mb-5">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle size={32} strokeWidth={2.25} className="text-green-600" />
              </div>
            </div>

            <div className="mb-7 text-center">
              <h2 className="text-2xl font-extrabold text-gray-900 dark:text-white mb-1 inline-flex items-center gap-2">
                {t("auth.reset.successTitle")} <Shield size={20} strokeWidth={2.25} className="text-green-500" />
              </h2>
              <p className="text-gray-500 text-sm">{t("auth.reset.successMessage")}</p>
            </div>

            <div className="border-t border-gray-200 dark:border-gray-700 mb-5" />

            <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-xl p-4 mb-5">
              <p className="text-xs font-bold text-indigo-700 dark:text-indigo-300 mb-2 uppercase tracking-wide"> Tips </p>
              <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                <li className="flex items-start gap-1.5">
                  <span className="text-indigo-500 mt-0.5"><CheckCircle size={12} strokeWidth={2.25} /></span>
                  Use a mix of letters, numbers & symbols
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-indigo-500 mt-0.5"><Shield size={12} strokeWidth={2.25} /></span>
                  Keep your password unique to this account
                </li>
              </ul>
            </div>

            <Link
              href="/login"
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-bold transition-all bg-indigo-600 hover:bg-indigo-700 text-white hover:shadow-xl hover:scale-[1.01] active:scale-[0.99] no-underline"
            >
              <LogIn size={14} strokeWidth={2.25} />
              {t("auth.reset.backToLogin")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

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
              <Lock size={28} strokeWidth={2.25} />
            </div>
            <div>
              <h1 className="text-2xl font-bold">{t('app.name')}</h1>
              <p className="text-white/80 text-sm">{t('app.tagline')}</p>
            </div>
          </div>
          <h2 className="text-5xl font-extrabold leading-tight mb-4">
            Set Your New<br />
            <span className="text-indigo-600 against-auth-bg">Password</span>
          </h2>
          <p className="text-white/80 text-lg mb-8 max-w-md">
            Choose a strong password to keep your account secure. Your new password must be at least 6 characters long.
          </p>
          <div className="flex flex-wrap gap-3">
            <span className="px-4 py-2 rounded-full bg-white/15 backdrop-blur-sm text-sm font-medium inline-flex items-center gap-2">
              <Sparkles size={14} strokeWidth={2.25} /> Strong Password
            </span>
            <span className="px-4 py-2 rounded-full bg-white/15 backdrop-blur-sm text-sm font-medium inline-flex items-center gap-2">
              <CheckCircle size={14} strokeWidth={2.25} /> Min 6 Characters
            </span>
          </div>
        </div>

        {/* Right side — form glass card */}
        <div className="glass rounded-3xl p-8 sm:p-10 shadow-2xl animate-scale-in">
          <div className="md:hidden flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white">
              <Lock size={24} strokeWidth={2.25} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">{t('app.name')}</h1>
              <p className="text-gray-500 text-xs">{t('app.tagline')}</p>
            </div>
          </div>

          <div className="mb-7">
            <h2 className="text-3xl font-extrabold text-gray-900 mb-1 inline-flex items-center gap-2">
              {t("auth.reset.title")} <Lock size={18} strokeWidth={2.25} className="text-indigo-500" />
            </h2>
            <p className="text-gray-500 text-sm">{t("auth.reset.subtitle")}</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* New Password */}
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5 uppercase tracking-wide">
                {t("auth.reset.newPassword")}
              </label>
              <div className="relative">
                <Lock size={14} strokeWidth={2.25} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  type={showPwdText ? "text" : "password"}
                  className={`w-full border-2 bg-white/70 dark:bg-gray-800 rounded-xl pl-9 pr-9 py-2.5 text-sm focus:outline-none focus:ring-2 transition ${errors.newPassword ? "border-red-400 focus:ring-red-100 dark:focus:ring-red-900" : "border-gray-200 dark:border-gray-700 focus:border-indigo-500 focus:ring-indigo-100 dark:focus:ring-indigo-900"}`}
                  placeholder={t("auth.reset.passwordPlaceholder")}
                  {...register("newPassword")}
                />
                <button
                  type="button"
                  onClick={() => setShowPwdText(!showPwdText)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 bg-transparent border-none cursor-pointer"
                >
                  {showPwdText ? <EyeOff size={14} strokeWidth={2.25} /> : <Eye size={14} strokeWidth={2.25} />}
                </button>
              </div>
              {errors.newPassword && (
                <p className="mt-1 text-xs text-red-500">{errors.newPassword.message}</p>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5 uppercase tracking-wide">
                {t("auth.reset.confirmPassword")}
              </label>
              <div className="relative">
                <Lock size={14} strokeWidth={2.25} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  type="password"
                  className={`w-full border-2 bg-white/70 dark:bg-gray-800 rounded-xl pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 transition ${errors.confirmPassword ? "border-red-400 focus:ring-red-100 dark:focus:ring-red-900" : "border-gray-200 dark:border-gray-700 focus:border-indigo-500 focus:ring-indigo-100 dark:focus:ring-indigo-900"}`}
                  placeholder={t("auth.reset.confirmPlaceholder")}
                  {...register("confirmPassword")}
                />
              </div>
              {errors.confirmPassword && (
                <p className="mt-1 text-xs text-red-500">{errors.confirmPassword.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-base font-bold transition-all cursor-pointer bg-indigo-600 hover:bg-indigo-700 text-white hover:shadow-2xl hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed border-none mt-2"
            >
              {isSubmitting ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  {t("auth.reset.submitting")}
                </>
              ) : (
                <>
                  {t("auth.reset.submit")}
                  <ArrowRight size={16} strokeWidth={2.25} />
                </>
              )}
            </button>
          </form>

          <div className="mt-5 text-center">
            <Link href="/login" className="text-sm font-medium text-indigo-500 hover:text-indigo-600 no-underline">
              ← {t("auth.reset.backToLogin")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <ResetForm />
    </Suspense>
  );
}
