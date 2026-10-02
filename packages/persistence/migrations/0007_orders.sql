-- ADR-012: first-party orders and Xendit payment sessions.
-- The server is the only monetary authority: totals are always recomputed
-- from the canonical catalog; browser-submitted amounts are never trusted.

CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  checkout_ref TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_payment',
  user_id TEXT REFERENCES users (id),
  customer_email TEXT NOT NULL,
  customer_name TEXT,
  delivery_jsonb JSONB,
  currency TEXT NOT NULL DEFAULT 'IDR',
  total_amount INTEGER NOT NULL,
  lines_jsonb JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX orders_checkout_ref ON orders (checkout_ref);
CREATE INDEX orders_user_created ON orders (user_id, created_at DESC);
CREATE INDEX orders_status_updated ON orders (status, updated_at);

CREATE TABLE order_payments (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders (id),
  provider TEXT NOT NULL,
  provider_session_id TEXT NOT NULL,
  redirect_url TEXT,
  currency TEXT NOT NULL DEFAULT 'IDR',
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX order_payments_provider_session ON order_payments (provider, provider_session_id);
CREATE INDEX order_payments_order ON order_payments (order_id);
CREATE INDEX order_payments_status ON order_payments (status);

CREATE TABLE payment_events (
  id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL REFERENCES order_payments (id),
  dedupe_key TEXT NOT NULL,
  event TEXT NOT NULL,
  outcome TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL
);

-- Webhook idempotency: a provider delivery replays the same dedupe key and
-- must never transition the payment twice.
CREATE UNIQUE INDEX payment_events_dedupe ON payment_events (dedupe_key);
CREATE INDEX payment_events_payment ON payment_events (payment_id);
