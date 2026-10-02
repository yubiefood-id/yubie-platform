# ADR-012: First-Party Checkout via Xendit + Google Identity

Status: **Accepted** (implementation phase; Xendit TEST mode only until the
sandbox suite in this ADR passes). Supersedes the checkout scope of
[ADR-004_MARKETPLACE_WHATSAPP_FIRST.md](ADR-004_MARKETPLACE_WHATSAPP_FIRST.md)
while KEEPING marketplace links as a secondary purchase channel and rollback
path. ADR-002 (hosted payment pages, no stored card data) remains in force.

Date: 2026-10-02

## Context

Stakeholder decision (final): customers must be able to purchase and pay on
yubie.id. Payment provider: **Xendit**. Authentication: **Google Identity
Services** (sign-in only, no Drive/Calendar/Gmail scopes). The previous
marketplace-only posture made `/cart` and `/checkout` redirect stubs.

## Decision

1. **Runtime topology** — production web is the existing vinext Cloudflare
   Worker artifact; apps/api (VPS, behind `api.yubie.id`) owns Postgres,
   provider secrets, sessions, and webhooks. The web worker exposes thin
   same-origin `/api/*` proxy routes so the browser only ever talks to
   `yubie.id` (first-party cookies, no CORS). The Vercel static export stays
   a preview only — it cannot host sessions, checkout, or webhooks.
2. **Payment** — Xendit Payment Session (`session_type: PAY`, `country: ID`,
   `currency: IDR`, `mode: PAYMENT_LINK`, `capture_method: AUTOMATIC`) behind
   `PaymentProviderPort` in `@yubie/application`; the adapter
   (`@yubie/integrations`, plain fetch, no SDK) is the only Xendit-aware
   code. No direct card handling. Components see only
   `{checkoutId, paymentStatus, redirectUrl}`.
3. **Money authority** — the server re-prices every checkout line from the
   canonical domain catalog; browser-submitted totals are never read.
4. **State machine** — Order `draft → pending_payment → paid → processing →
   shipped → completed` (+ `cancelled` from pre-paid states); Payment
   `pending → succeeded | failed | expired | cancelled | refunded`.
   Transitions happen ONLY from the verified webhook or the explicit
   server-side provider poll. The success page renders success only for
   server-confirmed paid state — never from the browser redirect.
5. **Webhook** — `POST /v1/webhooks/xendit/payment-session` verifies
   `x-callback-token` (constant-time), then `event`, `reference_id`,
   `payment_session_id`, `business_id`, `currency`, and `amount` against the
   order; `payment_events` unique `dedupe_key` makes deliveries idempotent;
   state + audit + outbox commits are atomic per AGENTS.md §5.
6. **Auth** — GIS credential exchanged at `/v1/auth/google` after GIS
   double-submit CSRF (`g_csrf_token` cookie+body); ID tokens verified
   server-side (RS256 via Google JWKS, issuer, audience, expiry) with a
   zero-dependency verifier. `google_sub` is the stable identity; email/name
   are profile data. Sessions are Yubie-owned random tokens (SHA-256 hashes
   persisted), `HttpOnly; Secure; SameSite=Lax` on `yubie.id`. Google ID
   tokens are never session tokens. Login never blocks checkout (guest flow
   preserved).
7. **Secrets** — `XENDIT_SECRET_KEY`, `XENDIT_WEBHOOK_TOKEN`, `SESSION_SECRET`
   class values live only in apps/api env. `COMMERCE_PROVIDER=xendit` fails
   closed without `XENDIT_SECRET_KEY`. Nothing sensitive enters the web
   runtime or client bundles.

## Consequences

- New migrations `0006_auth.sql` (users, auth_sessions) and `0007_orders.sql`
  (orders, order_payments, payment_events) — expand-only.
- Rollback: `COMMERCE_PROVIDER` unset restores the preview checkout UI;
  marketplace links never removed.
- LIVE mode is prohibited until the sandbox suite passes: create / cancel /
  success / failed / expired; duplicate webhook; invalid token; amount
  mismatch; reference mismatch; double delivery; browser-success-before-
  webhook; webhook-before-browser-return (all covered by
  `packages/application/tests/commerce.test.mjs` and
  `apps/api/tests/api-commerce.test.mjs` against the port contract; the same
  matrix runs against Xendit TEST before live keys are granted).
