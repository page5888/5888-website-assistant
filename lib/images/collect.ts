import { scrapeFacebookImages } from "./fbScraper";
import { searchUnsplash } from "./unsplash";
import { generateAiImages } from "./aiGen";

export interface CollectImagesInput {
  userImages?: string[];
  fbUrl?: string;
  industryHint: string;
  storeName: string;
  target?: number;
}

/**
 * Collects images in priority order:
 *   1. User-uploaded images (passed in as data URLs or blob URLs)
 *   2. Facebook page scraping (if fbUrl provided)
 *   3. Unsplash search by industry hint
 *   4. AI-generated fallback (Gemini Imagen)
 *
 * Returns up to `target` image URLs total. Short-circuits as soon as the
 * target is reached to save API cost.
 */
export async function collectImages(
  input: CollectImagesInput,
): Promise<{ images: string[]; sources: string[] }> {
  const target = input.target ?? 8;
  const images: string[] = [];
  const sources: string[] = [];

  // 1. User uploads
  if (input.userImages && input.userImages.length > 0) {
    images.push(...input.userImages.slice(0, target));
    sources.push(`user:${input.userImages.length}`);
    if (images.length >= target) return { images, sources };
  }

  // 2. Facebook
  if (input.fbUrl) {
    const fb = await scrapeFacebookImages(input.fbUrl, target - images.length);
    if (fb.length > 0) {
      images.push(...fb);
      sources.push(`fb:${fb.length}`);
    }
    if (images.length >= target) return { images, sources };
  }

  // 3. Unsplash
  const unsplashQuery = `${input.industryHint} ${input.storeName}`.trim();
  const stock = await searchUnsplash(unsplashQuery, target - images.length);
  if (stock.length > 0) {
    images.push(...stock);
    sources.push(`unsplash:${stock.length}`);
  }
  if (images.length >= target) return { images, sources };

  // 4. AI generation last resort
  const remaining = target - images.length;
  if (remaining > 0) {
    const ai = await generateAiImages(
      `High quality photography of ${input.industryHint}, warm lighting, editorial style, no text, no logos`,
      Math.min(remaining, 4),
    );
    if (ai.length > 0) {
      images.push(...ai);
      sources.push(`ai:${ai.length}`);
    }
  }

  return { images, sources };
}
