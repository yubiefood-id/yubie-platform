-- One unresolved payable attempt per authenticated principal and request hash.
-- Guest rows leave principal_key null so anonymous shoppers do not share a lock.
-- Ambiguous creates stay inside the predicate and therefore cannot insert a second row.

ALTER TABLE order_payments ADD COLUMN principal_key TEXT;
ALTER TABLE order_payments ADD COLUMN request_hash TEXT;

CREATE UNIQUE INDEX order_payments_unresolved_request
  ON order_payments (principal_key, request_hash)
  WHERE status = 'pending'
    AND principal_key IS NOT NULL
    AND request_hash IS NOT NULL
    AND (
      reconciliation_state IS NULL
      OR reconciliation_state IN ('ambiguous_create', 'attach_failed', 'pending_reconciliation', 'creating')
    );
