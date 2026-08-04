"use client";
import { useState, Suspense } from "react";
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
  Sparkles, Mail, ArrowRight, CheckCircle,
  Shield, Clock, Zap, Inbox, ArrowLeft,
} from "lucide-react";

const forgotSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Please enter a valid email'),
});
type ForgotInput = z.infer<typeof forgotSchema>;

function ForgotForm() {
  const { t } = useTranslation();
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotInput>({
    resolver: zodResolver(forgotSchema),
    mode: "onBlur",
  });

  const onSubmit = async (data: ForgotInput) => {
    try {
      await api.post("/auth/forgot-password", data);
      setDone(true);
    } catch (err: any) {
      toast.error(err.message || "Something went wrong");
    }
  };

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute inset-0 auth-bg-base"></div>
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-400 rounded-full filter blur-3xl opacity-30 animate-float-slow auth-glow-a"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-500 rounded-full filter blur-3xl opacity-20 animate-pulse-slow auth-glow-b"></div>

        {/* Language / theme switchers */}
        <div className="absolute top-4 right-4 z-30 flex items-center gap-2">
          <div className="bg-white/30 backdrop-blur-md border border-white/50 rounded-2xl shadow-lg dark:bg-white/10 dark:border-white/20">
            <ThemeSelector />
          </div>
          <div className="bg-white/30 backdrop-blur-md border border-white/50 rounded-2xl shadow-lg dark:bg-white/10 dark:border-white/20">
            <LanguageSwitcher compact />
          </div>
        </div>

        {/* Two-column layout */}
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
              Check Your<br />
              <span className="text-indigo-600 against-auth-bg">Inbox!</span>
            </h2>
            <p className="text-white/80 text-lg mb-8 max-w-md">
              We&apos;ve sent a secure password reset link to your email. Click the link to set a new password.
            </p>
            <div className="flex flex-wrap gap-3">
              <span className="px-4 py-2 rounded-full bg-white/15 backdrop-blur-sm text-sm font-medium inline-flex items-center gap-2">
                <Shield size={14} strokeWidth={2.25} /> Secure Reset Link
              </span>
              <span className="px-4 py-2 rounded-full bg-white/15 backdrop-blur-sm text-sm font-medium inline-flex items-center gap-2">
                <Clock size={14} strokeWidth={2.25} /> Expires in 15 Minutes
              </span>
              <span className="px-4 py-2 rounded-full bg-white/15 backdrop-blur-sm text-sm font-medium inline-flex items-center gap-2">
                <Zap size={14} strokeWidth={2.25} /> Takes Only 30 Seconds
              </span>
            </div>
          </div>

          {/* Right side — success glass card */}
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

            {/* Success icon */}
            <div className="flex justify-center mb-5">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle size={32} strokeWidth={2.25} className="text-green-600" />
              </div>
            </div>

            {/* Success title + subtitle */}
            <div className="mb-7 text-center">
              <h2 className="text-2xl font-extrabold text-gray-900 dark:text-white mb-1 inline-flex items-center gap-2">
                {t("auth.forgot.successTitle")} <Inbox size={20} strokeWidth={2.25} className="text-indigo-500" />
              </h2>
              <p className="text-gray-500 text-sm">{t("auth.forgot.successMessage")}</p>
            </div>

            {/* Divider */}
            <div className="border-t border-gray-200 dark:border-gray-700 mb-5" />

            {/* Tips */}
            <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-xl p-4 mb-5">
              <p className="text-xs font-bold text-indigo-700 dark:text-indigo-300 mb-2 uppercase tracking-wide"> Didn&apos;t receive it? </p>
              <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                <li className="flex items-start gap-1.5">
                  <span className="text-indigo-500 mt-0.5"><Inbox size={12} strokeWidth={2.25} /></span>
                  Check your spam or junk folder
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-indigo-500 mt-0.5"><Clock size={12} strokeWidth={2.25} /></span>
                  Wait 2–3 minutes and try again
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-indigo-500 mt-0.5"><Shield size={12} strokeWidth={2.25} /></span>
                  Make sure you entered the correct email
                </li>
              </ul>
            </div>

            {/* Back to login */}
            <Link
              href="/login"
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-bold transition-all bg-indigo-600 hover:bg-indigo-700 text-white hover:shadow-xl hover:scale-[1.01] active:scale-[0.99] no-underline"
            >
              <ArrowLeft size={14} strokeWidth={2.25} />
              {t("auth.forgot.backToLogin")}
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
              <Sparkles size={28} strokeWidth={2.25} />
            </div>
            <div>
              <h1 className="text-2xl font-bold">{t('app.name')}</h1>
              <p className="text-white/80 text-sm">{t('app.tagline')}</p>
            </div>
          </div>
          <h2 className="text-5xl font-extrabold leading-tight mb-4">
            Forgot Your<br />
            <span className="text-indigo-600 against-auth-bg">Password?</span>
          </h2>
          <p className="text-white/80 text-lg mb-8 max-w-md">
            No worries! Enter your email and we&apos;ll send you a secure link to reset your password instantly.
          </p>
          <div className="flex flex-wrap gap-3">
            <span className="px-4 py-2 rounded-full bg-white/15 backdrop-blur-sm text-sm font-medium inline-flex items-center gap-2">
              <Sparkles size={14} strokeWidth={2.25} /> Secure Reset Link
            </span>
            <span className="px-4 py-2 rounded-full bg-white/15 backdrop-blur-sm text-sm font-medium inline-flex items-center gap-2">
              <CheckCircle size={14} strokeWidth={2.25} /> Takes Only 30 Seconds
            </span>
          </div>
        </div>

        {/* Right side — form glass card */}
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
              {t("auth.forgot.title")} <Sparkles size={18} strokeWidth={2.25} className="text-indigo-500" />
            </h2>
            <p className="text-gray-500 text-sm">{t("auth.forgot.subtitle")}</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5 uppercase tracking-wide">
                {t("auth.forgot.email")}
              </label>
              <div className="relative">
                <Mail size={16} strokeWidth={2.25} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  type="email"
                  className={`w-full border-2 bg-white/70 dark:bg-gray-800 rounded-xl pl-11 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 transition ${errors.email ? "border-red-400 focus:ring-red-100 dark:focus:ring-red-900" : "border-gray-200 dark:border-gray-700 focus:border-indigo-500 focus:ring-indigo-100 dark:focus:ring-indigo-900"}`}
                  placeholder={t("auth.forgot.emailPlaceholder")}
                  {...register("email")}
                />
              </div>
              {errors.email && (
                <p className="mt-1 text-xs text-red-500">{errors.email.message}</p>
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
                  {t("auth.forgot.submitting")}
                </>
              ) : (
                <>
                  {t("auth.forgot.submit")}
                  <ArrowRight size={16} strokeWidth={2.25} />
                </>
              )}
            </button>
          </form>

          <div className="mt-5 text-center">
            <Link href="/login" className="text-sm font-medium text-indigo-500 hover:text-indigo-600 no-underline">
              ← {t("auth.forgot.backToLogin")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <ForgotForm />
    </Suspense>
  );
}
