# 21 — Marketplace Integration and Attribution

## MarketplaceProvider

~~~ts
interface MarketplaceProvider {
  listListings(input: ListingQuery): Promise<ListingSnapshot[]>;
  fetchListing(ref: ListingRef): Promise<ListingSnapshot>;
  listOrders?(input: OrderWindow): AsyncIterable<MarketplaceOrderSnapshot>;
  fetchOrder?(ref: MarketplaceOrderRef): Promise<MarketplaceOrderSnapshot>;
  listStatistics?(input: StatisticsWindow): Promise<MarketplaceStatistics>;
  updateInventory?(input: InventoryUpdate): Promise<ProviderResult>;
}
~~~

Capabilities vary by provider/access.

## Maturity ladder

**L0:** verified listing URLs.
**L1:** official seller report import.
**L2:** approved read APIs/webhooks.
**L3:** controlled write APIs.

## Shopee

Use Shopee Open Platform only when Yubie's seller/app has approved access for the required capability. Do not scrape Seller Center or treat affiliate API as seller-operations API.

## Tokopedia & Shop

Official partner guidance for Indonesia says migrated/new merchant operations use TikTok Shop APIs for new data while historical Tokopedia data can have legacy access. Model public channel separately from the integration provider and verify the merchant migration state before implementation.

## Listing registry

~~~
listing_key
marketplace
product_id
sku_id?
shop_key
external_listing_id?
public_url
status
verified_at
last_checked_at
integration_provider?
~~~

## Tracked redirect

GET /go/shopee/yubie-flour-250 validates the fixed server-owned listing, records non-PII intent and redirects.

A click is not proof of purchase.

## Report import

~~~
source -> checksum -> import batch -> validation -> staging -> SKU mapping -> projection -> exception report
~~~

Unknown SKU/status is explicit, never silently dropped.

## Future stock sync

If ERPNext becomes stock authority:

~~~
ERPNext -> channel policy/safety buffer -> marketplace adapter -> reconciliation
~~~
