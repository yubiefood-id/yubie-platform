import { proxyApi } from "@/lib/api-proxy";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return proxyApi(request, `/v1/checkouts/${encodeURIComponent(id)}/shipment`);
}
