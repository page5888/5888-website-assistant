import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

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
    req.nextUrl.pathname.startsWith("/api/download");

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
  ],
};
