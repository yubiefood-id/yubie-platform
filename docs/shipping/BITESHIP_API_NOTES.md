# Biteship API notes — pinned 2026-11-01 (Phase 0)

Payload reference pinned from official documentation on 2026-11-01 for contract
fixtures. Re-verify before sandbox acceptance; never hardcode plan limits,
costs, or dates in business logic (ADR-014). No secrets here.

Sources: `biteship.com/en/docs/api/*` (rates/retrieve, orders/create,
trackings/retrieve, webhook/overview) and
`help.biteship.com/hc/en-us/articles/58597705576985` (sandbox simulation),
`.../58382023618329` (webhook guide).

## Transport & auth

- Base origin: `https://api.biteship.com` (path prefix `/v1`). Fixed origin in
  adapter; no arbitrary base URL from config (SSRF rule).
- Auth: `Authorization: Bearer <server-side API key>`.
- Error body: `{ success:false, error:{ code, message, details? } }`.
  Reference-id conflict: code `40002060`, `details` names the conflicting
  `order_id`, `waybill_id`, `reference_id` — this is the recovery lookup we can
  use when a create outcome is ambiguous.

## POST /v1/rates/couriers

Request: `origin_postal_code | origin_latitude/origin_longitude |
origin_area_id` (one-of; coordinates required for instant), same for
`destination_*`; `couriers` string (`company:service,company:service`);
`courier_insurance` number; `items[]` with `name, description, category
(food_and_drink, frozen_food, ...), sku, value, quantity, weight` (grams) and
optional `height/length/width` (cm).

Response `pricing[]`: `company, courier_code, courier_name,
courier_service_code, courier_service_name, description,
available_collection_method` (`["pickup","drop_off"]` — **filter to pickup**),
`available_for_cash_on_delivery, available_for_proof_of_delivery,
available_for_instant_waybill_id, available_for_insurance, currency,
duration` (e.g. "2 - 3 days"), `shipment_duration_range,
shipment_duration_unit, service_type, shipping_type, shipping_fee,
shipping_fee_discount, shipping_fee_surcharge, insurance_fee,
cash_on_delivery_fee, price` (final), `tax_lines, type` (service tier code
like `ctc`, `reg`, `best`, `deno`).

## POST /v1/orders (booking)

Required: `origin_contact_name/phone/address`, `destination_contact_name/
phone/address`, `courier_company`, `courier_type`, `delivery_type`
(`now` | `scheduled` + `delivery_date` YYYY-MM-DD + `delivery_time` HH:mm),
`items[]` (same shape as rates; category `food_and_drink`/`frozen_food`).
Optional: `origin_collection_method` (`pickup` default — set explicitly),
`origin/destination_postal_code|coordinate|area_id` (one-of; **coordinates
required for instant**), `courier_insurance`, `reference_id` (**unique per
order**), `order_note`, `metadata`, `tags`.

Response: `id` (provider order id), `draft_order_id, reference_id, items,
price, currency, tax_lines, status` (e.g. `confirmed`), `courier{ tracking_id,
waybill_id, company, type, insurance{amount,fee}, link, routing_code, driver_*
}` (driver null at booking), `destination{cash_on_delivery, proof_of_delivery}`,
`delivery{datetime, type, distance, distance_unit}`.

Staging-mode orders behave like live ones but no physical pickup happens.

## Order status values (Trackings docs + webhook FAQ)

`pending, confirmed, being_picked_up, picked, in_transit, delivered,
cancelled, lost, returned, cancelled_by_admin, cancelled_by_shipper, draft`.

Mapping to our neutral Shipment status lives in the adapter, not the domain.

## GET /v1/trackings/{courier}/{waybill}

