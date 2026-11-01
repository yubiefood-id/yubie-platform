-- Additive shipping execution schema (ADR-014). Nothing existing is altered:
-- free_promotional policy rows, historical orders, payments and inventory stay
-- authoritative and untouched. Retention: shipment_provider_inbox payload is
-- bounded at ingest (<=64KiB) and purged by the webhook cleanup job after
-- processing + 30 days; shipment_finance_events are append-only forever.

CREATE TABLE shipping_origins (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL UNIQUE CHECK(length(trim(label)) BETWEEN 1 AND 80),
  contact_name TEXT NOT NULL,
  contact_phone TEXT NOT NULL,
  contact_email TEXT,
  address TEXT NOT NULL CHECK(length(trim(address))>0),
  postal_code TEXT,
  latitude DOUBLE PRECISION CHECK(latitude IS NULL OR latitude BETWEEN -90 AND 90),
  longitude DOUBLE PRECISION CHECK(longitude IS NULL OR longitude BETWEEN -180 AND 180),
  CHECK((latitude IS NULL)=(longitude IS NULL)),
  pickup_hours TEXT,
  note TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  version INTEGER NOT NULL CHECK(version>0),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE sku_shipping_profiles (
  id TEXT PRIMARY KEY,
  sku TEXT NOT NULL UNIQUE,
  weight_grams INTEGER NOT NULL CHECK(weight_grams>0),
  length_cm INTEGER CHECK(length_cm IS NULL OR length_cm>0),
  width_cm INTEGER CHECK(width_cm IS NULL OR width_cm>0),
  height_cm INTEGER CHECK(height_cm IS NULL OR height_cm>0),
  packaging TEXT,
  storage_class TEXT NOT NULL CHECK(storage_class IN ('shelf_stable','chilled','frozen')),
  handling_notes TEXT,
  effective_from TIMESTAMPTZ NOT NULL,
  effective_to TIMESTAMPTZ CHECK(effective_to IS NULL OR effective_to>effective_from),
  version INTEGER NOT NULL CHECK(version>0),
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE shipping_quotes (
  id TEXT PRIMARY KEY,
  principal_key TEXT NOT NULL,
  cart_hash TEXT NOT NULL CHECK(length(cart_hash)=64),
  destination_hash TEXT NOT NULL CHECK(length(destination_hash)=64),
  origin_id TEXT NOT NULL REFERENCES shipping_origins(id),
  parcels_digest TEXT NOT NULL CHECK(length(parcels_digest)=64),
  courier_company TEXT NOT NULL,
  courier_service_code TEXT NOT NULL,
  courier_service_name TEXT,
  service_type TEXT,
  delivery_type TEXT NOT NULL CHECK(delivery_type IN ('now','scheduled')),
  collection_method TEXT NOT NULL DEFAULT 'pickup' CHECK(collection_method='pickup'),
  offered_amount_idr INTEGER NOT NULL CHECK(offered_amount_idr>=0),
  provider_amount_idr INTEGER NOT NULL CHECK(provider_amount_idr>=0),
  subsidy_amount_idr INTEGER NOT NULL DEFAULT 0 CHECK(subsidy_amount_idr>=0),
  tax_amount_idr INTEGER NOT NULL DEFAULT 0 CHECK(tax_amount_idr>=0),
  tax_policy_version TEXT NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'IDR' CHECK(currency='IDR'),
  status TEXT NOT NULL CHECK(status IN ('quoted','consumed','expired')),
  valid_until TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  order_id TEXT REFERENCES orders(id),
  CONSTRAINT shipping_quotes_consumed_at_check CHECK((status='consumed')=(consumed_at IS NOT NULL)),
  CONSTRAINT shipping_quotes_consumed_order_check CHECK(status<>'consumed' OR order_id IS NOT NULL)
);
CREATE INDEX shipping_quotes_principal ON shipping_quotes(principal_key,created_at DESC);
CREATE INDEX shipping_quotes_expiry ON shipping_quotes(valid_until) WHERE status='quoted';

-- One shipment row per physical package. Retries and cancellation-authorized
-- replacements reuse the same row with an incremented dispatch_generation, so
-- (order, package) uniqueness already implies (order, package, generation);
-- the live-booking invariant is carried by reference_id/provider_order_id
-- uniqueness plus at most one non-terminal dispatch intent per shipment.
CREATE TABLE shipments (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  package_index INTEGER NOT NULL CHECK(package_index>=0),
  dispatch_generation INTEGER NOT NULL CHECK(dispatch_generation>0),
  reference_id TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL DEFAULT 'biteship' CHECK(provider='biteship'),
  provider_order_id TEXT UNIQUE,
  status TEXT NOT NULL CHECK(status IN (
    'not_ready','ready','booking_pending','booking_unknown','booked','pickup_pending',
    'picked','in_transit','delivered','cancelled','failed','returned','held'
  )),
  courier_company TEXT,
  courier_service TEXT,
  courier_type TEXT,
  delivery_type TEXT CHECK(delivery_type IS NULL OR delivery_type IN ('now','scheduled')),
  waybill_id TEXT,
  tracking_id TEXT,
  tracking_url TEXT,
  quote_id TEXT REFERENCES shipping_quotes(id),
  quoted_amount_idr INTEGER CHECK(quoted_amount_idr IS NULL OR quoted_amount_idr>=0),
  actual_amount_idr INTEGER CHECK(actual_amount_idr IS NULL OR actual_amount_idr>=0),
  currency CHAR(3) NOT NULL DEFAULT 'IDR' CHECK(currency='IDR'),
  weight_grams INTEGER CHECK(weight_grams IS NULL OR weight_grams>0),
  latest_provider_status TEXT,
  last_provider_event_at TIMESTAMPTZ,
  version INTEGER NOT NULL CHECK(version>0),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT shipments_order_package UNIQUE(order_id,package_index)
);
CREATE INDEX shipments_order ON shipments(order_id);
CREATE INDEX shipments_open ON shipments(status) WHERE status NOT IN ('delivered','cancelled','failed','returned');
CREATE INDEX shipments_waybill ON shipments(waybill_id) WHERE waybill_id IS NOT NULL;

CREATE TABLE shipment_items (
  id TEXT PRIMARY KEY,
  shipment_id TEXT NOT NULL REFERENCES shipments(id),
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK(quantity>0),
  order_line_id TEXT,
  lot_refs JSONB NOT NULL DEFAULT '[]'
);
CREATE INDEX shipment_items_shipment ON shipment_items(shipment_id);

-- Pre-ack durable inbox for authenticated Biteship webhooks (same contract as
-- payment_notification_inbox: append before 2xx, claim with a lease, finish).
CREATE TABLE shipment_provider_inbox (
  id TEXT PRIMARY KEY,
  dedupe_key TEXT NOT NULL UNIQUE,
  event TEXT NOT NULL CHECK(event IN ('order.status','order.waybill_id','order.price')),
  provider_order_id TEXT,
  waybill_id TEXT,
  status TEXT,
  payload JSONB NOT NULL,
  payload_hash TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  retry_after TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error_code TEXT
);
CREATE INDEX shipment_inbox_due ON shipment_provider_inbox(retry_after) WHERE processed_at IS NULL;
CREATE INDEX shipment_inbox_order ON shipment_provider_inbox(provider_order_id) WHERE provider_order_id IS NOT NULL;

-- Immutable shipping cost ledger: customer charge, provider cost, subsidy,
-- insurance, tax and adjustments are distinct events (ADR-014 finances).
CREATE TABLE shipment_finance_events (
  id TEXT PRIMARY KEY,
  shipment_id TEXT REFERENCES shipments(id),
  order_id TEXT NOT NULL REFERENCES orders(id),
  kind TEXT NOT NULL CHECK(kind IN (
    'quote_captured','customer_charged','provider_booked','price_adjustment','carrier_surcharge',
    'insurance','merchant_subsidy','tax_recorded','refund_linked','fee'
  )),
  amount_idr INTEGER NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'IDR' CHECK(currency='IDR'),
  provider_ref TEXT,
  policy_version TEXT,
  snapshot JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX shipment_finance_order ON shipment_finance_events(order_id,created_at);
CREATE INDEX shipment_finance_shipment ON shipment_finance_events(shipment_id) WHERE shipment_id IS NOT NULL;
CREATE FUNCTION shipment_finance_event_is_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'shipment finance events are append-only'; END;
$$;
CREATE TRIGGER shipment_finance_events_append_only BEFORE UPDATE OR DELETE ON shipment_finance_events FOR EACH ROW EXECUTE FUNCTION shipment_finance_event_is_append_only();

-- Worker lease bookkeeping for booking dispatch (no provider I/O inside a
-- transaction; the intent row IS the write-ahead dispatch record).
CREATE TABLE shipment_dispatch_intents (
  id TEXT PRIMARY KEY,
  shipment_id TEXT NOT NULL REFERENCES shipments(id),
  generation INTEGER NOT NULL CHECK(generation>0),
  reference_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('pending','leased','dispatched','unknown','complete','dead')),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5 CHECK(max_attempts>0),
  lease_expires_at TIMESTAMPTZ,
  last_error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE(shipment_id,generation)
);
CREATE INDEX shipment_dispatch_pending ON shipment_dispatch_intents(state,created_at) WHERE state IN ('pending','leased');
