import { NextResponse } from "next/server";
import { auth, getUserKey } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { buildOrderParams, getEcpayEndpoint, PRICING } from "@/lib/ecpay";

export const runtime = "nodejs";

function getBaseUrl(req: Request): string {
  // Prefer explicit env var (set in Vercel)
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  // Fall back to Vercel's auto-populated host
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  // Finally, synthesize from the request
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

/**
 * POST /api/checkout
 * Body: { siteId: string }
 *
 * Creates an ECPay order for unlocking the given site and returns an
 * auto-submitting HTML form. The browser is expected to navigate to this
 * response (via fetch + document.write or window.location), which then
 * POSTs the form to ECPay.
 */
export async function POST(req: Request) {
  const session = await auth();
  const userKey = getUserKey(session);
  if (!userKey) {
    return NextResponse.json({ error: "請先登入" }, { status: 401 });
  }

  let siteId: string;
  try {
    const body = (await req.json()) as { siteId?: string };
    if (!body.siteId) throw new Error("missing siteId");
    siteId = body.siteId;
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

  // Build a unique merchant trade number (ECPay max 20 chars, alphanumeric)
  const merchantTradeNo = `W${Date.now().toString().slice(-10)}${siteId.slice(0, 8)}`
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 20);

  // Store mapping: tradeNo -> siteId so the notify callback knows which
  // site to unlock. 24h TTL is plenty.
  await redis.set(`ecpay:trade:${merchantTradeNo}`, siteId, { ex: 60 * 60 * 24 });

  const baseUrl = getBaseUrl(req);
  const params = buildOrderParams({
    merchantTradeNo,
    totalAmount: PRICING.FULL_UNLOCK_TWD,
    tradeDesc: PRICING.TRADE_DESC,
    itemName: `${PRICING.ITEM_NAME} NT$${PRICING.FULL_UNLOCK_TWD}`,
    returnUrl: `${baseUrl}/api/ecpay/notify`,
    clientBackUrl: `${baseUrl}/preview/${siteId}`,
    orderResultUrl: `${baseUrl}/api/ecpay/return`,
  });

  const endpoint = getEcpayEndpoint();

  // Build an auto-submitting HTML form. The browser POSTs this directly
  // to ECPay and the user is taken to the hosted checkout page.
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
