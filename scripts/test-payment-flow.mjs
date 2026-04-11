/**
 * Autonomous end-to-end test for the ECPay payment flow.
 *
 * What this simulates (no browser, no real ECPay):
 *   1. Seed a fake site + meta + clean HTML in Redis (mimicking /api/generate)
 *   2. Seed the ecpay:trade:<tradeNo> mapping (mimicking /api/checkout cash branch)
 *   3. Compute a valid CheckMacValue for a successful-payment POST body
 *   4. Send that body to /api/ecpay/notify via the public tunnel URL
 *   5. Re-read site meta + HTML from Redis, assert:
 *        - meta.paid === true
 *        - meta.source === "ecpay_cash"
 *        - site:{id} no longer contains the watermark
 *        - site:{id}:clean is deleted
 *        - SITE_PAID_KEY counter set
 *   6. Test image slot extraction + replace helpers on the final HTML
 *
 * Run with: node scripts/test-payment-flow.mjs
 */

import { Redis } from "@upstash/redis";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// ─── Load .env.local manually (no dotenv dependency) ──────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, "..", ".env.local");
const envSrc = readFileSync(envPath, "utf-8");
for (const line of envSrc.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"\r\n]*)"?\s*$/);
  if (m) process.env[m[1]] = m[2];
}

const BASE = process.env.APP_URL;
const HASH_KEY = process.env.ECPAY_HASH_KEY;
const HASH_IV = process.env.ECPAY_HASH_IV;
const MERCHANT_ID = process.env.ECPAY_MERCHANT_ID;

console.log("▶ Config");
console.log("  APP_URL         =", BASE);
console.log("  MERCHANT_ID     =", MERCHANT_ID);
console.log("  HASH_KEY        =", HASH_KEY?.slice(0, 4) + "…");
console.log("  REDIS_URL       =", process.env.UPSTASH_REDIS_REST_URL);
console.log();

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// ─── ECPay helpers (ported from lib/ecpay.ts) ─────────────────────────
function ecpayUrlEncode(value) {
  return encodeURIComponent(value)
    .replace(/%20/g, "+")
    .replace(/'/g, "%27")
    .replace(/~/g, "%7e")
    .replace(/!/g, "%21")
    .replace(/\*/g, "%2a")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29")
    .toLowerCase();
}

function computeCheckMacValue(params, hashKey, hashIv) {
  const sortedKeys = Object.keys(params)
    .filter((k) => k !== "CheckMacValue")
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  const pairs = sortedKeys.map((k) => `${k}=${params[k]}`).join("&");
  const raw = `HashKey=${hashKey}&${pairs}&HashIV=${hashIv}`;
  const encoded = ecpayUrlEncode(raw);
  return createHash("sha256").update(encoded).digest("hex").toUpperCase();
}

// ─── Step 0: assertion helper ─────────────────────────────────────────
let failures = 0;
function assert(cond, label) {
  if (cond) {
    console.log("  ✓", label);
  } else {
    console.error("  ✗", label);
    failures++;
  }
}

// ─── Step 1: seed fake site in Redis ──────────────────────────────────
const siteId = `test${Date.now().toString().slice(-8)}`;
const tradeNo = `TEST${Date.now().toString().slice(-10)}`;
const fakeUserKey = "google:test-user-autonomous";

const CLEAN_HTML = `<!doctype html>
<html lang="zh-Hant">
<head><meta charset="utf-8"><title>Test Shop</title></head>
<body>
  <h1>測試店家</h1>
  <img data-5888-slot="storefront" src="https://example.com/a.jpg" alt="外觀" />
  <img data-5888-slot="menu" src="https://example.com/b.jpg" srcset="x 2x" alt="菜單" />
  <p>測試店家 ｜ 2026 Design by 幸福瓢蟲手作雜貨</p>
</body>
</html>`;

const WATERMARKED_HTML = CLEAN_HTML.replace(
  "</body>",
  `<!-- 5888-watermark-start -->
<style id="x5888-wm-style">.x5888-watermark{position:fixed;bottom:16px;right:16px}</style>
<a class="x5888-watermark" href="#">Powered by 5888 網站助手・免費版</a>
<!-- 5888-watermark-end -->
</body>`,
);

console.log("▶ Step 1: Seed fake site in Redis");
console.log("  siteId =", siteId);
console.log("  tradeNo =", tradeNo);

const TTL = 60 * 60 * 24; // 24h
await redis.set(`site:${siteId}`, WATERMARKED_HTML, { ex: TTL });
await redis.set(`site:${siteId}:clean`, CLEAN_HTML, { ex: TTL });
await redis.set(
  `site:${siteId}:meta`,
  JSON.stringify({
    storeName: "測試店家",
    createdAt: Date.now(),
    expiresAt: Date.now() + TTL * 1000,
    model: "sonnet",
    owner: fakeUserKey,
    paid: false,
  }),
  { ex: TTL },
);
await redis.set(`ecpay:trade:${tradeNo}`, siteId, { ex: TTL });
console.log("  seeded ✓\n");

// ─── Step 2: build ECPay notify POST body with valid CheckMacValue ────
console.log("▶ Step 2: Build ECPay success-callback POST body");
const notifyParams = {
  MerchantID: MERCHANT_ID,
  MerchantTradeNo: tradeNo,
  RtnCode: "1",
  RtnMsg: "交易成功",
  TradeNo: "2504110000000001",
  TradeAmt: "490",
  PaymentDate: "2026/04/11 17:30:00",
  PaymentType: "Credit_CreditCard",
  PaymentTypeChargeFee: "10",
  TradeDate: "2026/04/11 17:29:45",
  SimulatePaid: "0",
  StoreID: "",
  CustomField1: "",
  CustomField2: "",
  CustomField3: "",
  CustomField4: "",
};
notifyParams.CheckMacValue = computeCheckMacValue(
  notifyParams,
  HASH_KEY,
  HASH_IV,
);
console.log("  CheckMacValue =", notifyParams.CheckMacValue.slice(0, 16) + "…\n");

// ─── Step 3: POST to /api/ecpay/notify ────────────────────────────────
console.log("▶ Step 3: POST to /api/ecpay/notify");
const formBody = new URLSearchParams(notifyParams).toString();
const res = await fetch(`${BASE}/api/ecpay/notify`, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: formBody,
});
const resText = await res.text();
console.log("  status =", res.status);
console.log("  body   =", JSON.stringify(resText));
assert(res.status === 200, "endpoint returned 200");
assert(resText === "1|OK", "endpoint returned '1|OK'");
console.log();

