-- No inferred historical ownership or financial winner is backfilled.
-- Only a possessed hashed checkout cookie plus an authenticated session may bind.
CREATE TABLE checkout_guest_bindings (
 guest_principal text PRIMARY KEY CHECK (guest_principal ~ '^guest:[0-9a-f]{64}$'),
 user_id text NOT NULL REFERENCES users(id),
 linked_at timestamptz NOT NULL
);
CREATE INDEX checkout_guest_bindings_user ON checkout_guest_bindings(user_id);
