/**
 * HTML image-slot helpers.
 *
 * Generated sites tag every `<img>` with `data-5888-slot="{slotId}"`
 * (see lib/prompts.ts — we explicitly ask Claude to do this so we can
 * replace images after payment). This module is the single source of
 * truth for reading + rewriting those tags in stored HTML.
 *
 * Kept as pure string functions (no DOM, no parser dependency) so it
 * runs in edge/node identically and is trivial to unit test.
 */
import { SLOTS, type SlotId } from "./imageSlots";

const VALID_SLOT_IDS: ReadonlySet<string> = new Set(SLOTS.map((s) => s.id));

export interface SiteImageSlot {
  slotId: SlotId;
  currentUrl: string;
}

/**
 * Walk every `<img>` tag in the HTML and return the first occurrence
 * of each distinct `data-5888-slot` value along with its current src.
 *
 * Duplicates (same slot rendered in multiple spots of the page) are
 * intentionally de-duped for the UI — the replace operation itself
 * covers ALL occurrences.
 */
export function extractImageSlots(html: string): SiteImageSlot[] {
  const result: SiteImageSlot[] = [];
  const seen = new Set<string>();
  const tagRegex = /<img\b([^>]*)>/gi;
  let match: RegExpExecArray | null;
  while ((match = tagRegex.exec(html)) !== null) {
    const attrs = match[1];
    const slotMatch = attrs.match(/\bdata-5888-slot\s*=\s*["']([^"']+)["']/i);
    if (!slotMatch) continue;
    const slotId = slotMatch[1];
    if (!VALID_SLOT_IDS.has(slotId)) continue;
    if (seen.has(slotId)) continue;
    const srcMatch = attrs.match(/\bsrc\s*=\s*["']([^"']+)["']/i);
    if (!srcMatch) continue;
    seen.add(slotId);
    result.push({ slotId: slotId as SlotId, currentUrl: srcMatch[1] });
  }
  // Preserve SLOTS declaration order for stable UI
  const order = new Map(SLOTS.map((s, i) => [s.id, i] as const));
  result.sort((a, b) => (order.get(a.slotId) ?? 99) - (order.get(b.slotId) ?? 99));
  return result;
}

/**
 * Replace the `src` of every `<img>` tagged with the given slotId.
 * Returns the rewritten HTML and the number of tags actually touched.
 *
 * Also strips any `srcset` on the matched tags because the new URL is
 * a single size — a stale srcset would override our change on retina
 * displays and silently break the replacement.
 */
export function replaceSlotSrc(
  html: string,
  slotId: string,
  newUrl: string,
): { html: string; replaced: number } {
  if (!VALID_SLOT_IDS.has(slotId)) {
    return { html, replaced: 0 };
  }
  // Escape the slotId just in case (all current slots are a-z0-9 only)
  const safeSlot = slotId.replace(/[^a-z0-9_-]/gi, "");
  const imgRegex = new RegExp(
    `<img\\b[^>]*\\bdata-5888-slot\\s*=\\s*["']${safeSlot}["'][^>]*>`,
    "gi",
  );
  let count = 0;
  const rewritten = html.replace(imgRegex, (tag) => {
    count++;
    // Replace src (either quote style). If there's no src at all, add one.
    let out = tag;
    if (/\bsrc\s*=\s*"[^"]*"/i.test(out)) {
      out = out.replace(/\bsrc\s*=\s*"[^"]*"/i, `src="${escapeAttr(newUrl)}"`);
    } else if (/\bsrc\s*=\s*'[^']*'/i.test(out)) {
      out = out.replace(/\bsrc\s*=\s*'[^']*'/i, `src="${escapeAttr(newUrl)}"`);
    } else {
      out = out.replace(/<img\b/i, `<img src="${escapeAttr(newUrl)}"`);
    }
    // Strip any srcset (now stale)
    out = out.replace(/\s+srcset\s*=\s*"[^"]*"/gi, "");
    out = out.replace(/\s+srcset\s*=\s*'[^']*'/gi, "");
    return out;
  });
  return { html: rewritten, replaced: count };
}

/**
 * Allow only the Vercel Blob hostnames our `/api/upload-image` endpoint
 * actually emits. Rejecting arbitrary URLs prevents:
 *   - javascript: URIs that would XSS the iframe
 *   - attacker-controlled hosts used to exfiltrate referer / embed
 *     malicious content into the paid site
 */
export function isAllowedImageUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase();
  return (
    host === "blob.vercelusercontent.com" ||
    host.endsWith(".blob.vercelusercontent.com") ||
    host.endsWith(".public.blob.vercel-storage.com") ||
    host.endsWith(".blob.vercel-storage.com")
  );
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, "&quot;");
}
