# M4.5 Security Report

**Date:** 2026-09-20

## Verdict

**CODE:** PASS (with M4.5 hardening)  
**STAGING PENETRATION:** BLOCKED_EXTERNAL  
**PRODUCTION:** NOT READY

## M4.5 code hardening

| Item | Action | Status |
|------|--------|--------|
| Empty webhook auth | Reject `missing_auth_config` when secret and bearer both unset | FIXED |
| Unit test | Added `missing_auth_config` case | PASS |

## Threat model (code review)

| Threat | Mitigation | Residual risk |
|--------|------------|---------------|
| Forged webhook | HMAC-SHA1 + Bearer | Requires operator to set secrets |
| Modified body | HMAC over raw body | — |
| Replay | `X-Zammad-Delivery` dedupe | Depends on Zammad uniqueness |
| Bearer leak | Env-only; not in Git | Operator rotation |
| API token leak | Service account; least privilege | Staging validation pending |
| Cross-ticket leakage | `ticket_id` check on `getArticle` | — |
| Bot loops | Customer-only ingress filter | Live trigger config pending |
| HTML injection | `stripHtml` on articles | — |
| Body flood | 256KB limit | — |
| Public Postgres/Redis/ES | Compose override internal networks | VPS firewall pending |
| PII in logs | Structured logs; no raw chat in metrics labels | `raw_body` in inbox — purged by reconcile |

## Scans

| Scan | Result | Notes |
|------|--------|-------|
| Secrets grep (repo) | PASS | No committed tokens/keys |
| `npm audit` | WARN | Dev-deps only (`@cloudflare/vite-plugin`, `drizzle-kit`); not in Zammad runtime path |
| Live pen test | NOT RUN | Requires staging VPS |

## Operator checklist (staging)

- [ ] Set `ZAMMAD_WEBHOOK_SECRET` and `ZAMMAD_WEBHOOK_BEARER` (both recommended)
- [ ] Create `yubie-bot-service` token (not super-admin)
- [ ] Verify 403 on forbidden API actions
- [ ] Disable Zammad native customer AI
- [ ] Confirm ES/Redis/Postgres not public
- [ ] Run backup/restore drill

## Red-team cases (live — pending)

HMAC mutation, wrong Bearer, duplicate delivery spoof, oversized body, prompt injection, cross-ticket refs — documented in failure matrix; execution requires staging.
