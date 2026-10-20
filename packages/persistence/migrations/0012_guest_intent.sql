-- Checkout principals become 'user:<id>' or 'guest:<sha256 of the checkout cookie>'.
-- Every pending intent with a principal is unresolved, whatever its reconciliation
-- flag: states that end an intent also move it out of 'pending'.
-- Additive: no column is dropped and no payment row is deleted.

UPDATE order_payments
   SET principal_key = 'user:' || principal_key
 WHERE principal_key IS NOT NULL
   AND principal_key NOT LIKE 'user:%'
   AND principal_key NOT LIKE 'guest:%';

-- Rows the 0011 allowlist did not cover may duplicate a newer intent. Keep the
-- newest one keyed; older duplicates stay in place for reconciliation.
WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY principal_key, request_hash ORDER BY created_at DESC, id DESC) AS rn
    FROM order_payments
   WHERE status = 'pending' AND principal_key IS NOT NULL AND request_hash IS NOT NULL
)
UPDATE order_payments p
   SET principal_key = NULL
  FROM ranked r
 WHERE p.id = r.id AND r.rn > 1;

ALTER TABLE order_payments
  ADD CONSTRAINT order_payments_principal_key_format
  CHECK (principal_key IS NULL OR principal_key ~ '^(user:.+|guest:[0-9a-f]{64})$');

DROP INDEX IF EXISTS order_payments_unresolved_request;

CREATE UNIQUE INDEX order_payments_unresolved_request
  ON order_payments (principal_key, request_hash)
  WHERE status = 'pending'
    AND principal_key IS NOT NULL
    AND request_hash IS NOT NULL;
