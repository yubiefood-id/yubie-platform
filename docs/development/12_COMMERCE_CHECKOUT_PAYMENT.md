# 12 — Marketplace Commerce and Direct Checkout Deferral

## Current decision

Shopee and Tokopedia & Shop are the primary D2C transaction systems.

The Yubie website is not currently the payment boundary. The previous first-party checkout/payment architecture is reference material for a future decision and must not receive production payment credentials.

## Current flow

~~~
Yubie product page
 -> approved marketplace option
 -> tracked allowlisted redirect
 -> marketplace listing
 -> marketplace checkout/payment/returns
~~~

WhatsApp assists the buyer but does not collect card/bank credentials.

## Public CTA

For sellable items, show only verified destinations such as:

- Beli di Shopee;
- Beli di Tokopedia;
- Tanya via WhatsApp.

Do not hard-code dynamic marketplace promo price or stock unless an approved synchronization source and freshness rule exists.

## Marketplace authority

Marketplace owns consumer checkout, payment, order lifecycle, marketplace refunds/cancellation, platform promotions and marketplace buyer identity.

Yubie may import normalized outcome data for analytics/support.

## Integration maturity

~~~
L0 verified URLs + Seller Center
L1 official report/CSV import
L2 approved read APIs/webhooks
L3 controlled write APIs
~~~

Advance only when access and measurable value justify it.

For Tokopedia & Shop, determine whether the merchant is migrated and whether TikTok Shop API or historical Tokopedia access applies.

## Direct commerce re-entry

A new ADR is required. It must demonstrate a material need such as margin, customer experience, channel ownership or B2B requirements.
