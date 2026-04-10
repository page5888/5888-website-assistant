/**
 * Best-effort Facebook page image scraper.
 *
 * ⚠️ This violates Facebook's Terms of Service and is fragile — FB actively
 * blocks scrapers. The user has explicitly waived copyright/TOS concerns.
 * If this fails (which will happen often), callers must fall back to
 * Unsplash or AI image generation.
 *
 * Strategy:
 *   1. Fetch the public page with a realistic User-Agent.
 *   2. Parse <meta property="og:image"> and <meta property="og:image:secure_url">.
 *   3. Scan the HTML body for CDN image URLs (fbcdn.net / scontent).
 */
export async function scrapeFacebookImages(
  fbPageUrl: string,
  max = 8,
): Promise<string[]> {
  try {
    const normalized = normalizeFbUrl(fbPageUrl);
    if (!normalized) return [];

    const res = await fetch(normalized, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; facebookexternalhit/1.1; +http://www.facebook.com/externalhit_uatext.php)",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
      },
      cache: "no-store",
      redirect: "follow",
    });

    if (!res.ok) {
      console.warn("[fb] status", res.status);
      return [];
    }

    const html = await res.text();
    const images = new Set<string>();

    // og:image meta tags
    const ogRegex =
      /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/gi;
    let match: RegExpExecArray | null;
    while ((match = ogRegex.exec(html)) !== null) {
      images.add(decodeHtml(match[1]));
      if (images.size >= max) break;
    }

    // Raw fbcdn URLs in body
    if (images.size < max) {
      const cdnRegex =
        /https:\/\/[a-z0-9.-]*fbcdn\.net\/[^"'\s<>\\]+?\.(?:jpg|jpeg|png|webp)/gi;
      let cdn: RegExpExecArray | null;
      while ((cdn = cdnRegex.exec(html)) !== null) {
        images.add(cdn[0]);
        if (images.size >= max) break;
      }
    }

    return Array.from(images).slice(0, max);
  } catch (err) {
    console.error("[fb] scrape error", err);
    return [];
  }
}

function normalizeFbUrl(input: string): string | null {
  try {
    const u = new URL(input);
    if (!u.hostname.includes("facebook.com")) return null;
    // Prefer desktop host to get reliable OG tags
    u.hostname = "www.facebook.com";
    return u.toString();
  } catch {
    return null;
  }
}

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&#x2F;/g, "/")
    .replace(/&#47;/g, "/")
    .replace(/&quot;/g, '"');
}
