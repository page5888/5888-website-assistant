/**
 * AI image generation via Google Gemini Imagen.
 *
 * Uses `gemini-2.0-flash-exp` (which supports image generation) or
 * `imagen-3.0-generate-002` depending on availability. The generated
 * image is returned as a base64 JPEG buffer ready for upload to
 * Vercel Blob.
 *
 * Cost: 10 wallet points per image (charged by the caller, not here).
 * This module is purely the API call — billing lives in /api/generate-image.
 */

const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY ?? "";

export interface ImageGenRequest {
  /** What to generate — e.g. "手沖咖啡特寫,溫暖色調,日式木質桌面" */
  prompt: string;
  /** Target aspect ratio hint. Maps to Gemini's aspectRatio param. */
  aspectRatio?: "1:1" | "16:9" | "4:3" | "3:4" | "9:16";
}

export interface ImageGenResult {
  /** Raw JPEG bytes */
  buffer: Buffer;
  /** The actual prompt sent (for logging) */
  promptUsed: string;
}

/**
 * Generate a single image using Gemini's image generation capability.
 *
 * Uses the Imagen 3 model via the Gemini API's generateImages endpoint.
 * Falls back to text-to-image via gemini-2.0-flash if imagen is unavailable.
 */
export async function generateImage(
  req: ImageGenRequest,
): Promise<ImageGenResult> {
  if (!GEMINI_API_KEY) {
    throw new Error("GOOGLE_GEMINI_API_KEY not configured");
  }

  // Build a detailed prompt with style guidance to get good results
  const styledPrompt = buildStyledPrompt(req.prompt);

  // Try Imagen 3 first (dedicated image generation model)
  try {
    return await callImagen3(styledPrompt, req.aspectRatio);
  } catch (err) {
    console.warn("[imageGen] Imagen 3 failed, trying Gemini flash:", err);
  }

  // Fallback: Gemini 2.0 Flash with image generation
  return await callGeminiFlash(styledPrompt, req.aspectRatio);
}

/**
 * Enhance the user's simple prompt with photography-style guidance
 * so the output looks like a professional product/store photo rather
 * than generic AI art.
 */
function buildStyledPrompt(userPrompt: string): string {
  return (
    `Professional commercial photography: ${userPrompt}. ` +
    `Style: clean, modern, warm natural lighting, shallow depth of field, ` +
    `high resolution, editorial magazine quality. ` +
    `No text, no watermarks, no logos, no borders.`
  );
}

/**
 * Call Imagen 3 (imagen-3.0-generate-002) via the Gemini API.
 */
async function callImagen3(
  prompt: string,
  aspectRatio?: string,
): Promise<ImageGenResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${GEMINI_API_KEY}`;

  const body: Record<string, unknown> = {
    instances: [{ prompt }],
    parameters: {
      sampleCount: 1,
      aspectRatio: aspectRatio ?? "4:3",
      // Safety settings — allow commercial/product photography
      safetySetting: "block_only_high",
      personGeneration: "dont_allow",
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Imagen 3 API error ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    predictions?: Array<{
      bytesBase64Encoded?: string;
      mimeType?: string;
    }>;
  };

  const b64 = data.predictions?.[0]?.bytesBase64Encoded;
  if (!b64) {
    throw new Error("Imagen 3 returned no image data");
  }

  return {
    buffer: Buffer.from(b64, "base64"),
    promptUsed: prompt,
  };
}

/**
 * Fallback: use Gemini 2.0 Flash experimental with responseModalities
 * set to include "image". This model can generate images inline.
 */
async function callGeminiFlash(
  prompt: string,
  aspectRatio?: string,
): Promise<ImageGenResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`;

  const sizeHint = aspectRatio === "16:9"
    ? " The image should be landscape 16:9 aspect ratio."
    : aspectRatio === "1:1"
      ? " The image should be square 1:1 aspect ratio."
      : aspectRatio === "3:4" || aspectRatio === "9:16"
        ? " The image should be portrait aspect ratio."
        : " The image should be landscape 4:3 aspect ratio.";

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: `Generate a photo: ${prompt}${sizeHint}` }],
        },
      ],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Gemini Flash API error ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          text?: string;
          inlineData?: { mimeType: string; data: string };
        }>;
      };
    }>;
  };

  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((p) => p.inlineData?.data);
  if (!imagePart?.inlineData) {
    throw new Error("Gemini Flash returned no image data");
  }

  return {
    buffer: Buffer.from(imagePart.inlineData.data, "base64"),
    promptUsed: prompt,
  };
}
