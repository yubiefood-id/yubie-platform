# Phase M5 — Marketplace Intelligence

## 1. Problem

Transactions occur offsite, so owned-site click analytics alone cannot answer revenue, cancellations, returns or SKU performance.

## 2. Outcome

Management can ingest official seller reports reproducibly and view normalized channel/SKU metrics with explicit freshness and exception handling.

## 3. Why report import first

Report/CSV import:

- works before developer API approval;
- creates real mapping knowledge;
- reveals source schema instability;
- gives immediate business value;
- becomes contract fixture for future API adapters.

## 4. Import architecture

~~~text
source file
 -> object storage
 -> checksum
 -> import batch
 -> staging parser
 -> validation
 -> SKU/channel mapping
 -> exceptions
 -> normalized projection
 -> aggregate views
~~~

Raw source is retained according to approved retention/access policy.

## 5. Supported first metrics

Where present in official source:

- order count;
- gross/net sales;
- units by SKU;
- cancellation;
- return/refund;
- promotion/platform deductions;
- order timestamps;
- listing/shop ID.

Do not fabricate fields missing from a marketplace export.

## 6. Data quality

Every import reports:

~~~text
rows total
rows accepted
rows rejected
unknown SKU
unknown status
duplicate source row
currency mismatch
period mismatch
checksum duplicate
~~~

Unknown records never silently disappear.

## 7. Idempotency

Same file checksum + same parser version cannot duplicate published outcomes.

If parser version changes, reprocessing creates a new versioned projection/audit record.

## 8. Dashboard

Start with SQL/Metabase or simple internal report; do not build a large BI product.

Show:

- source freshness;
- channel revenue/order trend;
- SKU trend;
- cancellations/returns;
- mapping exceptions;
- owned click/WhatsApp intent separately.

## 9. Attribution discipline

Do not compute:

~~~text
website click -> exact marketplace order
~~~

unless a supported identifier/marketplace mechanism exists.

Use directional metrics:

~~~text
owned intent trend
vs
marketplace outcome trend
~~~

## 10. Security

- parser treats cells as data;
- formula content not executed;
- file size/type limits;
- uploader/operator audit;
- restricted source storage;
- no public download URL.

## 11. Tests

Fixtures from sanitized/official sample schemas:

- normal;
- duplicate;
- malformed header;
- unknown SKU;
- new status;
- bad currency;
- truncated file;
- large file;
- partial failure;
- replay.

## 12. GO gate

Business dashboard numbers can be traced to an import batch and every rejected row is explainable.
