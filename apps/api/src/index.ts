import { createHash, randomBytes } from "node:crypto";
import { PreviewCommerceProvider } from "@yubie/commerce";
import {
  GUEST_CHECKOUT_TOKEN_PATTERN,
  checkoutPrincipalKey,
  createFirstPartyCheckout,
  quoteCheckout,
  currentCheckout,
  getAccountOrder,
  getCheckoutStatus,
  getPurchaseOptions,
  googleLogin,
  joinProductWaitlist,
  logout,
  applyIpaymuCallback,
  processPaymentWebhook,
  resolveMarketplaceRedirect,
  resolveSession,
  resolveWhatsAppRedirect,
  submitB2bLead,
  subscribeNewsletter,
  webhookError,
} from "@yubie/application";
import { b2bLeadSchema, checkoutRequestSchema, googleLoginSchema, newsletterSubmissionSchema, productWaitlistSchema, shippingRatesRequestSchema } from "@yubie/validation";
import { parseYubieEnvName } from "@yubie/config";
import { customerRouteEnabled, parseLaunchProfile } from "@yubie/config/launch";
import { paymentStatusFromProviderSession } from "@yubie/domain";
import { parseIpaymuCallbackBody, verifyIpaymuCallback } from "@yubie/integrations";
import { createDatabase, type Database } from "@yubie/persistence";
import { tokensMatch, requestShippingRates } from "@yubie/application";
import { parseBiteshipWebhook, verifyBiteshipWebhookSecret } from "@yubie/integrations";
import { catalog } from "./catalog.js";
import { createAppContext, type AppContext } from "./composition/create-app.js";
import { createRequestId } from "./middleware/request-id.js";
import { logEvent } from "./middleware/log.js";
import { handleCustomerIdentity } from "./customer-identity.js";
import { customerBootstrap, currentCustomerProof } from "./customer-security.js";
import { handleCustomerAddresses } from "./customer-addresses.js";
import { handleCustomerLocations } from "./customer-locations.js";
import { handleCustomerPromotions } from "./customer-promotions.js";

const commerce = new PreviewCommerceProvider();
let appContext: AppContext | null = null;
let operationsDatabase: Database | null = null;

function getContext(): AppContext {
  if (!appContext) appContext = createAppContext();
  return appContext;
}

export function setAppContext(context: AppContext) {
  appContext = context;
}

export function setOperationsDatabase(database: Database | null) {
  operationsDatabase = database;
}

function getOperationsDatabase(): Database {
  if (!operationsDatabase) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("DATABASE_URL is required for operations routes");
    operationsDatabase = createDatabase(databaseUrl);
  }
  return operationsDatabase;
}

const json = (body: unknown, init?: ResponseInit) => new Response(JSON.stringify(body), {
  ...init,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control":"no-store", ...init?.headers },
});

/**
 * Route trust classes (ADR-012 §1/§7):
 *   PUBLIC                  /healthz /readyz /go/*        (redirect links from anywhere)
 *   PROVIDER-AUTHENTICATED  /v1/webhooks/*                (x-callback-token + business_id)
 *   WEB-PROXY-AUTHENTICATED every other /v1/*             (web worker server hop)
 *   SESSION-AUTHENTICATED   /v1/account/*                 (session, after the proxy gate)
 *   OPS                     /ops/*                        (OPS_API_TOKEN bearer)
 * When API_PROXY_TOKEN is set, the web-proxy class requires a constant-time
 * match; when it is unset the class fails closed outside local environments.
 */
function isWebProxyRoute(pathname: string): boolean {
  return pathname.startsWith("/v1/") && !pathname.startsWith("/v1/webhooks/");
}

function proxyTrustGate(request: Request, pathname: string): Response | null {
  if (!isWebProxyRoute(pathname)) return null;
  const expected = process.env.API_PROXY_TOKEN ?? "";
  if (expected) {
    const presented = request.headers.get("x-api-proxy-token");
    if (!presented || !tokensMatch(presented, expected)) {
      return json({ ok: false, code: "PROXY_UNAUTHORIZED" }, { status: 401 });
    }
    return null;
  }
  const env = parseYubieEnvName(process.env.YUBIE_ENV);
  if (env === "development" || env === "test") return null;
  return json({ ok: false, code: "PROXY_NOT_CONFIGURED" }, { status: 503 });
}

/** Bounded body readers: no route buffers an unbounded request into memory. */
const MAX_JSON_BYTES = 64 * 1024;
const MAX_WEBHOOK_BYTES = 256 * 1024;

async function readBoundedText(request: Request, maxBytes: number): Promise<string | null> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

async function readJsonBody(request: Request, maxBytes = MAX_JSON_BYTES): Promise<{ ok: true; value: unknown } | { ok: false }> {
  const text = await readBoundedText(request, maxBytes);
  if (text === null) return { ok: false };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: true, value: null };
  }
}

