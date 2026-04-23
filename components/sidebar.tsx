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
  "/super-admin": ShieldCheck,
  "/admin": ShieldCheck,
  "/admin/reports": ShieldCheck,
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

function formatRoleLabel(role: UserRole): string {
  return role === "SuperAdmin" ? "Super Admin" : role;
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

  const activeHref = resolveActiveHref(pathname, visibleLinks);

  return (
    <aside className="h-screen w-full max-w-64 border-r border-white/40 bg-white/75 p-4 backdrop-blur-xl">
      <div className="mb-6">
        <p className="text-2xl font-black italic leading-none text-red-600">imarflex.</p>
        <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">WIS Console</p>
      </div>
      {email ? (
        <p className="mb-3 text-xs text-slate-500">
          {email}
          {role ? (
            <span className="ml-2 rounded border border-slate-200 bg-white px-1.5 py-0.5 font-medium text-slate-700 shadow-sm">
              {formatRoleLabel(role)}
            </span>
          ) : null}
        </p>
      ) : null}
      <nav className="space-y-1.5">
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
                className={`flex items-center gap-2 rounded-r-lg border-l-4 py-2 pl-2 pr-3 text-sm transition-all ${
                  active
                    ? "border-yellow-500 bg-gradient-to-r from-yellow-50 to-red-50 font-semibold text-slate-900 shadow-sm"
                    : "border-transparent text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${active ? "text-red-600" : "text-slate-500"}`} />
                {link.label}
              </Link>
            );
          })
        )}
      </nav>
    </aside>
  );
}
