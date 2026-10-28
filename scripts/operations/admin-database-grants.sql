-- Reviewed root-operator setup AFTER migration 0026. No user or password is created.
-- The named LOGIN role yubie_ops must already have a securely provisioned credential.
-- psql ON_ERROR_STOP is required by the operator procedure.
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='yubie_ops' AND rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls) THEN
  RAISE EXCEPTION 'A dedicated unprivileged yubie_ops LOGIN role is required';
 END IF;
END $$;
GRANT USAGE ON SCHEMA public TO yubie_ops;
GRANT SELECT ON ops_checkout_freeze,orders,order_payments,inventory_lots,inventory_reservations,inventory_sku_policies,inventory_onboarding_operations,shipping_policy_approvals,admin_session_revocations,ops_staff_grants,ops_requests,ops_command_receipts,ops_events,ops_fulfillments,ops_order_notes,ops_exception_cases,ops_refund_executions TO yubie_ops;
-- Row locks require UPDATE privilege; payment amounts/status remain immutable to admin.
GRANT UPDATE(id) ON order_payments TO yubie_ops;
GRANT UPDATE(status,updated_at,fulfillment_hold) ON orders TO yubie_ops;
GRANT INSERT,UPDATE ON ops_checkout_freeze,inventory_lots,inventory_sku_policies,ops_staff_grants,ops_requests,ops_fulfillments,ops_exception_cases,ops_refund_executions TO yubie_ops;
GRANT SELECT ON inventory_movements TO yubie_ops;
GRANT SELECT(event_type,status) ON outbox_events TO yubie_ops;
GRANT INSERT ON inventory_movements,inventory_onboarding_operations,shipping_policy_approvals,admin_session_revocations,ops_command_receipts,ops_events,ops_order_notes,audit_events,outbox_events TO yubie_ops;
COMMIT;
