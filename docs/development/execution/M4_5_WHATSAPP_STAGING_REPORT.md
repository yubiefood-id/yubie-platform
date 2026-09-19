# M4.5 WhatsApp Staging Report

**Date:** 2026-09-20  
**Status:** BLOCKED_EXTERNAL

## Environment

| Target | Result |
|--------|--------|
| `support-staging.yubie.id` | DNS resolution failed from validation host |
| `bot-staging.yubie.id` | DNS resolution failed from validation host |
| Meta WhatsApp test channel | Not exercised — requires live Zammad |

## Code readiness (PASS)

- Zammad webhook route: `POST /webhooks/zammad`
- Provider selector: `SUPPORT_PROVIDER=zammad`
- Outbound: `ZammadSupportProvider.sendReply`
- Handoff: `buildHandoffCommand` (B2B, food-safety, human)

## Required operator evidence (not yet collected)

| # | Test | Status |
|---|------|--------|
| 1 | WhatsApp inbound creates/updates ticket | PENDING |
| 2 | Article type observed | PENDING |
| 3 | Trigger → webhook → inbox | PENDING |
| 4 | Full round-trip reply to WhatsApp | PENDING |
| 5 | `ZAMMAD_WHATSAPP_ARTICLE_TYPE` confirmed | PENDING |

## Vertical slice trace fields

When live testing, record:

- `request_id` / `X-Zammad-Delivery`
- `ticket_id`, `article_id`
- `webhook_inbox.id`
- `assistant_run.id`
- `assistant_outbox.id`

Never use customer message text as log labels.

## Unblock checklist

1. Deploy Zammad per [`infrastructure/zammad/README.md`](../../../infrastructure/zammad/README.md)
2. Configure Meta WhatsApp Cloud API channel in Zammad
3. Point DNS for staging hostnames
4. Configure Zammad trigger → `https://bot-staging.yubie.id/webhooks/zammad`
5. Set `ZAMMAD_WEBHOOK_SECRET`, `ZAMMAD_WEBHOOK_BEARER`, `ZAMMAD_API_TOKEN` on core VPS
