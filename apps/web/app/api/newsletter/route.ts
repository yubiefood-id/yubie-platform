import { NextResponse } from "next/server";
import { newsletterSubmissionSchema } from "@yubie/validation";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = newsletterSubmissionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, message: "Invalid submission" }, { status: 400 });
  return NextResponse.json({ ok: true, mode: "validated-prototype", message: "Validated locally; external delivery integration pending." }, { status: 202 });
}