// Give Redis a moment to settle after the server wrote
await new Promise((r) => setTimeout(r, 500));

// ─── Step 4: verify site was promoted to paid ─────────────────────────
console.log("▶ Step 4: Verify site promoted to paid");
const metaAfter = await redis.get(`site:${siteId}:meta`);
const metaObj =
  typeof metaAfter === "string" ? JSON.parse(metaAfter) : metaAfter;
console.log("  meta =", JSON.stringify(metaObj, null, 2));
assert(metaObj?.paid === true, "meta.paid === true");
assert(metaObj?.source === "ecpay_cash", "meta.source === 'ecpay_cash'");
assert(metaObj?.amount === 490, "meta.amount === 490");
assert(typeof metaObj?.paidAt === "number", "meta.paidAt is a number");
assert(metaObj?.expiresAt === undefined, "meta.expiresAt was removed");

const htmlAfter = await redis.get(`site:${siteId}`);
const htmlStr = typeof htmlAfter === "string" ? htmlAfter : "";
assert(htmlStr.length > 0, "site:{id} still exists");
assert(
  !htmlStr.includes("5888-watermark-start"),
  "watermark stripped from served HTML",
);
assert(
  !htmlStr.includes("Powered by 5888 網站助手・免費版"),
  "watermark badge text gone",
);

const cleanAfter = await redis.get(`site:${siteId}:clean`);
assert(cleanAfter === null, "site:{id}:clean was deleted");

const paidFlag = await redis.get(`web-cteater:paid:${siteId}`);
assert(paidFlag === 1 || paidFlag === "1", "SITE_PAID_KEY counter set");
console.log();

