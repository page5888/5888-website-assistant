#!/usr/bin/env node
/**
 * One-shot backfill: rebuild the `user:{userKey}:sites` index by scanning
 * all existing `site:*:meta` keys and grouping by `owner`.
 *
 * Needed once because the `recordUserSite()` call was added in commit
 * 72a4056 (2026-04-11 20:06), but sites generated BEFORE that commit
 * never got indexed. Users who logged in after the index feature shipped
 * saw an empty "recent sites" banner even though their sites were still
 * in Redis.
 *
 * Safe to re-run — it merges with any existing index entries and dedups
 * by siteId. Capped at 5 entries per user (MAX_ENTRIES in userSites.ts).
 *
 * Run:  node scripts/backfill-user-sites-index.mjs
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "..", ".env.local");

// Minimal .env.local parser so we don't need dotenv in devDeps.
const envText = readFileSync(envPath, "utf8");
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(?:"([^"]*)"|(.*))$/);
  if (m) process.env[m[1]] = m[2] ?? m[3] ?? "";
}

const URL = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
if (!URL || !TOKEN) {
  console.error("missing UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN");
  process.exit(1);
}

const MAX_ENTRIES = 5;

async function redis(cmd) {
  const res = await fetch(`${URL}/${cmd.join("/")}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Redis ${cmd[0]} failed: ${JSON.stringify(json)}`);
  return json.result;
}

async function redisSet(key, value) {
  // Upstash REST /set expects POST for non-trivial values. Safer path:
  // POST to /pipeline with a SET command so the value stays intact.
  const res = await fetch(`${URL}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([["SET", key, value]]),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Redis SET failed: ${JSON.stringify(json)}`);
  return json;
}

// 1. Find all site:*:meta keys.
const metaKeys = await redis(["keys", "site:*:meta"]);
console.log(`found ${metaKeys.length} site meta keys`);

// 2. Read each meta, group by owner → [{ siteId, createdAt }].
const byOwner = new Map();
for (const k of metaKeys) {
  const raw = await redis(["get", k]);
  if (!raw) continue;
  let meta;
  try {
    meta = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    console.warn(`  skipping ${k} — non-JSON meta`);
    continue;
  }
  const owner = meta.owner;
  if (!owner || typeof owner !== "string") {
    console.warn(`  skipping ${k} — no owner field`);
    continue;
  }
  // Extract siteId from `site:<id>:meta`
  const siteId = k.replace(/^site:/, "").replace(/:meta$/, "");
  const createdAt = Number(meta.createdAt) || Date.now();
  if (!byOwner.has(owner)) byOwner.set(owner, []);
  byOwner.get(owner).push({ siteId, createdAt });
}

console.log(`grouped into ${byOwner.size} owners`);

// 3. For each owner, merge with the existing user:{owner}:sites index.
for (const [owner, discovered] of byOwner) {
  const userKey = `user:${owner}:sites`;
  const existingRaw = await redis(["get", userKey]);
  let existing = [];
  if (existingRaw) {
    try {
      existing =
        typeof existingRaw === "string"
          ? JSON.parse(existingRaw)
          : existingRaw;
      if (!Array.isArray(existing)) existing = [];
    } catch {
      existing = [];
    }
  }

  // Merge: union by siteId, sort by createdAt desc, cap at MAX_ENTRIES.
  const seen = new Set();
  const merged = [...existing, ...discovered]
    .filter((e) => {
      if (seen.has(e.siteId)) return false;
      seen.add(e.siteId);
      return true;
    })
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
    .slice(0, MAX_ENTRIES);

  await redisSet(userKey, JSON.stringify(merged));
  console.log(
    `  ${owner.padEnd(50)} → ${merged.length} entries  (existing=${existing.length}, discovered=${discovered.length})`,
  );
}

console.log("done");
