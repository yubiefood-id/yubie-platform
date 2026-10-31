# Codex execution brief — Yubie Biteship shipping from audited main to controlled production

**This is an actionable implementation brief, NOT a claim of deployed code.**
Baseline observed 2026-11-01: main `f38455d5402ab752d6393fb6c8762d3bb9ec7a06`. User reports that payment and operator inventory/QC are already live. Trust runtime read-only evidence over stale documentation; DO NOT reset payment configuration or repeat historical deployment assumptions. First read `docs/architecture/ADR-014_BITESHIP_SHIPPING_EXECUTION.md` and existing production release runbooks.

## Your role and acceptance

Act as principal full-stack/backend engineer, software architect, DevSecOps/release engineer, SRE, payments and inventory consistency reviewer. Deliver a fully tested Biteship-first integrated shipping execution feature. Do not report success from mocks alone. Never deploy secrets or trigger a real courier/payment without protected approved live pilot procedures. If credentials or production access are missing, complete safe code/tests/PRs and give narrow exact BLOCKED_EXTERNAL / BLOCKED_OPERATOR items; never invent approvals.

**Definition of done:** A customer can get accurate eligible delivery choices and server-calculated totals, pay via existing iPaymu, operator can complete physical packing/QC without opening courier apps, and Yubie automatically dispatches an eligible prepared package via Biteship, receives waybill/status/price callbacks, displays customer tracking, reconciles shipping expenses, and handles failure/returns. The system never books twice or ships unpaid/held/expired food.

## Phase 0 — read-only baseline (must do first)

1. In fresh isolated worktree fetch `main` and record SHA/status. Audit code, env names (NAMES ONLY), current DB schema/migrations, tests, post-31-Oct PRs and provider ports. Run baseline `npm ci`, `npm run check` and relevant Playwright/Postgres suites. Do not stomp dirty worktree.
2. Read live production via approved READ-ONLY telemetry only: `/healthz`, `/readyz`, source/version, worker, storefront, migration version, existing active payment kind and checkout admission, operator UI availability, health of post-pay reconciliation. Compare to main, note compatibility gap. Do NOT print env values/secrets/customer PII.
3. Build CODEMAP with exact entry points: quote handlers, checkout TX1/TX2, iPaymu verified settlement event and outbox, inventory allocation/QC/holds, admin fulfillment update, pg-boss worker, frontend checkout/address, release runner.
4. Read Biteship current API docs, exact payloads/error codes, account entitlements, webhook security and test activation. Confirm current reality of 100 shipment Starter limit, 3 couriers, two origins and per-request cost; never hardcode a date or cost in business logic.
5. Produce an evidence ledger: IMPLEMENTED, TESTED_MOCK, TESTED_SANDBOX, ACTIVATED_PROVIDER, DEPLOYED_DISABLED, DEPLOYED_LIVE, PILOT_PASSED; do not conflate.

## Phase 1 — contracts and design

Write an ADR/contract tests before changing core payment logic. Add provider-neutral `ShippingProviderPort` with `getRates, createBooking, getOrder, cancelOrder, getTracking`, plus optional capability-checked label retrieval. Biteship adapter uses fixed allowed origin and server token, bounded timeouts/responses, rate limits and predictable error taxonomy. Check Biteship `reference_id` uniqueness semantics and safe recovery; do not assume a documented idempotency header or lookup-by-reference if absent.

Record approved shipping origins and per-physical-SKU weight/dimensions and storage/food constraints. This may need owner input. Multipack quantities must share actual existing components as currently modeled. For Ppang fresh/frozen, block unsupported logistics until food QA approves packaging/transit temperature/time; allow shelf-stable items only when evidenced.

Model `Shipment` separate from `Order` and versioned `ShippingQuote`: statuses `not_ready, ready, booking_pending, booking_unknown, booked, pickup_pending, picked, in_transit, delivered, cancelled, failed, returned, held`. Enforce transitions. `booked` and `pickup_pending` do NOT imply the package physically shipped; order `shipped` requires provider pickup `picked` or verified evidence.

## Phase 2 — additive schema and domain implementation

