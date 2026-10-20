# ERPNext sync design

Recorded 2026-10-20 after main `84b6603`. No ERPNext process is installed. The shared VPS and RetroPick were not changed.

## Authority

`erpStockWriteDecision()` still returns `allowed: false` / `dual_master_unproven`. Checkout does not post Stock Entries, Sales Invoices, or Payment Entries.

`stockDiscrepancyReport()` compares two in-memory quantity lists. A positive delta means Yubie is higher. It does not call the network.

`ErpNextShadowClient.read` remains GET-only under `/api/resource/` on an https origin. `write` returns `refused` and does not call the network.

## Proposed one-way flow, after a host is approved

1. ERPNext is the physical on-hand, batch, warehouse, and QA record for the four product families.
2. Yubie keeps checkout reservations and order payments.
3. A worker reads released ERP batches and writes a discrepancy report. It does not adjust Yubie `quantity_on_hand` until finance signs the report and a later PR changes `erpStockWriteDecision`.
4. Failed reads go to a durable outbox row with a retry count. They are not dropped. A dead letter is an operator queue, not an automatic stock write.

## Still blocked

An isolated ERPNext host and its cost are BLOCKED_EXTERNAL. This design is not a running ERPNext.
