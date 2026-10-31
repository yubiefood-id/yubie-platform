# ADR-014 — Biteship-first shipment execution for Yubie

Status: **PROPOSED / NOT DEPLOYED** · 2026-11-01 · Baseline main `f38455d5402ab752d6393fb6c8762d3bb9ec7a06`

## Decision, constraints, and current evidence

**Choose Biteship Starter as the first carrier aggregator**. It has no monthly subscription fee at the announced 2026-11-02 tier, but Rates/Tracking/Maps API calls and actual courier shipping cost are NOT free. Starter: 100 shipments/month, up to 3 active couriers and 2 origins (check account plan and enforcement dates before launch). Order API starts at no extra API charge, dependent on shipping fees. The second adapter may be KiriminAja later; do not implement it now. Do not contract direct GoSend API for MVP.

Source: https://help.biteship.com/hc/en-us/articles/62769479830553-Understanding-Biteship-s-New-Subscription-Plans-and-Migration-Process
API: https://biteship.com/en/docs/api/orders/create
Webhook: https://help.biteship.com/hc/en-us/articles/58382023618329-Complete-Guide-to-Understanding-Biteship-Webhooks
Sandbox: https://help.biteship.com/hc/en-us/articles/58597705576985-How-to-Simulate-Test-Orders-as-Delivered-or-Cancelled-in-Biteship

**Source baseline observations, not claimed running-state observations:**
- `packages/application/src/use-cases/checkout-quote.ts` and `packages/persistence/src/repositories/shipping-policy-repository.ts`: city-scoped approved `free_promotional` shipping, zero customer shipping price; no dynamic courier rate integration.
- `apps/web/components/checkout/checkout-view.tsx`: free-shipping coverage chips, quote session through existing same-origin proxy and first-party payment.
- `packages/domain/src/orders.ts`: order totals already include `shippingAmount` and `taxAmount`, with shipping type restricted to `free_promotional`.
- `apps/admin/ui/operations.tsx`, `packages/domain/src/operations.ts`, `packages/persistence/src/repositories/operations-repository.ts`: staff RBAC, QC, packing > packed > manually entered carrier/waybill > delivered. Extend; never bypass existing checks.
- `apps/worker/src/index.ts`: pg-boss plus durable jobs/payment reconciliation; reuse its runtime and existing database/outbox conventions.
- Deployed state is NOT established by repo; owner reports that paid checkout and operator inventory/QC are working. Compare live source SHA, image digests, database migrations, staff role readiness and payment configuration read-only BEFORE any change. Do not 'fix' live payment assumptions from older documents.

**Goal:** no staff courier-app booking. Owner/staff physically packs and hands over goods at verified pickup origin; Biteship API arranges pickup, AWB and tracking. Fully unattended physical pick-and-pack would require 3PL/warehouse outsourcing and is OUT OF SCOPE.

## Boundaries and architecture

Retain modular monolith and PostgreSQL authority. Extend `packages/domain` (shipping state/contracts), `packages/application` (use cases and provider-neutral ports), `packages/integrations/src/biteship` (HTTP adapter), `packages/persistence` (append-only shipment and finance events), `apps/api` (quote/webhook/staff routes), `apps/worker` (booking + reconciliation + tracking), `apps/web` (delivery options) and `apps/admin` (pack/dispatch exception view). Do NOT add a separate shipping microservice, switch PSP, or let Biteship become inventory/payment source-of-truth.

