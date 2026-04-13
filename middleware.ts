import { NextResponse, type NextRequest } from "next/server";
import { canAccessWithExtras, getPostLoginRedirect, normalizeRole } from "@/lib/auth/roles";
import {
  DEMO_PERMISSIONS_COOKIE,
  DEMO_SESSION_COOKIE,
  getUserExtraRoutes,
  readSession
} from "@/lib/auth/demo-auth";

const publicRoutes = ["/", "/login", "/verify-otp", "/forbidden", "/start-fresh"];
const mfaExemptRoutes = ["/logistics"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/track/") ||
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
  const isMfaExempt = mfaExemptRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
  if (!session.mfaVerified && pathname !== "/verify-otp" && !isMfaExempt) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/verify-otp";
    redirectUrl.searchParams.set("redirectedFrom", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (session.mfaVerified && pathname === "/verify-otp") {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = getPostLoginRedirect(role);
    return NextResponse.redirect(redirectUrl);
  }

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
