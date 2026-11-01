-- Issue #73 hardening. Additive only.
-- Machine-readable dispatch block reason surfaced to operators; NULL while
-- dispatching normally. Cleared when an operator requeues a held shipment.
ALTER TABLE shipments ADD COLUMN blocked_reason TEXT;
