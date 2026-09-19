# M4-Z Staging Report

**Date:** 2026-09-20  
**M4.5 status:** STAGING_PENDING — see [`M4_5_WHATSAPP_STAGING_REPORT.md`](./M4_5_WHATSAPP_STAGING_REPORT.md) (BLOCKED_EXTERNAL from validation host)  
**Environment:** `support-staging.yubie.id` (dedicated VPS — operator deploy)

## Code readiness

| Item | Status |
|------|--------|
| `SupportConversationProvider` port | DONE |
| Zammad adapter + webhook verifier | DONE |
| `POST /webhooks/zammad` | DONE |
| Provider-neutral schema `0004` | DONE |
| Worker `support.reply` / `support.reconcile` | DONE |
| Contract tests (fake/fixtures) | DONE |
| `npm run check` | PASS |
| Infra scripts + lock file | DONE |

## Operator staging tests (pending live Zammad)

| Test | Status |
|------|--------|
| Zammad compose up + verify.sh | PENDING |
| WhatsApp test number inbound | PENDING |
| Trigger → webhook → inbox | PENDING |
| SHADOW assistant turn | PENDING |
| Human takeover | PENDING |
| B2B handoff group | PENDING |
| Food-safety handoff | PENDING |
| Restart bot/worker/Zammad | PENDING |

## Notes

Staging QA requires operator Meta credentials and dedicated VPS provisioning. Code path validated via fake provider + contract tests in CI.
