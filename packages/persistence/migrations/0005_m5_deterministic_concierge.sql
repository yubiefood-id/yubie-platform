-- M5-D: deterministic conversation flow state (separate from human control state)

CREATE TABLE conversation_flow_state (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_thread_id TEXT NOT NULL,
  flow_version TEXT NOT NULL DEFAULT 'deterministic-v1',
  node_id TEXT NOT NULL DEFAULT 'home',
  context_jsonb JSONB NOT NULL DEFAULT '{}',
  fallback_count INTEGER NOT NULL DEFAULT 0,
  last_transition_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX conversation_flow_state_provider_thread
  ON conversation_flow_state (provider, provider_thread_id);

CREATE INDEX conversation_flow_state_updated_at
  ON conversation_flow_state (updated_at);

CREATE TABLE conversation_flow_events (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_thread_id TEXT NOT NULL,
  flow_version TEXT NOT NULL,
  from_node_id TEXT,
  to_node_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  metric_labels JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX conversation_flow_events_thread_created
  ON conversation_flow_events (provider, provider_thread_id, created_at);
