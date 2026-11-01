import { createHash } from "node:crypto";
import {
  DEFAULT_NON_PKP_SHIPPING_TAX_POLICY,
  err,
  ok,
  productFamilies,
  resolveShippingTax,
  type OrderShipping,
  type ShippingQuoteRecord,
  type SkuShippingProfileRecord,
  type SkuStorageClass,
  type UseCaseResult,
} from "@yubie/domain";
import type { ShippingProviderPort } from "../ports/shipping-provider.js";
import type { ShippingQuoteStore, TransactionalRepositories } from "../ports.js";
import { priceCheckoutLines } from "./checkout-quote.js";

/** How long a stored quote may authorize a payment. Short by design (ADR-014). */
export const SHIPPING_QUOTE_TTL_MS = 10 * 60 * 1000;
/** Cap offered options: Starter-plan cost discipline and a choice, not a wall. */
export const MAX_SHIPPING_OPTIONS = 5;

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Hash of WHAT is bought (cart only — promo and address never change the parcel). */
export function shippingCartHash(lines: ReadonlyArray<{ productId: string; sizeId: string; quantity: number }>): string {
  const merged = new Map<string, number>();
  for (const line of lines) {
    const key = `${line.productId}\u0000${line.sizeId}`;
    merged.set(key, (merged.get(key) ?? 0) + line.quantity);
  }
  const entries = [...merged.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, quantity]) => [...key.split("\u0000"), quantity]);
  return sha256Hex(JSON.stringify(["shipping-cart-v1", entries]));
}

/** Hash of WHERE it ships (routing fields only; notes never affect a courier rate; city is case-insensitive like coverage checks). */
export function shippingDestinationHash(delivery: { address: string; city: string; postalCode?: string | null | undefined }): string {
  return sha256Hex(JSON.stringify([
    "shipping-dest-v1",
    delivery.address.trim(),
    delivery.city.trim().toLowerCase(),
    delivery.postalCode?.trim() || null,
  ]));
}

export interface ShippingParcelItem {
  sku: string;
  name: string;
  category: "food_and_drink" | "frozen_food" | "groceries" | "healthcare" | "others";
  quantity: number;
  valueIdr: number;
  weightGrams: number;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  storageClass: SkuStorageClass;
}

export interface Parcelization {
  items: ShippingParcelItem[];
  /** False when any sellable SKU lacks an effective shipping profile. */
  complete: boolean;
  /** True when any item is chilled/frozen: courier dispatch is blocked until transit handling is approved. */
  perishable: boolean;
}

/** Sellable-catalog SKU for a cart line (the sellable pack, not its inventory components). */
function checkoutLineSku(productId: string, sizeId: string): string | null {
  const product = productFamilies.find((candidate) => candidate.id === productId && candidate.status === "available");
  const size = product?.sizes.find((candidate) => candidate.id === sizeId && candidate.available);
  return size?.sku ?? null;
}

/**
 * Build the physical parcel description from priced lines + approved per-SKU
 * logistics profiles. Server-only: names and values come from the priced
 * lines, never from the browser.
 */
export function parcelizeCheckout(
  lines: ReadonlyArray<{ productId: string; sizeId: string; quantity: number }>,
  profiles: ReadonlyMap<string, SkuShippingProfileRecord>,
): Parcelization {
  const items: ShippingParcelItem[] = [];
  let complete = true;
  let perishable = false;
  for (const line of priceCheckoutLines(lines)) {
    const sku = checkoutLineSku(line.productId, line.sizeId);
    const profile = sku ? profiles.get(sku) : undefined;
    if (!sku || !profile) {
      complete = false;
      continue;
    }
    if (profile.storageClass !== "shelf_stable") perishable = true;
    items.push({
      sku,
      name: `${line.productName} ${line.sizeLabel}`.trim(),
      category: profile.storageClass === "shelf_stable" ? "food_and_drink" : "frozen_food",
      quantity: line.quantity,
      valueIdr: line.unitPrice,
      weightGrams: profile.weightGrams,
      lengthCm: profile.lengthCm,
      widthCm: profile.widthCm,
      heightCm: profile.heightCm,
      storageClass: profile.storageClass,
    });
  }
  return { items, complete, perishable };
}

export function parcelsDigest(items: ReadonlyArray<ShippingParcelItem>): string {
  return sha256Hex(JSON.stringify(["shipping-parcels-v1", items.map((item) => [item.sku, item.quantity, item.valueIdr, item.weightGrams])]));
}

