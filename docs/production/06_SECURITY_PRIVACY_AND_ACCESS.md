# 06 — Security, Privacy and Access

## 1. Baseline

Use OWASP ASVS concepts as a verification baseline for exposed web, API and operator surfaces. Map applicable controls to evidence/tests; do not claim certification merely because a checklist is used.

## 2. Current threat priorities

The marketplace/WhatsApp architecture changes the priority order.

Primary threats:

- marketplace redirect/link poisoning;
- GitHub/Cloudflare/Meta/marketplace control-plane takeover;
- WhatsApp and provider token leakage;
- forged/replayed Chatwoot or marketplace webhooks;
- WhatsApp/CRM personal-data leakage;
- prompt injection and unauthorized assistant tool use;
- publication of unapproved food/health/certification claims;
- unsafe marketplace report/file import;
- database/backup compromise;
- Docker/host privilege escalation;
- dependency/supply-chain compromise;
- denial of service and provider outage.

Payment-page/card-data threats become launch-critical only if ADR-004 is superseded by a direct-commerce ADR.

## 3. Access controls

- named operator accounts;
- MFA where supported;
- no shared production database account;
- service credentials scoped per integration/environment;
- exceptional production DB shell access is time-bounded and auditable;
- immediate offboarding and credential rotation;
- admin roles limited to people who actually need them.

## 4. Application controls

Required:

- strict server-side validation;
- no arbitrary user-controlled redirect URL;
- server-side authorization for operator actions;
- webhook authentication/signature verification where supported;
- webhook dedupe/replay protection;
- CSRF protection for cookie-authenticated mutations;
- output encoding and CSP/security headers;
- route-specific rate/abuse limits;
- outbound URL/SSRF allowlists;
- import size/type/parser protections;
- provider timeout/body-size limits.

## 5. Assistant controls

- LLM is not source of truth;
- approved/effective knowledge only;
- deterministic tool allowlist;
- no arbitrary SQL, shell or browser tools;
- no provider secret access;
- red-risk intents hand off;
- customer text is untrusted input;
- response validation before auto-send;
- independent global and per-intent kill switches.

## 6. Privacy

Document purpose, access and retention for:

- WhatsApp/contact references;
- B2B qualification;
- CRM projection;
- marketplace report/order projections;
- analytics identifiers;
- support/food-safety records.

Marketing consent is separate from operational response.

Avoid copying full WhatsApp conversations into Yubie DB, CRM or analytics when external references/structured state are sufficient.

## 7. Secrets and supply chain

- no populated env files in Git;
- no secrets baked into container images;
- separate staging/production credentials;
- lockfile committed;
- dependency and secret scans;
- minimal CI workflow permissions;
- private/restricted container registry access;
- image/dependency provenance where practical.

## 8. Security evidence

Before public automation:

- threat model;
- control-plane access review;
- external port scan;
- webhook negative/replay tests;
- assistant prompt/tool abuse suite;
- dependency/secret scan;
- backup restore;
- incident tabletop;
- provider credential inventory.
