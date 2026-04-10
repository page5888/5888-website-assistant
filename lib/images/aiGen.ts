/**
 * AI image generation fallback using Google Gemini Imagen.
 *
 * This is the last-resort path — called only when the user provides no
 * images, FB scraping fails, AND Unsplash returns nothing. To keep the
 * dependency surface tiny we hit the REST API directly instead of pulling
 * in the full @google/generative-ai SDK.
 *
 * If GOOGLE_GEMINI_API_KEY is not configured this returns [] silently
 * so upstream code still works in dev.
 */

const ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict";

export async function generateAiImages(
  prompt: string,
  count = 4,
): Promise<string[]> {
  const key = process.env.GOOGLE_GEMINI_API_KEY;
  if (!key) {
    console.warn("[aiGen] GOOGLE_GEMINI_API_KEY not set, skipping");
    return [];
  }

  try {
    const res = await fetch(`${ENDPOINT}?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: { sampleCount: Math.min(count, 4) },
      }),
      cache: "no-store",
    });

    if (!res.ok) {
      console.error("[aiGen] HTTP", res.status, await res.text());
      return [];
    }

    const data = (await res.json()) as {
      predictions?: { bytesBase64Encoded?: string; mimeType?: string }[];
    };

    return (
      data.predictions
        ?.filter((p) => p.bytesBase64Encoded)
        .map(
          (p) => `data:${p.mimeType ?? "image/png"};base64,${p.bytesBase64Encoded}`,
        ) ?? []
    );
  } catch (err) {
    console.error("[aiGen] error", err);
    return [];
  }
}
