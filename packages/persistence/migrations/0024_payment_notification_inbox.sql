-- Expand-only, PII-minimized pre-ack inbox. Unknown outcomes remain retryable.
CREATE TABLE payment_notification_inbox (
 id TEXT PRIMARY KEY,
 dedupe_key TEXT NOT NULL UNIQUE,
 notification JSONB NOT NULL,
 received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 processed_at TIMESTAMPTZ,
 retry_after TIMESTAMPTZ NOT NULL DEFAULT now(),
 attempt_count INTEGER NOT NULL DEFAULT 0,
 last_error_code TEXT
);
CREATE INDEX payment_notification_due ON payment_notification_inbox(retry_after) WHERE processed_at IS NULL;
