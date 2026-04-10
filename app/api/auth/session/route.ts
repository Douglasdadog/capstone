import { NextRequest, NextResponse } from "next/server";
import {
  DEMO_PERMISSIONS_COOKIE,
  DEMO_SESSION_COOKIE,
  getUserExtraRoutes,
  readSession
} from "@/lib/auth/demo-auth";
import { SIDEBAR_LINKS, canAccessWithExtras } from "@/lib/auth/roles";

export async function GET(request: NextRequest) {
  const session = readSession(request.cookies.get(DEMO_SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const extraRoutes = getUserExtraRoutes(
    session.email,
    request.cookies.get(DEMO_PERMISSIONS_COOKIE)?.value
  );
  const visibleLinks = SIDEBAR_LINKS.filter((link) =>
    canAccessWithExtras(session.role, link.href, extraRoutes)
  );

  return NextResponse.json({
    email: session.email,
    role: session.role,
    visibleLinks
  });
}
