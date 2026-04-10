import { NextRequest, NextResponse } from "next/server";
import {
  DEMO_PERMISSIONS_COOKIE,
  DEMO_PROFILE_COOKIE,
  DEMO_SESSION_COOKIE,
  DEMO_USERS_COOKIE
} from "@/lib/auth/demo-auth";

const COOKIE_CLEAR = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 0
};

function clearAllDemoState(response: NextResponse) {
  for (const name of [
    DEMO_SESSION_COOKIE,
    DEMO_USERS_COOKIE,
    DEMO_PERMISSIONS_COOKIE,
    DEMO_PROFILE_COOKIE
  ]) {
    response.cookies.set(name, "", COOKIE_CLEAR);
  }
}

/** Full wipe: session, registered test users, admin-granted routes, account profile fields. */
export async function POST() {
  const response = NextResponse.json({
    ok: true,
    message: "Demo cookies cleared. Sign in again with sample accounts."
  });
  clearAllDemoState(response);
  return response;
}

/** Visit in browser: clears everything and sends you to login. */
export async function GET(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("fresh", "1");
  const response = NextResponse.redirect(url);
  clearAllDemoState(response);
  return response;
}
