# 29 — Marketplace Routing, Imports and Analytics

## 1. Goal

Treat Shopee and Tokopedia & Shop as transaction systems while Yubie owns discovery, channel choice, attribution and management of verified listing destinations.

## 2. Listing registry

Minimum record:

~~~text
listing_key
marketplace
shop_key
product_id
sku_id?
external_listing_id?
public_url
integration_provider?
status
verified_at
verified_by
last_checked_at
~~~

Status:

~~~text
DRAFT
ACTIVE
PAUSED
BROKEN
RETIRED
~~~

Only ACTIVE + verified records become public purchase options.

## 3. Tracked redirect

Public route:

~~~text
GET /go/:channel/:listingKey
~~~

Algorithm:

1. normalize/validate path;
2. query server-owned listing;
3. require ACTIVE and allowed scheme/host;
4. append outbound intent event;
5. respond with 302/307 to stored destination;
6. include no customer PII in URL.

Never implement `/go?url=<user-input>`.

## 4. Link-health

Worker checks only safe public URLs with conservative frequency.

Health result:

~~~text
OK
REDIRECTED_EXPECTED
AUTH_REQUIRED
NOT_FOUND
BLOCKED
TIMEOUT
UNKNOWN
~~~

Do not simulate purchase or scrape protected seller pages.

Broken listing creates operator task and removes purchase CTA only if policy says fail-closed.

## 5. WhatsApp attribution

Use server-owned intent keys:

~~~text
/go/whatsapp/flour-b2c
/go/whatsapp/flour-b2b-sample
~~~

Persist source/campaign/product/root context before redirecting to click-to-chat.

Do not embed sensitive identifiers into prefilled WhatsApp text.

## 6. Marketplace data ladder

### L0 — Links

Verified listing URLs and manual Seller Center operations.

### L1 — Official exports

Preferred first backend intelligence step.

Import:

~~~text
upload/reference
 -> checksum
 -> staging
 -> validate schema
 -> map SKU/status
 -> exceptions
 -> normalized projection
 -> analytics
~~~

### L2 — Read API/webhook

Only after seller/app access is approved.

### L3 — Write API

Catalog/stock writes require:

- source-of-truth owner;
- idempotency/reconciliation;
- dry-run/shadow;
- rate-limit handling;
- operator audit;
- rollback.

## 7. Tokopedia & Shop

Model public sales channel separately from API implementation.

~~~text
channel = TOKOPEDIA
provider = TIKTOK_SHOP_API | TOKOPEDIA_LEGACY_API
~~~

For migrated Indonesian merchants, new operations may use TikTok Shop APIs while historical Tokopedia data can follow legacy access paths. Verify the actual Yubie merchant migration state before coding an adapter.

## 8. Shopee

Do not assume affiliate APIs provide seller operations.

Before L2:

- confirm the exact Yubie seller account;
- confirm approved developer/open-platform credentials;
- inventory available scopes;
- document rate limits/webhook semantics;
- create provider contract fixtures.

Otherwise remain at L0/L1.

## 9. Analytics truth

Two separate funnels:

~~~text
OWNED INTENT
page view -> marketplace click -> WhatsApp start

MARKETPLACE OUTCOME
listing impressions -> marketplace orders -> revenue -> cancel/return
~~~

Never claim a website click converted to an order unless legitimate marketplace data provides a supported linkage.

## 10. Core metrics

- product -> marketplace CTR;
- channel split;
- listing failure rate;
- WhatsApp starts by product/source;
- marketplace orders/revenue by SKU/channel/day;
- cancellation/return;
- import freshness;
- unknown-SKU exception count.

## 11. Import security

- file size/type limit;
- no spreadsheet formula execution;
- virus/malware scan where appropriate;
- parse as data;
- restricted object storage;
- checksum/dedupe;
- operator identity/audit;
- retention policy.

## 12. Reconciliation

API/import data is eventually consistent.

Track:

~~~text
source_window
last_success_at
cursor
row_count
exception_count
fresh_until
~~~

Dashboards display freshness rather than silently showing stale data as current.
