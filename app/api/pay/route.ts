import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { auth } from "@/lib/auth";
import { redis } from "@/lib/redis";

/**
 * MOCK payment endpoint.
 * Marks a previously generated site as "paid" and returns a receipt.
 * Real payment integration (Stripe / ECPay) is out of scope for v1.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "請先登入" }, { status: 401 });
  }

  const { siteId } = (await req.json()) as { siteId?: string };
  if (!siteId) {
    return NextResponse.json({ error: "缺少 siteId" }, { status: 400 });
  }

  const metaKey = `site:${siteId}:meta`;
  const raw = await redis.get<string>(metaKey);
  if (!raw) {
    return NextResponse.json(
      { error: "預覽已過期,請重新生成" },
      { status: 404 },
    );
  }

  const meta = typeof raw === "string" ? JSON.parse(raw) : raw;
  const receipt = `mock-${nanoid(10)}`;
  meta.paid = true;
  meta.receipt = receipt;
  meta.paidAt = Date.now();

  await redis.set(metaKey, JSON.stringify(meta), { ex: 3600 });

  return NextResponse.json({
    paid: true,
    receipt,
    message: "付款成功 (模擬)",
  });
}