const tooLarge = () => json({ ok: false, code: "PAYLOAD_TOO_LARGE" }, { status: 413 });

function stringField(fields: Record<string, unknown>, key: string): string {
  const value = fields[key];
  return typeof value === "string" ? value : "";
}

function integerField(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^[0-9]+$/.test(value)) return Number.parseInt(value, 10);
  return null;
}

/**
 * Checkout failure semantics the storefront can act on. A sold-out line and a
 * reused idempotency key are both 409s with DIFFERENT meanings; a provider
 * outage/ambiguity is retryable 503, never "line unavailable".
 */
function checkoutError(code: string): { status: number; code: string } {
  switch (code) {
    case "shipping_unavailable":
      return { status: 503, code: "SHIPPING_UNAVAILABLE" };
    case "shipping_quote_stale":
      return { status: 409, code: "SHIPPING_QUOTE_STALE" };
    case "checkout_safety_hold":
      return { status: 503, code: "CHECKOUT_SAFETY_HOLD" };
    case "unauthorized":
      return { status: 401, code: "CHECKOUT_SESSION_REQUIRED" };
    case "validation":
      return { status: 400, code: "INVALID_REQUEST" };
    case "forbidden":
      return { status: 403, code: "PROMOTION_NOT_ELIGIBLE" };
    case "out_of_stock":
      return { status: 409, code: "INSUFFICIENT_INVENTORY" };
    case "conflict":
      return { status: 409, code: "IDEMPOTENCY_KEY_REUSED" };
    case "pending_reconciliation":
      return { status: 503, code: "PENDING_RECONCILIATION" };
    case "timeout":
    case "unavailable":
      return { status: 503, code: "PROVIDER_UNAVAILABLE" };
    default:
      return { status: 502, code: "CHECKOUT_FAILED" };
  }
}

