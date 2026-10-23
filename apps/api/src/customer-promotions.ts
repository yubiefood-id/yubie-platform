import { claimWelcomePromotion, getWelcomePromotion, checkoutPrincipalKey } from "@yubie/application";
import { promotionClaimSchema } from "@yubie/validation";
import type { AppContext } from "./composition/create-app.js";
import { authorizeCustomerMutation, currentCustomerProof, customerCookie } from "./customer-security.js";
import { readCustomerJsonBody } from "./customer-http.js";
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "cache-control": "no-store" } });
export async function handleCustomerPromotions(request: Request, ctx: AppContext): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (path !== "/v1/promotions/welcome" && path !== "/v1/promotions/welcome/claim") return null;
  const claim = path.endsWith("/claim");
  if (request.method !== (claim ? "POST" : "GET")) return json({ ok: false, code: "NOT_FOUND" }, 404);
  if (claim && !authorizeCustomerMutation(request, ctx)) return json({ ok: false, code: "CSRF_INVALID" }, 403);
  if (!ctx.identityTransactions) return json({ ok: false, code: "CUSTOMER_STORAGE_UNAVAILABLE" }, 503);
  try {
    const actor = await currentCustomerProof(request, ctx), deps = { tx: ctx.identityTransactions, clock: ctx.clock, ids: ctx.ids };
    if (claim && !actor) return json({ ok: false, code: "UNAUTHORIZED" }, 401);
    if (claim && !promotionClaimSchema.safeParse(await readCustomerJsonBody(request)).success) return json({ ok: false, code: "INVALID_REQUEST" }, 400);
    const guestPrincipal = checkoutPrincipalKey({ guestToken: customerCookie(request, "yubie_checkout") });
    const result = claim ? await claimWelcomePromotion({ actor: actor!, ...(guestPrincipal ? { guestPrincipal } : {}) }, deps) : await getWelcomePromotion({ ...(actor ? { actor } : {}) }, deps);
    return result.ok ? json({ ok: true, data: result.value }) : json({ ok: false, code: result.error.code === "unavailable" ? "CUSTOMER_STORAGE_UNAVAILABLE" : "PROMOTION_NOT_ELIGIBLE" }, result.error.code === "unavailable" ? 503 : 403);
  } catch (error) {
    const large = error instanceof Error && error.message === "BODY_TOO_LARGE";
    return json({ ok: false, code: large ? "BODY_TOO_LARGE" : "CUSTOMER_STORAGE_UNAVAILABLE" }, large ? 413 : 503);
  }
}
