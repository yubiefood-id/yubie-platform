import { NextResponse } from "next/server";
import { getApiOrigin } from "@/lib/api-origin";

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const response = await fetch(`${getApiOrigin()}/v1/products/${encodeURIComponent(slug)}/purchase-options`, {
    headers: { accept: "application/json" },
  });
  const body = await response.text();
  return new NextResponse(body, {
    status: response.status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
