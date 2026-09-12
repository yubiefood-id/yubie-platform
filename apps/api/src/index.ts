import { PreviewCommerceProvider } from "@yubie/commerce";
import { b2bLeadSchema, checkoutRequestSchema, newsletterSubmissionSchema, productWaitlistSchema } from "@yubie/validation";
import { catalog } from "./catalog.js";

const commerce = new PreviewCommerceProvider();

const json = (body: unknown, init?: ResponseInit) => new Response(JSON.stringify(body), {
  ...init,
  headers: { "content-type": "application/json; charset=utf-8", ...init?.headers },
});

export async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === "/healthz") {
    return json({ ok: true, service: "yubie-api", version: "v1" });
  }

  if (request.method === "GET" && url.pathname === "/v1/catalog") {
    return json({ data: catalog, meta: { count: catalog.length } });
  }

  if (request.method === "POST" && url.pathname === "/v1/newsletter") {
    return validateJson(request, newsletterSubmissionSchema);
  }

  if (request.method === "POST" && url.pathname === "/v1/waitlist") {
    return validateJson(request, productWaitlistSchema);
  }

  if (request.method === "POST" && url.pathname === "/v1/b2b-leads") {
    return validateJson(request, b2bLeadSchema);
  }

  if (request.method === "POST" && url.pathname === "/v1/checkouts") {
    const parsed = checkoutRequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return json({ ok: false, code: "INVALID_REQUEST" }, { status: 400 });
    const lines = parsed.data.lines.map((line) => {
      const product = catalog.find((item) => item.id === line.productId);
      const size = product?.sizes.find((item) => item.id === line.sizeId && item.available);
      if (!product || !size?.price) return null;
      return { id: `${product.id}-${size.id}`, productId: product.id, name: product.name, sizeId: size.id, sizeLabel: size.label, quantity: line.quantity, unitPrice: size.price, image: product.image };
    });
    if (lines.some((line) => line === null)) return json({ ok: false, code: "UNAVAILABLE_LINE" }, { status: 409 });
    const origin = url.origin;
    const session = await commerce.createCheckout({ lines: lines.filter((line) => line !== null), customerEmail: parsed.data.customerEmail, successUrl: `${origin}/checkout/success`, cancelUrl: `${origin}/cart` });
    return json({ ok: true, data: session }, { status: 202 });
  }

  return json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
}

async function validateJson(request: Request, schema: { safeParse(value: unknown): { success: boolean } }): Promise<Response> {
  const result = schema.safeParse(await request.json().catch(() => null));
  if (!result.success) return json({ ok: false, code: "INVALID_REQUEST" }, { status: 400 });
  return json({ ok: true, mode: "validated-prototype" }, { status: 202 });
}

export default { fetch: handleRequest };
