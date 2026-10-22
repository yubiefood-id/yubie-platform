-- Additive: old receipts remain intact; no historical delivery is reclassified.
ALTER TYPE assistant_outbox_status ADD VALUE IF NOT EXISTS 'accepted';
ALTER TYPE assistant_outbox_status ADD VALUE IF NOT EXISTS 'sent';
ALTER TYPE assistant_outbox_status ADD VALUE IF NOT EXISTS 'cancelled';
ALTER TABLE assistant_outbox ADD COLUMN depends_on_id TEXT REFERENCES assistant_outbox(id);
ALTER TABLE assistant_outbox ADD COLUMN lease_until TIMESTAMPTZ;
ALTER TABLE assistant_outbox ADD COLUMN next_attempt_at TIMESTAMPTZ;
CREATE INDEX assistant_outbox_due ON assistant_outbox(status, next_attempt_at, created_at);
CREATE INDEX webhook_inbox_assistant_backlog ON webhook_inbox(status,received_at)
  WHERE provider IN ('zammad','chatwoot_agentbot');
