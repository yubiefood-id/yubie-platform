-- No historical order amounts, discounts or identity ownership are rewritten.
CREATE TABLE promotion_campaigns (
  id text PRIMARY KEY,
  kind text NOT NULL DEFAULT 'welcome' CHECK(kind='welcome'),
  code text NOT NULL UNIQUE CHECK(code ~ '^[A-Z0-9_-]{3,32}$'),
  status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','active','paused','ended')),
  basis_points integer NOT NULL DEFAULT 1500 CHECK(basis_points BETWEEN 1 AND 9999),
  eligible_product_ids text[] NOT NULL CHECK(cardinality(eligible_product_ids)>0),
  starts_at timestamptz, ends_at timestamptz,
  approved_at timestamptz, approved_by text, approval_ref text,
  refund_policy text NOT NULL DEFAULT 'retain_consumed' CHECK(refund_policy='retain_consumed'),
  CHECK(status<>'active' OR (starts_at IS NOT NULL AND ends_at IS NOT NULL AND ends_at>starts_at AND approved_at IS NOT NULL AND length(approved_by)>0 AND length(approval_ref)>0) IS TRUE)
);
CREATE UNIQUE INDEX promotion_one_active_welcome ON promotion_campaigns(kind) WHERE status='active';
CREATE UNIQUE INDEX auth_identities_owner_provider ON auth_identities(id,user_id,provider);
CREATE TABLE promotion_entitlements (
  id text PRIMARY KEY,
  campaign_id text NOT NULL REFERENCES promotion_campaigns(id),
  user_id text NOT NULL REFERENCES users(id),
  phone_identity_id text NOT NULL,
  phone_provider text NOT NULL DEFAULT 'phone' CHECK(phone_provider='phone'),
  claimed_at timestamptz NOT NULL,
  FOREIGN KEY(phone_identity_id,user_id,phone_provider) REFERENCES auth_identities(id,user_id,provider),
  UNIQUE(campaign_id,user_id), UNIQUE(campaign_id,phone_identity_id), UNIQUE(id,campaign_id,user_id)
);
CREATE TABLE promotion_redemptions (
  id text PRIMARY KEY,
  entitlement_id text NOT NULL,
  campaign_id text NOT NULL,
  user_id text NOT NULL,
  order_id text NOT NULL UNIQUE REFERENCES orders(id),
  state text NOT NULL CHECK(state IN('reserved','consumed','released')),
  eligible_subtotal_amount integer NOT NULL CHECK(eligible_subtotal_amount>0),
  discount_amount integer NOT NULL CHECK(discount_amount>0 AND discount_amount<eligible_subtotal_amount),
  basis_points integer NOT NULL CHECK(basis_points BETWEEN 1 AND 9999),
  created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
  consumed_at timestamptz, released_at timestamptz,
  FOREIGN KEY(entitlement_id,campaign_id,user_id) REFERENCES promotion_entitlements(id,campaign_id,user_id),
  CHECK((state='reserved' AND consumed_at IS NULL AND released_at IS NULL) OR (state='consumed' AND consumed_at IS NOT NULL AND released_at IS NULL) OR (state='released' AND released_at IS NOT NULL AND consumed_at IS NULL))
);
CREATE UNIQUE INDEX promotion_one_qualifying_redemption ON promotion_redemptions(entitlement_id) WHERE state IN('reserved','consumed');
CREATE INDEX promotion_redemptions_customer_state ON promotion_redemptions(user_id,state);
-- A campaign definition is not activation or operator approval.
INSERT INTO promotion_campaigns(id,code,eligible_product_ids) VALUES('welcome_v3','YUBIE15',ARRAY['flour','shake','ppang','mie']);
