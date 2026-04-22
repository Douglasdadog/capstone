import { NextRequest, NextResponse } from "next/server";
import {
  DEMO_PERMISSIONS_COOKIE,
  DEMO_USERS_COOKIE,
  getSampleUsers,
  readPermissions,
  readRegisteredUsers,
  serializePermissions,
  setUserExtraRoutes
} from "@/lib/auth/demo-auth";
import { requireDemoSession } from "@/lib/auth/session";
import { SIDEBAR_LINKS } from "@/lib/auth/roles";

const grantableRoutes = SIDEBAR_LINKS.filter((link) => link.grantable).map((link) => link.href);

export async function GET(request: NextRequest) {
  const auth = requireDemoSession(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });
  if (auth.session.role !== "SuperAdmin") {
    return NextResponse.json({ error: "Super Admin access required." }, { status: 403 });
  }

  const users = [...getSampleUsers(), ...readRegisteredUsers(request.cookies.get(DEMO_USERS_COOKIE)?.value)];
  const permissions = readPermissions(request.cookies.get(DEMO_PERMISSIONS_COOKIE)?.value);

  return NextResponse.json({
    users: users.map((user) => ({
      email: user.email,
      role: user.role,
      extraRoutes: permissions[user.email] ?? []
    })),
    grantableRoutes
  });
}

export async function POST(request: NextRequest) {
  const auth = requireDemoSession(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });
  if (auth.session.role !== "SuperAdmin") {
    return NextResponse.json({ error: "Super Admin access required." }, { status: 403 });
  }

  const body = (await request.json()) as { email?: string; extraRoutes?: string[] };
  const email = body.email?.toLowerCase().trim();
  const extraRoutes = (body.extraRoutes ?? []).filter((route) => grantableRoutes.includes(route));

  if (!email) {
    return NextResponse.json({ error: "User email is required." }, { status: 400 });
  }

  const updated = setUserExtraRoutes(
    email,
    [...new Set(extraRoutes)],
    request.cookies.get(DEMO_PERMISSIONS_COOKIE)?.value
  );

  const response = NextResponse.json({ ok: true });
  response.cookies.set(DEMO_PERMISSIONS_COOKIE, serializePermissions(updated), {
    httpOnly: true,
    sameSite: "lax",
    path: "/"
  });
  return response;
}

export async function DELETE(request: NextRequest) {
  const auth = requireDemoSession(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });
  if (auth.session.role !== "SuperAdmin") {
    return NextResponse.json({ error: "Super Admin access required." }, { status: 403 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(DEMO_PERMISSIONS_COOKIE, serializePermissions({}), {
    httpOnly: true,
    sameSite: "lax",
    path: "/"
  });
  return response;
}
