# M5-D-RC Failure Drill Matrix

**Date:** 2026-09-20

## Code-level simulations (PASS when tests green)

| Drill | Mechanism | Expected |
|-------|-----------|----------|
| Duplicate inbound | Outbox fingerprint dedupe | Second enqueue returns duplicate status |
| HUMAN_ACTIVE suppression | `reply-delivery-handler` + session state | Outbox marked failed, no provider send |
| Unknown fallback | Deterministic engine | Second unknown → handoff |
| Flow restart | Postgres flow state reload | Buy path continues after reload |
| Invalid marketplace | Guard + registry lookup | No invented redirect URL |
| Sensitive fact missing | Product guard | Handoff, no fabricated claim |

## Live drills (BLOCKED_EXTERNAL)

| Drill | Procedure | Expected |
|-------|-----------|----------|
| A. Stop worker | Stop worker container/process | Inbound durable; queue grows; processes after restart |
| B. Stop Zammad | Stop Zammad temporarily | Outbound retries; no silent loss |
| C. Stop PostgreSQL | Stop Postgres | Readiness fails; no fake success |
| D. Full stack restart | Restart bot + worker + API | Flow state resumes |
| E. Invalid listing | Pause marketplace listing | Bot does not invent destination |
| F. Remove sensitive fact | Unapprove knowledge record | Bot hands to human |

## Observability during drills

Monitor without PII labels:

- `assistant_outbox_pending`, `assistant_outbox_failed`
- `support_provider_error_total`, `support_provider_timeout_total`
- `deterministic_handoff_total`, `deterministic_fallback_total`
- `human_takeover_total`

## Recovery notes

- Migration 0005 additive — do not DROP during incident
- Prefer HUMAN-FIRST emergency over uncontrolled legacy AI
