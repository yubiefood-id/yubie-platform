-- WA-04 (GOAL_PLAN): B2B CRM projection from the growth.b2b_lead_created
-- transactional outbox event. One opportunity per lead (UNIQUE lead_id) makes
-- the projection replay-safe. Privacy: the projection carries classification
-- fields + contact coordinates only — free-text need/message stays in
-- b2b_leads and is never copied into CRM rows or logs.
-- Additive only. Rollback: DROP TABLE b2b_tasks, b2b_opportunities,
-- b2b_contacts, b2b_accounts (no other table references these).

CREATE TABLE b2b_accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  city TEXT,
  business_type TEXT,
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX b2b_accounts_normalized_name ON b2b_accounts (normalized_name);

CREATE TABLE b2b_contacts (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES b2b_accounts(id),
  name TEXT,
  email TEXT,
  whatsapp TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX b2b_contacts_email ON b2b_contacts (email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX b2b_contacts_whatsapp ON b2b_contacts (whatsapp) WHERE whatsapp IS NOT NULL;

CREATE TABLE b2b_opportunities (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES b2b_accounts(id),
  lead_id TEXT NOT NULL UNIQUE,
  stage TEXT NOT NULL DEFAULT 'new' CHECK (stage IN ('new','contacted','qualified','negotiation','won','lost')),
  owner TEXT NOT NULL DEFAULT 'unassigned',
  interest TEXT,
  intent TEXT,
  city TEXT,
  source TEXT,
  next_action_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX b2b_opportunities_stage ON b2b_opportunities (stage, next_action_at);

CREATE TABLE b2b_tasks (
  id TEXT PRIMARY KEY,
  opportunity_id TEXT NOT NULL REFERENCES b2b_opportunities(id),
  title TEXT NOT NULL,
  due_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','done','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX b2b_tasks_open ON b2b_tasks (due_at) WHERE status = 'open';
