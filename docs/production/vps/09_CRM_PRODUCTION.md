# 09 — CRM Production

## 1. Role

CRM owns qualified B2B sales work. Routine B2C support remains Chatwoot.

## 2. Comp AI CRM

Comp AI CRM is an OSS candidate with separate web/API/agent processes and PostgreSQL. Treat it as an external sidecar behind `CrmProvider`.

## 3. Isolation

Prefer separate deployment/database because CRM has its own auth, resource usage, upgrades and AI workloads.

## 4. Production readiness

Before critical use:

- pin tested release/tag;
- review license/security;
- restrict sign-in;
- configure OAuth/IdP;
- backup/restore CRM DB;
- decide telemetry;
- document email/calendar scopes;
- test upgrade/export.

## 5. Yubie projection

Send only qualified sales data and stable Yubie lead IDs. Do not dump raw WhatsApp history by default.

## 6. AI enrichment

CRM-native agent output must not silently overwrite product truth or customer-provided qualification facts.

## 7. Outage

Yubie lead persists, outbox retries, operator sees backlog and reconciliation prevents duplicate opportunity creation.

## 8. Exit

Because Yubie owns lead intake/refs, a future CRM replacement is a projection migration rather than a rewrite.
