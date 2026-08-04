"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import toast from "react-hot-toast";
import api from "@/lib/api";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ThemeSelector from "@/components/ThemeSelector";
import { Sparkles, Lock, Eye, EyeOff, ArrowRight, CheckCircle } from "lucide-react";

export default function ResetPasswordPage() {
  const router = useRouter();
  const { t } = useTranslation();
  
  // Extract token from URL pathname
  const pathname = typeof window !== "undefined" ? window.location.pathname : "";
  const tokenFromUrl = pathname.split("/").pop() || "";
  
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState("");
  const [token] = useState(tokenFromUrl);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!token) {
      setError(t("auth.reset.errorInvalid"));
      return;
    }
    if (newPassword.length < 6) {
      setError(t("auth.reset.passwordTooShort"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t("auth.reset.passwordMismatch"));
      return;
    }
    setLoading(true);
    try {
      await api.post("/auth/reset-password", { token, newPassword });
      setDone(true);
    } catch (err: any) {
      toast.error(err.message || t("auth.reset.errorGeneric"));
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute inset-0 auth-bg-base"></div>
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-400 rounded-full filter blur-3xl opacity-30 animate-float-slow auth-glow-a"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-500 rounded-full filter blur-3xl opacity-20 animate-pulse-slow auth-glow-b"></div>
        <div className="absolute top-4 right-4 z-30 flex items-center gap-2">
          <div className="bg-white/30 backdrop-blur-md border border-white/50 rounded-2xl shadow-lg">
            <ThemeSelector />
          </div>
          <div className="bg-white/30 backdrop-blur-md border border-white/50 rounded-2xl shadow-lg">
            <LanguageSwitcher compact />
          </div>
        </div>
        <div className="relative z-10 w-full max-w-5xl grid md:grid-cols-2 gap-8 items-center">
          <div className="hidden md:block"></div>
          <div className="glass rounded-3xl p-8 sm:p-10 shadow-2xl animate-scale-in text-center">
            <div className="flex justify-center mb-5">
              <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center">
                <Lock size={28} strokeWidth={2.25} className="text-red-400" />
              </div>
            </div>
            <h2 className="text-2xl font-extrabold text-gray-900 dark:text-white mb-2">{t("auth.reset.errorInvalid")}</h2>
            <p className="text-gray-500 text-sm mb-6">{t("auth.forgot.successMessage")}</p>
            <Link href="/forgot-password" className="inline-flex items-center gap-2 text-sm font-bold text-indigo-600 hover:text-indigo-700 no-underline">
              ← {t("auth.reset.backToLogin")}
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
          <div className="bg-white/30 backdrop-blur-md border border-white/50 rounded-2xl shadow-lg">
            <ThemeSelector />
          </div>
          <div className="bg-white/30 backdrop-blur-md border border-white/50 rounded-2xl shadow-lg">
            <LanguageSwitcher compact />
          </div>
        </div>
        <div className="relative z-10 w-full max-w-5xl grid md:grid-cols-2 gap-8 items-center">
          <div className="hidden md:block"></div>
          <div className="glass rounded-3xl p-8 sm:p-10 shadow-2xl animate-scale-in text-center">
            <div className="flex justify-center mb-5">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle size={32} strokeWidth={2.25} className="text-green-600" />
              </div>
            </div>
            <h2 className="text-2xl font-extrabold text-gray-900 dark:text-white mb-2">{t("auth.reset.successTitle")}</h2>
            <p className="text-gray-500 text-sm mb-6">{t("auth.reset.successMessage")}</p>
            <Link href="/login" className="inline-flex items-center gap-2 text-sm font-bold text-indigo-600 hover:text-indigo-700 no-underline">
              {t("auth.reset.backToLogin")} <ArrowRight size={14} strokeWidth={2.25} />
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
          {/* Mobile logo */}
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

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5 uppercase tracking-wide">
                {t("auth.reset.newPassword")}
              </label>
              <div className="relative">
                <Lock size={14} strokeWidth={2.25} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  type={showPwd ? "text" : "password"}
                  className="w-full border-2 border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800 rounded-xl pl-9 pr-9 py-2.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900 transition"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={t("auth.reset.passwordPlaceholder")}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 bg-transparent border-none cursor-pointer"
                >
                  {showPwd ? <EyeOff size={14} strokeWidth={2.25} /> : <Eye size={14} strokeWidth={2.25} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5 uppercase tracking-wide">
                {t("auth.reset.confirmPassword")}
              </label>
              <div className="relative">
                <Lock size={14} strokeWidth={2.25} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  type="password"
                  className="w-full border-2 border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800 rounded-xl pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900 transition"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={t("auth.reset.confirmPlaceholder")}
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-base font-bold transition-all cursor-pointer bg-indigo-600 hover:bg-indigo-700 text-white hover:shadow-2xl hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed border-none mt-2"
            >
              {loading ? (
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
