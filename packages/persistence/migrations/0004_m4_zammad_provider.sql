-- M4-Z: provider-neutral support conversation fields (expand only)

ALTER TABLE conversation_sessions
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'chatwoot',
  ADD COLUMN IF NOT EXISTS provider_thread_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_inbox_or_channel_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_last_message_id TEXT;

UPDATE conversation_sessions
SET
  provider_thread_id = chatwoot_conversation_id,
  provider_customer_id = chatwoot_contact_id,
  provider_inbox_or_channel_id = inbox_id
WHERE provider_thread_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS conversation_sessions_provider_thread
  ON conversation_sessions (provider, provider_thread_id);

ALTER TABLE assistant_outbox
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'chatwoot',
  ADD COLUMN IF NOT EXISTS provider_thread_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_message_id TEXT;

UPDATE assistant_outbox
SET provider_thread_id = conversation_ref
WHERE provider_thread_id IS NULL;

ALTER TABLE webhook_inbox
  ADD COLUMN IF NOT EXISTS provider_event_type TEXT;
