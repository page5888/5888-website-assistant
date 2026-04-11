/**
 * Shared "promote free site to paid" logic.
 *
 * Used by BOTH:
 *   - app/api/ecpay/notify/route.ts  (normal ECPay-paid path)
 *   - app/api/checkout/route.ts       (full-points redemption, bypasses ECPay)
 *
 * Responsibilities:
 *   1. Load site meta + HTML from Redis
 *   2. Strip the watermark (or load the clean copy we stashed during generation)
 *   3. Re-store HTML + meta WITHOUT TTL so the site becomes permanent
 *   4. Mark meta.paid + meta.paidAt + any payment-source fields
 *   5. Set the lifetime "this site is paid" flag
 *   6. Clean up the throwaway clean-copy key
 *
 * Idempotent: if meta.paid is already true, this is a no-op.
 */

import { redis } from "./redis";
import { stripWatermark } from "./watermark";
import { SITE_PAID_KEY } from "./ratelimit";

export interface PromoteOptions {
  siteId: string;
  /** Extra fields to merge into meta (e.g. ecpayTradeNo, amount, usePoints) */
  paidMeta?: Record<string, unknown>;
}

export interface PromoteResult {
  ok: boolean;
  /** Already paid before this call */
  alreadyPaid?: boolean;
  /** Meta was missing — site likely expired */
  missing?: boolean;
}

export async function promoteSiteToPaid(
  opts: PromoteOptions,
): Promise<PromoteResult> {
  const { siteId, paidMeta } = opts;

  const metaRaw = await redis.get<string>(`site:${siteId}:meta`);
  if (!metaRaw) {
    return { ok: false, missing: true };
  }

  const meta =
    typeof metaRaw === "string"
      ? (JSON.parse(metaRaw) as Record<string, unknown>)
      : (metaRaw as Record<string, unknown>);

  if (meta.paid === true) {
    return { ok: true, alreadyPaid: true };
  }

  meta.paid = true;
  meta.paidAt = Date.now();
  if (paidMeta) {
    for (const [k, v] of Object.entries(paidMeta)) {
      meta[k] = v;
    }
  }
  delete meta.expiresAt;

  // Prefer the clean copy stashed at generation time; otherwise strip the
  // watermark from the currently-served (watermarked) HTML.
  const cleanHtml = await redis.get<string>(`site:${siteId}:clean`);
  const currentHtml = await redis.get<string>(`site:${siteId}`);
  const finalHtml = cleanHtml || (currentHtml ? stripWatermark(currentHtml) : null);

  if (finalHtml) {
    await redis.set(`site:${siteId}`, finalHtml);
  }
  await redis.set(`site:${siteId}:meta`, JSON.stringify(meta));
  await redis.set(SITE_PAID_KEY(siteId), 1);
  await redis.del(`site:${siteId}:clean`);

  return { ok: true };
}
