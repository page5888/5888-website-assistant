/**
 * Per-user recent sites index.
 *
 * Small bit of metadata so a logged-in user arriving at the landing page
 * can find the site they generated earlier — otherwise they'd need to
 * remember the random siteId URL.
 *
 * Storage: `user:{userKey}:sites` → JSON array of { siteId, createdAt },
 * newest first, capped at 5 entries. No TTL on this key itself — we rely
 * on individual `site:{siteId}:meta` keys expiring (24h for free tier)
 * as the source of truth and filter stale entries out at read time.
 */

import { redis } from "./redis";

export interface UserSiteEntry {
  siteId: string;
  createdAt: number;
}

const MAX_ENTRIES = 5;

function key(userKey: string): string {
  return `user:${userKey}:sites`;
}

async function readList(userKey: string): Promise<UserSiteEntry[]> {
  const raw = await redis.get<string | UserSiteEntry[]>(key(userKey));
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw) as UserSiteEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Record that `userKey` just generated `siteId`. Call this from
 * /api/generate after the site is stored in Redis.
 */
export async function recordUserSite(
  userKey: string,
  siteId: string,
): Promise<void> {
  const current = await readList(userKey);
  const deduped = current.filter((e) => e.siteId !== siteId);
  const next: UserSiteEntry[] = [
    { siteId, createdAt: Date.now() },
    ...deduped,
  ].slice(0, MAX_ENTRIES);
  await redis.set(key(userKey), JSON.stringify(next));
}

/**
 * Return the recent sites for this user that are still valid — i.e. the
 * corresponding `site:{siteId}:meta` key still exists. Entries whose meta
 * has expired (TTL hit, free-tier cleanup) are filtered out AND pruned
 * from the stored list as a side effect, so the list self-cleans.
 *
 * Each returned entry includes the resolved meta fields the landing page
 * needs to render a CTA: storeName, paid flag, and optional expiry.
 */
export interface ResolvedUserSite extends UserSiteEntry {
  storeName: string;
  paid: boolean;
  expiresAt?: number;
}

export async function getActiveUserSites(
  userKey: string,
): Promise<ResolvedUserSite[]> {
  const list = await readList(userKey);
  if (list.length === 0) return [];

  const resolved: ResolvedUserSite[] = [];
  const stillValidIds = new Set<string>();

  for (const entry of list) {
    const metaRaw = await redis.get<string>(`site:${entry.siteId}:meta`);
    if (!metaRaw) continue; // expired or never existed
    const meta =
      typeof metaRaw === "string"
        ? (JSON.parse(metaRaw) as Record<string, unknown>)
        : (metaRaw as Record<string, unknown>);

    resolved.push({
      siteId: entry.siteId,
      createdAt: entry.createdAt,
      storeName: (meta.storeName as string) ?? "未命名",
      paid: meta.paid === true,
      expiresAt: meta.expiresAt as number | undefined,
    });
    stillValidIds.add(entry.siteId);
  }

  // If any entries were dropped, rewrite the list so it self-cleans.
  if (stillValidIds.size !== list.length) {
    const pruned = list.filter((e) => stillValidIds.has(e.siteId));
    if (pruned.length === 0) {
      await redis.del(key(userKey));
    } else {
      await redis.set(key(userKey), JSON.stringify(pruned));
    }
  }

  return resolved;
}
