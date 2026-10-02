-- Growth + consent persistence (B9): newsletter, product waitlist and B2B
-- leads become durable customer data with an append-only consent ledger.
-- Consent scopes stay separate: a waitlist sign-up NEVER implies marketing
-- consent; B2B contact consent is its own purpose. All timestamps UTC;
-- business dates (e.g. campaign windows) are explicit elsewhere.

CREATE TABLE newsletter_subscriptions (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  -- pending (single opt-in recorded) | confirmed | unsubscribed
  status TEXT NOT NULL DEFAULT 'pending',
  name TEXT,
  source TEXT NOT NULL,
  consent_version TEXT NOT NULL,
  consented_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX newsletter_subscriptions_email ON newsletter_subscriptions (email);
CREATE INDEX newsletter_subscriptions_status ON newsletter_subscriptions (status);

CREATE TABLE product_waitlist_entries (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  product_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'waiting',
  source TEXT NOT NULL,
  consent_version TEXT NOT NULL,
  consented_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX product_waitlist_email_product ON product_waitlist_entries (email, product_id);

CREATE TABLE b2b_leads (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  business TEXT NOT NULL,
  type TEXT NOT NULL,
  city TEXT NOT NULL,
  email TEXT NOT NULL,
  whatsapp TEXT NOT NULL,
  need TEXT,
  intent TEXT NOT NULL,
  interest TEXT NOT NULL,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  source TEXT NOT NULL,
  consent_version TEXT NOT NULL,
  consented_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX b2b_leads_status_created ON b2b_leads (status, created_at);

-- Append-only record of every consent grant/revocation, per purpose.
CREATE TABLE consent_ledger (
  id TEXT PRIMARY KEY,
  subject_type TEXT NOT NULL,
  subject_key TEXT NOT NULL,
  -- marketing_newsletter | product_waitlist | b2b_contact
  purpose TEXT NOT NULL,
  -- granted | revoked
  action TEXT NOT NULL,
  consent_version TEXT NOT NULL,
  source TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX consent_ledger_subject_time ON consent_ledger (subject_type, subject_key, occurred_at);
