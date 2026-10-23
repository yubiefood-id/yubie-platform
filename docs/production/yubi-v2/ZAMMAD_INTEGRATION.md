# Zammad integration and acceptance

Source pin: infrastructure/zammad/zammad.lock.json (7.1.3-0014, pinned digest).
An image pin is not proof of the running instance. Read its version/image digest,
channel configuration and named principal permissions before R3. Meta account,
official number, channel ownership, protected secrets and test identities remain
operator dependencies. No live instance or WhatsApp receipt has been verified.

Use the existing Zammad channel and POST /webhooks/zammad. Authentication is
HMAC-SHA1 in x-hub-signature when ZAMMAD_WEBHOOK_SECRET is set; configured bearer
requires exact Authorization as well. ZAMMAD_WEBHOOK_BEARER alone is supported.
No configured authentication fails closed. Streamed body limit is 256 KiB.
The actual deployed trigger payload and signing bytes must be captured using
synthetic approved tests and reconciled with this adapter before activation.

Customer article contract (numbers, not strings):

```json
{"event":"article_created","ticket_id":1,"article_id":2,"customer_id":3,"group_id":4}
```

These are illustrative schema values, not account identifiers. The worker fetches
the actual article; only external Customer articles of the configured WhatsApp
type are interpreted. Agent identity comes from created_by_id vs authenticated
/api/v1/users/me. Zammad system/unassigned owner 1 is not a human agent. A named
owner other than the bot is authoritative for suppression.

The same authenticated webhook must also receive ticket lifecycle events:

```json
{"event":"ticket_updated","ticket_id":1,"state_id":4}
```

This payload MUST omit article_id so lifecycle events are not deduped as a prior
customer article. Resolve actual state IDs from the instance; 4 above is only a
fixture. Closed/merged/removed states are resolved using the provider state catalog
and latched RESOLVED before later navigation, even if already reopened. Do not set
up another outbound owner or direct Meta webhook. Configure article and lifecycle
conditions on the existing integration; validate actual receipts in staging.

Routing uses ZAMMAD_GROUP_CUSTOMER_SUPPORT, ZAMMAD_GROUP_SALES_PARTNERSHIP and
ZAMMAD_GROUP_FOOD_SAFETY, with ZAMMAD_PRIORITY_HIGH for food safety. Group/priority
must be confirmed by the returned ticket; labels and consented private B2B summary
are applied under final guards. Never claim human acceptance from routing alone.
The provisioning script ensures groups only; it does not configure WhatsApp or
webhooks/triggers. See infrastructure/zammad/scripts/provision.mjs.

Customer sends require a recent actual Customer WhatsApp article within 24 hours,
ticket AUTO, local ownership eligibility, runtime AUTO and final authorization.
Expired/missing window fails safely. No business-initiated template feature is
implemented; test any such requirement against the deployed version separately.

Internal food-safety routing survives OFF and human ownership; no public bot
receipt is authorized under those conditions. Unknown safety PATCH acknowledgment
is reconciled with bounded, convergent group/priority/tag writes. Routine unknown
handoff is held for operator review, rescheduled fairly, and terminal after 24h.

Acceptance chain: real inbound WhatsApp → Zammad ticket/article → authenticated
durable inbox → once-only worker turn → ordered outbox → native outgoing article
→ provider delivery status → actual recipient confirmation. Repeat with duplicate
and out-of-order webhook, worker restart, lost acknowledgment, window expiry,
human takeover, closure/reopen, emergency OFF and food-safety report. Record
sanitized event/outbox/article references and artifact identities, never phone
numbers, tokens, raw chats or credentials in release artifacts.
