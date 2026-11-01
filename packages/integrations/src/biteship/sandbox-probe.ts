import { err, ok, type UseCaseResult } from "@yubie/domain";

type FetchLike = (input: string, init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface BiteshipSandboxProbeOptions {
  apiKey: string;
  couriers?: string;
  originPostalCode: number;
  destinationPostalCode: number;
  items: Array<{ name: string; valueIdr: number; quantity: number; weightGrams: number }>;
  fetchFn?: FetchLike;
  timeoutMs?: number;
}

export interface BiteshipSandboxProbeResult {
  ratesCount: number;
  pickupCapableCount: number;
  cheapest?: { company: string; serviceCode: string; priceIdr: number } | undefined;
  orderId: string | null;
  orderStatus: string | null;
  waybillId: string | null;
  trackingId: string | null;
  cancelled: boolean;
  finalStatus: string | null;
}

/**
 * Live sandbox acceptance probe (ADR-014 / Issue #73): proves the real API
 * contract end-to-end against api.biteship.com with a TEST key —
 * rates -> booking (pickup) -> retrieve -> cancel. Gated by
 * YUBIE_BITESHIP_SANDBOX_E2E=1 and REFUSED for production keys; it never
 * touches first-party data and never proves payment or physical delivery.
 */
export function biteshipSandboxProbeDecision(env: Record<string, string | undefined>): { run: boolean; reason: string } {
  if (env.YUBIE_BITESHIP_SANDBOX_E2E !== "1") return { run: false, reason: "not requested" };
  const key = env.BITESHIP_API_KEY ?? "";
  if (!key.startsWith("biteship_test.")) return { run: false, reason: "refusing non-test credential" };
  if ((env.BITESHIP_ENV ?? "") === "production") return { run: false, reason: "refusing production environment" };
  return { run: true, reason: "sandbox e2e" };
}

export async function runBiteshipSandboxProbe(options: BiteshipSandboxProbeOptions): Promise<UseCaseResult<BiteshipSandboxProbeResult>> {
  const fetchFn = options.fetchFn ?? (fetch as unknown as FetchLike);
  const timeoutMs = options.timeoutMs ?? 20_000;
  const headers = { authorization: `Bearer ${options.apiKey}`, "content-type": "application/json", accept: "application/json" };
  const items = options.items.map((item) => ({ name: item.name, category: "food_and_drink", value: item.valueIdr, quantity: item.quantity, weight: item.weightGrams }));
  const base: BiteshipSandboxProbeResult = { ratesCount: 0, pickupCapableCount: 0, orderId: null, orderStatus: null, waybillId: null, trackingId: null, cancelled: false, finalStatus: null };

  const ratesResponse = await fetchFn("https://api.biteship.com/v1/rates/couriers", {
    method: "POST", headers, signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({ origin_postal_code: options.originPostalCode, destination_postal_code: options.destinationPostalCode, couriers: options.couriers ?? "jne,jnt,sicepat", items }),
  });
  if (ratesResponse.status >= 400) return err({ code: "unavailable", message: `Biteship sandbox rates rejected (HTTP ${ratesResponse.status}).`, retryable: false, requestId: "biteship-probe" });
  const ratesBody = (await ratesResponse.json()) as { pricing?: Array<Record<string, unknown>> };
  const pricing = Array.isArray(ratesBody.pricing) ? ratesBody.pricing : [];
  const pickupCapable = pricing.filter((entry) => Array.isArray(entry.available_collection_method) && (entry.available_collection_method as string[]).includes("pickup"));
  const cheapest = pickupCapable.map((entry) => ({ company: String(entry.company ?? ""), serviceCode: String(entry.courier_service_code ?? ""), priceIdr: Number(entry.price ?? 0) })).sort((a, b) => a.priceIdr - b.priceIdr)[0];
  const result: BiteshipSandboxProbeResult = { ...base, ratesCount: pricing.length, pickupCapableCount: pickupCapable.length, cheapest };
  if (!cheapest) return err({ code: "validation", message: "No pickup-capable courier returned for the lane.", retryable: false, requestId: "biteship-probe" });

  const referenceId = `ybship-sandbox-probe-${Date.now()}`;
  const orderResponse = await fetchFn("https://api.biteship.com/v1/orders", {
    method: "POST", headers, signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      origin_contact_name: "Yubie Sandbox Probe", origin_contact_phone: "+620000000001", origin_address: "Sandbox origin", origin_postal_code: options.originPostalCode, origin_collection_method: "pickup",
      destination_contact_name: "Sandbox Destination", destination_contact_phone: "+620000000002", destination_address: "Sandbox destination", destination_postal_code: options.destinationPostalCode,
      courier_company: cheapest.company, courier_type: cheapest.serviceCode, delivery_type: "now", items, reference_id: referenceId,
    }),
  });
  if (orderResponse.status >= 400) return err({ code: "unavailable", message: `Biteship sandbox order create rejected (HTTP ${orderResponse.status}).`, retryable: false, requestId: "biteship-probe" });
  const orderBody = (await orderResponse.json()) as { id?: string; status?: string; courier?: { waybill_id?: string; tracking_id?: string } };
  result.orderId = orderBody.id ?? null;
  result.orderStatus = orderBody.status ?? null;
  result.waybillId = orderBody.courier?.waybill_id ?? null;
  result.trackingId = orderBody.courier?.tracking_id ?? null;
  if (!result.orderId) return err({ code: "unavailable", message: "Sandbox order create returned no id.", retryable: false, requestId: "biteship-probe" });

  // Always clean up: cancel the sandbox order so the probe is repeatable.
  const cancelResponse = await fetchFn(`https://api.biteship.com/v1/orders/${encodeURIComponent(result.orderId)}/cancel`, { method: "POST", headers, signal: AbortSignal.timeout(timeoutMs), body: "{}" });
  const cancelBody = (await cancelResponse.json().catch(() => ({}))) as { status?: string };
  result.cancelled = cancelResponse.ok;
  result.finalStatus = cancelBody.status ?? null;
  return ok(result);
}
