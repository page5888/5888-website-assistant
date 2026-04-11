import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { verifyCheckMacValue, getEcpayConfig } from "@/lib/ecpay";
import { promoteSiteToPaid } from "@/lib/sitePaid";

export const runtime = "nodejs";

/**
 * ECPay Server-side Notification (ReturnURL).
 *
 * ECPay POSTs application/x-www-form-urlencoded here after the user
 * finishes payment. We MUST:
 *   1. Verify CheckMacValue (reject if invalid)
 *   2. Check RtnCode === "1" (success)
 *   3. Look up the tradeNo -> siteId mapping
 *   4. Promote site to paid (shared with full-redemption path in /api/checkout)
 *   5. Respond with literal "1|OK" (ECPay requires this exact string)
 *
 * Note: the 5888 central wallet does not support partial redemption, so
 * any ECPay order is guaranteed to be cash-only (usePoints === 0). All
 * wallet-side spending happens synchronously in /api/checkout's full-
 * redemption branch *before* ECPay is ever invoked, so this handler
 * never needs to talk to the wallet.
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
    return new NextResponse("1|OK", { status: 200 });
  }

  const tradeNo = params.MerchantTradeNo;
  if (!tradeNo) {
    return new NextResponse("0|NoTradeNo", { status: 200 });
  }

  // 3. Look up the mapping (plain siteId string, see /api/checkout)
  const siteIdRaw = await redis.get<string>(`ecpay:trade:${tradeNo}`);
  if (!siteIdRaw) {
    console.error("[ecpay-notify] unknown tradeNo", tradeNo);
    return new NextResponse("1|OK", { status: 200 });
  }
  const siteId = String(siteIdRaw);

  // 4. Promote the site to paid
  const promoteResult = await promoteSiteToPaid({
    siteId,
    paidMeta: {
      source: "ecpay_cash",
      usePoints: 0,
      amount: Number(params.TradeAmt || 0),
      ecpayTradeNo: params.TradeNo,
    },
  });

  if (promoteResult.missing) {
    console.error("[ecpay-notify] site meta missing", siteId);
  }

  // 5. ECPay requires exactly "1|OK"
  return new NextResponse("1|OK", { status: 200 });
}
