import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";
import { NextResponse } from "next/server";

// Middleware runs on the edge runtime, so we construct a slim NextAuth
// instance from the edge-safe config (no wallet / node:crypto imports).
// The full config with the wallet jwt callback lives in lib/auth.ts and
// is used by API routes / server components.
const { auth } = NextAuth(authConfig);

/**
 * Routes that require an authenticated user.
 *
 * IMPORTANT: /api/ecpay/notify and /api/ecpay/return must NOT be in here
 * because ECPay's servers (and the user's browser coming back from
 * ECPay's hosted checkout page) do not carry our session cookie.
 */
export default auth((req) => {
  const isProtected =
    req.nextUrl.pathname.startsWith("/preview") ||
    req.nextUrl.pathname.startsWith("/api/generate") ||
    req.nextUrl.pathname.startsWith("/api/checkout") ||
    req.nextUrl.pathname.startsWith("/api/pay") ||
    req.nextUrl.pathname.startsWith("/api/deploy") ||
    req.nextUrl.pathname.startsWith("/api/download") ||
    req.nextUrl.pathname.startsWith("/api/upload-image") ||
    req.nextUrl.pathname.startsWith("/api/admin");

  if (isProtected && !req.auth) {
    return NextResponse.redirect(new URL("/", req.url));
  }
  return NextResponse.next();
});

export const config = {
  matcher: [
    "/preview/:path*",
    "/api/generate/:path*",
    "/api/checkout/:path*",
    "/api/pay/:path*",
    "/api/deploy/:path*",
    "/api/download/:path*",
    "/api/upload-image/:path*",
    "/api/admin/:path*",
  ],
};
