# Phase M1 — Marketplace Routing and Attribution

## 1. Problem

Marketplace URLs embedded directly in components become stale, hard to measure and vulnerable to inconsistent mapping. The company needs a safe owned routing layer before deeper marketplace API work.

## 2. Outcome

Every sellable product presents only verified marketplace destinations. Yubie can measure outbound intent by product/channel/source without claiming that an outbound click equals a sale.

## 3. Architecture additions

M1 introduces the first durable backend foundation:

~~~text
packages/application
packages/persistence
packages/integrations
apps/worker
PostgreSQL
pg-boss
~~~

If creating all packages at once creates an oversized PR, sequence them across M1 sub-PRs while preserving the target boundaries.

## 4. Database

Minimum:

~~~text
marketplace_listings
outbound_clicks
whatsapp_intents
idempotency_keys
outbox_events
audit_events
operator_tasks
integration_health
~~~

Marketplace listing URLs are server-owned.

## 5. APIs

~~~text
GET /v1/products/:slug/purchase-options
GET /go/:channel/:listingKey
GET /go/whatsapp/:intentKey
GET /healthz
GET /readyz
~~~

Redirect routes validate:

- enum channel;
- known listing key;
- ACTIVE status;
- HTTPS;
- allowed marketplace host.

## 6. Redirect semantics

Preferred:

~~~text
request
 -> validate listing
 -> append lightweight intent event
 -> return redirect
~~~

Analytics failure must not create an endless customer wait. Define a bounded timeout and operator alert.

## 7. Listing lifecycle

~~~text
DRAFT -> ACTIVE -> PAUSED/BROKEN -> ACTIVE -> RETIRED
~~~

Only ACTIVE records appear publicly.

## 8. Operator workflow

Minimum can be config/admin script initially:

~~~text
list active links
verify
activate/pause
record verifier/time
show last health result
~~~

Do not build a broad admin dashboard merely for CRUD.

## 9. Link-health job

Worker performs conservative checks. It does not scrape protected listing content or automate purchase.

A broken-link result creates an operator task.

## 10. Source/campaign attribution

Allowlist fields:

~~~text
source
campaign
product
root?
placement
destination channel
~~~

Reject uncontrolled high-cardinality free text.

## 11. Privacy

Outbound click data should be anonymous/minimized.

Do not require phone/email to route to a marketplace.

## 12. Local/CI

Fake listing provider plus synthetic DB.

Tests:

- active link;
- paused link;
- retired link;
- unknown key;
- invalid channel;
- destination not allowlisted;
- analytics DB failure;
- health check timeout;
- duplicate request;
- source/campaign validation.

## 13. Production VPS

M1 is the first phase needing:

- Yubie Postgres;
- API process;
- worker;
- backup;
- reverse proxy;
- health monitoring.

Use the VPS handbook.

## 14. Metrics

- redirect availability;
- marketplace click rate;
- link-health age;
- broken listing count;
- redirect error count.

## 15. Rollback

Feature flag purchase-option source between:

~~~text
static verified links
database listing registry
~~~

Preserve previous verified destinations for emergency rollback.

## 16. GO gate

GO when:

- every live marketplace CTA uses server-owned mapping;
- no open redirect;
- DB survives restart;
- link-health exceptions are visible;
- backup exists;
- redirect SLO/alerts exist;
- website works even if deeper marketplace APIs do not exist.
