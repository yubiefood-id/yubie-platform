-- Expand-only. Staff session revocation is separate from customer identity.
-- Application rollback keeps this table; never restore a DB over live payments.
CREATE TABLE admin_session_revocations (
  token_hash TEXT PRIMARY KEY CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX admin_session_revocations_expiry ON admin_session_revocations (expires_at);
