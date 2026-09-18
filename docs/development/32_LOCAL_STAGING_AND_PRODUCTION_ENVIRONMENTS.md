# 32 — Local, Staging and Production Environments

## 1. Environment goals

### Local

Fast, deterministic, no real customer data and no mandatory external accounts.

### CI

Ephemeral/reproducible. Real PostgreSQL where persistence behavior matters; fake providers by default.

### Staging

Production-like topology with dedicated test accounts/numbers/shops where possible.

### Production

Least privilege, immutable artifacts, real providers, strict data/secret controls.

## 2. Provider matrix

| Capability | Local | CI | Staging | Production |
|---|---|---|---|---|
| Marketplace | static/fake | fake fixtures | approved test/read access or controlled export | approved seller access |
| Chatwoot | fake | signed fixtures | dedicated inbox/test number | official business inbox |
| Assistant model | fake/deterministic | fake + optional eval model | real model with safe dataset | approved model |
| CRM | fake | fake | test tenant/self-hosted stage | production CRM |
| Postgres | Docker | service container | dedicated DB | dedicated production DB |
| Email | Mailpit | fake | sandbox | transactional provider |

## 3. Configuration contract

Target grouped configuration:

~~~text
core
database
worker
conversation
assistant
crm
marketplaces.shopee
marketplaces.tokopedia
messaging
analytics
observability
storage
~~~

Validate at startup with Zod. A disabled provider does not require its secrets.

## 4. Local target

~~~bash
npm ci
npm run infra:up
npm run db:migrate
npm run db:seed
npm run dev:web
npm run dev:api
npm run dev:worker
~~~

Default fakes mean M1-M4 logic is testable without real provider accounts.

## 5. Staging data

Never copy production WhatsApp conversations/customer database into staging.

Use:

- synthetic customers;
- dedicated internal phone numbers;
- test marketplace listings where available;
- redacted/minimized fixtures.

If a production incident requires reproduction, create the smallest sanitized fixture necessary.

## 6. Secrets

Local: ignored `.env.local`.

CI: GitHub encrypted secrets only when a real integration job is explicitly enabled.

Staging/production: host secret files or secret manager, never repository files.

## 7. Database separation

~~~text
yubie_dev
yubie_test
yubie_stage
yubie_prod
~~~

No application role has permission to another environment database.

## 8. Feature flag separation

Production flags do not inherit staging state automatically.

High-risk examples:

~~~text
assistant.auto_reply.PRODUCT_INFO
assistant.auto_reply.B2B
crm.sync.enabled
marketplace.shopee.read_api
marketplace.tokopedia.read_api
marketplace.write.enabled
~~~

## 9. External-account inventory

Maintain a non-secret registry:

~~~text
provider
environment
account/shop/WABA identifier
owner
credential location
callback URLs
approved scopes
renewal/rotation date
status
~~~

This prevents accidentally connecting staging to a production merchant account.

## 10. Promotion

~~~text
local/CI
 -> staging deploy
 -> migration
 -> smoke
 -> provider contract
 -> shadow/read-only
 -> production deploy
 -> health/metric hold
~~~

No "works on staging" assumption substitutes for production rollout monitoring.
