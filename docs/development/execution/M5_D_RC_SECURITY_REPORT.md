# M5-D-RC Security Report

**Date:** 2026-09-20  
**Scope:** Deterministic concierge production activation (code review)

## Summary

Targeted review of M5-D deterministic path and Zammad integration boundaries. No AI prompt-injection audit required; user text must not become privileged operations or PII telemetry.

| Area | Verdict |
|------|---------|
| Webhook authentication | PASS (code) |
| Replay / duplicate semantics | PASS (code) |
| Provider boundary | PASS |
| PII in logs/metrics | PASS (code audit) |
| Marketplace redirect safety | PASS (allowlist) |
| Human takeover guard | PASS (code) |
| Live pen test | BLOCKED_EXTERNAL |

## Webhook authentication

- Zammad: HMAC-SHA1 + optional bearer ([`webhook-verifier.ts`](../../../packages/integrations/src/zammad/webhook-verifier.ts))
- Bot rejects missing/invalid signatures before inbox write
- Dedupe via delivery ID + payload hash

## Zero AI enforcement

- `BOT_ENGINE=deterministic` routes to FSM only ([`router.ts`](../../../packages/assistant/src/engine/router.ts))
- `ThrowingModelProvider` + zero-ai test suite gate legacy path
- Deterministic mode must not call `createModelProviderFromEnv()` on hot path

## Provider boundary

- `packages/assistant` has no Zammad imports
- Logical destinations only; group IDs in integrations config

## Input handling

- Menu input normalized to bounded choices / aliases
- User text never written to metric labels or Zammad tags
- Templates are static approved copy + approved knowledge lookups

## Logging audit

Structured logs include: provider, conversationRef, intent, nodeId, outcome, latency — not message body, phone, email, tokens, or raw webhook payloads.

## Residual live risks (external)

- Unverified Zammad group ID placeholders until staging provision run
- Human takeover race requires live operator test
- Backup/restore drill on staging database pending

## Rollback security

Emergency fallback: HUMAN-FIRST or shadow mode — never uncontrolled generative production replies.