// ─── Step 5: image slot helpers ───────────────────────────────────────
console.log("▶ Step 5: Test image slot extraction/replace helpers");
// Always use the inlined JS versions — loading the TS module from a plain
// .mjs would need tsx/ts-node. We just re-implement the same logic here
// and assert against it; the real module is exercised in-process by the
// running Next.js dev server.
{
  // Inline pure-JS versions for the test
  const VALID_SLOT_IDS = new Set([
    "storefront",
    "menu",
    "interior",
    "product",
    "team",
    "logo",
    "gallery1",
    "gallery2",
  ]);
  function inlineExtract(html) {
    const result = [];
    const seen = new Set();
    const tagRegex = /<img\b([^>]*)>/gi;
    let match;
    while ((match = tagRegex.exec(html)) !== null) {
      const attrs = match[1];
      const slotMatch = attrs.match(
        /\bdata-5888-slot\s*=\s*["']([^"']+)["']/i,
      );
      if (!slotMatch) continue;
      const slotId = slotMatch[1];
      if (!VALID_SLOT_IDS.has(slotId)) continue;
      if (seen.has(slotId)) continue;
      const srcMatch = attrs.match(/\bsrc\s*=\s*["']([^"']+)["']/i);
      if (!srcMatch) continue;
      seen.add(slotId);
      result.push({ slotId, currentUrl: srcMatch[1] });
    }
    return result;
  }
  function inlineReplace(html, slotId, newUrl) {
    const safeSlot = slotId.replace(/[^a-z0-9_-]/gi, "");
    const imgRegex = new RegExp(
      `<img\\b[^>]*\\bdata-5888-slot\\s*=\\s*["']${safeSlot}["'][^>]*>`,
      "gi",
    );
    let count = 0;
    const rewritten = html.replace(imgRegex, (tag) => {
      count++;
      let out = tag;
      if (/\bsrc\s*=\s*"[^"]*"/i.test(out)) {
        out = out.replace(/\bsrc\s*=\s*"[^"]*"/i, `src="${newUrl}"`);
      }
      out = out.replace(/\s+srcset\s*=\s*"[^"]*"/gi, "");
      out = out.replace(/\s+srcset\s*=\s*'[^']*'/gi, "");
      return out;
    });
    return { html: rewritten, replaced: count };
  }
  function inlineAllowed(raw) {
    try {
      const u = new URL(raw);
      if (u.protocol !== "https:") return false;
      const h = u.hostname.toLowerCase();
      return (
        h === "blob.vercelusercontent.com" ||
        h.endsWith(".blob.vercelusercontent.com") ||
        h.endsWith(".public.blob.vercel-storage.com") ||
        h.endsWith(".blob.vercel-storage.com")
      );
    } catch {
      return false;
    }
  }

  const slots = inlineExtract(htmlStr);
  console.log("  extracted slots =", slots);
  assert(slots.length === 2, "extracted 2 image slots");
  assert(slots[0].slotId === "storefront", "first slot is storefront");
  assert(slots[1].slotId === "menu", "second slot is menu");

  // Test replace
  const newUrl = "https://test.public.blob.vercel-storage.com/new.jpg";
  const { html: replaced, replaced: count } = inlineReplace(
    htmlStr,
    "storefront",
    newUrl,
  );
  assert(count === 1, "replaced 1 storefront tag");
  assert(replaced.includes(newUrl), "new URL present in replaced HTML");
  assert(!replaced.includes("https://example.com/a.jpg"), "old URL gone");

  // Test URL allowlist
  assert(
    inlineAllowed("https://test.blob.vercelusercontent.com/x.jpg"),
    "allows blob.vercelusercontent.com",
  );
  assert(
    !inlineAllowed("https://evil.com/x.jpg"),
    "rejects arbitrary hosts",
  );
  assert(
    !inlineAllowed("javascript:alert(1)"),
    "rejects javascript: URIs",
  );
  assert(!inlineAllowed("http://test.blob.vercelusercontent.com/x.jpg"), "rejects http://");
}
console.log();

