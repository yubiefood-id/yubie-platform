import { proxyApi } from "@/lib/api-proxy";
export async function POST(request: Request, { params }: { params: Promise<{ id: string; action: string }> }) {
  const { id, action } = await params;
  if (action !== "verify" && action !== "resend") return Response.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
  return proxyApi(request, `/v1/auth/phone/challenges/${encodeURIComponent(id)}/${action}`);
}
