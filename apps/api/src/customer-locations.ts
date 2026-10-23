import { isIP } from "node:net";
import { lookupDeliveryLocation } from "@yubie/application";
import { locationSearchSchema, locationDetailsSchema, locationReverseSchema } from "@yubie/validation";
import type { AppContext } from "./composition/create-app.js";
import { authorizeCustomerMutation, issueCustomerPinToken } from "./customer-security.js";
import { readCustomerJsonBody } from "./customer-http.js";
const json = (data: unknown, status = 200, headers: Record<string, string> = {}) => Response.json(data, { status, headers: { "cache-control": "no-store", ...headers } });
export async function handleCustomerLocations(request: Request, ctx: AppContext): Promise<Response | null> {
  const action = new URL(request.url).pathname.match(/^\/v1\/locations\/(autocomplete|details|reverse-geocode|confirm)$/)?.[1];
  if (!action) return null;
  if (request.method !== "POST") return json({ ok: false, code: "NOT_FOUND" }, 404);
  const browser = authorizeCustomerMutation(request, ctx); if (!browser) return json({ ok: false, code: "CSRF_INVALID" }, 403);
  const ip = request.headers.get("x-yubie-client-ip") ?? "";
  if (!ctx.identityTransactions || !ctx.deliveryLocations || !isIP(ip)) return json({ ok: false, code: "LOCATION_UNAVAILABLE" }, 503);
  try {
    const raw = await readCustomerJsonBody(request);
    const input = action === "autocomplete" ? locationSearchSchema.safeParse(raw) : action === "details" ? locationDetailsSchema.safeParse(raw) : locationReverseSchema.safeParse(raw);
    if (!input.success) return json({ ok: false, code: "INVALID_LOCATION" }, 400);
    const parsed = action === "autocomplete" ? { action: "autocomplete" as const, ...locationSearchSchema.parse(raw) } : action === "details" ? { action: "details" as const, ...locationDetailsSchema.parse(raw) } : { action: "reverse" as const, ...locationReverseSchema.parse(raw) };
    const result = await lookupDeliveryLocation({ ...parsed, browser, ip }, { tx: ctx.identityTransactions, clock: ctx.clock, hash: value => ctx.tokens.hash(value), provider: ctx.deliveryLocations });
    if (result.ok && action === "confirm") {
      const selection = result.value;
      if (!selection || Array.isArray(selection) || selection.countryCode !== "ID") return json({ ok: false, code: "LOCATION_OUTSIDE_SERVICE_AREA" }, 400);
      return json({ ok: true, data: { validationToken: issueCustomerPinToken(selection, browser, ctx) } });
    }
    return result.ok ? json({ ok: true, data: result.value }) : json({ ok: false, code: result.error.code === "rate_limited" ? "RATE_LIMITED" : "LOCATION_UNAVAILABLE" }, result.error.code === "rate_limited" ? 429 : 503, result.error.code === "rate_limited" ? { "retry-after": "60" } : {});
  } catch (error) {
    const large = error instanceof Error && error.message === "BODY_TOO_LARGE";
    return json({ ok: false, code: large ? "BODY_TOO_LARGE" : "LOCATION_UNAVAILABLE" }, large ? 413 : 503);
  }
}
