# Phase M6 — Marketplace APIs

## 1. Entry gate

M6 does **not** start because APIs exist.

Start only when:

- Yubie has approved seller/developer access;
- M5 establishes current manual/reporting cost;
- API capabilities match a real business problem;
- owner accepts maintenance/credential burden.

## 2. Integration strategy

Read first.

Priority candidates:

~~~text
listing metadata
shop/listing mapping
orders
statistics
returns/refunds
webhooks
~~~

Write capabilities such as catalog/stock synchronization are a separate later gate.

## 3. Provider abstraction

~~~text
MarketplaceProvider
  ShopeeAdapter
  TokopediaShopAdapter
  StaticListingAdapter
  ReportImportAdapter
~~~

Application code must tolerate different capability sets.

## 4. Tokopedia & Shop

Before coding:

- identify Yubie's merchant type/migration status;
- identify current required Partner Center API;
- inventory historical Tokopedia data requirement;
- record shop/product mapping;
- register webhooks only from official docs/current API version.

Do not assume 2024-era endpoints are permanent.

## 5. Shopee

Before coding:

- distinguish seller/open-platform access from affiliate APIs;
- confirm app/seller authorization;
- document scopes;
- rate limits;
- signing/token rules;
- webhook retry behavior;
- sandbox/development shop availability.

## 6. OAuth/token lifecycle

Persist encrypted/securely stored provider token metadata, not raw secrets in application tables where avoidable.

Track:

~~~text
provider account
scope
issued/updated
expiry
refresh health
owner
rotation procedure
~~~

## 7. Read synchronization

~~~text
scheduled poll/webhook
 -> inbox/cursor
 -> adapter
 -> normalized snapshot
 -> reconciliation
 -> derived projection
~~~

Use cursor/checkpoint so jobs resume after failure.

## 8. Webhooks

Webhook is a low-latency signal, not the only source of truth.

Periodic reconciliation checks missed events and drift.

## 9. Rate limits

- central limiter;
- provider-specific budget;
- jitter;
- 429 Retry-After where supplied;
- pause non-critical sync before critical support paths;
- no unbounded parallel scans.

## 10. Write API gate

Any marketplace write needs an ADR covering:

- source of truth;
- conflict resolution;
- idempotency;
- reconciliation;
- manual override;
- safety buffer;
- rollback/compensation.

Example future stock sync should originate from one stock master, not from website click data.

## 11. Tests

- token expiry;
- refresh failure;
- 429;
- timeout;
- provider 5xx;
- schema field added/removed;
- duplicate/out-of-order webhook;
- missed webhook recovered by reconcile;
- cursor resume;
- clock skew/signature issue.

## 12. GO gate

Production API integration must reduce measured operational burden without creating unowned data conflicts.
