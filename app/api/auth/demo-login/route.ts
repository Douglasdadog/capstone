import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { normalizeRole } from "@/lib/auth/roles";
import { delayOnFailure, enforceRateLimit } from "@/lib/security/rate-limit";
import {
  DEMO_LOGIN_GUARD_COOKIE,
  DEMO_SESSION_COOKIE,
  DEMO_USERS_COOKIE,
  findUser,
  readLoginGuard,
  readRegisteredUsers,
  serializeLoginGuard,
  serializeSession
} from "@/lib/auth/demo-auth";

const LOCK_THRESHOLD = 5;
const LOCK_WINDOW_MS = 15 * 60 * 1000;

function createSupabaseAuthClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

export async function POST(request: NextRequest) {
  const rateLimited = enforceRateLimit(request, "auth-login", 8, 60_000);
  if (rateLimited) return rateLimited;

  const { email, password } = (await request.json()) as { email?: string; password?: string };
  if (!email || !password) {
    await delayOnFailure();
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  const registeredUsers = readRegisteredUsers(request.cookies.get(DEMO_USERS_COOKIE)?.value);
  const loginGuard = readLoginGuard(request.cookies.get(DEMO_LOGIN_GUARD_COOKIE)?.value);
  const user = findUser(email, password, registeredUsers);
  const normalizedEmail = email.toLowerCase();
  const isRegisteredUser = registeredUsers.some(
    (registered) => registered.email === normalizedEmail && registered.password === password
  );
  const supabaseAuth = createSupabaseAuthClient();
  const now = Date.now();
  const guardEntry = loginGuard[normalizedEmail];

  function setLoginGuardCookie(response: NextResponse) {
    response.cookies.set(DEMO_LOGIN_GUARD_COOKIE, serializeLoginGuard(loginGuard), {
      httpOnly: true,
      sameSite: "lax",
      path: "/"
    });
    return response;
  }

  function registerFailure() {
    const prior = loginGuard[normalizedEmail];
    const withinWindow = prior ? now - prior.lastFailedAt <= LOCK_WINDOW_MS : false;
    const failedCount = withinWindow ? (prior?.failedCount ?? 0) + 1 : 1;
    const lockedUntil = failedCount >= LOCK_THRESHOLD ? now + LOCK_WINDOW_MS : null;
    loginGuard[normalizedEmail] = { failedCount, lockedUntil, lastFailedAt: now };
  }

  function clearFailures() {
    delete loginGuard[normalizedEmail];
  }

  if (guardEntry?.lockedUntil && guardEntry.lockedUntil > now) {
    const minutesLeft = Math.ceil((guardEntry.lockedUntil - now) / 60_000);
    await delayOnFailure();
    return setLoginGuardCookie(
      NextResponse.json(
        {
          error: `Account temporarily locked due to multiple failed logins. Try again in about ${minutesLeft} minute(s).`
        },
        { status: 423 }
      )
    );
  }

  if (!user) {
    if (!supabaseAuth) {
      await delayOnFailure();
      registerFailure();
      return setLoginGuardCookie(NextResponse.json({ error: "Invalid credentials." }, { status: 401 }));
    }

    const { data, error } = await supabaseAuth.auth.signInWithPassword({
      email: normalizedEmail,
      password
    });

    if (error || !data.user) {
      await delayOnFailure();
      registerFailure();
      return setLoginGuardCookie(NextResponse.json({ error: "Invalid credentials." }, { status: 401 }));
    }

    clearFailures();
    const response = setLoginGuardCookie(NextResponse.json({ ok: true }));
    response.cookies.set(
      DEMO_SESSION_COOKIE,
      serializeSession({
        email: normalizedEmail,
        role: normalizeRole(data.user.user_metadata?.role),
        source: "registered",
        mfaVerified: false,
        supabaseUserId: data.user.id
      }),
      {
        httpOnly: true,
        sameSite: "lax",
        path: "/"
      }
    );
    return response;
  }

  let supabaseUserId: string | null = null;
  if (isRegisteredUser && supabaseAuth) {
    const { data } = await supabaseAuth.auth.signInWithPassword({
      email: normalizedEmail,
      password
    });
    supabaseUserId = data.user?.id ?? null;
  }

  clearFailures();
  const response = setLoginGuardCookie(NextResponse.json({ ok: true }));
  response.cookies.set(
    DEMO_SESSION_COOKIE,
    serializeSession({
      email: user.email,
      role: user.role,
      source: isRegisteredUser ? "registered" : "sample",
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
