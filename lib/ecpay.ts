/**
 * ECPay (綠界) AIO checkout helper.
 *
 * Docs: https://developers.ecpay.com.tw/?p=2856
 *
 * Required env vars:
 *   ECPAY_MERCHANT_ID   — 特店編號 (test: 2000132)
 *   ECPAY_HASH_KEY      — HashKey  (test: 5294y06JbISpM5x9)
 *   ECPAY_HASH_IV       — HashIV   (test: v77hoKGq4kWxNNIS)
 *   ECPAY_STAGE         — "test" | "production"
 *   APP_URL             — e.g. https://5888-website-assistant.vercel.app
 *
 * Test card: 4311-9522-2222-2222, any future expiry, CVV 222
 */

import { createHash } from "node:crypto";

const TEST_ENDPOINT = "https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5";
const PROD_ENDPOINT = "https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5";

export function getEcpayEndpoint(): string {
  return process.env.ECPAY_STAGE === "production"
    ? PROD_ENDPOINT
    : TEST_ENDPOINT;
}

export function getEcpayConfig() {
  return {
    merchantId: process.env.ECPAY_MERCHANT_ID || "2000132",
    hashKey: process.env.ECPAY_HASH_KEY || "5294y06JbISpM5x9",
    hashIv: process.env.ECPAY_HASH_IV || "v77hoKGq4kWxNNIS",
    stage: process.env.ECPAY_STAGE || "test",
  };
}

/**
 * ECPay's URL-encoding is a variant of encodeURIComponent that keeps
 * certain characters as-is (-, _, ., !, *, (, ) and space becomes +).
 * The .NET HttpUtility.UrlEncode() output is the reference.
 */
function ecpayUrlEncode(value: string): string {
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

/**
 * Compute the CheckMacValue for a set of ECPay parameters.
 *
 *   1. Sort params alphabetically by key (case-insensitive)
 *   2. Prepend HashKey, append HashIV
 *   3. URL-encode the whole string using ECPay's variant
 *   4. Lowercase
 *   5. SHA-256 → uppercase hex
 */
export function computeCheckMacValue(
  params: Record<string, string | number>,
  hashKey: string,
  hashIv: string,
): string {
  // 1. Sort alphabetically, case-insensitive
  const sortedKeys = Object.keys(params)
    .filter((k) => k !== "CheckMacValue")
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

  // 2. Build key=value&key=value... with HashKey prepended and HashIV appended
  const pairs = sortedKeys.map((k) => `${k}=${params[k]}`).join("&");
  const raw = `HashKey=${hashKey}&${pairs}&HashIV=${hashIv}`;

  // 3 + 4. ECPay URL-encode + lowercase
  const encoded = ecpayUrlEncode(raw);

  // 5. SHA-256 → uppercase hex
  return createHash("sha256").update(encoded).digest("hex").toUpperCase();
}

/**
 * Verify an incoming CheckMacValue (used in /api/ecpay/notify) by
 * re-computing it from the posted params and comparing.
 */
export function verifyCheckMacValue(
  params: Record<string, string>,
  hashKey: string,
  hashIv: string,
): boolean {
  const incoming = params.CheckMacValue;
  if (!incoming) return false;
  const computed = computeCheckMacValue(params, hashKey, hashIv);
  return computed === incoming.toUpperCase();
}

export interface BuildOrderParamsInput {
  /** Your internal order id (<= 20 chars, alphanumeric) */
  merchantTradeNo: string;
  /** Amount in TWD, integer */
  totalAmount: number;
  /** e.g. "5888 網站助手 — 完整版解鎖" */
  tradeDesc: string;
  /** e.g. "網站解鎖 NT$490" */
  itemName: string;
  /** Absolute URL — server callback (MUST be publicly reachable) */
  returnUrl: string;
  /** Absolute URL — user's browser is redirected here after payment */
  clientBackUrl: string;
  /** Absolute URL — if user clicks "return to merchant" on ECPay's result page */
  orderResultUrl?: string;
}

/**
 * Build the full parameter dict (with CheckMacValue) that should be
 * POSTed to the ECPay AIO checkout endpoint as an HTML form.
 */
export function buildOrderParams(
  input: BuildOrderParamsInput,
): Record<string, string> {
  const { merchantId, hashKey, hashIv } = getEcpayConfig();

  // ECPay expects MerchantTradeDate in "yyyy/MM/dd HH:mm:ss" (Taiwan time)
  const now = new Date();
  const tzOffset = 8 * 60; // Taiwan is UTC+8
  const local = new Date(now.getTime() + (tzOffset + now.getTimezoneOffset()) * 60000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const merchantTradeDate =
    `${local.getFullYear()}/${pad(local.getMonth() + 1)}/${pad(local.getDate())} ` +
    `${pad(local.getHours())}:${pad(local.getMinutes())}:${pad(local.getSeconds())}`;

  const params: Record<string, string> = {
    MerchantID: merchantId,
    MerchantTradeNo: input.merchantTradeNo,
    MerchantTradeDate: merchantTradeDate,
    PaymentType: "aio",
    TotalAmount: String(input.totalAmount),
    TradeDesc: input.tradeDesc,
    ItemName: input.itemName,
    ReturnURL: input.returnUrl,
    ClientBackURL: input.clientBackUrl,
    ChoosePayment: "ALL",
    EncryptType: "1",
  };
  if (input.orderResultUrl) {
    params.OrderResultURL = input.orderResultUrl;
  }

  params.CheckMacValue = computeCheckMacValue(params, hashKey, hashIv);
  return params;
}

/**
 * Pricing constants. Change one value here and it flows everywhere.
 */
export const PRICING = {
  FULL_UNLOCK_TWD: 490,
  ITEM_NAME: "5888 網站助手 - 完整版解鎖",
  TRADE_DESC: "移除浮水印 永久保留 30次修改 GitHub部署",
} as const;

