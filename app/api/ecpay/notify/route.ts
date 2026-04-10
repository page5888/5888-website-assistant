import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { verifyCheckMacValue, getEcpayConfig } from "@/lib/ecpay";
import { stripWatermark } from "@/lib/watermark";
import { SITE_PAID_KEY } from "@/lib/ratelimit";

export const runtime = "nodejs";

/**
 * ECPay Server-side Notification (ReturnURL).
 *
 * ECPay POSTs application/x-www-form-urlencoded here after the user
 * finishes payment. We MUST:
 *   1. Verify CheckMacValue (reject if invalid)
 *   2. Check RtnCode === "1" (success)
 *   3. Look up the tradeNo -> siteId mapping
 *   4. Mark site as paid, remove the 24h TTL, switch to clean HTML
 *   5. Respond with literal "1|OK" (ECPay requires this exact string)
 *
 * Any other response means "retry later" and ECPay will keep notifying
 * up to a few times.
 */
export async function POST(req: Request) {
  let params: Record<string, string>;
  try {
    const body = await req.text();
    const usp = new URLSearchParams(body);
    params = Object.fromEntries(usp.entries());
  } catch (err) {
    console.error("[ecpay-notify] failed to parse body", err);
    return new NextResponse("0|ParseError", { status: 200 });
  }

  console.log("[ecpay-notify] incoming", {
    MerchantTradeNo: params.MerchantTradeNo,
    RtnCode: params.RtnCode,
    TradeAmt: params.TradeAmt,
    PaymentDate: params.PaymentDate,
  });

  const { hashKey, hashIv } = getEcpayConfig();

  // 1. Verify signature
  if (!verifyCheckMacValue(params, hashKey, hashIv)) {
    console.error("[ecpay-notify] invalid CheckMacValue");
    return new NextResponse("0|InvalidMac", { status: 200 });
  }

  // 2. Must be a successful transaction
  if (params.RtnCode !== "1") {
    console.warn("[ecpay-notify] payment not successful", params.RtnCode, params.RtnMsg);
    // Still return 1|OK so ECPay stops retrying a known-failed tx
    return new NextResponse("1|OK", { status: 200 });
  }

  const tradeNo = params.MerchantTradeNo;
  if (!tradeNo) {
    return new NextResponse("0|NoTradeNo", { status: 200 });
  }

  // 3. Look up the siteId
  const siteId = await redis.get<string>(`ecpay:trade:${tradeNo}`);
  if (!siteId) {
    console.error("[ecpay-notify] unknown tradeNo", tradeNo);
    // Still acknowledge so ECPay doesn't keep hammering us
    return new NextResponse("1|OK", { status: 200 });
  }

  // 4. Promote the site from free to paid:
  //    - Fetch the clean (unwatermarked) HTML
  //    - Re-store both the site HTML and meta WITHOUT TTL
  //    - Mark meta.paid = true
  //    - Set the lifetime "this site is paid" flag
  const metaRaw = await redis.get<string>(`site:${siteId}:meta`);
  if (!metaRaw) {
    console.error("[ecpay-notify] site meta missing", siteId);
    return new NextResponse("1|OK", { status: 200 });
  }

  const meta =
    typeof metaRaw === "string" ? JSON.parse(metaRaw) : (metaRaw as Record<string, unknown>);
  meta.paid = true;
  meta.paidAt = Date.now();
  meta.ecpayTradeNo = params.TradeNo;
  meta.amount = Number(params.TradeAmt || 0);
  delete meta.expiresAt;

  const cleanHtml = await redis.get<string>(`site:${siteId}:clean`);
  const currentHtml = await redis.get<string>(`site:${siteId}`);
  const finalHtml = cleanHtml || (currentHtml ? stripWatermark(currentHtml) : null);

  if (finalHtml) {
    // Permanent storage — no ex
    await redis.set(`site:${siteId}`, finalHtml);
  }
  await redis.set(`site:${siteId}:meta`, JSON.stringify(meta));
  await redis.set(SITE_PAID_KEY(siteId), 1);
  // The clean copy is no longer needed
  await redis.del(`site:${siteId}:clean`);

  // 5. ECPay requires exactly "1|OK"
  return new NextResponse("1|OK", { status: 200 });
}
