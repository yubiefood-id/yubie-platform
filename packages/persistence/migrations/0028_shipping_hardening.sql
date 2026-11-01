-- Issue #73 hardening. Additive only.
-- Machine-readable dispatch block reason surfaced to operators; NULL while
-- dispatching normally. Cleared when an operator requeues a held shipment.
ALTER TABLE shipments ADD COLUMN blocked_reason TEXT;

-- Issue #73 P0-A reservation ledger: ONE table owns pilot accounting so
-- committed and reserved capacity can never drift apart across transactions
-- (claim reserves, acceptance commits the same row, terminal outcomes
-- release it; ambiguous outcomes stay reserved until reconciled).
CREATE TABLE shipment_pilot_ledger (
  id TEXT PRIMARY KEY,
  shipment_id TEXT NOT NULL UNIQUE REFERENCES shipments(id),
  reference_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('reserved','committed','released')),
  amount_idr INTEGER NOT NULL CHECK (amount_idr >= 0),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX shipment_pilot_ledger_active ON shipment_pilot_ledger(state);
