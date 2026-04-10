import { NextRequest, NextResponse } from "next/server";
import { UserRole, normalizeRole } from "@/lib/auth/roles";
import {
  DEMO_SESSION_COOKIE,
  DEMO_USERS_COOKIE,
  buildRegisteredUser,
  readRegisteredUsers,
  serializeRegisteredUsers,
  serializeSession
} from "@/lib/auth/demo-auth";

export async function POST(request: NextRequest) {
  const { email, password, role } = (await request.json()) as {
    email?: string;
    password?: string;
    role?: UserRole;
  };

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  if (password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
  }

  const normalizedRole = normalizeRole(role);
  const registeredUsers = readRegisteredUsers(request.cookies.get(DEMO_USERS_COOKIE)?.value);
  const normalizedEmail = email.toLowerCase();

  if (registeredUsers.some((user) => user.email === normalizedEmail)) {
    return NextResponse.json({ error: "This test account already exists." }, { status: 409 });
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
      source: "registered"
    }),
    {
      httpOnly: true,
      sameSite: "lax",
      path: "/"
    }
  );

  return response;
}
