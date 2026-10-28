-- Additive operations controls. No stock, shipping coverage, staff or money seeded.
CREATE TABLE ops_staff_grants (
  subject TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('viewer','operator','qc','fulfillment','finance','admin')),
  granted_by TEXT NOT NULL,
  approval_ref TEXT NOT NULL CHECK (length(trim(approval_ref))>0),
  granted_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  PRIMARY KEY(subject,role)
);
CREATE TABLE ops_requests (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('inventory_count','shipping_policy','refund_full')),
  status TEXT NOT NULL CHECK (status IN ('draft','approved','applied','rejected')),
  version INTEGER NOT NULL CHECK (version>0),
  payload_json JSONB NOT NULL,
  payload_hash TEXT NOT NULL,
  created_by TEXT NOT NULL,
  approved_by TEXT,
  approval_reason TEXT,
  approved_at TIMESTAMPTZ,
  result_json JSONB,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CHECK (approved_by IS NULL OR approved_by<>created_by)
);
CREATE INDEX ops_requests_created ON ops_requests(created_at DESC,id DESC);
CREATE FUNCTION ops_request_payload_is_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.kind IS DISTINCT FROM OLD.kind
     OR NEW.payload_json IS DISTINCT FROM OLD.payload_json OR NEW.payload_hash IS DISTINCT FROM OLD.payload_hash
     OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR (OLD.approved_by IS NOT NULL AND NEW.approved_by IS DISTINCT FROM OLD.approved_by) THEN
    RAISE EXCEPTION 'operations request payload and approval identity are immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER ops_requests_immutable BEFORE UPDATE ON ops_requests FOR EACH ROW EXECUTE FUNCTION ops_request_payload_is_immutable();
CREATE TABLE ops_command_receipts (
  actor TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  result_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY(actor,idempotency_key)
);
CREATE TABLE ops_events (
  id TEXT PRIMARY KEY,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}',
  occurred_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX ops_events_resource ON ops_events(resource_id,occurred_at DESC);
CREATE FUNCTION ops_event_is_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'operations events are append-only'; END;
$$;
CREATE TRIGGER ops_events_append_only BEFORE UPDATE OR DELETE ON ops_events FOR EACH ROW EXECUTE FUNCTION ops_event_is_append_only();
CREATE TRIGGER ops_command_receipts_append_only BEFORE UPDATE OR DELETE ON ops_command_receipts FOR EACH ROW EXECUTE FUNCTION ops_event_is_append_only();
CREATE TABLE ops_fulfillments (
  order_id TEXT PRIMARY KEY REFERENCES orders(id),
  stage TEXT NOT NULL CHECK(stage IN ('packing','packed','shipped','delivered')),
  version INTEGER NOT NULL CHECK(version>0),
  carrier TEXT,
  tracking_number TEXT,
  updated_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CHECK(stage NOT IN ('shipped','delivered') OR (length(trim(carrier))>0 AND length(trim(tracking_number))>0))
);
CREATE TABLE ops_order_notes (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 1000),
  actor TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX ops_order_notes_order ON ops_order_notes(order_id,created_at);
CREATE TABLE ops_exception_cases (
  payment_id TEXT PRIMARY KEY REFERENCES order_payments(id),
  state TEXT NOT NULL CHECK(state IN ('investigating','escalated','resolved')),
  version INTEGER NOT NULL CHECK(version>0),
  updated_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE ops_refund_executions (
  request_id TEXT PRIMARY KEY REFERENCES ops_requests(id),
  order_id TEXT NOT NULL REFERENCES orders(id),
  payment_id TEXT NOT NULL REFERENCES order_payments(id),
  amount INTEGER NOT NULL CHECK(amount>0),
  state TEXT NOT NULL CHECK(state IN ('awaiting_merchant','merchant_execution_recorded','provider_and_finance_confirmed')),
  merchant_reference TEXT,
  evidence_ref TEXT,
  recorded_by TEXT,
  confirmed_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE UNIQUE INDEX ops_refund_once_per_payment ON ops_refund_executions(payment_id);
ALTER TABLE shipping_policy_approvals ADD COLUMN service_coverage TEXT;
ALTER TABLE shipping_policy_approvals ADD COLUMN cost_owner TEXT;
ALTER TABLE shipping_policy_approvals ADD COLUMN source_request_id TEXT REFERENCES ops_requests(id);
