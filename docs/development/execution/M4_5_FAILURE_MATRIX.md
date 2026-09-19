# M4.5 Failure Matrix

**Date:** 2026-09-20  
**Status:** CODE_DEFINED — LIVE_MATRIX PENDING

## Outbound delivery (`support.reply`)

| Case | Expected outbox status | Retry | Live tested |
|------|------------------------|-------|-------------|
| 200/201 success | `delivered` | No | Pending |
| 400 invalid | `retry` | Yes | Pending |
| 401 bad token | `retry` | Yes | Pending |
| 403 forbidden | `retry` | Yes | Pending |
| 404 ticket gone | `retry` | Yes | Pending |
| 429 rate limit | `retry` | Yes | Pending |
| 500 provider error | `retry` | Yes | Pending |
| Connection refused | `retry` | Yes | Pending |
| DNS failure | `retry` | Yes | Pending |
| Timeout before send | `ambiguous` | Reconcile first | Pending |
| Timeout after possible commit | `ambiguous` | Reconcile first | Pending |
| Human takeover (local) | `failed` human_takeover | No | Unit PASS |
| Human takeover (provider) | `failed` | No | Pending |

## Reconciliation

| Scenario | Expected | Live tested |
|----------|----------|-------------|
| Missed webhook | Cursor catch-up via `listThreadsUpdatedSince` | Pending |
| Bot downtime | Inbox replay + reconcile | Pending |
| Worker downtime | Outbox resume | Pending |
| Human state drift | `HUMAN_ACTIVE` sync | Pending |
| Ticket closed while queued | Delivery guard / failed | Pending |

## Chaos / restart

| Component | Expected | Live tested |
|-----------|----------|-------------|
| apps/bot | No message loss; dedupe holds | Pending |
| apps/worker | Outbox resumes | Pending |
| Postgres | Transaction durability | Pending |
| Zammad Rails | Webhook retry from Zammad | Pending |
| Redis / ES | Degraded search; app recovers | Pending |

## Intent routing (design)

| Intent | Expected route | Live tested |
|--------|----------------|-------------|
| PRODUCT_INFO | Bot (GREEN) or human per mode | Pending |
| FOOD_SAFETY | Food Safety group handoff | Pending |
| B2B_INTRO | Sales / Partnership handoff | Pending |
| EXPLICIT_HUMAN | Human handoff | Pending |
| PROMPT_INJECTION | Handoff / no reply | Unit PASS |
