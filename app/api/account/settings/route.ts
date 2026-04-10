import { NextRequest, NextResponse } from "next/server";
import {
  DEMO_PROFILE_COOKIE,
  readProfiles,
  serializeProfiles
} from "@/lib/auth/demo-auth";
import { requireDemoSession } from "@/lib/auth/session";

export async function GET(request: NextRequest) {
  const auth = requireDemoSession(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const profiles = readProfiles(request.cookies.get(DEMO_PROFILE_COOKIE)?.value);
  const profile = profiles[auth.session.email] ?? { fullName: "", phone: "" };

  return NextResponse.json({
    email: auth.session.email,
    role: auth.session.role,
    fullName: profile.fullName,
    phone: profile.phone
  });
}

export async function POST(request: NextRequest) {
  const auth = requireDemoSession(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const body = (await request.json()) as { fullName?: string; phone?: string };
  const fullName = (body.fullName ?? "").trim();
  const phone = (body.phone ?? "").trim();

  const profiles = readProfiles(request.cookies.get(DEMO_PROFILE_COOKIE)?.value);
  profiles[auth.session.email] = { fullName, phone };

  const response = NextResponse.json({ ok: true });
  response.cookies.set(DEMO_PROFILE_COOKIE, serializeProfiles(profiles), {
    httpOnly: true,
    sameSite: "lax",
    path: "/"
  });
  return response;
}
