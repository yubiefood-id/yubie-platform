import { PreviewCommerceProvider } from "@yubie/commerce";
import {
  createFirstPartyCheckout,
  getCheckoutStatus,
  getPurchaseOptions,
  googleLogin,
  logout,
  processPaymentWebhook,
  resolveMarketplaceRedirect,
  resolveSession,
  resolveWhatsAppRedirect,
  webhookError,
} from "@yubie/application";
import { b2bLeadSchema, checkoutRequestSchema, googleLoginSchema, newsletterSubmissionSchema, productWaitlistSchema } from "@yubie/validation";
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

  if (url.pathname.startsWith("/ops/assistant") && process.env.DATABASE_URL) {
    const { createDatabase } = await import("@yubie/persistence");
    const { handleOpsAssistant } = await import("./ops-assistant.js");
    const database = createDatabase(process.env.DATABASE_URL);
    const opsResponse = await handleOpsAssistant(request, database);
    if (opsResponse) return opsResponse;
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
    if (ctx.paymentMode === "xendit" && ctx.paymentProvider) {
      // First-party flow (ADR-012): server re-prices every line from the
      // canonical catalog, creates the order + Xendit payment session, and
      // returns only {checkoutId, redirectUrl, ...} to the browser.
      const sessionUser = await resolveSession(readSessionToken(request), { sessions: ctx.authSessions, users: ctx.users, tokens: ctx.tokens, clock: ctx.clock });
      const appOrigin = process.env.APP_ORIGIN ?? url.origin;
      const result = await createFirstPartyCheckout({
        lines: parsed.data.lines,
        customerEmail: parsed.data.customerEmail,
        ...(parsed.data.customerName ? { customerName: parsed.data.customerName } : {}),
        ...(parsed.data.delivery ? { delivery: parsed.data.delivery } : {}),
        userId: sessionUser.value?.id ?? null,
        successReturnUrl: `${appOrigin}/checkout/success`,
        cancelReturnUrl: `${appOrigin}/checkout/cancel`,
      }, { orders: ctx.orders, payments: ctx.payments, provider: ctx.paymentProvider, clock: ctx.clock, ids: ctx.ids });
      if (!result.ok) {
        const status = result.error.code === "validation" ? 400 : 409;
        return json({ ok: false, code: result.error.code === "validation" ? "INVALID_REQUEST" : "UNAVAILABLE_LINE" }, { status });
      }
      return json({ ok: true, data: result.value }, { status: 201 });
    }
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

  const checkoutStatusMatch = url.pathname.match(/^\/v1\/checkouts\/([^/]+)$/);
  if (request.method === "GET" && checkoutStatusMatch?.[1]) {
    const result = await getCheckoutStatus(decodeURIComponent(checkoutStatusMatch[1]), {
      orders: ctx.orders,
      payments: ctx.payments,
      paymentEvents: ctx.paymentEvents,
      ...(ctx.paymentProvider ? { provider: ctx.paymentProvider } : {}),
      clock: ctx.clock,
      ids: ctx.ids,
    }, { poll: true });
    if (!result.ok) return json({ ok: false, code: "INVALID_REQUEST" }, { status: 400 });
    if (!result.value) return json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
    return json({ ok: true, data: result.value });
  }

  if (request.method === "POST" && url.pathname === "/v1/webhooks/xendit/payment-session") {
    if (!ctx.webhookToken) return json({ ok: false, code: "WEBHOOK_NOT_CONFIGURED" }, { status: 503 });
    const payload = await request.json().catch(() => null);
    const outcome = await processPaymentWebhook({
      callbackToken: request.headers.get("x-callback-token"),
      expectedToken: ctx.webhookToken,
      payload,
    }, { orders: ctx.orders, payments: ctx.payments, paymentEvents: ctx.paymentEvents, clock: ctx.clock, ids: ctx.ids });
    if (outcome.result === "rejected") {
      return json({ ok: false, code: outcome.code }, { status: outcome.status });
    }
    if (outcome.result === "ignored") {
      return json({ ok: true, data: { result: "ignored" } }, { status: 202 });
    }
    return json({ ok: true, data: { result: outcome.result } });
  }

  if (request.method === "POST" && url.pathname === "/v1/auth/google") {
    if (!ctx.verifier) return json({ ok: false, code: "AUTH_NOT_CONFIGURED" }, { status: 503 });
    const parsed = googleLoginSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return json({ ok: false, code: "INVALID_REQUEST" }, { status: 400 });
    const csrfCookie = request.headers.get("cookie")?.match(/(?:^|;\s*)g_csrf_token=([^;]+)/)?.[1] ?? null;
    const result = await googleLogin({
      credential: parsed.data.credential,
      csrfToken: parsed.data.g_csrf_token,
      csrfCookie,
    }, { verifier: ctx.verifier, users: ctx.users, sessions: ctx.authSessions, tokens: ctx.tokens, clock: ctx.clock, ids: ctx.ids });
    if (!result.ok) return json({ ok: false, code: "AUTH_FAILED" }, { status: 401 });
    return json({ ok: true, data: { user: result.value.user } }, {
      status: 200,
      headers: { "set-cookie": sessionCookie(result.value.sessionToken, result.value.expiresAt, url.protocol === "https:") },
    });
  }

  if (request.method === "POST" && url.pathname === "/v1/auth/logout") {
    await logout(readSessionToken(request), { sessions: ctx.authSessions, tokens: ctx.tokens, clock: ctx.clock });
    return json({ ok: true, data: { revoked: true } }, { headers: { "set-cookie": clearSessionCookie() } });
  }

  if (request.method === "GET" && url.pathname === "/v1/auth/session") {
    const user = await resolveSession(readSessionToken(request), { sessions: ctx.authSessions, users: ctx.users, tokens: ctx.tokens, clock: ctx.clock });
    if (!user.ok) return json({ ok: false, code: "AUTH_FAILED" }, { status: 500 });
    return json({ ok: true, data: { authenticated: user.value !== null, user: user.value, googleClientId: ctx.googleClientId } });
  }

  const accountOrderMatch = url.pathname.match(/^\/v1\/account\/orders(?:\/([^/]+))?$/);
  if (request.method === "GET" && accountOrderMatch) {
    const sessionUser = await resolveSession(readSessionToken(request), { sessions: ctx.authSessions, users: ctx.users, tokens: ctx.tokens, clock: ctx.clock });
    if (!sessionUser.ok || !sessionUser.value) return json({ ok: false, code: "UNAUTHORIZED" }, { status: 401 });
    if (accountOrderMatch[1]) {
      const result = await getCheckoutStatus(decodeURIComponent(accountOrderMatch[1]), {
        orders: ctx.orders,
        payments: ctx.payments,
        paymentEvents: ctx.paymentEvents,
        clock: ctx.clock,
        ids: ctx.ids,
      });
      if (!result.ok || !result.value || !(await ownsOrder(ctx, result.value.checkoutId, sessionUser.value.id))) {
        return json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
      }
      return json({ ok: true, data: result.value });
    }
    const orders = await ctx.orders.listForUser(sessionUser.value.id);
    if (!orders.ok) return json({ ok: false, code: "INVALID_REQUEST" }, { status: 400 });
    return json({ ok: true, data: orders.value.map((order) => ({
      checkoutId: order.id,
      orderStatus: order.status,
      totalAmount: order.totalAmount,
      currency: order.currency,
      createdAt: order.createdAt,
      lineCount: order.lines.length,
    })) });
  }

  return json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
}

async function ownsOrder(ctx: AppContext, orderId: string, userId: string): Promise<boolean> {
  const order = await ctx.orders.findById(orderId);
  return order.ok && order.value !== null && order.value.userId === userId;
}

const SESSION_COOKIE = "yubie_session";

function readSessionToken(request: Request): string | null {
  const match = request.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function sessionCookie(token: string, expiresAt: string, secure: boolean): string {
  const maxAge = Math.max(0, Math.floor((Date.parse(expiresAt) - Date.now()) / 1000));
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
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
