# Phase M7 — ERP and Back-office Integration

## 1. Entry gate

ERP is introduced only after measured physical-operation pain, such as:

- stock drift causing cancellation;
- repetitive multi-channel stock updates;
- batch/expiry traceability burden;
- procurement/manufacturing complexity;
- QA/release workflow needs;
- accounting/COGS process needing a system of record.

## 2. Recommended role

ERPNext is the leading OSS candidate for:

~~~text
Item/SKU operations
warehouse/stock
batch/expiry
QA inspection/release
procurement
manufacturing
accounting
physical fulfilment documents
~~~

Yubie Core remains authority for public product-fact approval, assistant policy, channel attribution and B2B qualification.

## 3. System-of-record map

If adopted:

~~~text
ERPNext = physical stock/batch/warehouse/production truth
Yubie   = channel/product-publication/conversation/lead truth
Marketplace = marketplace order/payment truth
Chatwoot = conversation truth
CRM = sales-pipeline truth
~~~

Do not create competing writable inventory ledgers.

## 4. SKU mapping

Stable mapping:

~~~text
Yubie sku_id
ERP item_code
marketplace listing/SKU refs
commercial spec version
~~~

Mapping changes are audited.

## 5. Batch traceability

Minimum desired chain:

~~~text
supplier/raw lot
 -> production batch
 -> finished SKU batch
 -> marketplace order/sample dispatch
 -> complaint/recall lookup
~~~

If marketplace API does not expose recipient/order data needed for a recall, define an operator export/import process.

## 6. Sample workflow

~~~text
B2B qualified
 -> sample approved
 -> exact SKU
 -> ERP stock/batch allocation
 -> dispatch
 -> Yubie traceability reference
 -> CRM activity
~~~

A sample is not just a CRM note.

## 7. Stock sync

Only after ERP is authoritative.

~~~text
ERP available stock
 -> channel policy/safety buffer
 -> marketplace adapter
 -> provider write
 -> reconciliation
~~~

Do not promise real-time synchronization if provider APIs do not support it reliably.

## 8. ERP outage

Marketplace/store operations must have a documented degraded mode.

Do not accept automated inventory writes while ERP truth is stale beyond policy threshold.

## 9. Food safety

ERP quarantine/release state can feed Yubie safety projection.

Assistant never exposes internal QA details; complaint goes to human/safety workflow.

## 10. Tests

- SKU mapping;
- batch released/quarantined;
- ERP unavailable;
- stale stock;
- duplicate allocation;
- sample traceability;
- recall query;
- marketplace sync drift;
- import/reconciliation after ERP recovery.

## 11. Deployment

Prefer isolated ERP database/runtime. Do not install ERP tables in Yubie Postgres.

## 12. GO gate

ERP adoption must measurably improve physical operations and recall/QA reliability rather than merely add software.
