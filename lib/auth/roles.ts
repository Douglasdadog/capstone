export type UserRole = "Admin" | "Inventory" | "Sales" | "Client";

export type NavLink = {
  href: string;
  label: string;
  grantable?: boolean;
};

export const DASHBOARD_ROUTES = {
  Admin: "/dashboard",
  Inventory: "/inventory",
  Sales: "/sales",
  Client: "/client"
} as const;

export const ROLE_ACCESS: Record<UserRole, string[]> = {
  Admin: [
    "/dashboard",
    "/logs",
    "/admin",
    "/admin/settings",
    "/inventory",
    "/sales",
    "/client",
    "/logistics"
  ],
  Inventory: ["/dashboard", "/inventory", "/settings"],
  Sales: ["/dashboard", "/sales", "/logistics", "/settings"],
  Client: ["/client", "/settings"]
};

export const SIDEBAR_LINKS: NavLink[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/admin", label: "Admin", grantable: true },
  { href: "/admin/settings", label: "Settings" },
  { href: "/inventory", label: "Inventory", grantable: true },
  { href: "/sales", label: "Sales", grantable: true },
  { href: "/logistics", label: "Logistics", grantable: true },
  { href: "/client", label: "Client", grantable: true },
  { href: "/settings", label: "Settings" }
];

export function normalizeRole(role: unknown): UserRole {
  if (role === "Admin" || role === "Inventory" || role === "Sales" || role === "Client") {
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
  return role === "Client" ? "/client" : "/dashboard";
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