/** Read-only access to approved origins and SKU logistics profiles (no transaction needed). */
export interface ShippingOriginReader {
  findActive(now: string): Promise<ShippingOriginRecordLite | null>;
}
export interface ShippingOriginRecordLite {
  id: string;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
}
export interface SkuShippingProfileReader {
  findEffective(skus: readonly string[], now: string): Promise<SkuShippingProfileRecord[]>;
}

export interface ShippingRateOption {
  quoteId: string;
  courierCompany: string;
  courierName: string | null;
  courierServiceCode: string;
  courierServiceName: string | null;
  deliveryType: "now" | "scheduled";
  durationDescription: string | null;
  /** What the customer pays for shipping: offered amount plus policy tax. */
  totalShippingIdr: number;
  providerAmountIdr: number;
  taxAmountIdr: number;
}

export type ShippingRatesOutcome =
  | { mode: "free_promotional" }
  | { mode: "free_promotional_subsidized"; quoteId: string; courierCompany: string; courierServiceCode: string; courierServiceName: string | null; providerAmountIdr: number; subsidyAmountIdr: number; validUntil: string }
  | { mode: "unavailable"; reason: "missing_postal_code" | "no_origin" | "missing_profiles" | "perishable_unapproved" | "no_coverage" | "provider_unconfigured" }
  | { mode: "courier"; options: ShippingRateOption[]; validUntil: string };

export interface ShippingRatesDeps {
  provider: ShippingProviderPort | null;
  /** Owner-approved courier list; the live API rejects empty lists (error 40001002). */
  couriers?: string | null;
  /** Coverage + quote persistence run transactionally; provider calls never do. */
  tx: { run<T>(operation: string, work: (repos: TransactionalRepositories) => Promise<T>): Promise<T> };
  /** Absent on non-transactional (preview/in-memory) deployments: courier quotes are then never offered. */
  quotes?: ShippingQuoteStore | null;
  origins?: ShippingOriginReader | null;
  profiles?: SkuShippingProfileReader | null;
  clock: { now(): string };
  ids: { nextId(): string };
}

/**
 * Server-side rate quoting (ADR-014 step 3): free city coverage always wins;
 * otherwise fetch provider rates for the exact origin/destination/parcel,
 * keep only PICKUP-capable services, persist bounded server-owned quotes and
 * return them. Provider responses are reused while quotes for the same
 * principal/cart/destination are still valid — never a fresh paid API call
 * per keystroke. No HTTP call happens inside a transaction.
 */
