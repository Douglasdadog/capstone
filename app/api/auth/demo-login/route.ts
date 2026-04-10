import { NextRequest, NextResponse } from "next/server";
import {
  DEMO_SESSION_COOKIE,
  DEMO_USERS_COOKIE,
  findUser,
  readRegisteredUsers,
  serializeSession
} from "@/lib/auth/demo-auth";

export async function POST(request: NextRequest) {
  const { email, password } = (await request.json()) as { email?: string; password?: string };
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  const registeredUsers = readRegisteredUsers(request.cookies.get(DEMO_USERS_COOKIE)?.value);
  const user = findUser(email, password, registeredUsers);
  const normalizedEmail = email.toLowerCase();
  const isRegisteredUser = registeredUsers.some(
    (registered) => registered.email === normalizedEmail && registered.password === password
  );

  if (!user) {
    return NextResponse.json({ error: "Invalid credentials for demo account." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(
    DEMO_SESSION_COOKIE,
    serializeSession({
      email: user.email,
      role: user.role,
      source: isRegisteredUser ? "registered" : "sample"
    }),
    {
      httpOnly: true,
      sameSite: "lax",
      path: "/"
    }
  );
  return response;
}
