import { listCustomerAddresses, saveCustomerAddress, deleteCustomerAddress, setDefaultCustomerAddress } from "@yubie/application";
import { customerAddressSchema, customerAddressPatchSchema, defaultAddressSchema } from "@yubie/validation";
import type { AppError } from "@yubie/domain";
import type { AppContext } from "./composition/create-app.js";
import { authorizeCustomerMutation, currentCustomerProof, verifyCustomerPin } from "./customer-security.js";
import { readCustomerJsonBody } from "./customer-http.js";
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "cache-control": "no-store" } });
function failure(error: AppError): Response {
  const status = error.code === "validation" ? 400 : error.code === "unauthorized" ? 401 : error.code === "not_found" ? 404 : 503;
  return json({ ok: false, code: status === 503 ? "CUSTOMER_STORAGE_UNAVAILABLE" : error.code.toUpperCase() }, status);
}
export async function handleCustomerAddresses(request: Request, ctx: AppContext): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  const match = path.match(/^\/v1\/account\/addresses(?:\/(adr_[A-Za-z0-9_-]{1,96}))?$/);
  const defaultAddress = path === "/v1/account/default-address";
  if (!match && !defaultAddress) return null;
  const browser = request.method !== "GET" ? authorizeCustomerMutation(request, ctx) : null;
  if (request.method !== "GET" && !browser) return json({ ok: false, code: "CSRF_INVALID" }, 403);
  if (!ctx.identityTransactions) return json({ ok: false, code: "CUSTOMER_STORAGE_UNAVAILABLE" }, 503);
  try {
    const actor = await currentCustomerProof(request, ctx); if (!actor) return json({ ok: false, code: "UNAUTHORIZED" }, 401);
    const deps = { tx: ctx.identityTransactions, clock: ctx.clock, ids: ctx.ids, verifyPin: (pin: import("@yubie/domain").DeliveryPinInput) => !!browser && verifyCustomerPin(pin, browser, ctx) }, id = match?.[1];
    if (defaultAddress && request.method === "PUT") {
      const parsed = defaultAddressSchema.safeParse(await readCustomerJsonBody(request)); if (!parsed.success) return json({ ok: false, code: "INVALID_ADDRESS" }, 400);
      const result = await setDefaultCustomerAddress({ actor, id: parsed.data.addressId }, deps);
      return result.ok ? json({ ok: true, data: result.value }) : failure(result.error);
    }
    if (!defaultAddress && !id && request.method === "GET") {
      const result = await listCustomerAddresses({ actor }, deps); return result.ok ? json({ ok: true, data: result.value }) : failure(result.error);
    }
    if (!defaultAddress && ((!id && request.method === "POST") || (id && request.method === "PATCH"))) {
      const parsed = (id ? customerAddressPatchSchema : customerAddressSchema).safeParse(await readCustomerJsonBody(request)); if (!parsed.success) return json({ ok: false, code: "INVALID_ADDRESS" }, 400);
      const result = await saveCustomerAddress({ actor, ...(id ? { id } : {}), address: parsed.data }, deps);
      return result.ok ? json({ ok: true, data: result.value }, id ? 200 : 201) : failure(result.error);
    }
    if (id && request.method === "DELETE") {
      const result = await deleteCustomerAddress({ actor, id }, deps); return result.ok ? json({ ok: true, data: result.value }) : failure(result.error);
    }
    return json({ ok: false, code: "NOT_FOUND" }, 404);
  } catch (error) {
    const large = error instanceof Error && error.message === "BODY_TOO_LARGE";
    return json({ ok: false, code: large ? "BODY_TOO_LARGE" : "CUSTOMER_STORAGE_UNAVAILABLE" }, large ? 413 : 503);
  }
}