→ `{ success, message, object, id, courier, waybill_id, marks,
history[{ id, status, updated_at, note, city }] }`. Supported couriers incl.
JNE, J&T, SiCepat, Lion Parcel, AnterAja, SAP, Nex Golang, IDL, Paxel, GoSend,
Grab, Lalamove, Borzo, Deliverry, JasaOngkir, MILE, NSP, Royal,
WestBorneo, Padala, First, Star, Xpedit, Karunia, Sonya, Rapido, AlfaTime,
SiCepat Cargo, JNE Trucking.

## Webhooks

- Events: `order.status`, `order.waybill_id`, `order.price`.
- Delivery: HTTPS POST JSON. Security model: **merchant-configured static
  "Headers Signature Key + Secret" header pair** (dashboard). No HMAC —
  compare constant-time; do not invent a signature scheme (ADR-014 §step 9).
- `order.status` example fields: `event, courier_tracking_id,
  courier_waybill_id, courier_company, courier_type, courier_driver_name,
  courier_driver_phone, courier_driver_photo_url,
  courier_driver_plate_number, courier_link, order_id, order_price, status`.
- `order.price`: `event, order_id, courier_tracking_id, courier_waybill_id,
  price, shipping_fee` (docs example misspells `shippment_fee` — parse
  tolerantly), `cash_on_delivery_fee, proof_of_delivery_fee, status`.
- `order.waybill_id`: `event, order_id, courier_tracking_id,
  courier_waybill_id, status`.
- Payloads key on `order_id` (provider id); `reference_id` may be absent —
  authoritative GET closes disputes.

## Sandbox activation (owner/operator steps — BLOCKED_EXTERNAL until account exists)

Before the production key is activated, Biteship requires proof the system
handles status changes: create a test order via API, **simulate one order to
DELIVERED and one to CANCELLED** (order detail → Simulate), submit evidence
(order ids) to Biteship support for production activation. Production key is
unusable until approved.

## Open items to verify at activation time (never assume)

- Starter-plan quotas (announced: 100 shipments/month, 3 active couriers, 2
  origins; help-center article is login-gated) — owner checks dashboard.
- Wallet/billing balance mechanics and top-up lead time.
- Exact webhook header key configured in the merchant dashboard.


## Live sandbox verification — 2026-11-02 (owner-provided test key, never committed)

Proven against `https://api.biteship.com` (account "yubiefood", test key):
- **`couriers` is REQUIRED** on `POST /v1/rates/couriers` for this account:
  omitted/empty → error `40001002`. Wired as `BITESHIP_COURIERS` (required
  for any active mode).
- **`courier_service_code` is the per-company TIER code** (`reg`, `ez`,
  `best`, `jtr`), NOT globally unique — the service identity is
  (company, code). Booking `courier_type` = that tier code. Our quotes store
  the pair and booking sends `courier_company` + `courier_type` accordingly.
- Entitled couriers returning rates on the Sumedang→Bandung lane: jne
  (reg 9000 / jtr 60000), jnt (ez 8000), sicepat (best 13000), lion
  (reg_pack 10500), sap (reg 12000). All pickup-capable except none excluded;
  instant couriers absent without coordinates (as expected).
- Order lifecycle receipt: create → `confirmed` (price 9000, waybill
  `WYB-1793558546373`, tracking id + dev tracking link), retrieve →
  confirmed, `POST /v1/orders/{id}/cancel` with empty body → `cancelled`
  (default reason), retrieve confirms `cancelled`.
  Evidence order id (safe to store): `6ae788129a30646864504949` (cancelled).
- `GET /v1/trackings/{courier}/{waybill}` returns `success:false` in the
  sandbox environment — live tracking needs the production environment.
- Biteship activation requires one DELIVERED + one CANCELLED simulated
  order: the cancel half is proven via API above; the Delivered simulation
  is a dashboard action (owner, one click) per Biteship's help guide.
Reproducible via the manual workflow `.github/workflows/biteship-sandbox-probe.yml`
(environment `biteship-sandbox`, secret `BITESHIP_SANDBOX_API_KEY`).
