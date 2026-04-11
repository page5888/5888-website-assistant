import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import sharp from "sharp";
import { nanoid } from "nanoid";
import { auth } from "@/lib/auth";
import { getSlot, type SlotId, SLOTS } from "@/lib/imageSlots";

export const runtime = "nodejs";
// Image processing can take a few seconds for large phone photos.
export const maxDuration = 30;

const MAX_UPLOAD_BYTES = 12 * 1024 * 1024; // 12 MB hard cap before compression
const VALID_SLOT_IDS = new Set(SLOTS.map((s) => s.id));

/**
 * POST /api/upload-image
 *
 * Body: multipart/form-data
 *   - file: File           (the image)
 *   - slotId: SlotId       (which named slot this is for)
 *
 * Processes the image with sharp (auto-rotate, crop to slot aspect
 * ratio, resize to target dimensions, re-encode as high-quality JPEG),
 * uploads the result to Vercel Blob, and returns the public CDN URL.
 *
 * Auth: must be logged in. We don't tie the upload to a siteId yet
 * because generation hasn't happened — the blob gets attached to a
 * specific site at generation time and orphans are cleaned up by a
 * scheduled job (TODO: implement cleanup later).
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "請先登入" }, { status: 401 });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      {
        error: "圖片儲存服務尚未設定 — 請聯繫管理員設定 BLOB_READ_WRITE_TOKEN",
      },
      { status: 503 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "請使用 multipart/form-data 格式" },
      { status: 400 },
    );
  }

  const file = form.get("file");
  const slotIdRaw = form.get("slotId");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "缺少 file 欄位" }, { status: 400 });
  }
  if (typeof slotIdRaw !== "string" || !VALID_SLOT_IDS.has(slotIdRaw as SlotId)) {
    return NextResponse.json({ error: "無效的 slotId" }, { status: 400 });
  }
  const slotId = slotIdRaw as SlotId;
  const slot = getSlot(slotId);

  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `圖片太大,上限 ${MAX_UPLOAD_BYTES / 1024 / 1024} MB` },
      { status: 413 },
    );
  }

  const contentType = file.type || "image/jpeg";
  if (!contentType.startsWith("image/")) {
    return NextResponse.json(
      { error: "只接受圖片檔(image/*)" },
      { status: 400 },
    );
  }

  // Process the image: auto-rotate using EXIF, resize with smart crop
  // (sharp's "attention" strategy picks the most interesting region),
  // then re-encode as high-quality progressive JPEG.
  let processedBuffer: Buffer;
  try {
    const inputBuffer = Buffer.from(await file.arrayBuffer());
    processedBuffer = await sharp(inputBuffer)
      .rotate() // respect EXIF orientation
      .resize({
        width: slot.targetWidth,
        height: slot.targetHeight,
        fit: "cover",
        position: "attention", // smart crop — keeps the interesting part
      })
      .jpeg({
        quality: 82,
        progressive: true,
        mozjpeg: true,
      })
      .toBuffer();
  } catch (err) {
    console.error("[upload-image] sharp failed", err);
    return NextResponse.json(
      {
        error: "圖片處理失敗,可能是檔案損毀或格式不支援",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 422 },
    );
  }

  // Upload to Vercel Blob. The path includes a per-user namespace so
  // the admin can filter by user later if needed. Random suffix
  // prevents accidental overwrites when the same user uploads to the
  // same slot twice in a row.
  const userKey = session.user.email ?? "anon";
  const safeUser = userKey.replace(/[^a-z0-9]/gi, "_").slice(0, 40);
  const pathname = `uploads/${safeUser}/${slotId}-${nanoid(8)}.jpg`;

  try {
    const blob = await put(pathname, processedBuffer, {
      access: "public",
      contentType: "image/jpeg",
      cacheControlMaxAge: 60 * 60 * 24 * 365, // 1 year
    });
    return NextResponse.json({
      url: blob.url,
      pathname: blob.pathname,
      slotId,
      width: slot.targetWidth,
      height: slot.targetHeight,
      processedBytes: processedBuffer.byteLength,
    });
  } catch (err) {
    console.error("[upload-image] blob put failed", err);
    return NextResponse.json(
      {
        error: "圖片上傳失敗,請稍後再試",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }
}
