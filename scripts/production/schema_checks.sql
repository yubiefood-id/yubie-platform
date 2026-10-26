SELECT json_build_object(
 'skuPolicies', EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass('public.inventory_sku_policies') AND contype='p' AND pg_get_constraintdef(oid)='PRIMARY KEY (product_id, size_id)'),
 'lotApprovalColumns', (SELECT count(*)=2 FROM information_schema.columns WHERE table_schema='public' AND table_name='inventory_lots' AND column_name IN ('qc_approval_ref','unit_of_measure') AND data_type='text'),
 'fulfillmentHold', EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='orders' AND column_name='fulfillment_hold' AND data_type='text'),
 'onboardingSnapshot', EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='inventory_onboarding_operations' AND column_name='input_snapshot' AND data_type='jsonb'),
 'shippingApprovals', to_regclass('public.shipping_policy_approvals') IS NOT NULL,
 'appendOnlyTrigger', EXISTS(SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid WHERE t.tgrelid=to_regclass('public.inventory_movements') AND t.tgname='inventory_movements_append_only' AND t.tgenabled IN ('O','A') AND (t.tgtype & 27)=27 AND lower(p.prosrc) LIKE '%raise exception%inventory movements are append-only%'),
 'notificationInbox', (SELECT count(*)=5 FROM information_schema.columns WHERE table_schema='public' AND table_name='payment_notification_inbox' AND column_name IN ('notification','processed_at','retry_after','attempt_count','last_error_code')),
 'notificationDueIndex', EXISTS(SELECT 1 FROM pg_index WHERE indexrelid=to_regclass('public.payment_notification_due') AND indisvalid AND indisready AND pg_get_expr(indpred,indrelid)='(processed_at IS NULL)'),
 'recoveryForeignKey', EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass('public.idempotency_keys') AND confrelid=to_regclass('public.orders') AND contype='f' AND convalidated AND pg_get_constraintdef(oid)='FOREIGN KEY (resource_id) REFERENCES orders(id)'),
 'recoveryIndex', EXISTS(SELECT 1 FROM pg_index WHERE indexrelid=to_regclass('public.idempotency_keys_resource') AND indisvalid AND indisready AND pg_get_expr(indpred,indrelid)='(resource_id IS NOT NULL)')
);
