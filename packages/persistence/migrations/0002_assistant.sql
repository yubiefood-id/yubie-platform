CREATE TYPE conversation_state AS ENUM (
  'BOT_ELIGIBLE',
  'BOT_ACTIVE',
  'HANDOFF_REQUESTED',
  'QUEUED',
  'HUMAN_ACTIVE',
  'RESOLVED'
);

CREATE TYPE webhook_inbox_status AS ENUM ('received', 'processing', 'processed', 'failed', 'duplicate');

CREATE TABLE webhook_inbox (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'chatwoot_agentbot',
  delivery_id TEXT,
  event_type TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  raw_body TEXT NOT NULL,
  status webhook_inbox_status NOT NULL DEFAULT 'received',
  received_at TIMESTAMPTZ NOT NULL,
  processed_at TIMESTAMPTZ,
  last_error TEXT
);

CREATE UNIQUE INDEX webhook_inbox_provider_delivery ON webhook_inbox (provider, delivery_id) WHERE delivery_id IS NOT NULL;
CREATE UNIQUE INDEX webhook_inbox_provider_hash ON webhook_inbox (provider, payload_hash);
CREATE INDEX webhook_inbox_status_received ON webhook_inbox (status, received_at);

CREATE TABLE conversation_sessions (
  id TEXT PRIMARY KEY,
  chatwoot_conversation_id TEXT NOT NULL,
  chatwoot_contact_id TEXT NOT NULL,
  inbox_id TEXT NOT NULL,
  state conversation_state NOT NULL DEFAULT 'BOT_ELIGIBLE',
  current_intent TEXT,
  customer_type TEXT,
  last_activity_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX conversation_sessions_chatwoot_id ON conversation_sessions (chatwoot_conversation_id);
CREATE INDEX conversation_sessions_state ON conversation_sessions (state, last_activity_at);

CREATE TABLE assistant_runs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES conversation_sessions(id),
  inbox_event_id TEXT NOT NULL,
  intent TEXT,
  risk TEXT,
  model_provider TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  latency_ms INTEGER,
  outcome TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX assistant_runs_session_created ON assistant_runs (session_id, created_at);

CREATE TABLE assistant_actions (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES assistant_runs(id),
  action_type TEXT NOT NULL,
  tool_name TEXT,
  details_json TEXT,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE assistant_prompt_versions (
  id TEXT PRIMARY KEY,
  version TEXT NOT NULL UNIQUE,
  content TEXT NOT NULL,
  effective_from TIMESTAMPTZ NOT NULL,
  effective_until TIMESTAMPTZ
);

CREATE TABLE knowledge_items (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  scope TEXT NOT NULL,
  scope_id TEXT,
  locale TEXT NOT NULL DEFAULT 'id',
  approval_status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE knowledge_versions (
  id TEXT PRIMARY KEY,
  knowledge_id TEXT NOT NULL REFERENCES knowledge_items(id),
  version INTEGER NOT NULL,
  approved_content TEXT NOT NULL,
  effective_from TIMESTAMPTZ NOT NULL,
  effective_until TIMESTAMPTZ,
  source_reference TEXT,
  UNIQUE (knowledge_id, version)
);

CREATE TABLE assistant_eval_cases (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  input_text TEXT NOT NULL,
  expected_intent TEXT NOT NULL,
  expected_risk TEXT NOT NULL,
  expected_outcome TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'id',
  tags TEXT NOT NULL DEFAULT ''
);

CREATE TABLE assistant_eval_results (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES assistant_eval_cases(id),
  prompt_version TEXT NOT NULL,
  model_provider TEXT NOT NULL,
  passed BOOLEAN NOT NULL,
  actual_intent TEXT,
  actual_risk TEXT,
  actual_outcome TEXT,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE conversation_sync_checkpoints (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  cursor_value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