Create additive, rollback-compatible migrations for shipping origins, SKU logistics, quote snapshots, shipments, shipment lines/lots, dispatch intents, webhook inbox and immutable shipping finance ledger. Add unique constraints for (order, package, dispatch generation), provider reference, provider order ID, event id/hash; create reconciliation index and capped retention policy. Do not overwrite `orders.shipping`, payments, historical inventory or existing free-promotional policy.

Persist an immutable signed-or-server-owned quote selection binding to actor/cart/delivery origin/address/cart version/parcel profile/service/expiry. Quote server-side before PSP creation; no HTTP inside PG transaction. Extend order payment totals with policy-driven integer IDR shipping and tax, with existing exact amount invariants. Preserve `free_promotional` only for existing expressly approved coverage; dynamic paid shipping MUST be a separate approved shipping rule and no silent nationwide free fallback.

Tax is NOT a static 11% or 12% multiplication. Ask Finance to supply PKP status and product/shipping tax policy effective date and invoice treatment. Implement configurable non-PKP/PKP policies and tax-included/excluded semantics; no fake VAT invoice. Keep PSP collected shipping, courier incurred shipping, insured amount, fee and subsidy distinct.

## Phase 3 — checkout/UI

Add server-only Biteship rates endpoint behind existing same-origin Cloudflare proxy; input Zod validation, address/lat-long checks, origin selection and TTL. Introduce allowed services dynamically: start JNE regular plus a live available instant pickup service (GoSend when returned by Rates and permitted), max three active couriers on Starter. Do not invent pricing, delivery ETAs or service availability. Bound cost calls with debounce/cache per exact approved parcel and address; cache must not authorize payment if expired.

Change checkout UX to display couriers, customer shipping amount, optional insurance and approved tax lines, accurate total, unavailable states, re-quote on address/cart changes and customer tracking. No route path hardcoded until CODEMAP audited; preserve mobile and guest checkout recovery plus promo YUBIE15 behavior.

## Phase 4 — fulfillment, booking, tracking

Reuse staff OIDC/RBAC, existing QC/packing workflow and pg-boss; extend operations to present packing labels, weight/parcel review, ready_for_pickup, waybill/driver details, courier failures and reschedule. Pickup address may be owner home but must be private and explicitly approved. Never ask operator to open JNE, Lalamove or GoSend app for normal dispatch.

On authoritative payment paid, create fulfillment eligibility and work order, not immediate instant booking. After pack/QA `ready`, emit transactional outbox. Worker locks shipment, stores deterministic reference and dispatch intent, checks payment success and QC/recall/refund/holds/warehouse readiness **under transaction**, commits, and calls provider outside transaction. On unknown provider outcome freeze that shipment and reconcile by verified provider ID/reference where available; no blind retry. On insufficient balance or courier_not_found create supervised exception. Do not auto-substitute more expensive courier without customer policy/Finance authorization.

Biteship booking request `POST /v1/orders` includes contact, origin, destination, `courier_company`, `courier_type`, `delivery_type`, category `food_and_drink`, item value/weight/dimensions/qty and unique `reference_id`. For instant courier both coordinates required. Check provider supports pickup (`origin_collection_method=pickup`) and `scheduled` for selected courier, do not treat drop-off as meeting goal. Credentials and webhook secret only in backend secrets.

Implement HTTPS webhook receiving `order.status`, `order.price`, `order.waybill_id`; Biteship documentation supports configurable static secret headers: validate exact expected secret in constant time; do not invent HMAC. Persist authenticated minimal inbox before 2xx, process with idempotency, monotonic state rules and authoritative GET for critical disputes. Booking success alone is not `shipped`, only confirmed pickup. Price-change webhook creates Finance delta; preserve paid customer total and never silently auto-charge.

## Phase 5 — QA / security / release

