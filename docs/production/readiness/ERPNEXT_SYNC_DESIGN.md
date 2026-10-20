# ERPNext sync design

Recorded 2026-10-20 after main `84b6603`. No ERPNext process is installed. The shared VPS and RetroPick were not changed.

## Authority

`erpStockWriteDecision()` still returns `allowed: false` / `dual_master_unproven`. Checkout does not post Stock Entries, Sales Invoices, or Payment Entries.

`stockDiscrepancyReport()` compares two in-memory quantity lists. A positive delta means Yubie is higher. It does not call the network.

`ErpNextShadowClient.read` remains GET-only under `/api/resource/` on an https origin. `write` returns `refused` and does not call the network.

## Shadow reconcile (built, not scheduled)

- `validateErpMappings` requires one ERP item code per Yubie product size and one size per item code, with a strict item-code and warehouse format. The mapped warehouse must be the released (QA-passed) warehouse.
- `ErpNextStockReader` reads `Bin.actual_qty` through the GET-only shadow client, filtered by mapped item codes and warehouse. Fractional, negative, or malformed quantities and items outside the mapping are `invalid_response`, never rounded or trusted.
- `runErpShadowReconcile` compares sellable Yubie stock with ERP stock. A mismatch enqueues one `erp.stock_discrepancy_reported` outbox event (deduped per run). Failures retry with exponential backoff (1 min doubling, capped at 30 min) for 6 attempts, then enqueue `erp.shadow_reconcile_dead_letter` for an operator. A failed dead-letter write throws. It has no write port and refuses to run if `erpStockWriteDecision` is ever opened.
- Tests: `packages/application/tests/erp-shadow-reconcile.test.mjs`, `packages/integrations/tests/erpnext-stock-reader.test.mjs` (local mock Frappe).
- Not scheduled in the worker: no ERP host, item mapping, or credentials are approved.

## Proposed one-way flow, after a host is approved

1. ERPNext is the physical on-hand, batch, warehouse, and QA record for the four product families.
2. Yubie keeps checkout reservations and order payments.
3. A worker reads released ERP batches and writes a discrepancy report. It does not adjust Yubie `quantity_on_hand` until finance signs the report and a later PR changes `erpStockWriteDecision`.
4. Failed reads go to a durable outbox row with a retry count. They are not dropped. A dead letter is an operator queue, not an automatic stock write.

## Still blocked

An isolated ERPNext host and its cost are BLOCKED_EXTERNAL. This design is not a running ERPNext.
