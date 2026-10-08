# 14 — Go-Live Checklist

Use this as an evidence record. A checked item requires current evidence; N/A requires rationale.

## A. Product truth

- [ ] exact available/coming-soon lifecycle approved;
- [ ] public claims/facts are approved/effective;
- [ ] proposal/R&D-only health, shelf-life or certification language is not exposed as commercial truth;
- [ ] root/product/application/recipe relationships reviewed;
- [ ] marketplace listing/SKU mapping reviewed;
- [ ] public structured data is truthful.

## B. Website/channel

- [ ] first-party checkout (ADR-012) presents the direct cart/payment path with server-side re-pricing, idempotency keys, and lot-gated inventory;
- [ ] Xendit remains in TEST mode until the ADR-012 sandbox matrix passes (LIVE prohibited);
- [ ] marketplace purchase options resolve from server-owned verified records and remain the rollback channel;
- [ ] WhatsApp CTA works;
- [ ] no open redirect;
- [ ] outbound attribution is minimized/non-PII;
- [ ] broken-listing behavior is tested.

## C. Core VPS

- [ ] VPS host/network/TLS checklist complete;
- [ ] only intended ports public;
- [ ] immutable SHA image deployed;
- [ ] health/readiness pass;
- [ ] PostgreSQL private and least privilege;
- [ ] off-host backup green;
- [ ] restore drill passed;
- [ ] backup/disk alerts active.

## D. Zammad/WhatsApp (ADR-009; Chatwoot = rollback only)

- [ ] official WhatsApp Cloud API path configured into Zammad;
- [ ] business/WABA/number ownership verified;
- [ ] Zammad groups/routing IDs discovered and set (bot queue, customer support, sales/partnership, food safety, high priority);
- [ ] WhatsApp article type discovered from the real instance;
- [ ] human handoff works (deterministic engine → Zammad groups);
- [ ] Zammad can fail without disabling manual support;
- [ ] self-hosted Zammad backup/upgrade procedure verified.

## E. Assistant

- [ ] approved knowledge only;
- [ ] tool allowlist;
- [ ] shadow/suggested-reply stage completed;
- [ ] evaluation passes;
- [ ] red-risk intents human-first;
- [ ] marketplace-link tool returns verified listing only;
- [ ] global kill switch tested;
- [ ] no secret/raw-chat leakage in logs/analytics.

## F. B2B CRM

- [ ] ordinary B2C is not converted into CRM opportunities;
- [ ] qualification persists durably;
- [ ] each qualified lead has owner/next action;
- [ ] stable external Yubie lead ID;
- [ ] CRM outage/reconciliation test passes;
- [ ] CRM backup/export exists.

## G. Marketplace intelligence/API

- [ ] import checksum/idempotency works;
- [ ] unknown SKU/status becomes visible exception;
- [ ] source freshness is displayed;
- [ ] official API access/scopes documented before L2/L3;
- [ ] read-before-write rollout;
- [ ] no scraping.

## H. Security/privacy

- [ ] MFA on critical control planes;
- [ ] secrets absent from Git/image/log;
- [ ] external port scan complete;
- [ ] webhook abuse/replay tests pass;
- [ ] provider least privilege reviewed;
- [ ] privacy/retention reviewed;
- [ ] dependency/secret scan green.

## I. Operations

- [ ] actionable alerts;
- [ ] release rollback documented/tested;
- [ ] incident owners/on-call route;
- [ ] DB restore drill;
- [ ] Zammad outage drill (Chatwoot rollback drill during migration window only);
- [ ] unsafe-assistant drill;
- [ ] marketplace-link failure drill.

## GO / NO-GO

Any unresolved critical product-truth, food-safety, backup, credential, privacy or customer-channel issue is **NO-GO**.
