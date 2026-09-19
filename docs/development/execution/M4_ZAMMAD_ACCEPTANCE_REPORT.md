# M4-Z Acceptance Report

**Date:** 2026-09-20

## Code / CI acceptance

| Criterion | Status |
|-----------|--------|
| M1/M2/M3 preserved | PASS |
| Zammad version pinned in lock | PASS |
| Provider-neutral assistant | PASS |
| `packages/assistant` no Zammad imports | PASS |
| HMAC verifier (unit tests) | PASS |
| Dedupe contract | PASS |
| Human-over-bot tests | PASS |
| `npm run check` | PASS |
| Chatwoot rollback path retained | PASS |

## Staging / production (operator)

| Criterion | Status |
|-----------|--------|
| Zammad staging runs | PENDING |
| Native WhatsApp validated | PENDING |
| End-to-end SHADOW/SUGGEST/GREEN | PENDING |
| Backup/restore tested | PENDING |
| Production cutover authorized | NOT STARTED |

## Verdict

**M4-Z code complete; staging/production GO pending operator live validation and cutover authorization.**
