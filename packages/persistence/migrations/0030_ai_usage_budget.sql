-- WA-03 (GOAL_PLAN): bounded AI opt-in usage accounting.
-- ai_usage_reservations: one row per generation intent, idempotent by
-- request_id (the assistant_outbox payload fingerprint). Reserved amounts are
-- counted against caps conservatively; actuals are reconciled exactly once on
-- completion for cost reporting.
-- ai_usage_periods: atomic per-scope counters (conversation / contact-day /
-- global-day / global-month) incremented inside the same locked transaction
-- as the reservation insert, so concurrent requests can never overshoot caps.
-- Additive only. Rollback: DROP TABLE ai_usage_reservations, ai_usage_periods
-- (safe: feature default-off; no other table references these).

CREATE TABLE ai_usage_reservations (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE,
  contact_hash TEXT NOT NULL,
  provider_thread_id TEXT NOT NULL,
  day_key TEXT NOT NULL,
  month_key TEXT NOT NULL,
  reserved_input_tokens INTEGER NOT NULL,
  reserved_output_tokens INTEGER NOT NULL,
  actual_input_tokens INTEGER,
  actual_output_tokens INTEGER,
  model TEXT NOT NULL,
  price_version TEXT NOT NULL,
  estimated_cost_microusd BIGINT NOT NULL DEFAULT 0,
  actual_cost_microusd BIGINT,
  state TEXT NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved','completed','failed','expired','refunded')),
  failure_reason TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ai_usage_reservations_contact ON ai_usage_reservations (contact_hash, created_at);
CREATE INDEX ai_usage_reservations_active ON ai_usage_reservations (contact_hash) WHERE state = 'reserved';

CREATE TABLE ai_usage_periods (
  id TEXT PRIMARY KEY,
  subject_hash TEXT NOT NULL,
  period_key TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('conversation','contact_day','global_day','global_month')),
  request_count INTEGER NOT NULL DEFAULT 0,
  reserved_tokens INTEGER NOT NULL DEFAULT 0,
  actual_tokens INTEGER NOT NULL DEFAULT 0,
  cost_microusd BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ai_usage_periods_subject ON ai_usage_periods (subject_hash, period_key, scope);