export async function handleRequest(request: Request): Promise<Response> {
  const incomingId = request.headers.get("x-request-id");
  const requestId = incomingId && /^[A-Za-z0-9_-]{1,64}$/.test(incomingId) ? incomingId : createRequestId();
  const response = await routeRequest(request, requestId);
  const headers = new Headers(response.headers);
  headers.set("x-request-id", requestId);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function routeRequest(request: Request, requestId: string): Promise<Response> {
  const url = new URL(request.url);
  const profile = parseLaunchProfile(process.env.YUBIE_LAUNCH_PROFILE);
  if (!customerRouteEnabled(profile, url.pathname)) {
    return json({ ok: false, code: "FEATURE_DISABLED" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
  const ctx = getContext();

  const gate = proxyTrustGate(request, url.pathname);
  if (gate) return gate;
  const identityResponse = await handleCustomerIdentity(request, ctx);
  if (identityResponse) return identityResponse;
  const addressResponse = await handleCustomerAddresses(request, ctx);
  if (addressResponse) return addressResponse;
  const locationResponse = await handleCustomerLocations(request, ctx);
  if (locationResponse) return locationResponse;
  const promotionResponse = await handleCustomerPromotions(request, ctx);
  if (promotionResponse) return promotionResponse;

  if (request.method === "GET" && url.pathname === "/healthz") {
    return json({ ok: true, service: "yubie-api", version: "v1", releaseSha: ctx.releaseSha });
  }

  if (request.method === "GET" && url.pathname === "/readyz") {
    const health = await ctx.healthProbe.check();
    const ready = health.ok && health.value.ready;
    return json({ ok: ready, service: "yubie-api", details: health.ok ? health.value.details : undefined }, { status: ready ? 200 : 503 });
  }

  if (url.pathname.startsWith("/ops/assistant") && process.env.DATABASE_URL) {
    const { handleOpsAssistant } = await import("./ops-assistant.js");
    const opsResponse = await handleOpsAssistant(request, getOperationsDatabase());
    if (opsResponse) return opsResponse;
  }

  if (url.pathname.startsWith("/ops/payments")) {
    const { handleOpsPayments } = await import("./ops-payments.js");
    const opsResponse = await handleOpsPayments(
      request,
      process.env.DATABASE_URL ? getOperationsDatabase : null,
      requestId,
    );
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

  if (request.method === "GET" && url.pathname === "/v1/catalog/availability") {
    try {
      const data=await ctx.tx.run("inventory.availability",async repos=>repos.inventory.availability?repos.inventory.availability(ctx.clock.now()):catalog.flatMap(product=>product.sizes.map(size=>({productId:product.id,sizeId:size.id,maxQuantity:0,status:"unverified"}))));
      return json({ok:true,data},{headers:{"cache-control":"no-store"}});
    }catch{return json({ok:false,code:"AVAILABILITY_UNAVAILABLE"},{status:503,headers:{"cache-control":"no-store"}});}
  }
  if (request.method === "GET" && url.pathname === "/v1/shipping/coverage") {
    // Public, PII-free read of the exact city strings active free-promotional
    // policies cover, so storefronts can offer them as quick picks. Whether a
    // submitted checkout actually ships free stays authoritative in the quote.
    try {
      const policies=await ctx.tx.run("shipping.coverage",async repos=>repos.shipping?.listCoverage?repos.shipping.listCoverage(ctx.clock.now()):[]);
      return json({ok:true,data:{policies}},{headers:{"cache-control":"no-store"}});
    }catch{return json({ok:false,code:"SHIPPING_UNAVAILABLE"},{status:503,headers:{"cache-control":"no-store"}});}
  }
  if (request.method === "POST" && url.pathname === "/v1/shipping/rates") {
    // ADR-014 step 3: server-only courier rate quoting. Disabled mode answers
    // inert "unavailable" so the storefront never offers dynamic shipping
    // before activation; free-covered cities short-circuit without a paid
    // provider call. Provider I/O happens here, never inside a transaction.
    const body=await readJsonBody(request,MAX_JSON_BYTES);if(!body.ok)return tooLarge();
    const parsed=shippingRatesRequestSchema.safeParse(body.value);
    if(!parsed.success)return json({ok:false,code:"INVALID_REQUEST"},{status:400,headers:{"cache-control":"no-store"}});
    if (ctx.shippingExecutionMode === "disabled") {
      return json({ok:true,data:{shipping:{mode:"unavailable",reason:"provider_unconfigured"}}},{headers:{"cache-control":"no-store"}});
    }
    const user=await resolveSession(readSessionToken(request),{sessions:ctx.authSessions,users:ctx.users,tokens:ctx.tokens,clock:ctx.clock});
    if(!user.ok)return json({ok:false,code:"CUSTOMER_STORAGE_UNAVAILABLE"},{status:503,headers:{"cache-control":"no-store"}});
    const guest=guestCheckoutToken(request);
    const principal=checkoutPrincipalKey({userId:user.value?.id??null,guestToken:guest.token});
    if(!principal)return json({ok:false,code:"INVALID_REQUEST"},{status:400,headers:{"cache-control":"no-store"}});
    const result=await requestShippingRates({principalKey:principal,lines:parsed.data.lines,delivery:parsed.data.delivery},{
      provider:ctx.shippingProvider,tx:ctx.tx,
      ...(ctx.shippingQuotes?{quotes:ctx.shippingQuotes}:{}),
      ...(ctx.shippingCatalog?{origins:ctx.shippingCatalog,profiles:ctx.shippingCatalog}:{}),
      clock:ctx.clock,ids:ctx.ids,
    });
    if(!result.ok){const mapping=checkoutError(result.error.code);return json({ok:false,code:mapping.code},{status:mapping.status,headers:{"cache-control":"no-store"}});}
    return json({ok:true,data:{shipping:result.value}},{headers:{"cache-control":"no-store"}});
  }
  if (request.method === "POST" && url.pathname === "/v1/checkouts/quote") {
    const body=await readJsonBody(request,MAX_JSON_BYTES);if(!body.ok)return tooLarge();
    const parsed=checkoutRequestSchema.pick({lines:true,promoCode:true,delivery:true}).safeParse(body.value);
    if(!parsed.success)return json({ok:false,code:"INVALID_REQUEST"},{status:400,headers:{"cache-control":"no-store"}});
    const user=await resolveSession(readSessionToken(request),{sessions:ctx.authSessions,users:ctx.users,tokens:ctx.tokens,clock:ctx.clock});
    if(!user.ok)return json({ok:false,code:"CUSTOMER_STORAGE_UNAVAILABLE"},{status:503,headers:{"cache-control":"no-store"}});
    const proof=parsed.data.promoCode&&user.value?await currentCustomerProof(request,ctx):undefined;
    const result=await quoteCheckout({lines:parsed.data.lines,...(parsed.data.delivery?{city:parsed.data.delivery.city}:{}),...(parsed.data.promoCode?{promoCode:parsed.data.promoCode}:{}),userId:user.value?.id??null,...(proof?{customerProof:proof}:{})},{tx:ctx.tx,clock:ctx.clock});
    if(!result.ok){const mapping=checkoutError(result.error.code);return json({ok:false,code:mapping.code},{status:mapping.status,headers:{"cache-control":"no-store"}});}
    return json({ok:true,data:result.value},{headers:{"cache-control":"no-store"}});
  }

  if (request.method === "POST" && url.pathname === "/v1/newsletter") {
    const body = await readJsonBody(request, 32 * 1024);
    if (!body.ok) return tooLarge();
    const parsed = newsletterSubmissionSchema.safeParse(body.value);
    if (!parsed.success) return json({ ok: false, code: "INVALID_REQUEST" }, { status: 400 });
    const result = await subscribeNewsletter(
      { email: parsed.data.email, ...(parsed.data.name ? { name: parsed.data.name } : {}), source: "web" },
      { tx: ctx.tx, clock: ctx.clock, ids: ctx.ids },
    );
    if (!result.ok) return json({ ok: false, code: "INVALID_REQUEST" }, { status: 400 });
    return json({ ok: true, data: { outcome: result.value.outcome } }, { status: 201 });
  }

  if (request.method === "POST" && url.pathname === "/v1/waitlist") {
    const body = await readJsonBody(request, 32 * 1024);
    if (!body.ok) return tooLarge();
    const parsed = productWaitlistSchema.safeParse(body.value);
    if (!parsed.success) return json({ ok: false, code: "INVALID_REQUEST" }, { status: 400 });
    const result = await joinProductWaitlist(
      { phone: parsed.data.phone, productId: parsed.data.productId, source: "web" },
      { tx: ctx.tx, clock: ctx.clock, ids: ctx.ids },
    );
    if (!result.ok) return json({ ok: false, code: "INVALID_REQUEST" }, { status: 400 });
    return json({ ok: true, data: { outcome: result.value.outcome } }, { status: 201 });
  }

  if (request.method === "POST" && url.pathname === "/v1/b2b-leads") {
    const body = await readJsonBody(request, 32 * 1024);
    if (!body.ok) return tooLarge();
    const parsed = b2bLeadSchema.safeParse(body.value);
    if (!parsed.success) return json({ ok: false, code: "INVALID_REQUEST" }, { status: 400 });
    const result = await submitB2bLead(
      {
        name: parsed.data.name,
        business: parsed.data.business,
        type: parsed.data.type,
        city: parsed.data.city,
        email: parsed.data.email,
        whatsapp: parsed.data.whatsapp,
        ...(parsed.data.need ? { need: parsed.data.need } : {}),
        intent: parsed.data.intent,
        interest: parsed.data.interest,
        ...(parsed.data.message ? { message: parsed.data.message } : {}),
        source: "web",
      },
      { tx: ctx.tx, clock: ctx.clock, ids: ctx.ids },
    );
    if (!result.ok) return json({ ok: false, code: "INVALID_REQUEST" }, { status: 400 });
    return json({ ok: true, data: { outcome: result.value.outcome } }, { status: 201 });
  }

  if (request.method === "POST" && url.pathname === "/v1/checkouts" && process.env.COMMERCE_PROVIDER !== "disabled") {
    // Payment-safe emergency switch (ROLLBACK.md R1): stop NEW payable
    // sessions while keeping provider callbacks, reconciliation, recovery
    // reads and reservation resolution fully alive for in-flight orders.
    // COMMERCE_PROVIDER stays on the PSP until every pending payment is
    // authoritatively resolved — flipping it to preview would 503 the
    // webhook route and no-op the reconciler.
    if (process.env.YUBIE_CHECKOUT_ADMISSION === "disabled" || (process.env.YUBIE_ENV === "production" && process.env.YUBIE_CHECKOUT_ADMISSION !== "enabled")) {
      return json({ ok: false, code: "CHECKOUT_DISABLED" }, { status: 503, headers: { "cache-control": "no-store" } });
    }
    const rawBody = await readBoundedText(request, MAX_JSON_BYTES);
    if (rawBody === null) return tooLarge();
    let parsedJson: unknown = null;
    try {
      parsedJson = JSON.parse(rawBody);
    } catch {
      parsedJson = null;
    }
    const parsed = checkoutRequestSchema.safeParse(parsedJson);
    if (!parsed.success) return json({ ok: false, code: "INVALID_REQUEST" }, { status: 400 });
    if (ctx.paymentMode === "preview" && parsed.data.promoCode?.trim()) return json({ ok: false, code: "PROMOTION_UNAVAILABLE" }, { status: 503 });
    if (ctx.paymentMode !== "preview" && ctx.paymentProvider) {
      // First-party flow (ADR-012): server re-prices every line from the
      // canonical catalog, creates the order + Xendit payment session, and
      // returns only {checkoutToken, redirectUrl, ...} to the browser. The
      // Idempotency-Key makes duplicate submits replay the first response.
      const sessionUser = await resolveSession(readSessionToken(request), { sessions: ctx.authSessions, users: ctx.users, tokens: ctx.tokens, clock: ctx.clock });
      if (!sessionUser.ok) return json({ ok: false, code: "CUSTOMER_STORAGE_UNAVAILABLE" }, { status: 503 });
      const appOrigin = ctx.appOrigin ?? url.origin;
      const guest = guestCheckoutToken(request);
      const guestCookie = sessionUser.value || guest.existing ? null : checkoutCookie(guest.token, appOrigin.startsWith("https://"));
      const principal = checkoutPrincipalKey({ userId: sessionUser.value?.id ?? null, guestToken: guest.token });
      if (!principal) return json({ ok: false, code: "INVALID_REQUEST" }, { status: 400 });
      const cookieHeaders: Record<string, string> = guestCookie ? { "set-cookie": guestCookie } : {};
      const customerProof = parsed.data.promoCode && sessionUser.value ? await currentCustomerProof(request, ctx) : undefined;
      const result = await createFirstPartyCheckout({
        lines: parsed.data.lines,
        customerEmail: parsed.data.customerEmail,
        requestId,
        ...(parsed.data.customerName ? { customerName: parsed.data.customerName } : {}),
        ...(parsed.data.delivery ? { delivery: parsed.data.delivery } : {}),
        userId: sessionUser.value?.id ?? null,
        successReturnUrl: `${appOrigin}/checkout/success`,
        cancelReturnUrl: `${appOrigin}/checkout/cancel`,
        ...(process.env.SHIPPING_POLICY ? { shippingPolicy: process.env.SHIPPING_POLICY } : {}),
        provider: ctx.paymentMode === "ipaymu" ? "ipaymu" : "xendit",
        inventoryMode: ctx.inventoryMode,
        requireApprovedShipping: process.env.YUBIE_ENV === "production",
        idempotencyKey: request.headers.get("idempotency-key"),
        idempotencyPrincipal: principal,
        ...(parsed.data.promoCode ? { promoCode: parsed.data.promoCode } : {}),
        ...(parsed.data.shippingQuoteId ? { shippingQuoteId: parsed.data.shippingQuoteId } : {}),
        ...(customerProof ? { customerProof } : {}),
        ...(guest.existing ? { possessedGuestPrincipal: checkoutPrincipalKey({ guestToken: guest.token })! } : {}),
      }, { tx: ctx.tx, provider: ctx.paymentProvider, clock: ctx.clock, ids: ctx.ids });
      if (!result.ok) {
        logEvent("api.checkout_failed", { requestId, errorCode: result.error.code });
        const mapping = checkoutError(result.error.code);
        return json({ ok: false, code: mapping.code }, { status: mapping.status, headers: cookieHeaders });
      }
      logEvent("api.checkout_created", { requestId, checkoutRef: result.value.checkoutRef, totalAmount: result.value.totalAmount, currency: result.value.currency, mode: result.value.mode });
      return json({ ok: true, data: result.value }, { status: 201, headers: cookieHeaders });
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

  if (request.method === "GET" && url.pathname === "/v1/checkouts/session") {
    // Issues the guest checkout cookie before the first submit, so a lost
    // first response cannot leave a retry under a different principal.
    const guest = guestCheckoutToken(request);
    const headers: Record<string, string> = guest.existing ? {} : { "set-cookie": checkoutCookie(guest.token, (ctx.appOrigin ?? url.origin).startsWith("https://")) };
    try{
      const held=ctx.paymentMode!=="preview"&&await ctx.tx.run("checkout.admission.read",async repos=>Boolean(await repos.inventory.checkoutFrozen?.()) || await repos.payments.hasFinancialException());
      return json({ok:true,data:{ready:true,admission:process.env.YUBIE_CHECKOUT_ADMISSION==="enabled"&&ctx.paymentMode!=="preview"&&!held?"enabled":"disabled"}},{headers:{...headers,"cache-control":"no-store"}});
    }catch{return json({ok:false,data:{ready:false},code:"CHECKOUT_UNAVAILABLE"},{status:503,headers:{"cache-control":"no-store"}});}
  }

  if(request.method==="GET"&&url.pathname==="/v1/checkouts/current"){
    try{
      const user=await resolveSession(readSessionToken(request),{sessions:ctx.authSessions,users:ctx.users,tokens:ctx.tokens,clock:ctx.clock});
      if(!user.ok)throw new Error("Customer session unavailable");
      const guest=guestCheckoutToken(request);
      const attemptKey=request.headers.get("idempotency-key");
      const data=await currentCheckout({userId:user.value?.id??null,guestPrincipal:guest.existing?checkoutPrincipalKey({guestToken:guest.token}):null,...(attemptKey&&/^[A-Za-z0-9_-]{1,128}$/.test(attemptKey)?{attemptKey}:{})},ctx.tx);
      return json({ok:true,data},{headers:{"cache-control":"no-store"}});
    }catch{return json({ok:false,code:"RECOVERY_UNAVAILABLE"},{status:503,headers:{"cache-control":"no-store"}});}
  }

  const checkoutStatusMatch = url.pathname.match(/^\/v1\/checkouts\/([^/]+)$/);
  if (request.method === "GET" && checkoutStatusMatch?.[1]) {
    // Public, token-scoped, PII-free: only opaque-token lookups answer here;
    // full order views live behind the authenticated account endpoint.
    const result = await getCheckoutStatus(decodeURIComponent(checkoutStatusMatch[1]), {
      tx: ctx.tx,
      orders: ctx.orders,
      payments: ctx.payments,
      ...(ctx.paymentProvider ? { provider: ctx.paymentProvider } : {}),
      clock: ctx.clock,
      ids: ctx.ids,
    }, { poll: true });
    if (!result.ok) return json({ ok: false, code: "INVALID_REQUEST" }, { status: 400 });
    if (!result.value) return json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
    return json({ ok: true, data: result.value });
  }

  if (request.method === "POST" && url.pathname === "/v1/webhooks/biteship") {
    // ADR-014 step 9: provider-authenticated webhook. Biteship sends a
    // merchant-configured static secret header (no HMAC — none invented);
    // the secret compares constant-time and the durable inbox append happens
    // BEFORE the 2xx so a crash re-receives the event cleanly. Every mode
    // keeps accepting inbound events; only outbound bookings are gated.
    const secretHeaderName = (process.env.BITESHIP_WEBHOOK_SECRET_HEADER ?? "").trim() || "x-biteship-secret";
    const secret = process.env.BITESHIP_WEBHOOK_SECRET ?? "";
    const raw = await readBoundedText(request, MAX_WEBHOOK_BYTES);
    if (raw === null) return tooLarge();
    let parsedJson: unknown = null;
    try { parsedJson = JSON.parse(raw); } catch { parsedJson = null; }
    const webhook = parsedJson === null ? null : parseBiteshipWebhook(parsedJson);
    if (!webhook) return json({ ok: true, result: "ignored" }, { status: 202, headers: { "cache-control": "no-store" } });
    const receivedSecret = request.headers.get(secretHeaderName) ?? undefined;
    if (!secret || !verifyBiteshipWebhookSecret(receivedSecret, secret)) {
      logEvent("api.biteship_webhook_rejected", { requestId, reason: "signature" });
      return json({ ok: false, code: "INVALID_SIGNATURE" }, { status: 401, headers: { "cache-control": "no-store" } });
    }
    if (!ctx.shipmentInbox) {
      return json({ ok: false, code: "WEBHOOK_NOT_CONFIGURED" }, { status: 503, headers: { "cache-control": "no-store" } });
    }
    const payloadHash = createHash("sha256").update(raw).digest("hex");
    const dedupeKey = `biteship:${webhook.orderId}:${webhook.event}:${webhook.status ?? ""}:${payloadHash.slice(0, 16)}`;
    try {
      const outcome = await ctx.shipmentInbox.receive({
        dedupeKey,
        event: webhook.event,
        providerOrderId: webhook.orderId,
        waybillId: webhook.waybillId ?? null,
        status: webhook.status ?? null,
        payload: parsedJson as Record<string, unknown>,
        payloadHash,
      });
      logEvent("api.biteship_webhook_received", { requestId, event: webhook.event, outcome });
      return json({ ok: true, result: outcome }, { headers: { "cache-control": "no-store" } });
    } catch {
      // Storage failure: 503 so the provider redelivers; nothing was applied.
      return json({ ok: false, code: "WEBHOOK_STORAGE_UNAVAILABLE" }, { status: 503, headers: { "cache-control": "no-store" } });
    }
  }
  if (request.method === "POST" && url.pathname === "/v1/webhooks/ipaymu") {
    if (ctx.paymentMode !== "ipaymu" || !ctx.ipaymuVa || !ctx.paymentProvider) {
      return json({ ok: false, code: "WEBHOOK_NOT_CONFIGURED" }, { status: 503 });
    }
    const contentType = request.headers.get("content-type") ?? "";
    const rawBody = await readBoundedText(request, MAX_WEBHOOK_BYTES);
    if (rawBody === null) return tooLarge();
    const fields = parseIpaymuCallbackBody(rawBody, contentType);
    const signature = request.headers.get("x-signature") ?? "";
    if (!fields || !verifyIpaymuCallback(fields, ctx.ipaymuVa, signature)) {
      logEvent("api.ipaymu_webhook", { requestId, outcome: "rejected" });
      return json({ ok: false, code: "INVALID_SIGNATURE" }, { status: 401 });
    }
    const referenceId = stringField(fields, "reference_id") || stringField(fields, "referenceId");
    const merchant = stringField(fields, "merchant");
    const amount = integerField(fields.amount);
    const trxId = fields.trx_id == null ? null : String(fields.trx_id);
    const sessionId = stringField(fields, "sid") || null;
    if (!referenceId || !merchant || amount === null || amount <= 0 || (trxId !== null && !/^[1-9]\d*$/.test(trxId))) {
      logEvent("api.ipaymu_webhook", { requestId, outcome: "rejected", code: "invalid_payload" });
      return json({ ok: false, code: "INVALID_PAYLOAD" }, { status: 400 });
    }
    if(merchant!==ctx.ipaymuVa || (stringField(fields,"currency") && stringField(fields,"currency")!=="IDR"))return json({ok:false,code:"REJECTED"},{status:409});
    if(ctx.paymentNotifications){
      try{
        const result=await ctx.paymentNotifications.receive({referenceId,amount,currency:stringField(fields,"currency")||null,trxId,sessionId,payloadHash:createHash("sha256").update(rawBody).digest("hex")});
        logEvent("api.ipaymu_webhook",{requestId,outcome:result});
        return json({ok:true,data:{result}},{headers:{"cache-control":"no-store"}});
      }catch{return json({ok:false,code:"UNAVAILABLE"},{status:503,headers:{"cache-control":"no-store"}});}
    }
    if(ctx.database)return json({ok:false,code:"UNAVAILABLE"},{status:503});
    let authoritativeStatus = null;
    let authoritativeReferenceId: string | null = null;
    let authoritativeAmount: number | null = null;
    if (trxId) {
      const checked = await ctx.paymentProvider.getPaymentSession(trxId);
      if (checked.ok && checked.value) {
        authoritativeStatus = paymentStatusFromProviderSession(checked.value.rawStatus);
        authoritativeReferenceId = checked.value.referenceId ?? null;
        authoritativeAmount = checked.value.amount ?? null;
      }
    }
    const applied = await applyIpaymuCallback({
      referenceId,
      merchant,
      expectedMerchant: ctx.ipaymuVa,
      amount,
      authoritativeStatus,
      authoritativeReferenceId,
      authoritativeAmount,
      payloadHash: createHash("sha256").update(rawBody).digest("hex"),
      currency: stringField(fields, "currency") || null,
      trxId,
      sessionId,
      dedupeKey: `ipaymu:${referenceId}:${trxId ?? "none"}:${authoritativeStatus ?? "unchecked"}`,
    }, { tx: ctx.tx, clock: ctx.clock, ids: ctx.ids });
    logEvent("api.ipaymu_webhook", {
      requestId,
      outcome: applied.result,
      ...(applied.result === "rejected" ? { code: applied.reason } : {}),
    });
    if (!applied.persisted) return json({ ok: false, code: "UNAVAILABLE" }, { status: 503 });
    if (applied.result === "rejected") return json({ ok: false, code: "REJECTED" }, { status: 409 });
    return json({ ok: true, data: { result: applied.result } });
  }

  if (request.method === "POST" && url.pathname === "/v1/webhooks/xendit/payment-session") {
    if (!ctx.webhookToken || !ctx.xenditBusinessId) return json({ ok: false, code: "WEBHOOK_NOT_CONFIGURED" }, { status: 503 });
    const body = await readJsonBody(request, MAX_WEBHOOK_BYTES);
    if (!body.ok) return tooLarge();
    const payload = body.value;
    const outcome = await processPaymentWebhook({
      callbackToken: request.headers.get("x-callback-token"),
      expectedToken: ctx.webhookToken,
      expectedBusinessId: ctx.xenditBusinessId,
      payload,
    }, { tx: ctx.tx, clock: ctx.clock, ids: ctx.ids });
    logEvent("api.payment_webhook", { requestId, outcome: outcome.result, ...(outcome.result === "rejected" ? { code: outcome.code } : {}) });
    if (outcome.result === "rejected") {
      return json({ ok: false, code: outcome.code }, { status: outcome.status });
    }
    if (outcome.result === "ignored") {
      return json({ ok: true, data: { result: "ignored" } }, { status: 202 });
    }
    if (outcome.result === "stale") {
      // Authenticated new delivery whose terminal state was already decided:
      // recorded, acknowledged, nothing changed.
      return json({ ok: true, data: { result: "stale", paymentStatus: outcome.paymentStatus } }, { status: 202 });
    }
    return json({ ok: true, data: { result: outcome.result } });
  }

  if (request.method === "POST" && url.pathname === "/v1/auth/google") {
    if (!ctx.verifier) return json({ ok: false, code: "AUTH_NOT_CONFIGURED" }, { status: 503 });
    const body = await readJsonBody(request, MAX_JSON_BYTES);
    if (!body.ok) return tooLarge();
    const parsed = googleLoginSchema.safeParse(body.value);
    if (!parsed.success) return json({ ok: false, code: "INVALID_REQUEST" }, { status: 400 });
    const csrfCookie = request.headers.get("cookie")?.match(/(?:^|;\s*)g_csrf_token=([^;]+)/)?.[1] ?? null;
    const result = await googleLogin({
      credential: parsed.data.credential,
      csrfToken: parsed.data.g_csrf_token,
      csrfCookie,
    }, { verifier: ctx.verifier, users: ctx.users, sessions: ctx.authSessions, tokens: ctx.tokens, clock: ctx.clock, ids: ctx.ids,
      ...(ctx.identityTransactions ? { tx: ctx.identityTransactions } : {}),
      ...(readSessionToken(request) ? { previousSessionHash: ctx.tokens.hash(readSessionToken(request)!) } : {}),
    });
    if (!result.ok) return json({ ok: false, code: result.error.code === "unavailable" ? "CUSTOMER_STORAGE_UNAVAILABLE" : "AUTH_FAILED" }, { status: result.error.code === "unavailable" ? 503 : 401 });
    // Secure follows the CONFIGURED origin, not the per-request protocol
    // reconstruction: behind a TLS-terminating proxy (Caddy) the incoming
    // scheme can look plain and would silently drop the Secure attribute.
    const secure = (ctx.appOrigin ?? url.origin).startsWith("https://");
    return json({ ok: true, data: { user: result.value.user } }, {
      status: 200,
      headers: { "set-cookie": sessionCookie(result.value.sessionToken, result.value.expiresAt, secure) },
    });
  }

  if (request.method === "POST" && url.pathname === "/v1/auth/logout") {
    const revoked = await logout(readSessionToken(request), { sessions: ctx.authSessions, tokens: ctx.tokens, clock: ctx.clock });
    if (!revoked.ok) return json({ ok: false, code: "CUSTOMER_STORAGE_UNAVAILABLE" }, { status: 503 });
    const secure = (ctx.appOrigin ?? url.origin).startsWith("https://");
    return json({ ok: true, data: { revoked: true } }, { headers: { "set-cookie": clearSessionCookie(secure) } });
  }

  if (request.method === "GET" && url.pathname === "/v1/auth/session") {
    const user = await resolveSession(readSessionToken(request), { sessions: ctx.authSessions, users: ctx.users, tokens: ctx.tokens, clock: ctx.clock });
    if (!user.ok) return json({ ok: false, code: "CUSTOMER_STORAGE_UNAVAILABLE" }, { status: 503 });
    const bootstrap = customerBootstrap(request, ctx);
    return json({ ok: true, data: { authenticated: user.value !== null, user: user.value, googleClientId: ctx.googleClientId, csrfToken: bootstrap.csrfToken, phoneAvailable: !!ctx.phoneAuth, otpCountries: ctx.phoneAuth?.allowedCountries ?? [], mapsAvailable: !!ctx.deliveryLocations } }, { headers: bootstrap.headers });
  }

  const accountOrderMatch = url.pathname.match(/^\/v1\/account\/orders(?:\/([^/]+))?$/);
  if (request.method === "GET" && accountOrderMatch) {
    const sessionUser = await resolveSession(readSessionToken(request), { sessions: ctx.authSessions, users: ctx.users, tokens: ctx.tokens, clock: ctx.clock });
    if (!sessionUser.ok || !sessionUser.value) return json({ ok: false, code: "UNAUTHORIZED" }, { status: 401 });
    if (accountOrderMatch[1]) {
      const result = await getAccountOrder(decodeURIComponent(accountOrderMatch[1]), {
        orders: ctx.orders,
        payments: ctx.payments,
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
  try { return match?.[1] ? decodeURIComponent(match[1]) : null; } catch { return null; }
}

function sessionCookie(token: string, expiresAt: string, secure: boolean): string {
  const maxAge = Math.max(0, Math.floor((Date.parse(expiresAt) - Date.now()) / 1000));
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

const CHECKOUT_COOKIE = "yubie_checkout";
const CHECKOUT_COOKIE_MAX_AGE_SECONDS = 24 * 60 * 60;

function guestCheckoutToken(request: Request): { token: string; existing: boolean } {
  const match = request.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${CHECKOUT_COOKIE}=([^;]+)`));
  const value = match?.[1];
  if (value && GUEST_CHECKOUT_TOKEN_PATTERN.test(value)) return { token: value, existing: true };
  return { token: randomBytes(32).toString("base64url"), existing: false };
}

function checkoutCookie(token: string, secure: boolean): string {
  return `${CHECKOUT_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${CHECKOUT_COOKIE_MAX_AGE_SECONDS}${secure ? "; Secure" : ""}`;
}

function clearSessionCookie(secure: boolean): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
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

export default { fetch: handleRequest };