export async function requestShippingRates(
  input: { principalKey: string; lines: ReadonlyArray<{ productId: string; sizeId: string; quantity: number }>; delivery: { address: string; city: string; postalCode?: string | null | undefined }; subsidizedFree?: { maxSubsidyIdr: number } | undefined },
  deps: ShippingRatesDeps,
): Promise<UseCaseResult<ShippingRatesOutcome>> {
  const now = deps.clock.now();
  let priced;
  try {
    priced = priceCheckoutLines(input.lines);
  } catch {
    return err({ code: "validation", message: "Cart lines are unavailable for shipping.", retryable: false, requestId: "shipping" });
  }

  const covered = await deps.tx.run("shipping.coverage", async (repos) => (repos.shipping ? repos.shipping.authorize(input.delivery.city, now) : null));
  if (covered) {
    // Issue #73 P0-C: free coverage stays Rp0 for the customer, but when the
    // owner has armed the subsidy lever the server still resolves a REAL
    // pickup courier and records the merchant-subsidized provider cost so
    // packing triggers automatic booking. Selection policy (owner-approved):
    // cheapest COMPLIANT service - pickup-capable, non-instant, food-suitable
    // and within the approved subsidy cap; a cheaper non-compliant service is
    // never chosen. Any guard failing degrades to plain free (no auto-booking)
    // rather than rejecting an operator-approved promotion.
    const subsidy = input.subsidizedFree;
    if (!subsidy || !deps.provider || !deps.quotes || !deps.origins || !deps.profiles) return ok({ mode: "free_promotional" });
    const freePostal = input.delivery.postalCode?.trim() ?? "";
    if (!freePostal) return ok({ mode: "free_promotional" });
    const freeOrigin = await deps.origins.findActive(now);
    if (!freeOrigin || !freeOrigin.postalCode) return ok({ mode: "free_promotional" });
    const freeSkus = priced.map((line) => checkoutLineSku(line.productId, line.sizeId)).filter((sku): sku is string => sku !== null);
    const freeProfiles = new Map((await deps.profiles.findEffective(freeSkus, now)).map((profile) => [profile.sku, profile]));
    const freeParcel = parcelizeCheckout(input.lines, freeProfiles);
    if (!freeParcel.complete || freeParcel.perishable) return ok({ mode: "free_promotional" });
    const freeCartHash = shippingCartHash(input.lines);
    const freeDestinationHash = shippingDestinationHash(input.delivery);
    const reusableFree = await deps.quotes.listUsable({ principalKey: input.principalKey, cartHash: freeCartHash, destinationHash: freeDestinationHash, now });
    const existingSubsidized = reusableFree.ok ? reusableFree.value.filter((quote) => quote.subsidyAmountIdr > 0) : [];
    if (existingSubsidized.length > 0) {
      const quote = existingSubsidized[0]!;
      return ok({ mode: "free_promotional_subsidized", quoteId: quote.id, courierCompany: quote.courierCompany, courierServiceCode: quote.courierServiceCode, courierServiceName: quote.courierServiceName, providerAmountIdr: quote.providerAmountIdr, subsidyAmountIdr: quote.subsidyAmountIdr, validUntil: quote.validUntil });
    }
    const freeRates = await deps.provider.getRates({
      origin: { postalCode: freeOrigin.postalCode },
      destination: { postalCode: freePostal },
      couriers: deps.couriers ?? undefined,
      items: freeParcel.items.map((item) => ({
        name: item.name, category: item.category, sku: item.sku, valueIdr: item.valueIdr, quantity: item.quantity, weightGrams: item.weightGrams,
        ...(item.lengthCm ? { lengthCm: item.lengthCm } : {}), ...(item.widthCm ? { widthCm: item.widthCm } : {}), ...(item.heightCm ? { heightCm: item.heightCm } : {}),
      })),
    });
    if (!freeRates.ok) return ok({ mode: "free_promotional" });
    const compliant = freeRates.value
      .filter((rate) => rate.availableForPickup && rate.deliveryType !== "now" && Number.isSafeInteger(rate.priceIdr) && rate.priceIdr > 0 && rate.priceIdr <= subsidy.maxSubsidyIdr)
      .sort((a, b) => a.priceIdr - b.priceIdr)[0];
    if (!compliant) return ok({ mode: "free_promotional" });
    const freeValidUntil = new Date(Date.parse(now) + SHIPPING_QUOTE_TTL_MS).toISOString();
    const subsidizedQuote: ShippingQuoteRecord = {
      id: `sq_${deps.ids.nextId()}`,
      principalKey: input.principalKey,
      cartHash: freeCartHash,
      destinationHash: freeDestinationHash,
      originId: freeOrigin.id,
      parcelsDigest: parcelsDigest(freeParcel.items),
      courierCompany: compliant.courierCompany,
      courierServiceCode: compliant.courierServiceCode,
      courierServiceName: compliant.courierServiceName,
      serviceType: compliant.serviceType,
      deliveryType: compliant.deliveryType ?? "scheduled",
      offeredAmountIdr: 0,
      providerAmountIdr: compliant.priceIdr,
      subsidyAmountIdr: compliant.priceIdr,
      taxAmountIdr: 0,
      taxPolicyVersion: "free-subsidy-v1",
      currency: "IDR",
      status: "quoted",
      validUntil: freeValidUntil,
      createdAt: now,
      consumedAt: null,
      orderId: null,
    };
    const freeInserted = await deps.tx.run("shipping.quotes.insert", async (repos) => {
      if (!repos.shippingQuotes) return false;
      await repos.shippingQuotes.insert(subsidizedQuote);
      return true;
    });
    if (!freeInserted) return ok({ mode: "free_promotional" });
    return ok({ mode: "free_promotional_subsidized", quoteId: subsidizedQuote.id, courierCompany: subsidizedQuote.courierCompany, courierServiceCode: subsidizedQuote.courierServiceCode, courierServiceName: subsidizedQuote.courierServiceName, providerAmountIdr: subsidizedQuote.providerAmountIdr, subsidyAmountIdr: subsidizedQuote.subsidyAmountIdr, validUntil: freeValidUntil });
  }

  const postalCode = input.delivery.postalCode?.trim() ?? "";
  if (!postalCode) return ok({ mode: "unavailable", reason: "missing_postal_code" });
  if (!deps.provider) return ok({ mode: "unavailable", reason: "provider_unconfigured" });

  const origin = deps.origins ? await deps.origins.findActive(now) : null;
  if (!origin || !origin.postalCode) return ok({ mode: "unavailable", reason: "no_origin" });

  const skus = priced
    .map((line) => checkoutLineSku(line.productId, line.sizeId))
    .filter((sku): sku is string => sku !== null);
  const profileRows = deps.profiles ? await deps.profiles.findEffective(skus, now) : [];
  const profiles = new Map(profileRows.map((profile) => [profile.sku, profile]));
  const parcel = parcelizeCheckout(input.lines, profiles);
  if (!parcel.complete) return ok({ mode: "unavailable", reason: "missing_profiles" });
  if (parcel.perishable) return ok({ mode: "unavailable", reason: "perishable_unapproved" });

  const cartHash = shippingCartHash(input.lines);
  const destinationHash = shippingDestinationHash(input.delivery);
  const digest = parcelsDigest(parcel.items);

  // Reuse still-valid stored quotes for the same triple (cost discipline).
  if (deps.quotes) {
    const reusable = await deps.quotes.listUsable({ principalKey: input.principalKey, cartHash, destinationHash, now });
    const paidQuotes = reusable.ok ? reusable.value.filter((quote) => quote.subsidyAmountIdr === 0) : [];
    if (paidQuotes.length > 0) {
      return ok({ mode: "courier", options: paidQuotes.map(quoteToOption), validUntil: paidQuotes[0]!.validUntil });
    }
  }

  const rates = await deps.provider.getRates({
    origin: { postalCode: origin.postalCode },
    destination: { postalCode },
    couriers: deps.couriers ?? undefined,
    items: parcel.items.map((item) => ({
      name: item.name,
      category: item.category,
      sku: item.sku,
      valueIdr: item.valueIdr,
      quantity: item.quantity,
      weightGrams: item.weightGrams,
      ...(item.lengthCm ? { lengthCm: item.lengthCm } : {}),
      ...(item.widthCm ? { widthCm: item.widthCm } : {}),
      ...(item.heightCm ? { heightCm: item.heightCm } : {}),
    })),
  });
  if (!rates.ok) {
    // Ambiguous/definitive provider failures both degrade to "no options" —
    // never to a guessed price.
    return ok({ mode: "unavailable", reason: "no_coverage" });
  }
  const offered = rates.value
    // Pickup-only (ADR-014 goal), positive integer price, and bookable with
    // what checkout actually persists: instant services need destination
    // coordinates the current delivery model does not store, so offering them
    // would create a paid-but-unbookable order. They stay excluded until
    // coordinate capture lands.
    .filter((rate) => rate.availableForPickup && rate.deliveryType !== "now" && Number.isSafeInteger(rate.priceIdr) && rate.priceIdr > 0)
    .sort((a, b) => a.priceIdr - b.priceIdr)
    .slice(0, MAX_SHIPPING_OPTIONS);
  if (offered.length === 0) return ok({ mode: "unavailable", reason: "no_coverage" });

  const validUntil = new Date(Date.parse(now) + SHIPPING_QUOTE_TTL_MS).toISOString();
  if (!deps.quotes) return ok({ mode: "unavailable", reason: "provider_unconfigured" });
  const records: ShippingQuoteRecord[] = offered.map((rate) => {
    const tax = resolveShippingTax(rate.priceIdr, DEFAULT_NON_PKP_SHIPPING_TAX_POLICY).amountIdr;
    return {
      id: `sq_${deps.ids.nextId()}`,
      principalKey: input.principalKey,
      cartHash,
      destinationHash,
      originId: origin.id,
      parcelsDigest: digest,
      courierCompany: rate.courierCompany,
      courierServiceCode: rate.courierServiceCode,
      courierServiceName: rate.courierServiceName,
      serviceType: rate.serviceType,
      deliveryType: rate.deliveryType ?? "scheduled",
      offeredAmountIdr: rate.priceIdr,
      providerAmountIdr: rate.priceIdr,
      subsidyAmountIdr: 0,
      taxAmountIdr: tax,
      taxPolicyVersion: DEFAULT_NON_PKP_SHIPPING_TAX_POLICY.version,
      currency: "IDR",
      status: "quoted",
      validUntil,
      createdAt: now,
      consumedAt: null,
      orderId: null,
    };
  });
  const inserted = await deps.tx.run("shipping.quotes.insert", async (repos) => {
    if (!repos.shippingQuotes) return false;
    for (const record of records) await repos.shippingQuotes.insert(record);
    return true;
  });
  if (!inserted) return ok({ mode: "unavailable", reason: "provider_unconfigured" });

  return ok({ mode: "courier", options: records.map(quoteToOption), validUntil });
}

