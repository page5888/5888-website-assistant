#!/usr/bin/env node
/**
 * Rescue a site whose Redis meta was deleted but whose HTML body still
 * exists in Redis. Rebuilds `site:{id}:meta` + `web-cteater:paid:{id}`
 * flag + adds the site back into the owner's `user:{owner}:sites` index.
 *
 * When to run:
 *   - A customer says "I paid for my site but it's gone from /my-sites"
 *     and the GitHub Pages deployment still works
 *   - You've run `node scripts/inspect-sites.mjs` and confirmed there is
 *     a `site:<id>` HTML key but no matching `:meta` sibling
 *
 * The original cause (paid-site meta being silently rewritten with a
 * 1-hour TTL on GitHub deploy) was fixed in commit 2c16962. Running
 * this script on a rescued site is safe — it only writes, never deletes.
 * It also aborts if meta already exists, so re-runs won't clobber.
 *
 * Usage:
 *   node scripts/rescue-site-meta.mjs <siteId> <owner> [options]
 *
 * Required positional args:
 *   siteId   The random-looking id from /preview/<id>
 *   owner    The owner userKey in the form "google:<sub>" (check the
 *            customer's session cookie or `user:*:sites` keys via
 *            inspect-sites.mjs to find the right one)
 *
 * Options:
 *   --store <name>       Store name to put in meta.storeName. If
 *                        omitted, we try to extract it from <title> or
 *                        JSON-LD in the HTML body. Falls back to "未命名".
 *   --repo <name>        GitHub repo name (e.g. "site-foo-1234567890").
 *                        If provided, we also reconstruct the deploy
 *                        object so /my-sites shows the 🚀 已上架 badge.
 *   --owner-name <owner> GitHub owner for deploy URLs. Default page5888.
 *   --created-at <ms>    Explicit createdAt timestamp. If omitted AND a
 *                        repo name is given with a trailing -<timestamp>
 *                        suffix, we'll use that; otherwise Date.now().
 *   --dry-run            Print what would be written without touching
 *                        Redis. Always run this first to sanity check.
 *   --force              Overwrite existing meta. DANGEROUS. Without
 *                        this flag the script refuses to run if meta
 *                        already exists.
 *
 * Examples:
 *   # Dry run first
 *   node scripts/rescue-site-meta.mjs GZWQZ_LPF_qo google:100336556323686893277 \\
 *     --store "一級棒鎖印行" \\
 *     --repo site-site-1775912574213 \\
 *     --dry-run
 *
 *   # For real
 *   node scripts/rescue-site-meta.mjs GZWQZ_LPF_qo google:100336556323686893277 \\
 *     --store "一級棒鎖印行" \\
 *     --repo site-site-1775912574213
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ── env loading ─────────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envText = readFileSync(
  path.resolve(__dirname, "..", ".env.local"),
  "utf8",
);
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(?:"([^"]*)"|(.*))$/);
  if (m) process.env[m[1]] = m[2] ?? m[3] ?? "";
}

const BASE = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
if (!BASE || !TOKEN) {
  console.error(
    "missing UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN in .env.local",
  );
  process.exit(1);
}

// ── arg parsing ─────────────────────────────────────────────────────
function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const name = a.slice(2);
      // Boolean flags
      if (name === "dry-run" || name === "force") {
        flags[name] = true;
      } else {
        flags[name] = argv[++i];
      }
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

const { positional, flags } = parseArgs(process.argv.slice(2));

if (positional.length < 2) {
  console.error("usage: node scripts/rescue-site-meta.mjs <siteId> <owner> [options]");
  console.error("run with --help to see the full docblock");
  process.exit(1);
}

const SITE_ID = positional[0];
const OWNER = positional[1];
const REPO_NAME = flags.repo ?? null;
const GH_OWNER = flags["owner-name"] ?? "page5888";
const DRY_RUN = Boolean(flags["dry-run"]);
const FORCE = Boolean(flags.force);

// Try to auto-detect createdAt from repo name suffix (deployHtmlToPages
// appends Date.now() as the suffix), else use the explicit override or
// current time.
function detectCreatedAt() {
  if (flags["created-at"]) {
    const n = Number(flags["created-at"]);
    if (Number.isFinite(n)) return n;
  }
  if (REPO_NAME) {
    const match = REPO_NAME.match(/-(\d{13})$/);
    if (match) {
      // Deploy was a few seconds AFTER creation in practice; back off
      // a minute so timeline cards show a sane order.
      return Number(match[1]) - 60_000;
    }
  }
  return Date.now();
}

// ── redis helpers ───────────────────────────────────────────────────
async function rGet(cmd) {
  const res = await fetch(`${BASE}/${cmd.join("/")}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`GET fail: ${JSON.stringify(j)}`);
  return j.result;
}

async function rSet(key, value) {
  if (DRY_RUN) {
    console.log(`  [dry-run] SET ${key}  (${String(value).length} bytes)`);
    return;
  }
  const res = await fetch(`${BASE}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([["SET", key, value]]),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`SET fail: ${JSON.stringify(j)}`);
}

// ── storeName extraction (fallback) ─────────────────────────────────
function extractStoreName(html) {
  if (!html) return null;
  // Prefer JSON-LD LocalBusiness name, which the prompt asks for.
  const ldMatch = html.match(/"@type"\s*:\s*"LocalBusiness"[\s\S]*?"name"\s*:\s*"([^"]+)"/);
  if (ldMatch) return ldMatch[1];
  // Fallback to <title> stripped of common separators.
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) {
    return titleMatch[1].split(/[|｜—–-]/)[0].trim() || null;
  }
  return null;
}

// ── main ────────────────────────────────────────────────────────────
console.log(`\n=== rescue-site-meta ===`);
console.log(`  siteId: ${SITE_ID}`);
console.log(`  owner:  ${OWNER}`);
if (DRY_RUN) console.log(`  MODE:   dry-run (no writes)`);
console.log();

// 1. HTML body must exist
const html = await rGet(["get", `site:${SITE_ID}`]);
if (!html) {
  console.error(
    `✗ site:${SITE_ID} has no HTML body either — nothing to rescue.`,
  );
  console.error(`  (If the site only lives on GitHub Pages, you can still`);
  console.error(`  manually add an entry via Upstash console, but this`);
  console.error(`  script needs the HTML body as proof of existence.)`);
  process.exit(1);
}
console.log(`✓ HTML body present (${html.length} chars)`);

// 2. Meta must be missing (unless --force)
const existingMeta = await rGet(["get", `site:${SITE_ID}:meta`]);
if (existingMeta && !FORCE) {
  console.error(`\n⚠ meta already exists. Aborting to avoid clobber.`);
  console.error(`  Use --force if you're SURE you want to overwrite.`);
  console.error(`  Existing meta:`);
  console.error(
    "  " +
      (typeof existingMeta === "string"
        ? existingMeta
        : JSON.stringify(existingMeta)),
  );
  process.exit(1);
}

// 3. Resolve storeName
let storeName = flags.store ?? extractStoreName(html) ?? "未命名";
console.log(`✓ storeName: ${storeName}${flags.store ? " (from --store)" : " (auto-detected)"}`);

// 4. Resolve createdAt
const createdAt = detectCreatedAt();
const paidAt = createdAt + 30_000; // ~30s after generation
console.log(`✓ createdAt: ${new Date(createdAt).toISOString()}`);

// 5. Build deploy object if repo provided
let deploy = null;
if (REPO_NAME) {
  deploy = {
    repoName: REPO_NAME,
    repoUrl: `https://github.com/${GH_OWNER}/${REPO_NAME}`,
    pagesUrl: `https://${GH_OWNER}.github.io/${REPO_NAME}/`,
  };
  console.log(`✓ deploy: ${deploy.pagesUrl}`);
} else {
  console.log(`  deploy: (none — pass --repo <name> if you want the`);
  console.log(`           🚀 已上架 badge and public URL link)`);
}

// 6. Build meta matching promoteSiteToPaid shape
const meta = {
  siteId: SITE_ID,
  owner: OWNER,
  storeName,
  createdAt,
  paid: true,
  paidAt,
  rescued: true,
  rescuedAt: Date.now(),
  rescueNote:
    "Meta rebuilt by scripts/rescue-site-meta.mjs. Site body + GitHub repo still existed; meta had been wiped.",
  ...(deploy ? { deploy } : {}),
};

console.log(`\nmeta to write:`);
console.log("  " + JSON.stringify(meta).slice(0, 300) + "...");

// 7. Write everything
console.log(`\nwriting to Redis:`);
await rSet(`site:${SITE_ID}:meta`, JSON.stringify(meta));
console.log(`  ✓ site:${SITE_ID}:meta (no TTL)`);

await rSet(`web-cteater:paid:${SITE_ID}`, "1");
console.log(`  ✓ web-cteater:paid:${SITE_ID} = 1`);

// 8. Merge into user:*:sites index
const userKey = `user:${OWNER}:sites`;
const existingIdxRaw = await rGet(["get", userKey]);
let existingIdx = [];
if (existingIdxRaw) {
  try {
    existingIdx =
      typeof existingIdxRaw === "string"
        ? JSON.parse(existingIdxRaw)
        : existingIdxRaw;
    if (!Array.isArray(existingIdx)) existingIdx = [];
  } catch {
    existingIdx = [];
  }
}
const withoutThis = existingIdx.filter((e) => e.siteId !== SITE_ID);
const merged = [...withoutThis, { siteId: SITE_ID, createdAt }].sort(
  (a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0),
);
await rSet(userKey, JSON.stringify(merged));
console.log(`  ✓ ${userKey} (${merged.length} entries)`);

console.log(
  `\n${DRY_RUN ? "[dry-run done — re-run without --dry-run to apply]" : "🎉 rescue complete"}`,
);
if (!DRY_RUN) {
  console.log(
    `   log in as ${OWNER} → /my-sites → should see "${storeName}"`,
  );
}
