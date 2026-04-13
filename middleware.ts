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

function applySecurityHeaders(response: NextResponse) {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(self), microphone=(), geolocation=()");
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  if (process.env.NODE_ENV === "production") {
    response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  }
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/track/") ||
    pathname.includes(".") ||
    publicRoutes.includes(pathname)
  ) {
    return applySecurityHeaders(NextResponse.next());
  }

  const session = readSession(request.cookies.get(DEMO_SESSION_COOKIE)?.value);

  if (!session) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("redirectedFrom", pathname);
    return applySecurityHeaders(NextResponse.redirect(redirectUrl));
  }

  const role = normalizeRole(session.role);
  const isMfaExempt = mfaExemptRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
  if (!session.mfaVerified && pathname !== "/verify-otp" && !isMfaExempt) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/verify-otp";
    redirectUrl.searchParams.set("redirectedFrom", pathname);
    return applySecurityHeaders(NextResponse.redirect(redirectUrl));
  }

  if (session.mfaVerified && pathname === "/verify-otp") {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = getPostLoginRedirect(role);
    return applySecurityHeaders(NextResponse.redirect(redirectUrl));
  }

  const extraRoutes = getUserExtraRoutes(session.email, request.cookies.get(DEMO_PERMISSIONS_COOKIE)?.value);
  if (!canAccessWithExtras(role, pathname, extraRoutes)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/forbidden";
    return applySecurityHeaders(NextResponse.redirect(redirectUrl));
  }

  return applySecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
