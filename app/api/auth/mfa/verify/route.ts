import { NextRequest, NextResponse } from "next/server";
import {
  DEMO_MFA_COOKIE,
  DEMO_MFA_PENDING_COOKIE,
  DEMO_SESSION_COOKIE,
  readMfaSecrets,
  readSession,
  serializeMfaSecrets,
  serializeSession
} from "@/lib/auth/demo-auth";
import { getSupabaseMfaMeta, saveSupabaseMfaSecret, verifyTotpToken } from "@/lib/auth/mfa";
import { delayOnFailure, enforceRateLimit } from "@/lib/security/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const rateLimited = enforceRateLimit(request, "auth-mfa-verify", 10, 60_000);
  if (rateLimited) return rateLimited;

  const session = readSession(request.cookies.get(DEMO_SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { token?: string };
  const token = (body.token ?? "").trim();
  if (!/^\d{6}$/.test(token)) {
    await delayOnFailure(400);
    return NextResponse.json({ error: "OTP code is required." }, { status: 400 });
  }

  const normalizedEmail = session.email.toLowerCase();
  const pendingMap = readMfaSecrets(request.cookies.get(DEMO_MFA_PENDING_COOKIE)?.value);
  const persistedMap = readMfaSecrets(request.cookies.get(DEMO_MFA_COOKIE)?.value);

  let secret: string | null = null;
  let isFirstEnrollment = false;

  if (session.supabaseUserId) {
    const supabaseMeta = await getSupabaseMfaMeta(session.supabaseUserId);
    if (supabaseMeta.secret) {
      secret = supabaseMeta.secret;
    } else if (pendingMap[normalizedEmail]) {
      secret = pendingMap[normalizedEmail];
      isFirstEnrollment = true;
    }
  } else {
    if (persistedMap[normalizedEmail]) {
      secret = persistedMap[normalizedEmail];
    } else if (pendingMap[normalizedEmail]) {
      secret = pendingMap[normalizedEmail];
      isFirstEnrollment = true;
    }
  }

  if (!secret) {
    return NextResponse.json({ error: "MFA is not configured yet. Start setup first." }, { status: 400 });
  }

  if (!(await verifyTotpToken(token, secret))) {
    await delayOnFailure(450);
    return NextResponse.json({ error: "Invalid OTP code." }, { status: 401 });
  }

  if (isFirstEnrollment) {
    if (session.supabaseUserId) {
      try {
        await saveSupabaseMfaSecret(session.supabaseUserId, secret);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to save MFA secret to Supabase.";
        return NextResponse.json({ error: message }, { status: 500 });
      }
    } else {
      persistedMap[normalizedEmail] = secret;
    }
  }

  try {
    const supabase = createAdminClient();
    await supabase
      .from("mfa_reset_requests")
      .update({ status: "Completed" })
      .eq("email", normalizedEmail)
      .eq("status", "Approved");
  } catch {
    // Non-blocking: verification succeeds even if status bookkeeping fails.
  }

  delete pendingMap[normalizedEmail];

  const response = NextResponse.json({ ok: true });
  response.cookies.set(
    DEMO_SESSION_COOKIE,
    serializeSession({
      ...session,
      mfaVerified: true
    }),
    {
      httpOnly: true,
      sameSite: "lax",
      path: "/"
    }
  );
  response.cookies.set(DEMO_MFA_PENDING_COOKIE, serializeMfaSecrets(pendingMap), {
    httpOnly: true,
    sameSite: "lax",
    path: "/"
  });
  response.cookies.set(DEMO_MFA_COOKIE, serializeMfaSecrets(persistedMap), {
    httpOnly: true,
    sameSite: "lax",
    path: "/"
  });
  return response;
}
