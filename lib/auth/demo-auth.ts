import { UserRole, normalizeRole } from "@/lib/auth/roles";

export type DemoSession = {
  email: string;
  role: UserRole;
  source: "sample" | "registered";
};

export type DemoUser = {
  email: string;
  password: string;
  role: UserRole;
};

type UserPermissionsMap = Record<string, string[]>;
type UserProfilesMap = Record<string, { fullName: string; phone: string }>;

export const DEMO_SESSION_COOKIE = "wis_demo_session";
export const DEMO_USERS_COOKIE = "wis_demo_users";
export const DEMO_PERMISSIONS_COOKIE = "wis_demo_permissions";
export const DEMO_PROFILE_COOKIE = "wis_demo_profile";

const SAMPLE_USERS: DemoUser[] = [
  { email: "admin@wis.local", password: "admin123", role: "Admin" },
  { email: "inventory@wis.local", password: "inventory123", role: "Inventory" },
  { email: "sales@wis.local", password: "sales123", role: "Sales" },
  { email: "client@wis.local", password: "client123", role: "Client" }
];

function safeJsonParse<T>(value: string | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function readSession(rawCookie: string | undefined): DemoSession | null {
  const session = safeJsonParse<DemoSession | null>(rawCookie, null);
  if (!session?.email) return null;
  return {
    email: session.email,
    role: normalizeRole(session.role),
    source: session.source === "registered" ? "registered" : "sample"
  };
}

export function serializeSession(session: DemoSession): string {
  return JSON.stringify(session);
}

export function readRegisteredUsers(rawCookie: string | undefined): DemoUser[] {
  const users = safeJsonParse<DemoUser[]>(rawCookie, []);
  return users
    .filter((u) => u?.email && u?.password)
    .map((u) => ({
      email: u.email.toLowerCase(),
      password: u.password,
      role: normalizeRole(u.role)
    }));
}

export function serializeRegisteredUsers(users: DemoUser[]): string {
  return JSON.stringify(users);
}

export function findUser(email: string, password: string, registeredUsers: DemoUser[]): DemoUser | null {
  const normalizedEmail = email.toLowerCase();
  const allUsers = [...SAMPLE_USERS, ...registeredUsers];
  return allUsers.find((user) => user.email === normalizedEmail && user.password === password) ?? null;
}

export function buildRegisteredUser(email: string, password: string, role: UserRole): DemoUser {
  return {
    email: email.toLowerCase(),
    password,
    role
  };
}

export function getSampleUsers(): DemoUser[] {
  return SAMPLE_USERS;
}

export function readPermissions(rawCookie: string | undefined): UserPermissionsMap {
  const data = safeJsonParse<UserPermissionsMap>(rawCookie, {});
  return Object.fromEntries(
    Object.entries(data).map(([email, routes]) => [
      email.toLowerCase(),
      Array.isArray(routes) ? routes.filter((route) => typeof route === "string") : []
    ])
  );
}

export function serializePermissions(data: UserPermissionsMap): string {
  return JSON.stringify(data);
}

export function getUserExtraRoutes(email: string, rawCookie: string | undefined): string[] {
  const permissions = readPermissions(rawCookie);
  return permissions[email.toLowerCase()] ?? [];
}

export function setUserExtraRoutes(
  email: string,
  routes: string[],
  rawCookie: string | undefined
): UserPermissionsMap {
  const permissions = readPermissions(rawCookie);
  permissions[email.toLowerCase()] = [...new Set(routes)];
  return permissions;
}

export function readProfiles(rawCookie: string | undefined): UserProfilesMap {
  return safeJsonParse<UserProfilesMap>(rawCookie, {});
}

export function serializeProfiles(data: UserProfilesMap): string {
  return JSON.stringify(data);
}
