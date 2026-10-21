# Admin, ERP and support acceptance

2026-10-21. Local source tests and deployment preparation are separate from live operational acceptance. G5–G7 remain blocked.

## Staff console

Refine5.0.12/React19.2.8 is now implemented locally. Same-origin BFF supplies orders, payments, exceptions and inventory from parameterized, bounded, read-only PostgreSQL readers. Separate staff Google audience, approved exact subject→role mapping, short signed session, server RBAC, same-origin CSRF, current-role revalidation, durable logout revocation and access audit are implemented. Backend/audit failure returns unavailable rather than a successful empty table. Customer session cookies cannot grant staff access. Browser code receives no DB/ERP credentials. Telemetry is disabled.

Synthetic RS256/JWKS tests exercise real signature/issuer/audience/expiry validation without a Google login; browser tests use synthetic staff identities and real BFF policy with fixture data. PostgreSQL reader/revocation tests use real isolated databases. These do not prove Google/Access/staging identity acceptance.

`infrastructure/docker/Dockerfile.admin`, separate opt-in `docker-compose.admin.yml` and `admin.env.example` define deployment. No admin service is added to the shared active stack. Before deployment: approve host and named staff Access/MFA, staff OAuth client distinct from customer, least-privilege subject/role map and DB grant, protected secret file, immutable image and migration0014. The migration adds only revocation records (SHA256 token hashes, expiry and index). Apply after backup/isolated restore and lock review; rollback application without dropping the table or revocation evidence. Runtime refuses missing auth configuration. Never enable write controls to make acceptance pass.

| Live acceptance | Status |
|---|---|
| Separate real viewer/operator/finance Google identities through Access | BLOCKED_EXTERNAL |
| Real order/payment/exception/lot counts and bounded pagination/search | BLOCKED_EXTERNAL |
| Cross-role/customer-session denial, logout replay, audit persistence | PASS_LOCAL; STAGING NOT_RUN |
|503 recovery, keyboard/axe/responsive table behavior | Local browser coverage; live NOT_RUN |
| CRM/support ticket summary, trends/export | NOT_IMPLEMENTED |
| Approved retry/reconciliation actions | NOT_IMPLEMENTED; all dangerous writes remain denied |

## ERPNext

No running ERPNext has been verified. `infrastructure/erpnext/` prepares pinned upstream source + image digests and separate MariaDB/Redis; see its README. Approval for isolated host/resources/cost, schema and named staff is required. Do not install it on the shared RetroPick/Yubie VPS. No fabricated data or product safety specification is supplied.

The existing Yubie GET-only Frappe shadow reader, item mappings, discrepancy dedupe, backoff and dead-letter behavior are reused. They do not provide a physical stock authority or native manufacturing/finance workflow. ERP stock writes remain denied. Integration and ERP-native user roles are separate.

| Operational scenario / required evidence | Status / owner prerequisite |
|---|---|
| Item↔nine variant SKU, Warehouse and UOM/pack conversions | BLOCKED_EXTERNAL; Operations approves mapping and synthetic fixtures |
| Supplier→purchase order→receipt→invoice→payment/GL | BLOCKED_EXTERNAL; Finance approves COA, tax and supplier fixtures |
| BOM→work order→raw issue→manufacture→finished batch | BLOCKED_EXTERNAL; Manufacturing approves BOM/spec/UOM and fixtures |
| Receiving→QA hold→release; quarantined/recalled lot exclusion | BLOCKED_EXTERNAL; QA approves exact product specification and release authority |
| Batch/expiry/FEFO; fractional/negative/missing quantities fail closed | PASS_LOCAL mapping guards only; real ERP fixtures NOT_RUN |
| Deliberate ERP/Yubie discrepancy, stale data, outage/backoff/dead letter | Local controlled Frappe tests; real ERP NOT_RUN |
| Order→reservation→pick/pack→delivery→ERP stock move→finance convergence | BLOCKED_EXTERNAL; approve single-writer boundary and physical stock authority |
| Cancel/return/refund; recall lot→affected deliveries and support escalation | BLOCKED_EXTERNAL; Operations/Finance/QA own signed procedure |
| Named-user least privilege, GET-only integration, private MariaDB/Redis | BLOCKED_EXTERNAL; host/staff provision pending |
| Off-host encrypted sites+DB backup and isolated restore | BLOCKED_EXTERNAL; SRE receipt required |

## Zammad/WhatsApp and fulfillment

Self-hosted Zammad remains support authority; Chatwoot is rollback only. Local deterministic bot and provider-contract tests do not prove a WhatsApp delivery. Live acceptance is BLOCKED_EXTERNAL until an approved channel, sender/recipient, named agents, credentials and permitted test window exist. No message was sent.

Operator receipt must demonstrate inbound test message→one ticket/conversation→routing/dedupe→bot/human handoff, explicit-human/complaint/food-safety priority, after-hours fallback, human reply/outbound delivery, privacy redaction, outage/replay recovery and honest marketplace refund guidance. Qualified B2B projection needs approved CRM routing and owner. No raw message/customer data should be committed.

Fulfillment needs a named owner and real test order through address validation, packing, shipping/tracking, cancellation, returns and Finance reconciliation. Checkout success is not fulfillment readiness. Actual alert notification, discrepancy triage and on-call escalation remain G9 requirements.
