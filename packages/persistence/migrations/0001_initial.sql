CREATE TYPE listing_status AS ENUM ('draft', 'active', 'paused', 'broken', 'retired');
CREATE TYPE marketplace AS ENUM ('shopee', 'tokopedia');
CREATE TYPE whatsapp_status AS ENUM ('active', 'paused', 'retired');
CREATE TYPE outbox_status AS ENUM ('pending', 'published', 'failed');
CREATE TYPE operator_task_status AS ENUM ('open', 'in_progress', 'done', 'cancelled');

CREATE TABLE marketplace_listings (
  id TEXT PRIMARY KEY,
  listing_key TEXT NOT NULL,
  marketplace marketplace NOT NULL,
  shop_key TEXT NOT NULL,
  product_id TEXT NOT NULL,
  sku_id TEXT,
  external_listing_id TEXT,
  public_url TEXT NOT NULL,
  status listing_status NOT NULL DEFAULT 'draft',
  verified_at TIMESTAMPTZ NOT NULL,
  verified_by TEXT NOT NULL,
  last_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX marketplace_listings_marketplace_listing_key ON marketplace_listings (marketplace, listing_key);
CREATE UNIQUE INDEX marketplace_listings_marketplace_external_id ON marketplace_listings (marketplace, external_listing_id) WHERE external_listing_id IS NOT NULL;
CREATE INDEX marketplace_listings_product_status ON marketplace_listings (product_id, status);

CREATE TABLE outbound_clicks (
  id TEXT PRIMARY KEY,
  listing_id TEXT,
  product_id TEXT,
  sku_id TEXT,
  destination_kind TEXT NOT NULL,
  channel TEXT NOT NULL,
  listing_key TEXT,
  intent_key TEXT,
  source TEXT,
  campaign TEXT,
  placement TEXT,
  root_id TEXT,
  request_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX outbound_clicks_created_at ON outbound_clicks (created_at);
CREATE INDEX outbound_clicks_listing_id ON outbound_clicks (listing_id);

CREATE TABLE whatsapp_intents (
  intent_key TEXT PRIMARY KEY,
  destination_url TEXT NOT NULL,
  product_id TEXT,
  root_id TEXT,
  audience TEXT NOT NULL,
  status whatsapp_status NOT NULL DEFAULT 'paused',
  verified_at TIMESTAMPTZ NOT NULL,
  verified_by TEXT NOT NULL
);

CREATE TABLE idempotency_keys (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  principal_key TEXT NOT NULL,
  operation TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX idempotency_keys_unique ON idempotency_keys (scope, principal_key, operation, idempotency_key);

CREATE TABLE outbox_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  payload_json TEXT NOT NULL,
  dedupe_key TEXT NOT NULL,
  status outbox_status NOT NULL DEFAULT 'pending',
  available_at TIMESTAMPTZ NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  published_at TIMESTAMPTZ,
  last_error_code TEXT
);

CREATE UNIQUE INDEX outbox_events_dedupe_key ON outbox_events (dedupe_key);
CREATE INDEX outbox_events_status_available_at ON outbox_events (status, available_at);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE operator_tasks (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status operator_task_status NOT NULL DEFAULT 'open',
  priority INTEGER NOT NULL DEFAULT 2,
  listing_key TEXT,
  details TEXT,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX operator_tasks_status_priority_created ON operator_tasks (status, priority, created_at);

CREATE TABLE integration_health (
  id TEXT PRIMARY KEY,
  integration TEXT NOT NULL,
  status TEXT NOT NULL,
  last_success_at TIMESTAMPTZ,
  last_checked_at TIMESTAMPTZ NOT NULL,
  details TEXT
);
