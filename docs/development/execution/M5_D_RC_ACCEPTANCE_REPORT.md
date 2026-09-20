# M5-D-RC Acceptance Report

**Date:** 2026-09-20

## SHAs

| | SHA |
|--|-----|
| M5-D application | `796d923`..RC HEAD |
| Graphify baseline | post-RC `npm run graph:context` |

## Independent axis verdicts

| Axis | Verdict |
|------|---------|
| CODE | PASS |
| BUILD | PASS |
| GRAPHIFY | PASS (post semantic refresh) |
| MIGRATION_FRESH | PASS (with docker proof script) |
| MIGRATION_UPGRADE | PASS (with docker proof script) |
| FLOW_PERSISTENCE | PASS (integration tests when DATABASE_URL set) |
| ZERO_AI | PASS |
| ZAMMAD_PROVISIONING | PARTIAL — script emits IDs; live IDs unverified |
| ZAMMAD_STAGING | BLOCKED_EXTERNAL |
| WHATSAPP_INBOUND | BLOCKED_EXTERNAL |
| WHATSAPP_OUTBOUND | BLOCKED_EXTERNAL |
| CUSTOMER_SUPPORT_HANDOFF | BLOCKED_EXTERNAL (live) |
| SALES_HANDOFF | BLOCKED_EXTERNAL (live) |
| FOOD_SAFETY_HANDOFF | BLOCKED_EXTERNAL (live) |
| HUMAN_ACTIVE_SUPPRESSION | PASS (code); BLOCKED_EXTERNAL (live race) |
| DUPLICATE_SAFETY | PASS (outbox fingerprint tests) |
| RESTART_RECOVERY | PASS (flow reload tests) |
| BACKUP_RESTORE | BLOCKED_EXTERNAL |
| OBSERVABILITY | PASS (metrics defined; live scrape blocked) |
| SECURITY | PASS (code review) |
| ROLLBACK | PASS (documented) |
| CANARY_READY | PASS (stages documented) |
| PRODUCTION_READY | **NO** |
| PRODUCTION_ACTIVE | **NO** |

## Release blockers remaining

Live path not proven:

```
real WhatsApp → real Zammad → webhook → deterministic → outbox → WhatsApp
```

Live human takeover not proven:

```
HUMAN_ACTIVE → zero bot replies
```

## Canary rollout stages

| Stage | Scope | Status |
|-------|-------|--------|
| 0 | Local fixtures | PASS |
| 1 | Internal test identities | Pending credentials |
| 2 | WhatsApp staging number | BLOCKED_EXTERNAL |
| 3 | Small production cohort | Not started |
| 4 | Full deterministic rollout | Not started |

## Monitor during canary

- `deterministic_fallback_total`, `deterministic_handoff_total`
- `deterministic_handoff_food_safety_total`
- `human_takeover_total`, duplicate replies, queue lag
- Buy-flow completion rate

Correct routing over containment.

## Next milestone

M5-B2B (durable lead lifecycle + CRM sync) only after live M5-D-RC acceptance.
