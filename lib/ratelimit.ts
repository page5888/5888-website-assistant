import { Ratelimit } from "@upstash/ratelimit";
import { redis } from "./redis";

/**
 * Daily rate limit: 1 generation per account per 24h.
 * Keyed on `${provider}:${providerAccountId}` via getUserKey().
 */
export const dailyLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(1, "1 d"),
  prefix: "web-cteater:daily",
  analytics: false,
});
