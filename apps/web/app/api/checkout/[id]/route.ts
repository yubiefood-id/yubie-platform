import { proxyApi } from "@/lib/api-proxy";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyApi(request, `/v1/checkouts/${encodeURIComponent(id)}`);
}
