# ADR-013: iPaymu First-Party Direct Commerce (production)

**Status:** PROPOSED — owner sign-off pending (G0/G10 of the release checklist)
**Date:** 2026-10-24
**Supersedes (partially):** ADR-012 (provider selection), docs/production/05_ORDER_PAYMENT_INVENTORY_FULFILMENT.md (marketplace-first as the *primary* channel)

## Context

- The owner selected (2026-10-24): payment gateway **iPaymu**, **first-party Yubie checkout** with iPaymu hosted Redirect Payment, production domain **yubiefood.com**; WhatsApp bot deferred.
- Standing decisions conflicted: ADR-012 accepted first-party checkout with **Xendit**; doc-05 recorded marketplace-first D2C; the readiness ledger kept G0 `BLOCKED_OWNER` on the channel/PSP ADR.
- The iPaymu adapter and every validation layer were sandbox-only by design (`IPAYMU_ENV=sandbox` enforced in adapter, factory, config, and CI scanners).
- An iPaymu VA/API-key pair was pasted into an engineering chat on 2026-10-19; it is treated as compromised.

## Decision

1. **iPaymu is the production PSP** for first-party checkout via hosted Redirect Payment (`POST /api/v2/payment` → provider-hosted page → signed callback → durable inbox → authoritative reconciliation).
2. **Xendit stays implemented but inactive.** No Xendit live credentials, no automatic PSP failover; switching providers is an explicit reviewed change, never a runtime fallback.
3. **Marketplace channels become the rollback path** (ADR-004 posture), not the primary channel.
4. **Environment selection is explicit and origin-bound:**
   - `IPAYMU_ENV=sandbox` → exact origin `https://sandbox.ipaymu.com`
   - `IPAYMU_ENV=production` → exact origin `https://my.ipaymu.com`, and **requires `YUBIE_ENV=production`**
   - Never inferred from a missing variable; cross-env credentials/origins are rejected at adapter, factory, config, and redirect-allowlist layers; CI scanners ban production literals outside the reviewed allowlist files.
5. **Web commerce runs under `DIRECT_COMMERCE_PRODUCTION`** (public customer routes on; static catalog export impossible under it). Launch profile and PSP activation are independent gates: the profile does NOT enable live payments — `COMMERCE_PROVIDER` + `IPAYMU_ENV` + credentials do.
6. **WhatsApp bot deferred:** production worker runs `SUPPORT_PROVIDER=disabled`; support queues dormant; payment reconciliation independent (see 2026-10-24/WHATSAPP_DEFERRED.md).

## Activation gates (all required before `FULL_COMMERCE_LIVE`)

1. Rotated iPaymu **sandbox** credentials injected into the protected `sandbox` GitHub environment; 10-step sandbox matrix PASS with receipts (runbook: docs/production/runbooks/ipaymu-sandbox-e2e.md).
2. Written iPaymu answers on: cancel-by-SessionID, lookup by referenceId/SessionID, referenceId reuse during an outstanding session, create-timeout discovery, callback timestamp authentication/clock skew, JSON-vs-form callback normalization.
3. Merchant account activated for production (KYC, static outbound IP validation, domain validation, published terms/privacy/refund policies).
4. **Rotated production VA/API key** in the production secret store (the 2026-10-19 pair is burned).
5. Refund path decided: until an API refund contract is confirmed in writing, refunds are a **manual merchant-dashboard procedure** owned by Finance with dual approval and audit trail — never labeled as automated.
6. Finance + release-owner sign-off on the exact release manifest (G10).

## Consequences

- `COMMERCE_PROVIDER=preview` remains the production default until gate 1–6 pass; checkout renders honestly in preview mode instead of pretending to be live.
- ADR-012's Xendit-first selection is superseded for production; its topology (Worker web + VPS API + PaymentProviderPort) carries over unchanged.
- doc-05's marketplace-first posture is retained only as the rollback channel.
- Live activation is a reviewed environment change (separate from any code deploy); no code path can flip it by accident.
