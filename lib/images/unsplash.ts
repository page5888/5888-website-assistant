/**
 * Unsplash search — reliable stock photo fallback.
 * Returns up to `count` image URLs matching the given query.
 */
export async function searchUnsplash(
  query: string,
  count = 8,
): Promise<string[]> {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) {
    console.warn("[unsplash] UNSPLASH_ACCESS_KEY not set, skipping");
    return [];
  }

  const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(
    query,
  )}&per_page=${count}&orientation=landscape`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Client-ID ${key}` },
      cache: "no-store",
    });
    if (!res.ok) {
      console.error("[unsplash] HTTP", res.status);
      return [];
    }
    const data = (await res.json()) as {
      results: { urls: { regular: string } }[];
    };
    return data.results.map((r) => r.urls.regular);
  } catch (err) {
    console.error("[unsplash] fetch error", err);
    return [];
  }
}
