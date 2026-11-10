# Onboarding & emergency runbook — Zammad / WhatsApp / AI

**Operator-only.** This guide intentionally avoids pasting commands that might activate production messaging. Follow existing locked deployment workflow and owner approval.

## A. Reality check: is the bot truly live?

1. Check docs/production/2026-10-24/WHATSAPP_DEFERRED.md and the **latest** production release receipt, not just README.
2. Read actual env status (names/boolean health only; never print tokens): SUPPORT_PROVIDER, BOT_ENGINE, bot Docker profile, ZAMMAD_BASE_URL, verified webhook destination, AI mode/limits and assistant_enabled.
3. Verify production/staging live container versions and Zammad admin channel, phone ID, article type, group IDs, trigger ownership and audit log.
4. Run one authenticated staging test inbound->Zammad->bot->worker->Zammad->Meta->recipient with provider receipt and explicit operator acknowledgement.
5. If no real receipt or service is disabled, report **NOT LIVE / BLOCKED_EXTERNAL**.

## B. Number selection: keep customer's number safe

1. Obtain written decision whether the **current WhatsApp Business app** must stay accessible on staff phones.
2. For fastest safe proof, use an eligible distinct test Cloud API number with native Zammad setup.
3. For current-number Coexistence, verify provider-specific onboarding and Indonesia support; inventory inbound synchronization, mobile app reply sync, message history limitations, rollback and billing.
4. Native Zammad docs state app-registered numbers cannot use the regular Cloud API onboarding path; never silently move/deregister that number. Confirm current provider features before proceeding.
5. One number must have one primary inbound owner and one outbound sender authority per message. If mirror sync is needed, document event IDs/loop suppression.
6. Require owner-signoff for app-only to API-only conversion or paid BSP enrollment.

## C. Zammad staging checklist

- Dedicated support host and restored backup; true host/version/digest recorded; HTTPS and valid system FQDN.
- A named least-privilege Zammad service principal; validate token only in private secret manager.
- Discover and store actual ZAMMAD_WHATSAPP_ARTICLE_TYPE, ZAMMAD_GROUP_BOT_QUEUE, ZAMMAD_GROUP_CUSTOMER_SUPPORT, ZAMMAD_GROUP_SALES_PARTNERSHIP, ZAMMAD_GROUP_FOOD_SAFETY and ZAMMAD_PRIORITY_HIGH.
- Configure valid signed trigger to apps/bot POST /webhooks/zammad; verify ZAMMAD_WEBHOOK_SECRET and/or BEARER according to deployed signature contract.
- Keep Zammad's native customer-facing AI disabled, since Yubi is the sole conversation bot.
- Confirm staff can view ticket priority, claim the ticket and send a WhatsApp article; validate human takeover stops bot.
- Ensure Zammad default welcome/reminder behavior cannot produce duplicate messages with Yubi's responses.

## D. Controlled AI enablement (not current runtime commands)

1. Deploy quota reservation/ledger code with hard-cap test and secure model provider credentials.
2. Set per-call input/output caps, per-contact daily/session count, per-day/global token and month spend ceilings as **required** config. Missing config => AI off.
3. Deploy SHADOW first, then SUGGESTION with agent review; opt-in customer AI only after independent owner approval, safety evaluation and actual usage/cost dashboard.
4. Keep deterministic normal route zero-token and preserve customer-service option even when AI is unavailable.
5. Confirm audit log, monthly budget reset, UTC/accounting, concurrent reservation test and denial fallback.
6. Never turn BOT_ENGINE=legacy globally to simulate opt-in AI. Implement a guarded assistant port and model-provider call within deterministic authority.

## E. Operator emergency scenarios

### Bot or AI giving unsafe answers

- If **AI only** is unhealthy, disable the new AI feature flag/hard quota and retain deterministic/human routes.
- If **all customer automation** is unsafe, use existing authenticated POST /ops/assistant/emergency-off using approved ops tooling; that sets assistant_enabled false, mode off and cancels pending customer outbox rows. Avoid embedding OPS_API_TOKEN in shell history or runbook.
- Verify customer sends stopped using delivery ledger/provider receipts, not just HTTP acknowledgement. Internal food-safety routing remains permitted as designed.
- Alert shift lead and named engineer; preserve sanitized correlation IDs and last known safe release.

### Zammad or WhatsApp delivery down

- Pause automated sends. Durable queue and reconcile; do not introduce a parallel direct WhatsApp sender while Zammad remains authoritative.
- Check cloud provider state and 24-hour window; do not resend ambiguous POST before provider reconciliation.
- Keep customer-support owners updated; use previously approved emergency communication fallback when applicable.
- Roll back only via existing deployment process and a named operator.

### Suspected API abuse or unexpected costs

- Disable AI/auto template dispatch immediately via dedicated kill switches.
- Verify outstanding reservations, model actual usage and delivery cost; revoke compromised credentials via secret manager/provider; rate-limit account/contact.
- Restrict agent access, file incident ticket, preserve redacted receipts, and obtain signoff before re-enabling.

### Food-safety incident

- Create/retain urgent Zammad ticket and assign the on-call P0 human; don't use AI to provide treatment claims.
- Maintain independent internal escalation even while customer automation is OFF.
- Preserve relevant conversation in approved private support system according to retention and privacy policy.

## F. Cutover and rollback record

Every cutover must contain current/support image digests, DB migrations, Meta channel and phone binding, documented owner consent, UAT physical test, operator roster, spend cap, backup receipt, rollback decision and exact SHA. Record if phone app remains usable; avoid “works on WhatsApp” as blanket proof of Coexistence.

Rollback is designed to preserve paid/checkouts/shipping and human tickets: return assistant to OFF or safe deterministic if accepted, disable AI and outbound templates independently, keep Zammad as human inbox; roll back provider bridge only after queue reconciliation. Chatwoot rollback requires separate accepted support authority change (ADR-009), **not** simultaneous active operation.

## G. Official reference links

https://admin-docs.zammad.org/en/latest/channels/whatsapp/index.html  
https://admin-docs.zammad.org/en/7.1/channels/whatsapp/preparation.html  
https://admin-docs.zammad.org/en/pre-release/channels/whatsapp/limitations.html  
https://whatsappbusiness.com/id/policy/  
https://whatsappbusiness.com/products/platform-pricing/
