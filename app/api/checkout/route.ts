import { NextResponse } from "next/server";
import { auth, getUserKey, getWalletUid } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { buildOrderParams, getEcpayEndpoint, PRICING } from "@/lib/ecpay";
import { getBalance, spend, WalletError } from "@/lib/wallet";
import { promoteSiteToPaid } from "@/lib/sitePaid";

export const runtime = "nodejs";

function getBaseUrl(req: Request): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

/**
 * POST /api/checkout
 * Body: { siteId: string, usePoints?: number }
 *
 * The 5888 central wallet does NOT support partial redemption. So this
 * endpoint has exactly two branches:
 *
 *   1. Full redemption  (usePoints === PRICING.FULL_UNLOCK_TWD
 *                        AND walletBalance >= that amount)
 *      → spend() the entire order amount, promote site to paid directly,
 *        return JSON { paid, redirect }, ECPay never involved.
 *
 *   2. Cash             (everything else — user chose to pay, or balance
 *                        is insufficient for full redemption)
 *      → ECPay for the full PRICING.FULL_UNLOCK_TWD amount,
 *        notify handler promotes the site on successful callback.
 *
 * Any value of `usePoints` that is NOT 0 and NOT exactly equal to the
 * full price is rejected — no middle ground.
 */
export async function POST(req: Request) {
  const session = await auth();
  const userKey = getUserKey(session);
  if (!userKey) {
    return NextResponse.json({ error: "請先登入" }, { status: 401 });
  }
  const walletUid = getWalletUid(session);

  let siteId: string;
  let rawUsePoints: number;
  try {
    const body = (await req.json()) as {
      siteId?: string;
      usePoints?: number;
    };
    if (!body.siteId) throw new Error("missing siteId");
    siteId = body.siteId;
    rawUsePoints = Number.isFinite(body.usePoints) ? Math.floor(body.usePoints!) : 0;
    if (rawUsePoints < 0) rawUsePoints = 0;
  } catch {
    return NextResponse.json({ error: "缺少 siteId" }, { status: 400 });
  }

  // Verify the site exists and belongs to this user
  const metaRaw = await redis.get<string>(`site:${siteId}:meta`);
  if (!metaRaw) {
    return NextResponse.json(
      { error: "預覽已過期,請重新生成" },
      { status: 404 },
    );
  }
  const meta =
    typeof metaRaw === "string" ? JSON.parse(metaRaw) : (metaRaw as Record<string, unknown>);

  if (meta.owner && meta.owner !== userKey) {
    return NextResponse.json({ error: "無權限操作此預覽" }, { status: 403 });
  }

  if (meta.paid) {
    return NextResponse.json(
      { error: "此預覽已付款,無需重複付款" },
      { status: 409 },
    );
  }

  const totalAmount = PRICING.FULL_UNLOCK_TWD;
  const wantsFullRedeem = rawUsePoints === totalAmount;

  // Reject anything that isn't 0 or exactly the full order amount. The
  // wallet doesn't support partial deduction so there's no valid middle
  // ground — let the user know instead of silently ignoring.
  if (rawUsePoints !== 0 && !wantsFullRedeem) {
    return NextResponse.json(
      {
        error: `點數折抵只能全額抵扣 ${totalAmount} 點,不支援部分折抵`,
      },
      { status: 400 },
    );
  }

  // ───────────────────────────────────────────────────────────────────
  // Branch 1: full redemption — spend points, promote site, skip ECPay
  // ───────────────────────────────────────────────────────────────────
  if (wantsFullRedeem) {
    if (!walletUid) {
      return NextResponse.json(
        { error: "尚未完成錢包綁定,請重新登入" },
        { status: 400 },
      );
    }

    // Verify balance server-side before attempting the spend — gives us
    // a clean 400 with a good error message instead of relying on the
    // wallet's INSUFFICIENT_BALANCE path for the common case.
    try {
      const bal = await getBalance(walletUid);
      if (bal.status !== "active") {
        return NextResponse.json(
          { error: "您的點數帳號目前無法使用,請聯繫客服" },
          { status: 403 },
        );
      }
      if (bal.balance < totalAmount) {
        return NextResponse.json(
          {
            error: `點數不足:目前 ${bal.balance} 點,需要 ${totalAmount} 點才可免費解鎖`,
          },
          { status: 400 },
        );
      }
    } catch (err) {
      console.error("[checkout] getBalance failed", err);
      return NextResponse.json(
        { error: "無法確認點數餘額,請稍後再試" },
        { status: 503 },
      );
    }

    // Idempotency key — siteId is unique per generation, so retries
    // (bad network, double-click) are de-duplicated by the wallet.
    const idempotencyKey = `cteater_${siteId}`;
    try {
      const spendRes = await spend({
        uid: walletUid,
        amount: totalAmount,
        reason: "cteater_full_unlock",
        idempotencyKey,
        refOrderId: siteId,
        metadata: { siteId, kind: "full_redeem" },
      });

      await promoteSiteToPaid({
        siteId,
        paidMeta: {
          source: "points_full",
          usePoints: totalAmount,
          amount: 0,
          walletTxId: spendRes.txId,
        },
      });

      return NextResponse.json({
        paid: true,
        redirect: `/preview/${siteId}?paid=1`,
      });
    } catch (err) {
      if (err instanceof WalletError) {
        const msg =
          err.code === "INSUFFICIENT_BALANCE"
            ? "點數餘額不足,請重新整理後再試"
            : err.code === "ACCOUNT_NOT_ACTIVE"
              ? "您的點數帳號目前無法使用"
              : `點數扣款失敗:${err.code}`;
        return NextResponse.json({ error: msg }, { status: 400 });
      }
      console.error("[checkout] spend failed", err);
      return NextResponse.json(
        { error: "系統錯誤,請稍後再試" },
        { status: 500 },
      );
    }
  }

  // ───────────────────────────────────────────────────────────────────
  // Branch 2: cash — normal ECPay flow for the full amount
  // ───────────────────────────────────────────────────────────────────
  const merchantTradeNo = `W${Date.now().toString().slice(-10)}${siteId.slice(0, 8)}`
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 20);

  // Store the mapping: tradeNo -> siteId (plain string form — see
  // /api/ecpay/notify for the reader).
  await redis.set(`ecpay:trade:${merchantTradeNo}`, siteId, {
    ex: 60 * 60 * 24,
  });

  const baseUrl = getBaseUrl(req);
  const params = buildOrderParams({
    merchantTradeNo,
    totalAmount,
    tradeDesc: PRICING.TRADE_DESC,
    itemName: `${PRICING.ITEM_NAME} NT$${totalAmount}`,
    returnUrl: `${baseUrl}/api/ecpay/notify`,
    clientBackUrl: `${baseUrl}/preview/${siteId}`,
    orderResultUrl: `${baseUrl}/api/ecpay/return`,
  });

  const endpoint = getEcpayEndpoint();

  const inputs = Object.entries(params)
    .map(
      ([k, v]) =>
        `<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(v)}" />`,
    )
    .join("\n");

  const html = `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <title>跳轉至綠界金流…</title>
  <style>
    body{font-family:system-ui,-apple-system,"Noto Sans TC",sans-serif;
      display:flex;min-height:100vh;margin:0;align-items:center;justify-content:center;
      background:linear-gradient(135deg,#0f0a1e,#1a0f2e);color:#fff}
    .card{text-align:center}
    .spin{width:40px;height:40px;border:4px solid rgba(255,255,255,.2);
      border-top-color:#a855f7;border-radius:50%;animation:s 1s linear infinite;margin:0 auto 16px}
    @keyframes s{to{transform:rotate(360deg)}}
  </style>
</head>
<body>
  <div class="card">
    <div class="spin"></div>
    <p>正在跳轉至綠界金流,請稍候…</p>
  </div>
  <form id="ecpay" method="POST" action="${escapeHtml(endpoint)}">
    ${inputs}
  </form>
  <script>document.getElementById('ecpay').submit();</script>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
