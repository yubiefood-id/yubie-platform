# M5-D-RC Live Staging Playbook (BLOCKED_EXTERNAL)

**Status:** Prepared — execute when Zammad + WhatsApp staging credentials available.

## Prerequisites

- [ ] `ZAMMAD_BASE_URL`, `ZAMMAD_API_TOKEN`, webhook secret/bearer configured
- [ ] Run `infrastructure/zammad/scripts/provision.mjs` and record real group IDs
- [ ] Set `ZAMMAD_GROUP_*`, `ZAMMAD_PRIORITY_HIGH` in staging env
- [ ] `BOT_ENGINE=deterministic`, `SUPPORT_PROVIDER=zammad`
- [ ] Approved WhatsApp test/staging number only

## Phase 8 — Zammad staging smoke

1. Inject test customer message via approved channel
2. Confirm bot webhook 200 + inbox row
3. Confirm worker processes job + outbox delivery
4. Capture thread ID + timestamps (no message body in report)

## Phase 9 — WhatsApp tests A–G

See [M5_D_RC_STAGING_REPORT.md](./M5_D_RC_STAGING_REPORT.md) matrix.

## Phase 10 — Human takeover

1. Customer: `admin`
2. Operator accepts in Customer Support group
3. Customer follow-up → verify zero bot articles
4. Race test with delayed worker job

## Phase 11 — Food safety

Synthetic: `produk terlihat berjamur` → Food Safety group + high priority.

## Phase 16 — Backup restore (staging DB only)

1. Backup Yubie Postgres including `conversation_flow_state`, `conversation_flow_events`, inbox/outbox, sessions
2. Restore to isolated instance
3. Verify flow state reload for test thread

## Evidence template

```text
axis: WHATSAPP_OUTBOUND
thread_id: <opaque>
timestamp: ISO8601
result: PASS|FAIL
notes: <no PII>
```
