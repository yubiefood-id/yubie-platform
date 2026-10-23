-- Expand-only. Orders keep their existing independent immutable address snapshots.
CREATE TABLE customer_addresses (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  address jsonb NOT NULL CHECK ((jsonb_typeof(address)='object' AND address->>'countryCode'='ID'
    AND length(address->>'recipientName') BETWEEN 2 AND 80
    AND address->>'recipientPhone' ~ '^\+[1-9][0-9]{7,14}$'
    AND length(address->>'fullAddress') BETWEEN 8 AND 500
    AND length(address->>'province') BETWEEN 2 AND 80
    AND length(address->>'city') BETWEEN 2 AND 80
    AND address->>'postalCode' ~ '^[0-9]{5}$') IS TRUE),
  pin jsonb,
  pin_expires_at timestamptz,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CHECK (((pin IS NULL AND pin_expires_at IS NULL) OR
    (pin IS NOT NULL AND pin_expires_at IS NOT NULL AND jsonb_typeof(pin)='object'
     AND pin ?& ARRAY['latitude','longitude','source','confirmed','confirmedAt','expiresAt']
     AND jsonb_typeof(pin->'latitude')='number' AND jsonb_typeof(pin->'longitude')='number'
     AND (pin->>'latitude')::double precision BETWEEN -90 AND 90
     AND (pin->>'longitude')::double precision BETWEEN -180 AND 180
     AND pin->>'confirmed'='true'
     AND pin->>'source' IN ('device','google','map')
     AND pin_expires_at=(pin->>'expiresAt')::timestamptz
     AND pin_expires_at>(pin->>'confirmedAt')::timestamptz
     AND pin_expires_at<=(pin->>'confirmedAt')::timestamptz+INTERVAL '30 days')) IS TRUE)
);
CREATE INDEX customer_addresses_owner ON customer_addresses(user_id,created_at,id);
CREATE UNIQUE INDEX customer_addresses_one_default ON customer_addresses(user_id) WHERE is_default;
CREATE INDEX customer_addresses_pin_expiry ON customer_addresses(pin_expires_at) WHERE pin IS NOT NULL;
