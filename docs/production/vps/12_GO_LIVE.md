# 12 — VPS Go-Live Checklist

## Host/network

- [ ] Ubuntu LTS patched.
- [ ] named SSH key login verified.
- [ ] root/password SSH disabled after validation.
- [ ] only intended ports public.
- [ ] Docker internal ports private.
- [ ] DNS and strict TLS correct.
- [ ] admin surfaces restricted.

## Application

- [ ] immutable SHA image.
- [ ] health/readiness pass.
- [ ] config validation pass.
- [ ] no production payment credentials.
- [ ] verified marketplace redirect.
- [ ] WhatsApp redirect works.

## Database

- [ ] app role not superuser.
- [ ] DB private.
- [ ] explicit migrations.
- [ ] off-host backup green.
- [ ] restore drill passed.
- [ ] backup alerts active.

## Product truth

- [ ] available/coming-soon truthful.
- [ ] no unapproved health/nutrition/certification/shelf-life claim.
- [ ] listing/SKU mapping reviewed.
- [ ] structured data truthful.

## Chatwoot

- [ ] official WhatsApp Cloud API.
- [ ] business ownership verified.
- [ ] team/assignment/handoff tested.
- [ ] manual support works with assistant disabled.
- [ ] self-host backup if applicable.

## Assistant

- [ ] shadow/suggested phase completed.
- [ ] evaluations green.
- [ ] red intents human-first.
- [ ] verified purchase-link tool.
- [ ] kill switch tested.
- [ ] no secret/chat leakage in logs.

## CRM

- [ ] only qualified B2B sync.
- [ ] stable Yubie lead key.
- [ ] outage/reconcile tested.
- [ ] independent backup/export.

## Marketplace intelligence

- [ ] import checksum/idempotency.
- [ ] mapping exceptions visible.
- [ ] freshness displayed.
- [ ] approved API scopes before L2/L3.
- [ ] no scraping.

## Security/ops

- [ ] MFA on control planes.
- [ ] external port scan.
- [ ] dependency/secret scan.
- [ ] alerts/runbooks/on-call.
- [ ] DB restore, Chatwoot outage and bad-assistant drills.

Critical unresolved product-truth, backup, credential, safety or customer-channel issue is NO-GO.
