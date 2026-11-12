# WA-05 — Approved Outbound B2B Template Gateway Receipt

**Date (UTC):** 2026-11-11 · **Branch:** `feat/whatsapp-trimode-wa00-wa07` · **Base:** WA-04 commit `f469230`

## Stage states

| Stage | State |
| --- | --- |
| SOURCE_AUDITED | PASS |
| LOCAL_TESTS_GREEN | PASS — worker 67/67 (Fake transport only; the Meta transport is never called in tests) |
| REAL PROVIDER (Meta template approval + send) | **BLOCKED_EXTERNAL** — no WABA/test number, no approved templates, no credentials (owner + Meta Business admin) |
| OWNER_APPROVED / PRODUCTION_ENABLED | NOT REQUESTED — runtime key `outbound_whatsapp` defaults `{enabled:false, dailyContactCap:1}`; the entire path no-ops until an audited operator flips it |

## What changed

- **Migration 0032** (`0032_outbound_templates.sql`): `outbound_templates` (name+version unique, draft/approved/retired with approver), `outbound_drafts` (template + purpose `b2b_followup` + b2b contact + variables + **immutable content_hash** + approval with **mandatory expiry** + per-draft cost cap), `outbound_sends` (one per draft — idempotency anchor, provider message id, state machine pending/dispatched/delivered/failed/ambiguous/cancelled, cost, bounded attempts). Additive; rollback = drop 3 tables.
- **Transport port** (`packages/application/src/ports/outbound-template-transport.ts`): provider-neutral send + receipt-status. Implementations (`packages/integrations/src/outbound/`): `FakeOutboundTransport` (tests), `MetaCloudApiTemplateTransport` (Cloud API messages endpoint, timeout-bounded, 5xx → AMBIGUOUS by design), `createOutboundTransportFromEnv` **fail-closed default** (no `OUTBOUND_WHATSAPP_PROVIDER` + credentials → `FailClosedOutboundTransport` that can never send).
- **Dispatch worker** (`outbound.whatsapp` queue, every minute): no-ops while the runtime switch is off; claims due approved drafts (raw-SQL `FOR UPDATE OF ... SKIP LOCKED` with SQL-level rechecks: template approved, approval unexpired, no in-flight/ambiguous send, per-contact 24h frequency cap) and then rechecks in-handler immediately before the transport call: **consent revoke precedence** (latest `consent_ledger` action per whatsapp subject wins), template status, expiry, cost cap. Outcomes: ok → `dispatched` + provider id + cost; TIMEOUT/AMBIGUOUS → `ambiguous` reconciled against receipts, **never resent blindly**; hard validation errors or ≥5 attempts → `failed`; receipts resolve dispatched/ambiguous → delivered/failed with a 24h unresolved window.
- **Ops**: `POST /ops/whatsapp/outbound/draft` (schema-validated; records content hash; `requiresApproval`, `implicitSend:false`), `POST /ops/whatsapp/outbound/:id/approve` (binds operator to the exact content hash + expiry hours; wrong hash → 409), and outbound health (`enabled`, state counts, month cost) in `GET /ops/whatsapp/status`.
- Consent purpose is the new scoped `b2b_followup` (append-only ledger; `b2b_contact` web-form consent is NOT treated as outbound messaging consent, and revocation always wins).

## Test evidence

~~~
node --test apps/worker/tests/wa05-outbound.test.mjs   # 5 pass (DB)
~~~
- Default-off: approved+consented draft + enabled… disabled gateway → zero transport calls, no send row.
- D15: missing consent → draft cancelled (`consent_none`); granted-then-revoked → `consent_revoked`, zero sends.
- Missing template approval / expired approval → never claimed, never sent (D16-adjacent).
- Happy path: one send with idempotency key = draft id; second pass reconciles to `delivered`; transport called exactly once.
- Ambiguous TIMEOUT: send goes `ambiguous`, holds, and is **never blindly resent**; bounded unresolved window fails closed.

## Rollback

Code revert + drop the 3 additive tables; runtime disable = `outbound_whatsapp {enabled:false}` (or leave untouched — default). No Zammad channel interaction exists to undo.

## Next safe milestone

WA-06 (coexistence decision record, no code) then WA-07 (full gate + PR).
