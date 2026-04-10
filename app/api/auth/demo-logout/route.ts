import { NextResponse } from "next/server";
import { DEMO_SESSION_COOKIE } from "@/lib/auth/demo-auth";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(DEMO_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0
  });
  return response;
}
