-- Minimal transactional inventory core (B7): lot-aware stock for Yubie Flour
-- with FEFO reservations and an append-only movement ledger. This is the
-- smallest system that satisfies the food-safety sellability invariants
-- (docs/production/01_PRODUCT_TRUTH_AND_FOOD_COMPLIANCE.md §4): only RELEASED
-- lots within their sellable window may be reserved; quarantined, recalled
-- and expired lots are never sellable. A single fulfillment location is the
-- current operating reality, so locations are implicit until that changes.
--
-- Operator onboarding (psql, from the released-lot record):
--   INSERT INTO inventory_lots (id, product_id, size_id, lot_code,
--     quantity_on_hand, expiry_date, status, released_at, release_reason,
--     created_at, updated_at)
--   VALUES ('lot_<uuid>', 'flour', '250g', 'YBF-250-2026-10', 100,
--     DATE '2027-10-01', 'released', NOW(), 'coa-verified', NOW(), NOW());

CREATE TYPE inventory_lot_status AS ENUM ('received', 'quarantined', 'released', 'recalled', 'depleted');
CREATE TYPE inventory_reservation_status AS ENUM ('active', 'consumed', 'released');

CREATE TABLE inventory_lots (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  size_id TEXT NOT NULL,
  lot_code TEXT NOT NULL,
  -- Net sellable quantity: physical receipts minus active reservations
  -- (reservations decrement; releases increment back). The movement ledger
  -- records every delta.
  quantity_on_hand INTEGER NOT NULL CHECK (quantity_on_hand >= 0),
  expiry_date DATE NOT NULL,
  status inventory_lot_status NOT NULL DEFAULT 'received',
  released_at TIMESTAMPTZ,
  release_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX inventory_lots_sku_code ON inventory_lots (product_id, size_id, lot_code);
-- FEFO scan: released, unexpired, in-stock lots, earliest expiry first.
CREATE INDEX inventory_lots_fefo ON inventory_lots (product_id, size_id, expiry_date)
  WHERE status = 'released';

CREATE TABLE inventory_reservations (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders (id),
  lot_id TEXT NOT NULL REFERENCES inventory_lots (id),
  product_id TEXT NOT NULL,
  size_id TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  status inventory_reservation_status NOT NULL DEFAULT 'active',
  reason TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

-- One active reservation per (order, lot): a FEFO checkout may legitimately
-- span several lots, but the same lot is never reserved twice for one order.
CREATE UNIQUE INDEX inventory_reservations_one_active_per_order_lot ON inventory_reservations (order_id, lot_id) WHERE status = 'active';
CREATE INDEX inventory_reservations_lot ON inventory_reservations (lot_id);
CREATE INDEX inventory_reservations_expiry ON inventory_reservations (expires_at) WHERE status = 'active';

CREATE TABLE inventory_movements (
  id TEXT PRIMARY KEY,
  lot_id TEXT NOT NULL REFERENCES inventory_lots (id),
  product_id TEXT NOT NULL,
  size_id TEXT NOT NULL,
  movement_type TEXT NOT NULL,
  quantity_delta INTEGER NOT NULL,
  order_id TEXT,
  reason TEXT,
  occurred_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX inventory_movements_lot_time ON inventory_movements (lot_id, occurred_at);
CREATE INDEX inventory_movements_order ON inventory_movements (order_id) WHERE order_id IS NOT NULL;
