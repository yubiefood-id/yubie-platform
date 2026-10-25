-- Expand-only. Existing balances are retained, but do not imply packaging or
-- QC approval. Rollback to older checkout code requires admission frozen.
CREATE TABLE inventory_sku_policies (
  product_id TEXT NOT NULL,
  size_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  components JSONB NOT NULL CHECK (jsonb_typeof(components) = 'array'),
  approval_ref TEXT NOT NULL CHECK (length(trim(approval_ref)) > 0),
  approved_by TEXT NOT NULL,
  approved_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (product_id, size_id)
);
ALTER TABLE inventory_lots ADD COLUMN qc_approval_ref TEXT;
ALTER TABLE inventory_lots ADD COLUMN unit_of_measure TEXT;
ALTER TABLE orders ADD COLUMN fulfillment_hold TEXT;
CREATE TABLE inventory_onboarding_operations (
  operation_id TEXT PRIMARY KEY,
  input_hash TEXT NOT NULL,
  input_snapshot JSONB NOT NULL,
  result JSONB NOT NULL,
  actor TEXT NOT NULL,
  reason TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE shipping_policy_approvals (
  id TEXT PRIMARY KEY,
  policy TEXT NOT NULL CHECK (policy = 'free_promotional'),
  cities JSONB NOT NULL CHECK (jsonb_typeof(cities) = 'array'),
  approval_ref TEXT NOT NULL,
  approved_by TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL CHECK (ends_at > starts_at)
);
CREATE FUNCTION inventory_movement_is_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'inventory movements are append-only'; END;
$$;
CREATE TRIGGER inventory_movements_append_only BEFORE UPDATE OR DELETE ON inventory_movements
  FOR EACH ROW EXECUTE FUNCTION inventory_movement_is_append_only();