Tests must prove:
- unit contract of SKU grams, volume and mixed-order parcelization, tax policy non-PKP/PKP, display totals incl. discount;
- quote expiry/stale-address/cart mutation/tampering, uncovered destination and no pickup availability;
- concurrent checkout + last-unit, payment webhook duplication, QC rejection, expiry/recall while packing;
- 100 duplicate paid callbacks + 100 repeated dispatch events => at most 1 courier booking per package;
- network failure before/after provider accept and duplicate reference response => no second paid shipment; unknown state goes to reconciler/manual queue;
- invalid/missing webhook header, replay, out-of-order transitions, waybill update, price-change, callback arrival before create DB attach;
- courier not found, zero Biteship balance, 429/5xx, worker restart, pg failover, cancellation before/after pickup, lost package/return;
- staff RBAC/CSRF/account IDOR, PII redaction, no secrets in artifacts;
- demo source code and real API payload contract fixtures, DB migration+restore rehearsal, checkout mobile/desktop Playwright.
Use existing `npm run check`, targeted workspace tests, required quality/persistence/security/browser/containers checks on merged SHA. Provide exact commands, outputs, versions and SHA/digest receipts.

**Provider sandbox acceptance:** obtain Biteship test key via private env. Create one test order simulated to DELIVERED and one CANCELLED, save safe order IDs as activation evidence (not tokens/PII); verify webhook, labels if entitled, quote, price/waybill events. Request Biteship production API activation (operator step). Production token not usable until Biteship approves.

**Release, no shortcuts:**
1. Implement in reviewable PRs: schema/domain, adapter & sandbox, checkout, worker & operations, tracking/finances, final E2E/runbooks. Push branches and open PRs; don't force-push protected main. Require approval and green checks.
2. Merge via protected main with proper reviews and signed evidence. Produce SHA-pinned images and frontend artifact following `docs/production/2026-10-26/CONTROLLED_RELEASE.md` and latest applicable runbook; verify first what runbook still applies to active production. Do not use old disabled-admission status to override owner's current paid commerce.
3. Deploy additive DB and backend with `SHIPPING_EXECUTION_MODE=disabled`. Health/readiness checks and preservation of iPaymu + ops + existing free-shipping journeys. No booking effect.
4. Enable `shadow` and verify diff/coverage/cost metrics without customer-visible side effects. Then `sandbox` isolated from production real orders; then `pilot` only with explicit Finance + Operations approval of real charge and courier pickup, bounded order count and wallet budget.
5. Enable paid shipping quote to customers only after partner live activation, relevant approved tax policy, pickup service verified at actual warehouse, packaging data, carrier balance and business acceptance. Keep feature flags separately reversible for quote and booking, preventing a paid but unfulfillable checkout.
6. Observe webhooks, booking latency, order count, cross-ledger reconciliation, courier cost delta, package exceptions and customer tracking. Escalation on anomalies; immediately disable NEW shipping writes if double booking, mismatch or fraud, but continue inbound webhooks and reconciliation. Roll back code only if schema compatible; reconcile actual bookings before rolling back workers.
7. Record actual deployed SHA, API/worker image digest, Cloudflare Worker version, migration version, provider activation and one approved physical pilot order's safe event milestones. NEVER claim PRODUCTION_READY based only on a green test.

## Deliverables / final handoff

- Architecture ADR (update with implementation differences), CODEMAP, DB schema and migration rollback plan.
- Source PRs and links, automated tests, security/privacy evidence and shipping API mock fixtures.
- Biteship account onboarding manual (test key, create order, two activation order IDs, live key, callback URL and secret header, wallet top-up), private operator checklist (no credentials/PII exposed).
- User journey screenshot/e2e receipts for checkout quotes and staff ready-to-pickup screen; webhook and waybill behavior.
- Finance reconciliation policy, tax decision record owner-approved, shipping pricing/subsidy/insurance policy and liability owner.
- Validated sandbox and gated pilot receipts, deploy/rollback receipts, residual risk + unresolved external blockers.
- Final truthful ledger: AUDITED, IMPLEMENTED, CI_GREEN, SANDBOX_PASSED, PROVIDER_ACTIVATED, PROD_DEPLOYED_DISABLED, LIVE_PILOT_PASSED, LIVE_ENABLED — with PASS only when there is direct evidence.

Always continue safe implementation/test work if external steps block activation. Do not request users paste API secrets, private home coordinates, or customer data in the repository or chat.