function quoteToOption(quote: ShippingQuoteRecord): ShippingRateOption {
  return {
    quoteId: quote.id,
    courierCompany: quote.courierCompany,
    courierName: null,
    courierServiceCode: quote.courierServiceCode,
    courierServiceName: quote.courierServiceName,
    deliveryType: quote.deliveryType,
    durationDescription: null,
    totalShippingIdr: quote.offeredAmountIdr + quote.taxAmountIdr,
    providerAmountIdr: quote.providerAmountIdr,
    taxAmountIdr: quote.taxAmountIdr,
  };
}

/**
 * TX1 quote revalidation (ADR-014 step 4): lock the row, verify it binds to
 * THIS principal, cart and destination, then consume it exactly once. Any
 * mismatch (stale, replayed for another cart, tampered id) returns null and
 * the caller must refuse the checkout with a re-quote prompt.
 */
export async function consumeCheckoutShippingQuote(
  repos: Pick<TransactionalRepositories, "shippingQuotes">,
  input: { quoteId: string; principalKey: string; cartHash: string; destinationHash: string; orderId: string; now: string },
): Promise<ShippingQuoteRecord | null> {
  if (!repos.shippingQuotes) return null;
  const found = await repos.shippingQuotes.findById(input.quoteId, input.now);
  if (!found.ok || !found.value) return null;
  const quote = found.value;
  if (quote.principalKey !== input.principalKey || quote.cartHash !== input.cartHash || quote.destinationHash !== input.destinationHash) {
    return null;
  }
  const consumed = await repos.shippingQuotes.consume(quote.id, input.orderId, input.now);
  if (!consumed.ok || !consumed.value) return null;
  return quote;
}

