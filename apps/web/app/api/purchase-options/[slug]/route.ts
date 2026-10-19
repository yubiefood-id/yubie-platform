import { proxyApi } from "@/lib/api-proxy";

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;

  return proxyApi(
    request,
    `/v1/products/${encodeURIComponent(slug)}/purchase-options`
  );
}
