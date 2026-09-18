# 13 — Marketplace Operations, Inventory and Food Traceability

## Current priority

Marketplace checkout removes web inventory reservation from the critical path, but it does not remove Yubie's food-safety and traceability obligations.

## Initial operating model

At early volume:

- seller teams manage marketplace order/stock workflows in Seller Center;
- Yubie keeps a controlled SKU/listing mapping;
- batch/lot used for shipped goods is recorded in the operational process;
- marketplace sales/order reports are imported when needed.

Do not build real-time omni-channel stock infrastructure before a measured problem exists.

## ERPNext role

ERPNext remains a candidate for stock, batch/expiry, QA, procurement, manufacturing and accounting.

It is not a prerequisite for M1 marketplace routing, M2 Chatwoot or M3 chatbot.

## Automation triggers

Deeper ERP/marketplace stock automation becomes justified when there is evidence of:

- oversell/cancellation from stock drift;
- repeated manual updates across channels;
- slow/incomplete batch traceability;
- order/SKU volume exceeding reliable manual control;
- manufacturing/procurement/accounting complexity.

Set numeric thresholds after collecting baseline data rather than inventing them in architecture.

## Traceability

Where marketplace order data is available:

~~~
marketplace order/reference
 -> Yubie SKU
 -> packed batch/lot
 -> dispatch
 -> complaint/recall correlation
~~~

If a marketplace API does not expose necessary data, use a controlled operator/import process rather than scraping.

## Safety invariant

A serious complaint should be traceable, where operational data allows, to channel -> order/reference -> SKU -> batch -> QA/production evidence -> other potentially affected recipients.
