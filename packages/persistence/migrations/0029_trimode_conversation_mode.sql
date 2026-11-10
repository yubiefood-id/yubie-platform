-- WA-02 (GOAL_PLAN): per-conversation tri-mode state and priority support tasks.
-- conversation_mode_state keeps the customer-selected mode (deterministic / AI
-- opt-in) SEPARATE from human-control ownership: conversation_sessions.state and
-- the Zammad ticket remain the authority for human ownership (ADR-009).
-- priority_support_tasks is a projection for internal triage due-times and
-- acknowledgement evidence; assignment/owner truth stays in Zammad.
-- Additive only, no changes to existing tables. Default behavior without these
-- tables populated is exactly today's behavior (mode defaults DETERMINISTIC).
-- Rollback: DROP TABLE conversation_mode_events, conversation_mode_state,
-- priority_support_tasks (safe: additive, default-off feature).

CREATE TABLE conversation_mode_state (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_thread_id TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'DETERMINISTIC' CHECK (mode IN ('DETERMINISTIC','AI_OPT_IN')),
  policy_version TEXT NOT NULL DEFAULT 'trimode-1',
  selected_by TEXT NOT NULL DEFAULT 'customer',
  selected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_customer_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX conversation_mode_state_provider_thread ON conversation_mode_state (provider, provider_thread_id);

CREATE TABLE conversation_mode_events (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_thread_id TEXT NOT NULL,
  from_mode TEXT,
  to_mode TEXT NOT NULL CHECK (to_mode IN ('DETERMINISTIC','AI_OPT_IN')),
  trigger_kind TEXT NOT NULL CHECK (trigger_kind IN ('customer_opt_in','customer_exit','human_takeover','operator_reset','automation_off')),
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX conversation_mode_events_thread_created ON conversation_mode_events (provider, provider_thread_id, created_at);

CREATE TABLE priority_support_tasks (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'zammad',
  provider_thread_id TEXT NOT NULL,
  ticket_id TEXT NOT NULL,
  source_outbox_id TEXT NOT NULL UNIQUE,
  priority TEXT NOT NULL CHECK (priority IN ('P0_FOOD_SAFETY','P1_EXPLICIT_HUMAN','P2_B2B','P3_GENERAL')),
  group_id TEXT,
  reason TEXT NOT NULL,
  next_action_at TIMESTAMPTZ NOT NULL,
  ack_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX priority_support_tasks_open ON priority_support_tasks (priority, created_at) WHERE resolved_at IS NULL;
CREATE INDEX priority_support_tasks_thread ON priority_support_tasks (provider, provider_thread_id);
