import { Ratelimit } from "@upstash/ratelimit";
import { redis } from "./redis";

/**
 * Daily rate limit: 1 successful generation per account per 24h.
 * Keyed on `${provider}:${providerAccountId}` via getUserKey().
 *
 * IMPORTANT: we only consume this AFTER Claude returns success, so a
 * failed generation (bad API key, network error, credit exhaustion,
 * etc.) does NOT waste the user's daily quota.
 */
export const dailyLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(1, "1 d"),
  prefix: "web-cteater:daily",
  analytics: false,
});

/**
 * IP-based limit: 5 requests per IP per day. This is a cheap first line
 * of defence against script-based abuse. Real people behind shared IPs
 * (Starbucks, office, school) should still be fine.
 */
export const ipDailyLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(5, "1 d"),
  prefix: "web-cteater:ip",
  analytics: false,
});

/**
 * Edit limit: 1 edit per account per day. Paid users can still edit
 * their sites, but only once every 24h to keep Claude cost predictable.
 */
export const dailyEditLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(1, "1 d"),
  prefix: "web-cteater:edit-daily",
  analytics: false,
});

/**
 * TTL constants (in seconds).
 */
export const TTL = {
  /** Free-tier sites live for 24 hours after generation */
  FREE_SITE: 60 * 60 * 24,
  /** Permanent sites never expire (use `undefined` to skip `ex`) */
  PAID_SITE: undefined,
} as const;

/**
 * Lifetime free-generation counter key. Stored as a plain Redis counter
 * with no TTL — once a user has used up their quota, they stay capped
 * forever (until they pay).
 *
 * The limit used to be 1, but was bumped to 2 so users who bump into
 * broken images / wrong-style output on their first attempt have a
 * retry buffer before being forced to pay.
 */
export const LIFETIME_FREE_KEY = (userKey: string) =>
  `web-cteater:lifetime-free:${userKey}`;

/** How many free generations each account gets, lifetime. */
export const LIFETIME_FREE_LIMIT = 2;

/**
 * Lifetime paid flag (once paid for this siteId, this key is set
 * forever). Checked by download / deploy / remove-watermark.
 */
export const SITE_PAID_KEY = (siteId: string) => `web-cteater:paid:${siteId}`;

/**
 * Per-site edit counter (max 30 for paid users).
 */
export const SITE_EDITS_KEY = (siteId: string) =>
  `web-cteater:edits:${siteId}`;

/** Max edits per paid site */
export const MAX_EDITS_PER_SITE = 30;
