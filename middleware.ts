import { NextResponse, type NextRequest } from "next/server";
import { canAccessWithExtras, normalizeRole } from "@/lib/auth/roles";
import {
  DEMO_PERMISSIONS_COOKIE,
  DEMO_SESSION_COOKIE,
  getUserExtraRoutes,
  readSession
} from "@/lib/auth/demo-auth";

const publicRoutes = ["/", "/login", "/forbidden", "/start-fresh"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.includes(".") ||
    publicRoutes.includes(pathname)
  ) {
    return NextResponse.next();
  }

  const session = readSession(request.cookies.get(DEMO_SESSION_COOKIE)?.value);

  if (!session) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("redirectedFrom", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  const role = normalizeRole(session.role);
  const extraRoutes = getUserExtraRoutes(session.email, request.cookies.get(DEMO_PERMISSIONS_COOKIE)?.value);
  if (!canAccessWithExtras(role, pathname, extraRoutes)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/forbidden";
    return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
