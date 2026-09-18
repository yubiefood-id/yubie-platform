# 23 — Local Development: Marketplace + WhatsApp

## Goal

Daily development is lightweight; no real marketplace/WhatsApp/CRM account is required for ordinary work.

## Default stack

~~~
Node 22.13+
npm 11+
Docker Compose
apps/web
apps/api
apps/worker           target
PostgreSQL            target
FakeChatwoot
FakeCRM
FakeMarketplace
FakeAssistant
~~~

## Provider modes

~~~bash
CHAT_PROVIDER=fake
CRM_PROVIDER=fake
MARKETPLACE_SHOPEE_PROVIDER=static
MARKETPLACE_TOKOPEDIA_PROVIDER=static
ASSISTANT_PROVIDER=fake
~~~

## Suggested ports

~~~
web 5173
api 8787
postgres 5432
chatwoot 3002 optional
crm 3000/3001 optional
mailpit 8025
~~~

## Fixtures

Marketplace: active/disabled listing, changed URL, unknown SKU, duplicate/malformed report, timeout, rate limit.

Chatbot: product question, where-to-buy, B2B, complaint, food safety, human request, prompt injection, unknown product, duplicate signed webhook.

CI never needs real Meta/Shopee/Tokopedia credentials.

## Target commands

~~~bash
npm run infra:up
npm run db:migrate
npm run db:seed
npm run dev:web
npm run dev:api
npm run dev:worker
npm run assistant:eval
npm run check
~~~

Real adapter workflow: fake contract -> real happy path -> failure/timeout/duplicate -> reconciliation -> verify no duplicate action -> return to fake mode.
