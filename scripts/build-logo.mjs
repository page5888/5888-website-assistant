#!/usr/bin/env node
/**
 * Rasterize public/logo.svg → logo-32.png / logo-64.png / favicon.ico.
 *
 * Run:  node scripts/build-logo.mjs
 *
 * Uses `sharp` which is already a transitive dep of Next.js.
 */
import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, "..", "public");

const svg = await readFile(path.join(publicDir, "logo.svg"));

async function rasterize(size, outName) {
  const png = await sharp(svg)
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toBuffer();
  await writeFile(path.join(publicDir, outName), png);
  console.log(`wrote ${outName} (${png.length} bytes, ${size}×${size})`);
}

await rasterize(32, "logo-32.png");
await rasterize(64, "logo-64.png");
await rasterize(512, "logo-512.png");

// Favicon — 32x32 PNG named favicon.ico (browsers accept this).
await rasterize(32, "favicon.ico");

console.log("done");
