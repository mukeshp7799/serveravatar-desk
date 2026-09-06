"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import api from "@/lib/api";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ThemeSelector from "@/components/ThemeSelector";
import Link from "next/link";
import { registerSchema, passwordValidation, isPasswordStrong, type RegisterInput } from "@/lib/schemas";
import { Sparkles, Rocket, Mail, Lock, Eye, EyeOff, ArrowRight, PartyPopper, Check, X } from "lucide-react";

function RegisterForm() {
  const router = useRouter();
  const { t } = useTranslation();
  const [showPwdText, setShowPwdText] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    mode: "onBlur",
  });

  const watchedPassword = watch("password", "");
  const passwordReqs = passwordValidation(watchedPassword);
  const passwordReqList = [
    { label: 'At least 8 characters', met: watchedPassword.length >= 8 },
    { label: '1 uppercase letter (A-Z)', met: /[A-Z]/.test(watchedPassword) },
    { label: '1 lowercase letter (a-z)', met: /[a-z]/.test(watchedPassword) },
    { label: '1 number (0-9)', met: /\d/.test(watchedPassword) },
    { label: '1 special character (!@#$%...)', met: /[!@#$%^&*()_+\-=\[\]{};:'",.<>\/?]/.test(watchedPassword) },
  ];

  const onSubmit = async (data: RegisterInput) => {
    try {
      await api.post("/auth/register", {
        email: data.email,
        password: data.password,
        firstName: data.firstName,
        lastName: data.lastName,
      });
      const result = await api.post("/auth/login", {
        email: data.email,
        password: data.password,
      });
      api.setToken(result.token);
      localStorage.setItem("user", JSON.stringify(result.user));
      const pendingToken = localStorage.getItem("pending_invitation_token");
      localStorage.removeItem("pending_invitation_token");
      if (pendingToken) {
        router.push(`/invitation-confirm/${pendingToken}`);
      } else {
        router.push("/dashboard");
      }
    } catch (err: any) {
      toast.error(err.message || t("auth.register.registerFailed"));
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
              <Rocket size={28} strokeWidth={2.25} />
            </div>
            <div>
              <h1 className="text-2xl font-bold">{t('app.name')}</h1>
              <p className="text-white/80 text-sm">{t('app.tagline')}</p>
            </div>
          </div>
          <h2 className="text-5xl font-extrabold leading-tight mb-4">
            {t('auth.register.heroTitle1') || 'Get Started'}<br />
            <span className="text-indigo-600 against-auth-bg">
              {t('auth.register.heroTitle2') || 'With Serveravatar Hub'}
            </span>
          </h2>
          <p className="text-white/80 text-lg mb-8 max-w-md">
            {t('auth.register.heroSubtitle') || 'Create your account and start managing HR, projects, leaves, and more — all in one place.'}
          </p>
          <div className="flex flex-wrap gap-3">
            <span className="px-4 py-2 rounded-full bg-white/15 backdrop-blur-sm text-sm font-medium inline-flex items-center gap-2">
              <Sparkles size={14} strokeWidth={2.25} /> {t('auth.register.feature1') || 'Quick Setup'}
            </span>
            <span className="px-4 py-2 rounded-full bg-white/15 backdrop-blur-sm text-sm font-medium inline-flex items-center gap-2">
              <Rocket size={14} strokeWidth={2.25} /> {t('auth.register.feature2') || 'Powerful Dashboard'}
            </span>
            <span className="px-4 py-2 rounded-full bg-white/15 backdrop-blur-sm text-sm font-medium inline-flex items-center gap-2">
              <PartyPopper size={14} strokeWidth={2.25} /> {t('auth.register.feature3') || 'Free Forever'}
            </span>
          </div>
        </div>

        {/* Right side — register form glass card */}
        <div className="glass rounded-3xl p-8 sm:p-10 shadow-2xl animate-scale-in">
          {/* Mobile logo */}
          <div className="md:hidden flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white">
              <Rocket size={24} strokeWidth={2.25} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">{t('app.name')}</h1>
              <p className="text-gray-500 text-xs">{t('app.tagline')}</p>
            </div>
          </div>

          <div className="mb-7">
            <h2 className="text-3xl font-extrabold text-gray-900 mb-1 inline-flex items-center gap-2">
              {t('auth.register.title')} <Rocket size={18} strokeWidth={2.25} className="text-indigo-500" />
            </h2>
            <p className="text-gray-500 text-sm">{t('auth.register.subtitle')}</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Name row */}
            <div className="grid grid-cols-2 gap-4">
              {/* First name */}
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5 uppercase tracking-wide">
                  {t("auth.register.firstName")}
                </label>
                <input
                  className={`w-full border-2 bg-white/70 dark:bg-gray-800 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 transition ${errors.firstName ? "border-red-400 focus:ring-red-100 dark:focus:ring-red-900" : "border-gray-200 dark:border-gray-700 focus:border-indigo-500 focus:ring-indigo-100 dark:focus:ring-indigo-900"}`}
                  placeholder={t("auth.register.firstNamePlaceholder") || "John"}
                  {...register("firstName")}
                />
                {errors.firstName && (
                  <p className="mt-1 text-xs text-red-500">{errors.firstName.message}</p>
                )}
              </div>
              {/* Last name */}
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5 uppercase tracking-wide">
                  {t("auth.register.lastName")}
                </label>
                <input
                  className={`w-full border-2 bg-white/70 dark:bg-gray-800 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 transition ${errors.lastName ? "border-red-400 focus:ring-red-100 dark:focus:ring-red-900" : "border-gray-200 dark:border-gray-700 focus:border-indigo-500 focus:ring-indigo-100 dark:focus:ring-indigo-900"}`}
                  placeholder={t("auth.register.lastNamePlaceholder") || "Doe"}
                  {...register("lastName")}
                />
                {errors.lastName && (
                  <p className="mt-1 text-xs text-red-500">{errors.lastName.message}</p>
                )}
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5 uppercase tracking-wide">
                {t("auth.register.email")}
              </label>
              <div className="relative">
                <Mail size={16} strokeWidth={2.25} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  type="email"
                  className={`w-full border-2 bg-white/70 dark:bg-gray-800 rounded-xl pl-11 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 transition ${errors.email ? "border-red-400 focus:ring-red-100 dark:focus:ring-red-900" : "border-gray-200 dark:border-gray-700 focus:border-indigo-500 focus:ring-indigo-100 dark:focus:ring-indigo-900"}`}
                  placeholder={t("auth.register.emailPlaceholder") || "you@company.com"}
                  {...register("email")}
                />
              </div>
              {errors.email && (
                <p className="mt-1 text-xs text-red-500">{errors.email.message}</p>
              )}
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5 uppercase tracking-wide">
                {t("auth.register.password")}
              </label>
              <div className="relative">
                <Lock size={14} strokeWidth={2.25} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  type={showPwdText ? "text" : "password"}
                  className={`w-full border-2 bg-white/70 dark:bg-gray-800 rounded-xl pl-9 pr-9 py-2.5 text-sm focus:outline-none focus:ring-2 transition ${errors.password ? "border-red-400 focus:ring-red-100 dark:focus:ring-red-900" : "border-gray-200 dark:border-gray-700 focus:border-indigo-500 focus:ring-indigo-100 dark:focus:ring-indigo-900"}`}
                  placeholder={t("auth.register.passwordPlaceholder") || "Min. 8 characters"}
                  {...register("password")}
                />
                <button
                  type="button"
                  onClick={() => setShowPwdText(!showPwdText)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 bg-transparent border-none cursor-pointer"
                >
                  {showPwdText ? <EyeOff size={14} strokeWidth={2.25} /> : <Eye size={14} strokeWidth={2.25} />}
                </button>
              </div>
              {errors.password ? (
                <p className="mt-1 text-xs text-red-500">{errors.password.message}</p>
              ) : (
                <div className="mt-2 p-2.5 rounded-lg bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700">
                  <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Password must contain:</p>
                  <div className="grid grid-cols-1 gap-0.5">
                    {passwordReqList.map((req, i) => (
                      <div key={i} className={`flex items-center gap-1.5 text-xs ${req.met ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400 dark:text-gray-500'}`}>
                        {req.met ? <Check size={11} strokeWidth={3} /> : <X size={11} strokeWidth={3} />}
                        {req.label}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5 uppercase tracking-wide">
                {t("auth.register.confirmPassword")}
              </label>
              <div className="relative">
                <Lock size={14} strokeWidth={2.25} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  type="password"
                  className={`w-full border-2 bg-white/70 dark:bg-gray-800 rounded-xl pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 transition ${errors.confirmPassword ? "border-red-400 focus:ring-red-100 dark:focus:ring-red-900" : "border-gray-200 dark:border-gray-700 focus:border-indigo-500 focus:ring-indigo-100 dark:focus:ring-indigo-900"}`}
                  placeholder={t("auth.register.confirmPasswordPlaceholder") || "Repeat password"}
                  {...register("confirmPassword")}
                />
              </div>
              {errors.confirmPassword && (
                <p className="mt-1 text-xs text-red-500">{errors.confirmPassword.message}</p>
              )}
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-base font-bold transition-all cursor-pointer bg-indigo-600 hover:bg-indigo-700 text-white hover:shadow-2xl hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed border-none mt-2"
            >
              {isSubmitting ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  {t("auth.register.registering")}
                </>
              ) : (
                <>
                  {t("auth.register.submit")}
                  <PartyPopper size={16} strokeWidth={2.25} />
                </>
              )}
            </button>
          </form>

          <div className="mt-5 text-center">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t("auth.register.haveAccount")}{" "}
              <Link href="/login" className="font-bold text-indigo-600 hover:text-indigo-700 no-underline">
                {t("auth.register.signIn")} <ArrowRight size={14} strokeWidth={2.25} className="inline-block ml-0.5" />
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return <RegisterForm />;
}
