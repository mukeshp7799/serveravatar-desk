"use client";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import api from "@/lib/api";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ThemeSelector from "@/components/ThemeSelector";
import Link from "next/link";
import { Sparkles, Rocket, Eye, EyeOff, PartyPopper } from "lucide-react";
import { validateForm, registerSchema } from "@/lib/schemas";

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useTranslation();
  const [departments, setDepartments] = useState<any[]>([]);
  const [designations, setDesignations] = useState<any[]>([]);
  const [form, setForm] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    firstName: "",
    lastName: "",
    employeeId: "",
    departmentId: "",
    designationId: "",
    hireDate: "",
  });
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);

  useEffect(() => {
    Promise.all([api.get("/departments"), api.get("/designations")])
      .then(([deptData, desigData]) => {
        setDepartments(deptData.departments || []);
        setDesignations(desigData.designations || []);
      })
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const valid = validateForm(registerSchema, form);
    if (!valid) return;

    setLoading(true);
    try {
      await api.post("/auth/register", {
        email: valid.email,
        password: valid.password,
        firstName: valid.firstName,
        lastName: valid.lastName,
        employeeId: valid.employeeId || null,
        departmentId: valid.departmentId || null,
        designationId: valid.designationId || null,
        hireDate: valid.hireDate || null,
        roleId: 1,
      });

      const data = await api.post("/auth/login", {
        email: valid.email,
        password: valid.password,
      });

      api.setToken(data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      const pendingToken = localStorage.getItem("pending_invitation_token");
      localStorage.removeItem("pending_invitation_token");
      // If user has a pending invitation token, redirect to the confirmation page
      if (pendingToken) {
        router.push(`/invitation-confirm/${pendingToken}`)
      } else {
        const nextUrl = searchParams.get("next");
        const redirectTo = (nextUrl && nextUrl.startsWith("/")) ? nextUrl : "/dashboard";
        router.push(redirectTo);
      }
    } catch (err: any) {
      toast.error(err.message || t("auth.register.registerFailed"));
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 auth-bg-base"></div>
      <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-indigo-400 rounded-full filter blur-3xl opacity-30 animate-float-slow auth-glow-a"></div>
      <div className="absolute bottom-1/4 left-1/4 w-96 h-96 bg-indigo-500 rounded-full filter blur-3xl opacity-20 animate-pulse-slow auth-glow-b"></div>

      <div className="absolute top-4 right-4 z-30 flex items-center gap-2">
        <div className="bg-white/30 backdrop-blur-md border border-white/50 rounded-2xl shadow-lg dark:bg-white/10 dark:border-white/20">
          <ThemeSelector />
        </div>
        <div className="bg-white/30 backdrop-blur-md border border-white/50 rounded-2xl shadow-lg dark:bg-white/10 dark:border-white/20">
          <LanguageSwitcher compact />
        </div>
      </div>

      <div className="relative z-10 w-full max-w-3xl">
        <div className="glass rounded-3xl p-8 sm:p-10 shadow-2xl animate-scale-in my-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center">
              <Rocket size={24} strokeWidth={2.25} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">{t("auth.register.title")}</h1>
              <p className="text-gray-500 text-xs">{t("auth.register.subtitle")}</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5 uppercase tracking-wide">{t("auth.register.firstName")}</label>
                <input name="firstName" value={form.firstName} onChange={handleChange} className="w-full border-2 border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900" placeholder="John" required />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5 uppercase tracking-wide">{t("auth.register.lastName")}</label>
                <input name="lastName" value={form.lastName} onChange={handleChange} className="w-full border-2 border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900" placeholder="Doe" required />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5 uppercase tracking-wide">{t("auth.register.email")}</label>
              <input name="email" type="email" value={form.email} onChange={handleChange} className="w-full border-2 border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900" placeholder="john@company.com" required />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5 uppercase tracking-wide">{t("auth.register.password")}</label>
                <div className="relative">
                  <input name="password" type={showPwd ? "text" : "password"} value={form.password} onChange={handleChange} className="w-full border-2 border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900 pr-10" placeholder="Min. 6 characters" required />
                  <button type="button" onClick={() => setShowPwd(!showPwd)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 bg-transparent border-none cursor-pointer text-sm">
                    {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5 uppercase tracking-wide">{t("auth.register.confirmPassword")}</label>
                <input name="confirmPassword" type="password" value={form.confirmPassword} onChange={handleChange} className="w-full border-2 border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900" placeholder="Repeat password" required />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5 uppercase tracking-wide">Department</label>
                <select name="departmentId" value={form.departmentId} onChange={handleChange} className="w-full border-2 border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900">
                  <option value="">None</option>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5 uppercase tracking-wide">Designation</label>
                <select name="designationId" value={form.designationId} onChange={handleChange} className="w-full border-2 border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900">
                  <option value="">None</option>
                  {designations.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5 uppercase tracking-wide">Employee ID</label>
                <input name="employeeId" value={form.employeeId} onChange={handleChange} className="w-full border-2 border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900" placeholder="EMP-001" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5 uppercase tracking-wide">Hire Date</label>
              <input name="hireDate" type="date" value={form.hireDate} onChange={handleChange} className="w-full border-2 border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900" />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-base font-bold transition-all cursor-pointer bg-indigo-600 hover:bg-indigo-700 text-white hover:shadow-2xl hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed border-none mt-2"
            >
              {loading ? (
                <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span> {t("auth.register.registering")}…</>
              ) : (
                <>{t("auth.register.submit")} <PartyPopper size={16} strokeWidth={2.25} /></>
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              {t("auth.register.hasAccount")} <Link href="/login" className="font-bold text-indigo-600 hover:text-indigo-700 no-underline">{t("auth.register.signIn")}</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <RegisterForm />
    </Suspense>
  );
}
