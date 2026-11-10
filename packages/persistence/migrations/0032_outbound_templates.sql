-- WA-05 (GOAL_PLAN): approved outbound B2B template gateway. Independent of
-- the Zammad native channel: business-initiated template messages go through
-- a dedicated transport that is DISABLED by default and can only carry drafts
-- with (a) purpose-scoped consent evidence, (b) an approved template version,
-- (c) explicit human approval bound to an immutable content hash, and
-- (d) an expiry — all rechecked immediately before every dispatch attempt.
-- Additive only. Rollback: DROP TABLE outbound_sends, outbound_drafts,
-- outbound_templates (no other table references these).

CREATE TABLE outbound_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'id',
  body_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','retired')),
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (name, version)
);

CREATE TABLE outbound_drafts (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES outbound_templates(id),
  purpose TEXT NOT NULL,
  contact_id TEXT NOT NULL REFERENCES b2b_contacts(id),
  variables_jsonb JSONB NOT NULL DEFAULT '{}',
  content_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','rejected','expired','cancelled')),
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  cost_cap_microusd BIGINT NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX outbound_drafts_dispatch ON outbound_drafts (status, expires_at);

CREATE TABLE outbound_sends (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL UNIQUE REFERENCES outbound_drafts(id),
  provider TEXT NOT NULL DEFAULT 'meta-cloud-api',
  provider_message_id TEXT,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','dispatched','delivered','failed','ambiguous','cancelled')),
  last_error TEXT,
  cost_microusd BIGINT NOT NULL DEFAULT 0,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX outbound_sends_reconcile ON outbound_sends (state, next_attempt_at);
