-- Expand identity independently from commerce activation; retain legacy subjects.
ALTER TABLE users ALTER COLUMN google_sub DROP NOT NULL;
ALTER TABLE users ADD COLUMN phone TEXT;
ALTER TABLE users ADD COLUMN phone_verified_at TIMESTAMPTZ;
CREATE TABLE auth_identities (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
 provider TEXT NOT NULL CHECK(provider IN ('google','phone')), subject TEXT NOT NULL,
 verified_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL,
 CONSTRAINT auth_identities_provider_subject UNIQUE(provider,subject),
 CONSTRAINT auth_identities_user_provider UNIQUE(user_id,provider)
);
INSERT INTO auth_identities(id,user_id,provider,subject,verified_at,created_at)
 SELECT 'legacy_google_'||id,id,'google',google_sub,created_at,created_at FROM users WHERE google_sub IS NOT NULL;
CREATE UNIQUE INDEX auth_sessions_token_hash_unique ON auth_sessions(token_hash);
CREATE TABLE phone_verifications (
 id TEXT PRIMARY KEY, browser_hash TEXT NOT NULL, phone_hash TEXT NOT NULL,
 request_key TEXT NOT NULL, request_hash TEXT NOT NULL,
 purpose TEXT NOT NULL CHECK(purpose IN('login','link_phone','reauth')),
 target_user_id TEXT REFERENCES users(id),
 state TEXT NOT NULL CHECK(state IN('active','used','expired','failed')),
 attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
 verifier TEXT, phone_ciphertext TEXT, delivery_ciphertext TEXT,
 delivery_state TEXT NOT NULL CHECK(delivery_state IN('queued','sending','ambiguous','accepted','delivered','failed')),
 delivery_attempts INTEGER NOT NULL DEFAULT 0 CHECK(delivery_attempts>=0),
 lease_until TIMESTAMPTZ, next_attempt_at TIMESTAMPTZ NOT NULL,
 created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL, expires_at TIMESTAMPTZ NOT NULL,
 CONSTRAINT phone_verifications_browser_request UNIQUE(browser_hash,request_key), CHECK(expires_at>created_at)
);
CREATE INDEX phone_verifications_phone_created ON phone_verifications(phone_hash,created_at DESC);
CREATE INDEX phone_verifications_browser_created ON phone_verifications(browser_hash,created_at DESC);
CREATE INDEX phone_verifications_delivery ON phone_verifications(next_attempt_at) WHERE state='active';
CREATE INDEX phone_verifications_expiry ON phone_verifications(expires_at);
CREATE TABLE identity_rate_buckets (key TEXT PRIMARY KEY, count INTEGER NOT NULL CHECK(count>0), expires_at TIMESTAMPTZ NOT NULL);
CREATE INDEX identity_rate_expiry ON identity_rate_buckets(expires_at);
