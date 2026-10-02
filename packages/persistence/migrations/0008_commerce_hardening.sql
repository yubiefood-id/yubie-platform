-- Commerce hardening (B4/B5/B6): opaque public checkout token, totals
-- breakdown (subtotal/shipping/discount/tax/grand-total, integer IDR),
-- payment intent rows before the provider session exists, provider
-- references + reconciliation state, and stored idempotent responses.
-- Expand-only; existing rows are backfilled from total_amount.

ALTER TABLE orders
  ADD COLUMN checkout_public_token TEXT,
  ADD COLUMN subtotal_amount INTEGER,
  ADD COLUMN shipping_amount INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN discount_amount INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN tax_amount INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN grand_total_amount INTEGER,
  ADD COLUMN shipping_jsonb JSONB;

-- Backfill: legacy rows carry a single total; grand_total = subtotal, free shipping.
UPDATE orders SET
  checkout_public_token = replace(gen_random_uuid()::text, '-', ''),
  subtotal_amount = total_amount,
  grand_total_amount = total_amount,
  shipping_jsonb = '{"policy":"free_promotional","amount":0}'::jsonb
WHERE checkout_public_token IS NULL;

ALTER TABLE orders
  ALTER COLUMN checkout_public_token SET NOT NULL,
  ALTER COLUMN subtotal_amount SET NOT NULL,
  ALTER COLUMN grand_total_amount SET NOT NULL;

CREATE UNIQUE INDEX orders_checkout_public_token ON orders (checkout_public_token);

ALTER TABLE orders
  ADD CONSTRAINT orders_grand_total_check
    CHECK (grand_total_amount = subtotal_amount + shipping_amount + tax_amount - discount_amount),
  ADD CONSTRAINT orders_amounts_nonnegative
    CHECK (subtotal_amount >= 0 AND shipping_amount >= 0 AND discount_amount >= 0 AND tax_amount >= 0 AND grand_total_amount >= 0);

-- Payment intents exist before the provider call; the session id attaches after.
ALTER TABLE order_payments ALTER COLUMN provider_session_id DROP NOT NULL;
DROP INDEX order_payments_provider_session;
CREATE UNIQUE INDEX order_payments_provider_session ON order_payments (provider, provider_session_id) WHERE provider_session_id IS NOT NULL;

ALTER TABLE order_payments
  ADD COLUMN provider_business_id TEXT,
  ADD COLUMN provider_payment_id TEXT,
  ADD COLUMN reconciliation_state TEXT;

CREATE INDEX order_payments_pending_expiry ON order_payments (expires_at) WHERE status = 'pending';
CREATE INDEX order_payments_reconciliation ON order_payments (reconciliation_state) WHERE reconciliation_state IS NOT NULL;

CREATE INDEX orders_stale_drafts ON orders (created_at) WHERE status = 'draft';

-- Checkout idempotency: replayed requests return the stored first response.
ALTER TABLE idempotency_keys ADD COLUMN response_json TEXT;