Flow:
1. Owner approves warehouse pickup address (full, postal, coordinate for instant, contact phone, handoff hours), business courier rules, eligible SKUs, packaging mass/dimensions, QC and shelf-life constraints, cost owner, tax applicability/PKP status and insurance policy.
2. After customer enters delivery contact/address and cart, server computes physical package(s) from SKU package profiles (multipacks use existing component SKU conversion), verifies sellable lots and delivery eligibility. Do NOT send network calls while holding a database lock/transaction.
3. Request Rates API server-side, allow only **pickup** collection methods supported by live courier; allow instant when both coordinates valid. Store bounded quote with immutable cart hash, destination hash, origin, parcel dimensions, service, raw quoted provider cost, merchant subsidy/fee snapshot and expiry. Never trust browser-supplied IDR totals or service code.
4. Customer chooses option; backend revalidates quote identity/expiry/availability and calculates exact immutable IDR totals including any legally approved tax policy, insurance and discount. Extend existing TX1 reservation + PSP session logic while preserving payment idempotency and ambiguous outcomes. A payment session cannot be created with a stale/changed quote; return a re-quote prompt.
5. Only an authoritative iPaymu succeeded transaction (not return URL) makes fulfillment eligible. An order with refund/financial exception/recall/QC hold remains ineligible.
6. Staff confirms picking and **packed/ready_for_pickup**, with lot evidence and package weight/dimensions. Instant dispatch happens only now. Standard courier uses explicit pickup window/cutoff policies and capabilities; never assume a date supported by every courier.
7. Worker atomically leases shipment and persists unique deterministic provider `reference_id` (per order/package/version) and dispatch intent BEFORE calling `POST /v1/orders`. Never blindly retry timeout/5xx/unknown booking; perform vendor reconciliation by stored provider ID or conflict reference. If safe lookup-by-reference is unsupported, hold in `booking_unknown` for human resolution. One physical package -> max one live booking unless a verified cancellation/return transition authorizes replacement.
8. Store provider order ID, waybill/tracking, courier and actual service cost. On courier `picked`, transition existing paid/processing order to shipped using server-authorized operation (not simulated staff mark). On `delivered`, mark completed only after verified carrier state and business policy, not when label is created.
9. Receive `order.status`, `order.price` and `order.waybill_id` webhooks through HTTPS. Biteship allows configurable secret HTTP headers; compare secrets constant-time, strictly validate body bounds and schema, persist inbox + audit before 2xx. Use authenticated Biteship GET order to verify high-impact state where needed; process idempotently and tolerate duplicates/out-of-order statuses. **Do not invent an HMAC signature**. No PII in logs.
10. If courier unavailable, package lost, price changed or return initiated, create exception for fulfillment/Finance. Do not silently choose a more expensive alternative or charge customer again. Keep customer notifications honest.

## Data additions (proposed, not an instruction to overwrite tables)

- `shipping_origins`: approved origin and contact, coordinates, hours, pickup policy, active version; private PII server-side.
- `sku_shipping_profiles`: approved package dimensions/weights (gram/cm), packaging, handling requirements, effective dates/version.
- `shipping_quotes`: id, customer/session binding, cart/address/cart weight digest, provider service ID, origin/profile snapshot, offered IDR, provider IDR, subsidy/insurance/tax policy version, valid_until; no plaintext secret.
- `shipments`: order FK, package index, immutable reference_id unique, state, provider order ID unique nullable, courier/type, waybill, quote link, lifecycle timestamps, optimistic version, actual cost, currency.
- `shipment_items`: shipment FK, order line FK, quantity, allocated lot IDs if permitted by privacy boundary.
- `shipment_provider_inbox`: deduplication key, event hash, minimum bounded payload, status, received_at; choose retention and purge policy.
- `shipment_finance_events` / immutable cost ledger: quoted shipping, charged shipping, actual shipping, insurance, carrier adjustment, merchant subsidy, fee/tax treatments; reconciliation pointers.
- `shipment_dispatch_outbox`: pending/leased/unknown/complete/dead with attempts and last error, or reuse proven outbox system without duplicate processing.
- Preserve older `free_promotional` shipping records and existing already-paid orders; migrations must be additive with expand/contract compatibility.

## Finances, tax, and policy

Three distinct monetary concepts: (A) customer-facing shipping charge included in iPaymu grand total, (B) actual Biteship charge to Yubie's courier wallet/invoice, (C) Yubie tax liability and shipping-related tax treatment. Never equate them. No hardcoded 11%/12% VAT; derive from **owner-and-accountant-approved, effective-dated tax rules** and verified PKP/business classification, product tax category, included/excluded presentation and shipping pass-through classification. Non-PKP sellers must not issue fictitious VAT invoices. Preserve original quote and recorded tax breakdown for audit. A carrier's own tax lines do not automatically become Yubie's sales VAT. A real invoice/faktur pajak workflow must be approved separately; a checkout receipt is not automatically an official tax invoice.

