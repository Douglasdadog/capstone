import { UserRole, normalizeRole } from "@/lib/auth/roles";

export type DemoSession = {
  email: string;
  role: UserRole;
  source: "sample" | "registered";
  mfaVerified: boolean;
  supabaseUserId?: string | null;
};

export type DemoUser = {
  email: string;
  password: string;
  role: UserRole;
};

type UserPermissionsMap = Record<string, string[]>;
type UserProfilesMap = Record<string, { fullName: string; phone: string }>;
type UserMfaMap = Record<string, string>;
type VerificationCodeMap = Record<string, { code: string; expiresAt: number }>;

export const DEMO_SESSION_COOKIE = "wis_demo_session";
export const DEMO_USERS_COOKIE = "wis_demo_users";
export const DEMO_PERMISSIONS_COOKIE = "wis_demo_permissions";
export const DEMO_PROFILE_COOKIE = "wis_demo_profile";
export const DEMO_MFA_COOKIE = "wis_demo_mfa";
export const DEMO_MFA_PENDING_COOKIE = "wis_demo_mfa_pending";
export const DEMO_EMAIL_VERIFY_COOKIE = "wis_demo_email_verify";

const SAMPLE_USERS: DemoUser[] = [
  { email: "bunuan.arthur+superadmin@gmail.com", password: "superadmin123", role: "SuperAdmin" },
  { email: "bunuan.arthur+admin@gmail.com", password: "admin123", role: "Admin" },
  { email: "bunuan.arthur+inventory@gmail.com", password: "inventory123", role: "Inventory" },
  { email: "bunuan.arthur+sales@gmail.com", password: "sales123", role: "Sales" },
  { email: "bunuan.arthur+client@gmail.com", password: "client123", role: "Client" }
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
    source: session.source === "registered" ? "registered" : "sample",
    mfaVerified: Boolean(session.mfaVerified),
    supabaseUserId: typeof session.supabaseUserId === "string" ? session.supabaseUserId : null
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

export function readMfaSecrets(rawCookie: string | undefined): UserMfaMap {
  const data = safeJsonParse<UserMfaMap>(rawCookie, {});
  return Object.fromEntries(
    Object.entries(data).filter(
      ([email, secret]) => typeof email === "string" && typeof secret === "string" && secret.length > 0
    )
  );
}

export function serializeMfaSecrets(data: UserMfaMap): string {
  return JSON.stringify(data);
}

export function readEmailVerificationCodes(rawCookie: string | undefined): VerificationCodeMap {
  const data = safeJsonParse<VerificationCodeMap>(rawCookie, {});
  return Object.fromEntries(
    Object.entries(data).filter(([email, entry]) => {
      return (
        typeof email === "string" &&
        entry &&
        typeof entry.code === "string" &&
        typeof entry.expiresAt === "number"
      );
    })
  );
}

export function serializeEmailVerificationCodes(data: VerificationCodeMap): string {
  return JSON.stringify(data);
}
