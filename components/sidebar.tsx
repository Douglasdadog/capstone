"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Package,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Truck,
  Users,
  type LucideIcon
} from "lucide-react";
import { type NavLink, type UserRole } from "@/lib/auth/roles";

const LINK_ICONS: Record<string, LucideIcon> = {
  "/dashboard": LayoutDashboard,
  "/admin": ShieldCheck,
  "/admin/settings": Settings,
  "/inventory": Package,
  "/sales": ShoppingCart,
  "/logistics": Truck,
  "/client": Users,
  "/settings": Settings
};

function resolveActiveHref(pathname: string, links: NavLink[]): string | null {
  const matches = links.filter(
    (l) => pathname === l.href || (l.href !== "/" && pathname.startsWith(`${l.href}/`))
  );
  if (matches.length === 0) return null;
  return matches.reduce((best, cur) => (cur.href.length > best.href.length ? cur : best)).href;
}

export default function Sidebar() {
  const pathname = usePathname();
  const [role, setRole] = useState<UserRole | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [visibleLinks, setVisibleLinks] = useState<NavLink[]>([]);
  const [menuLoading, setMenuLoading] = useState(true);

  useEffect(() => {
    async function loadSession() {
      setMenuLoading(true);
      const response = await fetch("/api/auth/session");
      if (!response.ok) {
        setRole(null);
        setEmail(null);
        setVisibleLinks([]);
        setMenuLoading(false);
        return;
      }
      const data = (await response.json()) as {
        email?: string;
        role?: UserRole;
        visibleLinks?: NavLink[];
      };
      setEmail(data.email ?? null);
      setRole(data.role ?? null);
      setVisibleLinks(data.visibleLinks ?? []);
      setMenuLoading(false);
    }
    void loadSession();
  }, []);

  async function handleLogout() {
    await fetch("/api/auth/demo-logout", { method: "POST" });
    window.location.href = "/login";
  }

  const activeHref = resolveActiveHref(pathname, visibleLinks);

  return (
    <aside className="h-screen w-full max-w-60 border-r border-slate-200 bg-white p-4">
      <h2 className="mb-6 text-xl font-semibold text-slate-900">WIS</h2>
      {email ? (
        <p className="mb-3 text-xs text-slate-500">
          {email}
          {role ? (
            <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-700">
              {role}
            </span>
          ) : null}
        </p>
      ) : null}
      <nav className="space-y-1">
        {menuLoading ? (
          <p className="px-3 py-2 text-sm text-slate-400">Loading menu…</p>
        ) : (
          visibleLinks.map((link) => {
            const Icon = LINK_ICONS[link.href] ?? LayoutDashboard;
            const active = activeHref === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-2 border-l-4 py-2 pl-2 pr-3 text-sm transition-colors ${
                  active
                    ? "border-blue-600 bg-blue-50 font-medium text-slate-900"
                    : "border-transparent text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${active ? "text-blue-700" : "text-slate-500"}`} />
                {link.label}
              </Link>
            );
          })
        )}
      </nav>
      <button
        type="button"
        onClick={handleLogout}
        className="mt-6 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
      >
        Logout (Demo)
      </button>
    </aside>
  );
}
