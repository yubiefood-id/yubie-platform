# Release dependencies

Beads is the task tracker: yubie-fnf.10 is the catalog engineering milestone; yubie-fnf.11 is native ERP operator readiness. This file records external decisions and acceptance boundaries.

| Category | Dependency / owner | Exact intervention |
|---|---|---|
| OWNER | Release owner | Approve the reviewed full source SHA, artifact digest, staging environment and window before candidate deployment; production separately requires profile, payment mode disabled, window, on-call and rollback target. |
| OWNER | Cloudflare / CI administrator | In repository Settings → Environments → staging, set CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET from the existing protected secret store for a least-privilege service token admitted to staging. Keep them out of chat and artifacts. |
| OWNER | Google test-account custodian | Select the approved existing staging customer Google identity. Store its account identifier and interactive login/MFA procedure in the organization's protected vault entry yubie/staging/customer-google-test (proposed entry if none exists). Perform fresh consent/login through approved staging; export only Yubie session state, excluding Google cookies, to staging E2E_AUTH_STATE_BASE64. A replayed Yubie session proves session acceptance, not a fresh Google handshake. |
| OWNER | Staff security administrator | In protected vault yubie/staging/staff-google-test, identify separate viewer, operator and finance Google subjects; approve ADMIN_GOOGLE_CLIENT_ID and ADMIN_STAFF_SUBJECT_ROLES role map via infrastructure/admin.env.example. Provision named Cloudflare Access/MFA membership. Customer sessions must remain denied. Do not reuse customer OAuth audience. |
| OWNER | Email administrator | Verify hello@yubiefood.com delivery in Private Email as described in EMAIL_VERIFICATION.md. Current verdict PENDING_OPERATOR_VERIFICATION. |
| OWNER | Product / Legal | Approve exact displayed sizes, prices, imagery, contact, privacy and terms for catalog; no label/nutrition/certification approval is implied. Approve official marketplace URLs before selecting MARKETPLACE_MSP. |
| OWNER | Infrastructure / SRE | Approve isolated ERPNext host or managed instance, resource budget, private network, TLS/Access, backup destination and on-call; do not install on shared VPS. Production ERP is NOT_PROVISIONED. |
| OWNER | Operations / QA / Manufacturing / Finance | Supply exact SKU/UOM conversions, approved specifications/BOMs, quarantine/release authority, suppliers, chart of accounts/tax and signed workflow acceptance. Synthetic fixtures cannot replace these. |
| PROVIDER | PSP | Written callback/reconciliation contract, isolated sandbox credentials, approved synthetic order/window and provider-backed acceptance. Existing callback simulations are not provider success. |
| PROVIDER | Support owner / WhatsApp | Approved Zammad endpoint, channel, test sender/recipient, operator identities and test window. Live support remains BLOCKED_EXTERNAL. |
| DEFERRED_BY_PROFILE | Direct commerce | Customer authentication, payments, transactional fulfillment and G0–G10 financial gates remain separate from catalog-only acceptance; they are mandatory before direct commerce. |
| CODEX_NOW | Engineering | Finish review fixes, regression/CI, immutable artifact preparation, local native ERP and private admin regression coverage. No external credential dependency blocks these tasks. |

Do not place passwords, OAuth tokens, Access secrets, browser cookies or full email headers in this repository or chat.