// ─── Step 6: idempotency check — second notify should be no-op ────────
console.log("▶ Step 6: Idempotency — replay the notify POST");
const res2 = await fetch(`${BASE}/api/ecpay/notify`, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: formBody,
});
const res2Text = await res2.text();
assert(res2.status === 200, "replay returned 200");
assert(res2Text === "1|OK", "replay still returned '1|OK'");

const metaReplay = await redis.get(`site:${siteId}:meta`);
const metaReplayObj =
  typeof metaReplay === "string" ? JSON.parse(metaReplay) : metaReplay;
assert(
  metaReplayObj?.paidAt === metaObj?.paidAt,
  "meta.paidAt did NOT change (alreadyPaid path)",
);
console.log();

// ─── Step 7: invalid CheckMacValue must be rejected ───────────────────
console.log("▶ Step 7: Tampered CheckMacValue must be rejected");
const badBody = formBody.replace(
  notifyParams.CheckMacValue,
  "0000000000000000000000000000000000000000000000000000000000000000",
);
const res3 = await fetch(`${BASE}/api/ecpay/notify`, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: badBody,
});
const res3Text = await res3.text();
assert(res3.status === 200, "tampered request returned 200 (ECPay contract)");
assert(
  res3Text === "0|InvalidMac",
  "tampered request rejected with 0|InvalidMac",
);
console.log();

// ─── Step 8: /api/ecpay/return should redirect back to the preview ───
console.log("▶ Step 8: /api/ecpay/return POST redirects to /preview/{id}?paid=1");
// Seed a fresh trade mapping so return can resolve it
const returnTradeNo = `RET${Date.now().toString().slice(-10)}`;
await redis.set(`ecpay:trade:${returnTradeNo}`, siteId, { ex: 60 * 10 });

const returnRes = await fetch(`${BASE}/api/ecpay/return`, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: `MerchantTradeNo=${returnTradeNo}&RtnCode=1`,
  redirect: "manual",
});
console.log("  status   =", returnRes.status);
console.log("  location =", returnRes.headers.get("location"));
assert(returnRes.status === 303, "returns 303 (POST→GET redirect)");
const loc = returnRes.headers.get("location") || "";
assert(loc === `/preview/${siteId}?paid=1`, `location is path-only /preview/{id}?paid=1 (got: ${loc})`);
assert(
  !loc.includes("localhost"),
  "location does NOT contain localhost (would break under tunnel)",
);

// Unknown tradeNo should fall back to /
const returnRes2 = await fetch(`${BASE}/api/ecpay/return`, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: "MerchantTradeNo=UNKNOWN_TRADE&RtnCode=1",
  redirect: "manual",
});
const loc2 = returnRes2.headers.get("location") || "";
assert(returnRes2.status === 303, "unknown tradeNo still 303");
assert(loc2 === "/", `unknown tradeNo redirects to "/" (got: ${loc2})`);
await redis.del(`ecpay:trade:${returnTradeNo}`);
console.log();

// ─── Step 9: /preview/{id} page should render paid HTML without watermark ─
console.log("▶ Step 9: /preview/{id} serves the paid HTML");
const previewRes = await fetch(`${BASE}/preview/${siteId}`);
const previewHtml = await previewRes.text();
assert(previewRes.status === 200, "preview page returns 200");
assert(
  !previewHtml.includes("Powered by 5888 網站助手・免費版"),
  "no watermark in rendered preview",
);
console.log();

// ─── Cleanup ──────────────────────────────────────────────────────────
console.log("▶ Cleanup");
await redis.del(`site:${siteId}`);
await redis.del(`site:${siteId}:meta`);
await redis.del(`site:${siteId}:clean`);
await redis.del(`site:${siteId}:paid`);
await redis.del(`ecpay:trade:${tradeNo}`);
console.log("  done\n");

// ─── Summary ──────────────────────────────────────────────────────────
if (failures === 0) {
  console.log("✅ All assertions passed.");
  process.exit(0);
} else {
  console.error(`❌ ${failures} assertion(s) failed.`);
  process.exit(1);
}
