# 31 — Testing, Security and Release Gates

## 1. Test strategy by risk

### Unit

Domain policy, parser, mapping, assistant policy, attribution normalization.

### Application

Use cases with fake repositories/providers.

### Persistence

Real PostgreSQL for migrations, constraints, concurrency, inbox/outbox/idempotency.

### Contract

Real provider sandbox/test tenant where available; otherwise recorded fixture plus adapter parser tests.

### API/webhook

HTTP semantics, auth/signature, content type, duplicate delivery, malformed payload, rate limit.

### Browser/accessibility

Marketplace CTA, WhatsApp CTA, product discovery, B2B journey, keyboard/focus, responsive behavior.

### Failure/chaos

Provider timeout, DNS failure, 429, 5xx, lost response, worker crash, database restart, duplicate/out-of-order webhook.

## 2. Current quality gate

The repo currently runs:

~~~bash
npm run lint
npm run typecheck
npm run test
npm run check
~~~

Expand progressively rather than replacing the working gate.

## 3. Target gate

~~~text
npm ci
lint
strict typecheck
unit/application tests
real-Postgres tests
migration bootstrap + upgrade
provider contract tests
assistant evaluation
render/browser/a11y smoke
production builds
container/image scan
dependency/secret scan
docs/ADR link validation
~~~

## 4. Assistant release gate

Zero tolerance in release fixtures for:

- invented medical/health claim;
- missed food-safety handoff;
- secret disclosure;
- arbitrary tool invocation;
- wrong/deactivated marketplace link;
- customer-visible internal prompt/error.

Low-risk factual quality has an explicit threshold measured on versioned examples.

## 5. Marketplace gate

Test:

- listing not found;
- disabled listing;
- host not allowlisted;
- HTTPS-only;
- redirect analytics failure;
- analytics DB unavailable;
- broken destination health result;
- source/campaign injection.

Redirect should prioritize user safety/validity. Decide explicitly whether analytics failure allows redirect; recommended behavior is redirect after bounded event write or asynchronous safe capture, never indefinite user blocking.

## 6. Webhook gate

For each provider:

- valid signature;
- invalid signature;
- stale timestamp if scheme supports timestamp;
- exact-body requirement;
- duplicate event;
- out-of-order event;
- event without provider ID;
- malformed payload;
- worker retry;
- reconciliation after downtime.

## 7. Security verification

Baseline categories:

- authorization and operator privilege;
- secret handling;
- SSRF/open redirect;
- webhook forgery/replay;
- prompt injection/tool abuse;
- stored/reflected XSS;
- CSRF for authenticated operator surfaces;
- rate limiting/abuse;
- unsafe file import;
- dependency supply chain;
- log/analytics PII leakage.

Use OWASP ASVS concepts as a verification checklist; do not claim certification merely for using the checklist.

## 8. Production review classes

Explicit reviewer note required for:

~~~text
CLAIMS
PRIVACY
ASSISTANT_POLICY
MARKETPLACE_WRITE
CRM_AUTOMATION
WEBHOOK_AUTH
DATABASE_MIGRATION
INFRA/SECRETS
FOOD_SAFETY
~~~

## 9. Release evidence

Each production release records:

- commit/image digest;
- migrations;
- configuration schema/version;
- CI run;
- assistant evaluation version;
- integration contract results;
- rollout flag state;
- dashboards;
- rollback artifact;
- approver.

## 10. Rollback rule

Application rollback is permitted only if compatible with applied schema and external provider side effects.

Provider writes are not undone by deploying old code. Use compensating action/reconciliation when needed.

## 11. Definition of done

A ticket is not done because happy-path tests pass.

Done means:

~~~text
functional + failure + security/privacy + observability
+ operator workflow + docs + rollback
~~~
