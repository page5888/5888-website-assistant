import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";

export const runtime = "nodejs";

/**
 * ECPay OrderResultURL — the user's browser is POSTed here after they
 * complete payment. Unlike /notify (server-to-server), this is a user
 * redirect. We don't need to re-verify here; we just forward the user
 * to their preview page, which will reflect the paid state already set
 * by /notify.
 *
 * IMPORTANT: we deliberately return a PATH-ONLY `Location` header
 * instead of using `NextResponse.redirect(new URL(target, req.url))`.
 * Under a proxy/tunnel (cloudflared → localhost:3020) `req.url` reports
 * the internal host, so the absolute URL form would redirect the user
 * to `https://localhost:3020/...` which is unreachable from outside.
 * A path-only Location is same-origin-relative and resolves correctly
 * against whichever host the browser is on.
 */
async function resolveSiteId(tradeNo: string | null): Promise<string | null> {
  if (!tradeNo) return null;
  const raw = await redis.get<string>(`ecpay:trade:${tradeNo}`);
  return raw ? String(raw) : null;
}

function redirectTo(path: string): NextResponse {
  // 303 → browser switches from POST to GET for the follow-up request
  return new NextResponse(null, {
    status: 303,
    headers: { Location: path },
  });
}

export async function POST(req: Request) {
  const body = await req.text();
  const params = Object.fromEntries(new URLSearchParams(body).entries());
  const siteId = await resolveSiteId(params.MerchantTradeNo ?? null);
  return redirectTo(siteId ? `/preview/${siteId}?paid=1` : "/");
}

// Some ECPay callbacks may GET this URL too
export async function GET(req: Request) {
  const url = new URL(req.url);
  const siteId = await resolveSiteId(url.searchParams.get("MerchantTradeNo"));
  return redirectTo(siteId ? `/preview/${siteId}?paid=1` : "/");
}
