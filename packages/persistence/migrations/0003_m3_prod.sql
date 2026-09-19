-- M3-PROD: webhook minimization, outbound outbox, runtime config, extended audit

CREATE TYPE assistant_outbox_status AS ENUM (
  'pending',
  'delivering',
  'delivered',
  'retry',
  'ambiguous',
  'failed'
);

ALTER TABLE webhook_inbox
  ADD COLUMN IF NOT EXISTS dedupe_key TEXT,
  ADD COLUMN IF NOT EXISTS conversation_ref TEXT,
  ADD COLUMN IF NOT EXISTS message_ref TEXT,
  ADD COLUMN IF NOT EXISTS contact_ref TEXT,
  ADD COLUMN IF NOT EXISTS inbox_ref TEXT,
  ADD COLUMN IF NOT EXISTS provider_timestamp TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS raw_body_expires_at TIMESTAMPTZ;

ALTER TABLE webhook_inbox ALTER COLUMN raw_body DROP NOT NULL;

CREATE INDEX IF NOT EXISTS webhook_inbox_conversation_ref ON webhook_inbox (conversation_ref);
CREATE INDEX IF NOT EXISTS webhook_inbox_raw_body_expires ON webhook_inbox (raw_body_expires_at)
  WHERE raw_body IS NOT NULL;

ALTER TABLE assistant_runs
  ADD COLUMN IF NOT EXISTS conversation_ref TEXT,
  ADD COLUMN IF NOT EXISTS message_ref TEXT,
  ADD COLUMN IF NOT EXISTS classifier_version TEXT,
  ADD COLUMN IF NOT EXISTS policy_version TEXT,
  ADD COLUMN IF NOT EXISTS knowledge_version TEXT,
  ADD COLUMN IF NOT EXISTS model_name TEXT,
  ADD COLUMN IF NOT EXISTS tool_names TEXT,
  ADD COLUMN IF NOT EXISTS validator_outcome TEXT,
  ADD COLUMN IF NOT EXISTS handoff_reason TEXT,
  ADD COLUMN IF NOT EXISTS token_usage INTEGER;

CREATE TABLE assistant_outbox (
  id TEXT PRIMARY KEY,
  run_id TEXT REFERENCES assistant_runs(id),
  conversation_ref TEXT NOT NULL,
  action_type TEXT NOT NULL,
  payload_fingerprint TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  provider_external_id TEXT,
  status assistant_outbox_status NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  delivered_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX assistant_outbox_fingerprint ON assistant_outbox (conversation_ref, payload_fingerprint);
CREATE INDEX assistant_outbox_status_created ON assistant_outbox (status, created_at);

CREATE TABLE assistant_runtime_config (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE TABLE assistant_runtime_config_audit (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL,
  old_value_json TEXT,
  new_value_json TEXT NOT NULL,
  changed_by TEXT NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX assistant_runtime_config_audit_key ON assistant_runtime_config_audit (key, changed_at);
