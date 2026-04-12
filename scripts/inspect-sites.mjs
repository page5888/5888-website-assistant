// One-shot inspection: dump all site:*:meta + user:*:sites in Upstash.
// Used for debugging "missing paid site" reports. Run:
//   node scripts/inspect-sites.mjs
// Safe to run — read only.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

async function r(cmd) {
  const res = await fetch(`${BASE}/${cmd.join("/")}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`redis fail: ${JSON.stringify(j)}`);
  return j.result;
}

const metaKeys = await r(["keys", "site:*:meta"]);
console.log(`=== ${metaKeys.length} site meta keys ===\n`);

const rows = [];
for (const k of metaKeys) {
  const raw = await r(["get", k]);
  if (!raw) continue;
  const m = typeof raw === "string" ? JSON.parse(raw) : raw;
  const id = k.replace(/^site:/, "").replace(/:meta$/, "");
  rows.push({
    id,
    paid: m.paid === true,
    owner: m.owner || "(none)",
    store: m.storeName || "(none)",
    createdAt: m.createdAt,
    paidAt: m.paidAt,
    deploy: m.deploy || null,
    expiresAt: m.expiresAt,
  });
}

// Sort newest first
rows.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));

for (const row of rows) {
  const flags = [];
  if (row.paid) flags.push("✨PAID");
  if (row.deploy?.pagesUrl) flags.push("🚀DEPLOYED");
  if (row.expiresAt) flags.push(`⏰EXPIRES@${new Date(row.expiresAt).toISOString()}`);
  console.log(`${row.id}  [${flags.join(" ")}]`);
  console.log(`  store:   ${row.store}`);
  console.log(`  owner:   ${row.owner}`);
  console.log(`  created: ${row.createdAt ? new Date(row.createdAt).toISOString() : "?"}`);
  if (row.paidAt) console.log(`  paidAt:  ${new Date(row.paidAt).toISOString()}`);
  if (row.deploy?.pagesUrl) console.log(`  pages:   ${row.deploy.pagesUrl}`);
  if (row.deploy?.repoUrl) console.log(`  repo:    ${row.deploy.repoUrl}`);
  console.log();
}

console.log("=== user:*:sites indexes ===\n");
const userKeys = await r(["keys", "user:*:sites"]);
for (const k of userKeys) {
  const raw = await r(["get", k]);
  const list = typeof raw === "string" ? JSON.parse(raw) : raw;
  console.log(`${k}  (${Array.isArray(list) ? list.length : 0} entries)`);
  if (Array.isArray(list)) {
    for (const e of list) {
      console.log(`  - ${e.siteId}  ${e.createdAt ? new Date(e.createdAt).toISOString() : "?"}`);
    }
  }
  console.log();
}
