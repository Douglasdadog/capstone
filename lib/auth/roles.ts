export type UserRole = "SuperAdmin" | "Admin" | "Inventory" | "Sales" | "Client";

export type NavLink = {
  href: string;
  label: string;
  grantable?: boolean;
};

export const DASHBOARD_ROUTES = {
  SuperAdmin: "/super-admin",
  Admin: "/dashboard",
  Inventory: "/inventory",
  Sales: "/sales",
  Client: "/client"
} as const;

export const ROLE_ACCESS: Record<UserRole, string[]> = {
  SuperAdmin: [
    "/logs",
    "/super-admin",
    "/admin",
    "/admin/settings",
    "/inventory",
    "/sales",
    "/client",
    "/logistics"
  ],
  Admin: [
    "/dashboard",
    "/logs",
    "/admin",
    "/inventory",
    "/sales",
    "/client",
    "/logistics"
  ],
  Inventory: ["/dashboard", "/inventory", "/settings"],
  Sales: ["/dashboard", "/sales", "/logistics", "/admin/reports", "/settings"],
  Client: ["/client", "/settings"]
};

export const SIDEBAR_LINKS: NavLink[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/super-admin", label: "Super Admin" },
  { href: "/admin", label: "Admin", grantable: true },
  { href: "/admin/reports", label: "Reports" },
  { href: "/inventory", label: "Inventory", grantable: true },
  { href: "/sales", label: "Sales", grantable: true },
  { href: "/client", label: "Client", grantable: true },
  { href: "/admin/settings", label: "Settings" },
  { href: "/settings", label: "Settings" }
];

export function normalizeRole(role: unknown): UserRole {
  if (
    role === "SuperAdmin" ||
    role === "Admin" ||
    role === "Inventory" ||
    role === "Sales" ||
    role === "Client"
  ) {
    return role;
  }
  return "Client";
}

export function canAccess(role: UserRole, pathname: string): boolean {
  const allowed = ROLE_ACCESS[role];
  return allowed.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

export function canAccessWithExtras(role: UserRole, pathname: string, extraRoutes: string[]): boolean {
  if (canAccess(role, pathname)) return true;
  return extraRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

/** Default landing path after sign-in when no valid deep link is provided. */
export function getPostLoginRedirect(role: UserRole): string {
  return DASHBOARD_ROUTES[role];
}

/**
 * Use `redirectedFrom` only if that path is allowed for this role; otherwise use role home.
 * Avoids sending Client users to `/dashboard` (403) when the default was wrong.
 */
export function resolvePostLoginPath(role: UserRole, redirectedFrom: string | null): string {
  const fallback = getPostLoginRedirect(role);
  if (!redirectedFrom || redirectedFrom === "/" || redirectedFrom === "/login") {
    return fallback;
  }
  return canAccess(role, redirectedFrom) ? redirectedFrom : fallback;
}
