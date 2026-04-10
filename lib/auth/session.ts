import { NextRequest } from "next/server";
import { DEMO_SESSION_COOKIE, readSession } from "@/lib/auth/demo-auth";
import { UserRole, normalizeRole } from "@/lib/auth/roles";

export function requireDemoSession(request: NextRequest) {
  const session = readSession(request.cookies.get(DEMO_SESSION_COOKIE)?.value);
  if (!session) {
    return { ok: false as const, error: "Unauthorized" };
  }

  return {
    ok: true as const,
    session: {
      email: session.email.toLowerCase(),
      role: normalizeRole(session.role) as UserRole
    }
  };
}
