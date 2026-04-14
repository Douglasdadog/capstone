import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { UserRole } from "@/lib/auth/roles";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import {
  DEMO_SESSION_COOKIE,
  DEMO_USERS_COOKIE,
  buildRegisteredUser,
  readRegisteredUsers,
  serializeRegisteredUsers,
  serializeSession
} from "@/lib/auth/demo-auth";

export async function POST(request: NextRequest) {
  const rateLimited = enforceRateLimit(request, "auth-register", 5, 60_000);
  if (rateLimited) return rateLimited;

  const { email, password, role } = (await request.json()) as {
    email?: string;
    password?: string;
    role?: UserRole;
  };

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  if (email.length > 190 || password.length > 128) {
    return NextResponse.json({ error: "Input exceeds allowed length." }, { status: 400 });
  }

  if (password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
  }

  const normalizedRole = "Client";
  const registeredUsers = readRegisteredUsers(request.cookies.get(DEMO_USERS_COOKIE)?.value);
  const normalizedEmail = email.toLowerCase();
  let supabaseUserId: string | null = null;

  if (registeredUsers.some((user) => user.email === normalizedEmail)) {
    return NextResponse.json({ error: "This test account already exists." }, { status: 409 });
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: {
        role: normalizedRole
      }
    });

    if (error) {
      const message = error.message.toLowerCase();
      if (message.includes("already") || message.includes("exists")) {
        return NextResponse.json({ error: "This account already exists in Supabase." }, { status: 409 });
      }
      return NextResponse.json({ error: `Supabase registration failed: ${error.message}` }, { status: 400 });
    }
    supabaseUserId = data.user?.id ?? null;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to connect to Supabase.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const updatedUsers = [...registeredUsers, buildRegisteredUser(normalizedEmail, password, normalizedRole)];
  const response = NextResponse.json({ ok: true });

  response.cookies.set(DEMO_USERS_COOKIE, serializeRegisteredUsers(updatedUsers), {
    httpOnly: true,
    sameSite: "lax",
    path: "/"
  });

  response.cookies.set(
    DEMO_SESSION_COOKIE,
    serializeSession({
      email: normalizedEmail,
      role: normalizedRole,
      source: "registered",
      mfaVerified: false,
      supabaseUserId
    }),
    {
      httpOnly: true,
      sameSite: "lax",
      path: "/"
    }
  );

  return response;
}
