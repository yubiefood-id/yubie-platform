-- Expand-only: ownership-scoped recovery works after a lost create response,
-- even if the payment becomes terminal before the first browser recovery read.
ALTER TABLE idempotency_keys ADD COLUMN resource_id TEXT REFERENCES orders(id);
CREATE INDEX idempotency_keys_resource ON idempotency_keys(resource_id) WHERE resource_id IS NOT NULL;
