import { proxyApi } from "@/lib/api-proxy";
export async function POST(request: Request, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  if (!["autocomplete", "details", "reverse-geocode"].includes(action)) return Response.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
  return proxyApi(request, `/v1/locations/${action}`);
}
