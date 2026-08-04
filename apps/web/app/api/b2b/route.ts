import { NextResponse } from "next/server";
import { b2bLeadSchema } from "@yubie/validation";

export async function POST(request: Request) {
  const parsed = b2bLeadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: "Invalid submission" }, { status: 400 });
  }

  return NextResponse.json({ ok: true, mode: "validated-prototype" }, { status: 202 });
}