`customer_total = products - approved_discount + approved_customer_shipping + approved_applicable_tax + approved_optional_charges`. Store integer IDR; define rounding and tax-inclusive policy in versioned Finance config. `gross_shipping_margin = customer_shipping - courier_charge - insurance - other shipping costs` is accounting, not payment authorization. Late carrier repricing is Yubie expense or review per approved terms, NOT a second charge. Require wallet/billing balance monitoring and alert before booking failures.

Food transport rules: distinguish shelf-stable flour/shake/mie from fresh/frozen Ppang. For fresh/frozen items, prohibit services without approved transit time, packaging and temperature handling evidence. FEFO, recalls and quarantine must block dispatch even after prior payment. Do not infer cold-chain capability from a generic instant courier.

## Security, reliability, and rollout gates

- Server-only Biteship test/live keys, webhook header secrets, origin contact details, and payment secrets. Separate sandbox/prod; block test token in production.
- SSRF-safe fixed Biteship base origin, bounded timeout/body limits; Zod validate responses. Token never reaches browser logs/caches.
- Anti-fraud: authorized staff roles, auditable write commands, strong idempotency on checkout, pack and dispatch, unique constraints and safe transitions. Dedicated webhook inbox. Rate limiting, backpressure, circuit breaker and dead-letter queue.
- Cost: rate API cache (short TTL, only for matching exact origin/address/parcel); no repeated call on every keystroke; budget alarms at Starter tier limits, do not promise booked shipment if no wallet balance.
- `SHIPPING_EXECUTION_MODE=disabled|shadow|sandbox|pilot|enabled`, independent of existing `YUBIE_CHECKOUT_ADMISSION`. `disabled` means no booking, not a change to already-paid orders. `shadow` logs mock quote comparisons, never creates real shipping orders.
- Rollout: migration -> API/worker disabled -> web display hidden -> sandbox E2E -> owner Biteship activation -> pilot approved small real orders -> operational reconciliation -> full enable. No production release or actual charge with no approval; preserve controlled-release SHA/digest and rollback procedure.
- Existing paid orders: no auto-dispatch backfill. If rollout begins with pending paid/unshipped orders, create explicit eligible migration review queue; do not silently book all historical orders.

## Acceptance matrix (all must have evidence)

1. Quotes by city/postal/coordinates; invalid or stale address; out-of-coverage/no-pickup courier and mixed SKU packaging.
2. Integrity of amount in UI quote = order snapshot = iPaymu payment intent; tamper price/shipping/tax/promo/order quantity rejected; quote expiry/requote.
3. Concurrent last-stock/FEFO/recall/QC holds/multipacks; no physical stock duplication.
4. Duplicate iPaymu paid webhook produces **at most one** shipment dispatch intent and Biteship booking.
5. Biteship response lost after accepting booking; unique reference prevents double-book; reconciliation or exception.
6. Sandbox: create delivered and cancelled orders with evidence for Biteship activation; simulated callbacks, replay, wrong secret, out-of-order status, waybill and price change.
7. Courier not found, insufficient wallet, missing pickup coordinates, cancel before/after pickup, return/damaged/lost package; correct exceptions.
8. Finance: non-PKP, approved PKP rule, tax-inclusive/exclusive, free-shipping subsidy, carrier repricing, refund; no made-up tax invoices.
9. Privacy/RBAC: staff-only admin shipment PII; customers can only read own shipment; no secrets/PII in logs/events.
10. CI: npm check, integration/Postgres and migration/restore, browser E2E, security scan, protected release artifact and approved one-order live pilot. Production smoke READ-ONLY except explicitly approved pilot.

## Operator-only blockers

Provision Biteship Starter merchant, **sandbox** token, webhook secret headers, approved real pickup address/contact/hours and actual packaging weights/dimensions, account activation proof (delivered+cancelled test order IDs), **production** token, top-up/billing arrangement, approved courier list, insurance policy, Finance/PKP/tax treatment and launch authorization. Do not ask to paste tokens or private physical home address into a public GitHub repo or chat. Use protected server secrets and private operator storage. If any required external proof is missing, complete mock/integration coding but mark live activation BLOCKED_EXTERNAL.

**This ADR is a design and a proposed plan, not implemented shipment execution, sandbox acceptance or deployed production.**
