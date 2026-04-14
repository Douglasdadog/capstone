import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireDemoSession } from "@/lib/auth/session";
import {
  DEMO_USERS_COOKIE,
  buildRegisteredUser,
  readRegisteredUsers,
  serializeRegisteredUsers
} from "@/lib/auth/demo-auth";
import { UserRole, normalizeRole } from "@/lib/auth/roles";
import { enforceRateLimit } from "@/lib/security/rate-limit";

export async function POST(request: NextRequest) {
  const auth = requireDemoSession(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });
  if (auth.session.role !== "Admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rateLimited = enforceRateLimit(request, "admin-create-user", 20, 60_000);
  if (rateLimited) return rateLimited;

  const body = (await request.json()) as {
    email?: string;
    password?: string;
    role?: UserRole;
  };
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const role = normalizeRole(body.role);

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }
  if (email.length > 190 || password.length > 128) {
    return NextResponse.json({ error: "Input exceeds allowed length." }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
  }

  const existing = readRegisteredUsers(request.cookies.get(DEMO_USERS_COOKIE)?.value);
  if (existing.some((user) => user.email === email)) {
    return NextResponse.json({ error: "User already exists in local registry." }, { status: 409 });
  }

  try {
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role }
    });
    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes("already") || msg.includes("exists")) {
        return NextResponse.json({ error: "User already exists in Supabase." }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const updatedUsers = [...existing, buildRegisteredUser(email, password, role)];
    const response = NextResponse.json({ ok: true });
    response.cookies.set(DEMO_USERS_COOKIE, serializeRegisteredUsers(updatedUsers), {
      httpOnly: true,
      sameSite: "lax",
      path: "/"
    });
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create user." },
      { status: 500 }
    );
  }
}
