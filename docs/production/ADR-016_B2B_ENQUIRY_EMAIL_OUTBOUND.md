# ADR-016: B2B Enquiry Email Outbound (SMTP, fail-closed, inert-by-default)

- Status: Accepted for implementation (2026-11-12)
- Supersedes: none. Complements ADR-009 (Zammad remains the conversation/ticket authority; this ADR covers the website lead-notification email only), ADR-011 (no LLM in this path), ADR-013 (commerce PSP scope untouched).
- Scope: the public B2B enquiry form at `/b2b` (`POST /v1/b2b-leads`).

## Context

The B2B form has been live since the direct-commerce release: every submission is durably stored (`b2b_leads` + `consent_ledger` purpose `b2b_contact` + outbox event `growth.b2b_lead_created` + audit, one transaction). Nothing consumes that event, no email capability exists in the platform, and the form's success copy honestly said "no message is sent out." Enquiries therefore pile up unseen; the team inbox (`hello@yubiefood.com`) is where the team wants them.

Owner decisions (2026-11-12): auto-send (no mailbox-draft step, no mailto handoff), transport = SMTP via the existing Namecheap Private Email hosting, and an automatic acknowledgment copy to the submitting business.

## Decision

1. **Transport: SMTP submission from a dedicated mailbox.** The only recipients are the team inbox (internal — near-certain delivery) and the submitter (transactional receipt of their own data). This removes new-vendor/DKIM onboarding from the critical path. The adapter (`SmtpEmailSender`, nodemailer pinned) lives in `packages/integrations`; `EmailSender` is a provider-neutral port in `packages/application` so a transactional API provider can be added later without touching use cases.
2. **Dispatch: two NEW outbox event types**, `growth.b2b_enquiry_email_requested` and `growth.b2b_enquiry_ack_requested`, enqueued in the same transaction as the lead. The existing `growth.b2b_lead_created` event stays untouched so the planned WA-04 CRM projection consumer never competes for the same rows (`PostgresOperationsOutbox` is now parameterized by claim-type list; concurrent claimers use disjoint lists with `FOR UPDATE SKIP LOCKED`).
3. **Worker drain**: a `growth.email` pg-boss queue (every minute + immediate kick, batch 3) exists only when the email config is enabled. Payloads carry `{leadId}` only; the handler rehydrates the full lead from storage. Provider I/O happens with no DB transaction open; non-accepted sends retry with backoff and fail closed after 10 attempts (existing outbox lease semantics). Audit rows `b2b.enquiry_emailed` / `b2b.enquiry_ack_sent` record outcomes; logs carry lead id + outcome only (no bodies, no recipient PII beyond the id).
4. **Fail-closed activation** (repo convention: deploy inert, activate by env): `B2B_EMAIL_DELIVERY=disabled` is the default and makes the whole path inert — no queue, no SMTP connection, events simply wait. `enabled` requires the full contract (`SMTP_HOST`, `SMTP_PORT` ∈ {465,587}, `SMTP_USER`, `SMTP_PASSWORD`, `B2B_ENQUIRY_EMAIL_FROM`, `B2B_ENQUIRY_NOTIFY_TO` ≤5, optional `B2B_ENQUIRY_ACK`); a partial config refuses worker startup. Worker-scope only: the API never sees SMTP secrets.
5. **Abuse budget at the API**: `/v1/b2b-leads` now caps 3 submissions per mailbox per rolling hour and 50 globally by counting durable lead rows (schema-free, no IP retention; races may slightly overrun — acceptable for a fixed internal recipient). A hidden `website` honeypot field returns a quiet 201 to bots: nothing persisted, nothing emailed. No CAPTCHA in v1.
6. **Copy honesty**: the form success panel now states the enquiry was received with 1–2 working-day follow-up and that sample availability is confirmed separately — the retired copy claimed no message was ever sent. Emails echo only what the submitter entered; no nutrition/health/certification language is generated (AGENTS.md §1). The acknowledgment explicitly disclaims availability ("bukan konfirmasi ketersediaan").

## Consequences

- A 5xx SMTP refusal is definitive (`failed`) but still occupies the bounded retry ladder before marking the event failed — acceptable at this volume; permanent misconfiguration surfaces as 10 failed attempts plus the activation guide's connectivity preflight.
- SMTP accept-then-timeout ambiguity can duplicate an email on retry; both recipients are first-party and duplicative notification emails are harmless. Documented, accepted.
- DMARC stays `p=none`; activation guide includes DKIM verification for the sending mailbox (Namecheap Private Email) as a recommended, non-blocking step for the customer-facing acknowledgment copy.
- Rate-limit counts ride `b2b_leads`; if the table is ever purged, the budget resets with it — acceptable (the honeypot and consent gate remain).
- Rollback: set `B2B_EMAIL_DELIVERY=disabled` (or remove the block) and recreate the worker; pending events hold without data loss. The API/web changes degrade independently and harmlessly.

## Review notes (change gate)

- New runtime dependency: `nodemailer@7.0.13` (+ `@types/nodemailer` dev) in `@yubie/integrations`, exact-pinned.
- Touches: chat/growth automation boundary (outbox consumers), production infrastructure config (new worker-scope secrets), and public form copy — per AGENTS.md §7 this PR carries explicit review notes and rollback behavior (above).
- No database migration. Live email acceptance stays BLOCKED_OPERATOR until the owner provisions the mailbox and runs `docs/production/2026-11-12/B2B_EMAIL_ACTIVATION_GUIDE.md`.
