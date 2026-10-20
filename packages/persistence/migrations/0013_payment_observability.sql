-- Payment exception metrics and stable operator pagination.
-- Apply during the migration window before application rollout. Standard
-- CREATE INDEX can briefly block writes; the staging runbook requires drain,
-- backup, timing, and rollback evidence before this reaches production.

CREATE INDEX order_payments_pending_created
  ON order_payments (created_at)
  WHERE status = 'pending';

CREATE INDEX order_payments_exception_cursor
  ON order_payments (updated_at DESC, id DESC);

CREATE INDEX order_payments_active_reconciliation
  ON order_payments (updated_at DESC, id DESC)
  WHERE reconciliation_state IN (
    'ambiguous',
    'ambiguous_create',
    'pending_reconciliation',
    'attach_failed'
  );

CREATE INDEX webhook_inbox_payment_provider_received
  ON webhook_inbox (provider, received_at DESC)
  WHERE provider IN ('xendit', 'ipaymu');

CREATE INDEX inventory_reservations_active_created
  ON inventory_reservations (created_at)
  WHERE status = 'active';
