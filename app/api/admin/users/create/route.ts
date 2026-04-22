import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireDemoSession } from "@/lib/auth/session";
import {
  DEMO_EMAIL_VERIFY_COOKIE,
  DEMO_USERS_COOKIE,
  buildRegisteredUser,
  readEmailVerificationCodes,
  readRegisteredUsers,
  serializeEmailVerificationCodes,
  serializeRegisteredUsers
} from "@/lib/auth/demo-auth";
import { UserRole, normalizeRole } from "@/lib/auth/roles";
import { enforceRateLimit } from "@/lib/security/rate-limit";

export async function POST(request: NextRequest) {
  const auth = requireDemoSession(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });
  if (auth.session.role !== "SuperAdmin") {
    return NextResponse.json({ error: "Super Admin access required." }, { status: 403 });
  }

  const rateLimited = enforceRateLimit(request, "admin-create-user", 20, 60_000);
  if (rateLimited) return rateLimited;

  const body = (await request.json()) as {
    email?: string;
    password?: string;
    role?: UserRole;
    verificationCode?: string;
  };
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const role = normalizeRole(body.role);
  const verificationCode = String(body.verificationCode ?? "").trim();

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }
  if (email.length > 190 || password.length > 128) {
    return NextResponse.json({ error: "Input exceeds allowed length." }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
  }
  if (!verificationCode) {
    return NextResponse.json({ error: "Verification code is required." }, { status: 400 });
  }

  const verificationCodes = readEmailVerificationCodes(
    request.cookies.get(DEMO_EMAIL_VERIFY_COOKIE)?.value
  );
  const verificationEntry = verificationCodes[email];
  if (!verificationEntry) {
    return NextResponse.json({ error: "No verification code found for this email." }, { status: 400 });
  }
  if (Date.now() > verificationEntry.expiresAt) {
    return NextResponse.json({ error: "Verification code expired. Send a new code." }, { status: 400 });
  }
  if (verificationEntry.code !== verificationCode) {
    return NextResponse.json({ error: "Invalid verification code." }, { status: 400 });
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
    delete verificationCodes[email];
    const response = NextResponse.json({ ok: true });
    response.cookies.set(DEMO_USERS_COOKIE, serializeRegisteredUsers(updatedUsers), {
      httpOnly: true,
      sameSite: "lax",
      path: "/"
    });
    response.cookies.set(DEMO_EMAIL_VERIFY_COOKIE, serializeEmailVerificationCodes(verificationCodes), {
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
