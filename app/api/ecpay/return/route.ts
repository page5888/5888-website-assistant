import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";

export const runtime = "nodejs";

/**
 * ECPay OrderResultURL — the user's browser is POSTed here after they
 * complete payment. Unlike /notify (server-to-server), this is a user
 * redirect. We don't need to re-verify here; we just forward the user
 * to their preview page, which will reflect the paid state already set
 * by /notify.
 */
export async function POST(req: Request) {
  const body = await req.text();
  const params = Object.fromEntries(new URLSearchParams(body).entries());

  const tradeNo = params.MerchantTradeNo;
  let siteId: string | null = null;
  if (tradeNo) {
    siteId = await redis.get<string>(`ecpay:trade:${tradeNo}`);
  }

  const target = siteId ? `/preview/${siteId}?paid=1` : "/";

  // 303 ensures the browser switches from POST to GET for the redirect
  return NextResponse.redirect(new URL(target, req.url), 303);
}

// Some ECPay callbacks may GET this URL too
export async function GET(req: Request) {
  const url = new URL(req.url);
  const tradeNo = url.searchParams.get("MerchantTradeNo");
  let siteId: string | null = null;
  if (tradeNo) {
    siteId = await redis.get<string>(`ecpay:trade:${tradeNo}`);
  }
  const target = siteId ? `/preview/${siteId}?paid=1` : "/";
  return NextResponse.redirect(new URL(target, req.url), 303);
}
