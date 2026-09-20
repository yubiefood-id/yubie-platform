# M5-D-RC Staging Report

**Date:** 2026-09-20

## Migration proof

### Scenario A — Fresh database

Script: [`scripts/migration-proof-0005.sh`](../../../scripts/migration-proof-0005.sh)

Test: [`packages/persistence/tests/migration-0005.test.mjs`](../../../packages/persistence/tests/migration-0005.test.mjs)

Verifies:

- `conversation_flow_state` table + unique index on `(provider, provider_thread_id)`
- `conversation_flow_events` table + thread index
- Migrations 0001→0005 apply cleanly

### Scenario B — Upgrade from 0004

Same harness bootstraps schema through 0004, seeds `conversation_sessions`, applies 0005, asserts row preserved.

### Rollback policy

Migration 0005 is additive. Operational rollback ignores flow tables; no destructive DROP.

## Live staging axes

| Axis | Verdict | Notes |
|------|---------|-------|
| ZAMMAD_STAGING | BLOCKED_EXTERNAL | No staging credentials |
| WHATSAPP_INBOUND | BLOCKED_EXTERNAL | No test number |
| WHATSAPP_OUTBOUND | BLOCKED_EXTERNAL | No test number |
| CUSTOMER_SUPPORT_HANDOFF (live) | BLOCKED_EXTERNAL | Requires Zammad + WhatsApp |
| FOOD_SAFETY_HANDOFF (live) | BLOCKED_EXTERNAL | Requires Zammad groups |
| HUMAN_ACTIVE_SUPPRESSION (live) | BLOCKED_EXTERNAL | Requires operator workflow |
| BACKUP_RESTORE (live) | BLOCKED_EXTERNAL | Isolated restore drill pending |

## Prepared live test scripts (execute when unblocked)

### Phase 8 — Zammad round trip

1. Send synthetic customer article to staging WhatsApp/Zammad test identity
2. Verify `webhook_inbox` row + `assistant.process` job
3. Verify `assistant_outbox` reply + `support.reply` delivery
4. Confirm Zammad article visible to operator (redact PII in evidence)

### Phase 9 — WhatsApp A–G

| Test | Input | Expected |
|------|-------|----------|
| A | hello / menu | HOME menu |
| B | 1 → 1 → 1 | Flour → Shopee option |
| C | admin | CUSTOMER_SUPPORT handoff |
| D | saya punya alergi | health escalation, no advice |
| E | produk bau aneh | FOOD_SAFETY high priority |
| F | cafe 30 kg | B2B → SALES_PARTNERSHIP |
| G | two unknown inputs | second → handoff |

### Phase 10 — Human takeover

1. Customer sends `admin`
2. Operator accepts ticket → HUMAN_ACTIVE
3. Customer sends follow-up → bot reply count = 0
4. Race: queued bot job must not deliver after takeover

### Phase 11 — Food safety live

Synthetic message: `produk terlihat berjamur` → FOOD_SAFETY group + high priority + approved framing only.

## Evidence capture rules

- No credentials, tokens, phone numbers, or message bodies in reports
- Use conversation/thread IDs and timestamps only
