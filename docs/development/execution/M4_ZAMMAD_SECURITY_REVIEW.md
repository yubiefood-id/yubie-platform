# M4-Z Security Review

**Date:** 2026-09-20  
**Scope:** Zammad webhook ingress, API service account, provider boundary

## Threat model

| Threat | Control |
|--------|---------|
| Forged webhook | HMAC-SHA1 on raw body; optional Bearer token |
| Replay | `UNIQUE(provider, delivery_id)` + payload hash fallback |
| Token leak | Secrets in env/secret manager only; redacted logs |
| Over-privileged API user | Dedicated `yubie-bot-service`; ticket.agent scope |
| Bot loop | Trigger conditions + app-side `sender != Customer` guard |
| Cross-ticket leakage | Article fetch validates `ticket_id` match |
| Internal note exposure | Context provider filters `internal=true` |
| HTML injection | `stripHtml` on HTML articles |
| Public ES/Redis/PG | Compose override: internal networks only |
| Human/bot race | 4-layer human-over-bot invariant preserved |
| Ambiguous duplicate send | Outbox `AMBIGUOUS` + reconcile before retry |

## Mandatory scans (operator)

- [ ] secrets-scan on repo
- [ ] `npm audit` / SCA
- [ ] Staging penetration: wrong HMAC, wrong bearer, flood webhook

## Open items (staging)

- Confirm WhatsApp article type does not expose internal channel metadata
- Validate Zammad service account cannot access admin endpoints
- Disable Zammad native customer AI features

## Verdict

**Pass for staging deployment** with operator completion of staging validation checklist.
