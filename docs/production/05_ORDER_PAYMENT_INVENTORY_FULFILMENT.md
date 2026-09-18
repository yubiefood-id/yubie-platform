# 05 — Marketplace Order, Payment, Inventory and Fulfilment

## Current decision

D2C orders/payments are executed by Shopee/Tokopedia & Shop, not yubie.id.

Yubie therefore does not need a production payment processor or first-party reservation stack for the current launch.

## Marketplace-owned

- checkout/payment;
- order status;
- cancellation/refund mechanics;
- marketplace promotion;
- platform logistics workflow where applicable.

## Yubie-owned

- product/listing mapping;
- outbound purchase intent;
- imported/API sales projection;
- support context;
- B2B workflows;
- food-safety/traceability processes outside marketplace transaction ownership.

## Inventory

Seller-center stock may remain operator-managed while volume is low. Introduce ERPNext/central inventory synchronization only after measured stock drift, oversell, traceability or manufacturing pain.

## Support

The WhatsApp bot must not promise to cancel/refund a marketplace order. It supplies approved guidance or human handoff and routes customers to the applicable marketplace process.

## Future direct commerce

The earlier payment/idempotency/webhook controls remain valid reference if a future ADR chooses direct checkout.