/**
 * Issue #73 P0-C TX1 hook for free-covered destinations: find the latest
 * still-quoted SUBSIDIZED row for this principal/cart/destination and consume
 * it exactly once. Returns null when none exists (plain free Rp0, manual
 * fulfillment - the historic behavior; historic orders are never backfilled).
 */
export async function consumeSubsidizedFreeQuote(
  repos: Pick<TransactionalRepositories, "shippingQuotes">,
  input: { principalKey: string; cartHash: string; destinationHash: string; orderId: string; now: string },
): Promise<ShippingQuoteRecord | null> {
  if (!repos.shippingQuotes) return null;
  const usable = await repos.shippingQuotes.listUsable({ principalKey: input.principalKey, cartHash: input.cartHash, destinationHash: input.destinationHash, now: input.now });
  if (!usable.ok) return null;
  const subsidized = usable.value.filter((quote) => quote.subsidyAmountIdr > 0)[0];
  if (!subsidized) return null;
  const consumed = await repos.shippingQuotes.consume(subsidized.id, input.orderId, input.now);
  if (!consumed.ok || !consumed.value) return null;
  return subsidized;
}

/** Rp0 customer charge with the merchant-subsidized courier identity snapshotted. */
export function subsidizedOrderShipping(quote: ShippingQuoteRecord): OrderShipping {
  return {
    policy: "free_promotional",
    amount: 0,
    reason: `Merchant-subsidized courier ${quote.courierCompany} ${quote.courierServiceCode}`,
    quoteId: quote.id,
    courierCompany: quote.courierCompany,
    courierServiceCode: quote.courierServiceCode,
    ...(quote.courierServiceName ? { courierServiceName: quote.courierServiceName } : {}),
    deliveryType: quote.deliveryType,
    providerAmountIdr: quote.providerAmountIdr,
    subsidyAmountIdr: quote.subsidyAmountIdr,
    taxAmountIdr: 0,
    taxPolicyVersion: quote.taxPolicyVersion,
  };
}

/** Snapshot a consumed quote onto the order (immutable once written). */
export function courierOrderShipping(quote: ShippingQuoteRecord): OrderShipping {
  return {
    policy: "courier",
    amount: quote.offeredAmountIdr,
    quoteId: quote.id,
    courierCompany: quote.courierCompany,
    courierServiceCode: quote.courierServiceCode,
    ...(quote.courierServiceName ? { courierServiceName: quote.courierServiceName } : {}),
    deliveryType: quote.deliveryType,
    providerAmountIdr: quote.providerAmountIdr,
    subsidyAmountIdr: quote.subsidyAmountIdr,
    taxAmountIdr: quote.taxAmountIdr,
    taxPolicyVersion: quote.taxPolicyVersion,
  };
}
