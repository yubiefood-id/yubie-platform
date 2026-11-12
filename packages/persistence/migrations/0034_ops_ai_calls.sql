-- Operator-AI pass: history of ops-copilot calls. Stores the REDACTED draft
-- (phones/emails stripped) plus accounting refs; tokens/cost live on the
-- ai_usage_reservations row keyed by request_id. Additive only.
-- Rollback: DROP TABLE ops_ai_calls.

CREATE TABLE ops_ai_calls (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  operator TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  response_redacted TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ops_ai_calls_operator_time ON ops_ai_calls (operator, created_at);
