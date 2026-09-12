import { NextResponse } from "next/server";
import { productWaitlistSchema } from "@yubie/validation";

export async function POST(request: Request) {
  const parsed = productWaitlistSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, message: "Invalid waitlist submission" }, { status: 400 });
  return NextResponse.json({ ok: true, mode: "validated-prototype", productId: parsed.data.productId }, { status: 202 });
}
