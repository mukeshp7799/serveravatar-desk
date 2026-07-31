"use client";
import api from "@/lib/api";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: "◈" },
  { section: "HR Management" },
  { href: "/employees", label: "Employees", icon: "◉" },
  { href: "/leaves", label: "Leave Management", icon: "◎" },
  { href: "/structure", label: "Departments & Designations", icon: "⬡" },
  { href: "/roles", label: "Roles & Permissions", icon: "⬢" },
  { section: "Projects" },
  { href: "/projects", label: "Projects", icon: "◆" },
  { href: "/discussions", label: "Discussions", icon: "○" },
  { section: "Company" },
  { href: "/announcements", label: "Announcements", icon: "★" },
  { href: "/settings", label: "Settings", icon: "⚙" },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<any>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const token = localStorage.getItem("token");
    const storedUser = localStorage.getItem("user");
    if (!token) {
      router.replace("/login");
      return;
    }
    if (storedUser) setUser(JSON.parse(storedUser));
  }, [router]);

  // Fetch unread notification count (including pending invitations)
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;
    api.get('/notifications').then(res => {
      setUnreadCount(res.unreadCount || 0)
    }).catch(() => {})
  }, [user])

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.push("/login");
  };

  if (!user) return null;

  const initials =
    `${user.firstName?.[0] || ""}${user.lastName?.[0] || ""}`.toUpperCase();
  const currentPage =
    navItems.find((n) => !("section" in n) && pathname.startsWith(n.href))
      ?.label || "Dashboard";

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="fixed top-0 left-0 w-64 min-h-screen bg-indigo-950 text-white flex flex-col z-50">
        <div className="border-b border-white/10 px-6 py-5 font-bold text-lg shrink-0 flex items-center justify-between gap-2">
          <span className="text-indigo-400 font-bold">Serveravatar Hub</span>
        </div>
        <nav className="flex-1 py-2 overflow-y-auto">
          {navItems.map((item, i) =>
            "section" in item ? (
              <div
                key={i}
                className="uppercase tracking-wider text-indigo-400 px-6 py-4 pt-6 text-xs font-semibold"
              >
                {item.section}
              </div>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 w-[calc(100%-16px)] mx-2 my-0.5 px-6 py-2.5 text-sm rounded-lg no-underline transition-colors ${pathname === item.href ? "bg-white/10 text-white" : "text-indigo-200 hover:bg-white/10 hover:text-white"}`}
              >
                <span>{item.icon}</span>
                {item.label}
              </Link>
            ),
          )}
        </nav>
        <div className="border-t border-white/10 px-6 py-4 shrink-0">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm font-semibold shrink-0">
              {initials}
            </div>
            <div>
              <div className="text-sm font-semibold text-white">
                {user.firstName} {user.lastName}
              </div>
              <div className="text-xs text-indigo-200">{user.roleName}</div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="inline-flex items-center gap-2 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer w-full justify-center bg-white/10 text-white hover:bg-white/20 border border-white/20"
          >
            Logout
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-col flex-1 min-h-screen ml-64">
        {/* Top bar */}
        <div className="sticky top-0 z-10 bg-white border-b border-gray-200 flex items-center justify-between h-16 px-8 shrink-0">
          <div>
            <h1 className="text-lg font-semibold">{currentPage}</h1>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/notifications"
              className="relative text-gray-500 no-underline text-xl"
            >
              🔔
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 text-xs flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </Link>
            <Link
              href="/settings"
              className="flex items-center gap-2 no-underline text-gray-700 text-sm font-medium"
            >
              <div className="w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-semibold shrink-0">
                {initials}
              </div>
              <span>{user.firstName}</span>
            </Link>
          </div>
        </div>

        {/* Page content */}
        <div className="p-8 bg-gray-100 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
