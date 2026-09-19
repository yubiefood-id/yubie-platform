import { PreviewCommerceProvider } from "@yubie/commerce";
import {
  getPurchaseOptions,
  resolveMarketplaceRedirect,
  resolveWhatsAppRedirect,
} from "@yubie/application";
import { b2bLeadSchema, checkoutRequestSchema, newsletterSubmissionSchema, productWaitlistSchema } from "@yubie/validation";
import { catalog } from "./catalog.js";
import { createAppContext, type AppContext } from "./composition/create-app.js";
import { createRequestId } from "./middleware/request-id.js";

const commerce = new PreviewCommerceProvider();
let appContext: AppContext | null = null;

function getContext(): AppContext {
  if (!appContext) appContext = createAppContext();
  return appContext;
}

export function setAppContext(context: AppContext) {
  appContext = context;
}

const json = (body: unknown, init?: ResponseInit) => new Response(JSON.stringify(body), {
  ...init,
  headers: { "content-type": "application/json; charset=utf-8", ...init?.headers },
});

export async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const ctx = getContext();
  const requestId = request.headers.get("x-request-id") ?? createRequestId();

  if (request.method === "GET" && url.pathname === "/healthz") {
    return json({ ok: true, service: "yubie-api", version: "v1", releaseSha: ctx.releaseSha });
  }

  if (request.method === "GET" && url.pathname === "/readyz") {
    const health = await ctx.healthProbe.check();
    const ready = health.ok && health.value.ready;
    return json({ ok: ready, service: "yubie-api", details: health.ok ? health.value.details : undefined }, { status: ready ? 200 : 503 });
  }

  const purchaseMatch = url.pathname.match(/^\/v1\/products\/([^/]+)\/purchase-options$/);
  if (request.method === "GET" && purchaseMatch?.[1]) {
    const slug = decodeURIComponent(purchaseMatch[1]);
    const result = await getPurchaseOptions(slug, ctx.listings, ctx.whatsapp, requestId);
    if (!result.ok) {
      const status = result.error.code === "not_found" ? 404 : 400;
      return json({ ok: false, error: result.error }, { status });
    }
    return json({ data: result.value });
  }

  const whatsappMatch = url.pathname.match(/^\/go\/whatsapp\/([^/]+)$/);
  if (request.method === "GET" && whatsappMatch?.[1]) {
    const intentKey = decodeURIComponent(whatsappMatch[1]);
    const attribution = buildAttribution(url);
    const result = await resolveWhatsAppRedirect(intentKey, attribution, {
      intents: ctx.whatsapp,
      outbound: ctx.outbound,
      attribution: ctx.attribution,
      clock: ctx.clock,
      ids: ctx.ids,
      requestId,
    });
    if (!result.ok) {
      const status = result.error.code === "unavailable" ? 503 : result.error.code === "not_found" ? 404 : 400;
      return json({ ok: false, error: result.error }, { status });
    }
    return new Response(null, { status: 302, headers: { Location: result.value.destinationUrl, "x-request-id": requestId } });
  }

  const goMatch = url.pathname.match(/^\/go\/([^/]+)\/([^/]+)$/);
  if (request.method === "GET" && goMatch?.[1] && goMatch[2]) {
    const channel = goMatch[1];
    const listingKey = goMatch[2];
    const attribution = buildAttribution(url);
    const result = await resolveMarketplaceRedirect(channel, listingKey, attribution, {
      listings: ctx.listings,
      outbound: ctx.outbound,
      allowlist: ctx.allowlist,
      attribution: ctx.attribution,
      clock: ctx.clock,
      ids: ctx.ids,
      requestId,
    });
    if (!result.ok) {
      const status = result.error.code === "not_found" ? 404 : result.error.code === "forbidden" ? 403 : 400;
      return json({ ok: false, error: result.error }, { status });
    }
    return new Response(null, { status: 302, headers: { Location: result.value.destinationUrl, "x-request-id": requestId } });
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

  if (request.method === "POST" && url.pathname === "/v1/checkouts" && process.env.COMMERCE_PROVIDER !== "disabled") {
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

function buildAttribution(url: URL): Partial<import("@yubie/domain").AttributionContext> {
  const attribution: Partial<import("@yubie/domain").AttributionContext> = {};
  const source = url.searchParams.get("source");
  const campaign = url.searchParams.get("campaign");
  const placement = url.searchParams.get("placement");
  const productId = url.searchParams.get("productId");
  const rootId = url.searchParams.get("rootId");
  if (source) attribution.source = source;
  if (campaign) attribution.campaign = campaign;
  if (placement) attribution.placement = placement;
  if (productId) attribution.productId = productId;
  if (rootId) attribution.rootId = rootId;
  return attribution;
}

async function validateJson(request: Request, schema: { safeParse(value: unknown): { success: boolean } }): Promise<Response> {
  const result = schema.safeParse(await request.json().catch(() => null));
  if (!result.success) return json({ ok: false, code: "INVALID_REQUEST" }, { status: 400 });
  return json({ ok: true, mode: "validated-prototype" }, { status: 202 });
}

export default { fetch: handleRequest };
