import { date, index, pgEnum, pgTable, text, timestamp, uniqueIndex, integer, jsonb } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const listingStatusEnum = pgEnum("listing_status", ["draft", "active", "paused", "broken", "retired"]);
export const marketplaceEnum = pgEnum("marketplace", ["shopee", "tokopedia"]);
export const whatsappStatusEnum = pgEnum("whatsapp_status", ["active", "paused", "retired"]);
export const outboxStatusEnum = pgEnum("outbox_status", ["pending", "published", "failed"]);
export const operatorTaskStatusEnum = pgEnum("operator_task_status", ["open", "in_progress", "done", "cancelled"]);

export const marketplaceListings = pgTable("marketplace_listings", {
  id: text("id").primaryKey(),
  listingKey: text("listing_key").notNull(),
  marketplace: marketplaceEnum("marketplace").notNull(),
  shopKey: text("shop_key").notNull(),
  productId: text("product_id").notNull(),
  skuId: text("sku_id"),
  externalListingId: text("external_listing_id"),
  publicUrl: text("public_url").notNull(),
  status: listingStatusEnum("status").notNull().default("draft"),
  verifiedAt: timestamp("verified_at", { withTimezone: true, mode: "string" }).notNull(),
  verifiedBy: text("verified_by").notNull(),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true, mode: "string" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull(),
}, (table) => [
  uniqueIndex("marketplace_listings_marketplace_listing_key").on(table.marketplace, table.listingKey),
  uniqueIndex("marketplace_listings_marketplace_external_id").on(table.marketplace, table.externalListingId),
  index("marketplace_listings_product_status").on(table.productId, table.status),
]);

export const outboundClicks = pgTable("outbound_clicks", {
  id: text("id").primaryKey(),
  listingId: text("listing_id"),
  productId: text("product_id"),
  skuId: text("sku_id"),
  destinationKind: text("destination_kind").notNull(),
  channel: text("channel").notNull(),
  listingKey: text("listing_key"),
  intentKey: text("intent_key"),
  source: text("source"),
  campaign: text("campaign"),
  placement: text("placement"),
  rootId: text("root_id"),
  requestId: text("request_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
}, (table) => [
  index("outbound_clicks_created_at").on(table.createdAt),
  index("outbound_clicks_listing_id").on(table.listingId),
]);

export const whatsappIntents = pgTable("whatsapp_intents", {
  intentKey: text("intent_key").primaryKey(),
  destinationUrl: text("destination_url").notNull(),
  productId: text("product_id"),
  rootId: text("root_id"),
  audience: text("audience").notNull(),
  status: whatsappStatusEnum("status").notNull().default("paused"),
  verifiedAt: timestamp("verified_at", { withTimezone: true, mode: "string" }).notNull(),
  verifiedBy: text("verified_by").notNull(),
});

export const idempotencyKeys = pgTable("idempotency_keys", {
  id: text("id").primaryKey(),
  scope: text("scope").notNull(),
  principalKey: text("principal_key").notNull(),
  operation: text("operation").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  requestHash: text("request_hash").notNull(),
  status: text("status").notNull(),
  responseJson: text("response_json"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
}, (table) => [
  uniqueIndex("idempotency_keys_unique").on(table.scope, table.principalKey, table.operation, table.idempotencyKey),
]);

export const outboxEvents = pgTable("outbox_events", {
  id: text("id").primaryKey(),
  eventType: text("event_type").notNull(),
  aggregateType: text("aggregate_type").notNull(),
  aggregateId: text("aggregate_id").notNull(),
  schemaVersion: integer("schema_version").notNull().default(1),
  payloadJson: text("payload_json").notNull(),
  dedupeKey: text("dedupe_key").notNull(),
  status: outboxStatusEnum("status").notNull().default("pending"),
  availableAt: timestamp("available_at", { withTimezone: true, mode: "string" }).notNull(),
  attemptCount: integer("attempt_count").notNull().default(0),
  publishedAt: timestamp("published_at", { withTimezone: true, mode: "string" }),
  lastErrorCode: text("last_error_code"),
}, (table) => [
  uniqueIndex("outbox_events_dedupe_key").on(table.dedupeKey),
  index("outbox_events_status_available_at").on(table.status, table.availableAt),
]);

export const auditEvents = pgTable("audit_events", {
  id: text("id").primaryKey(),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  resourceType: text("resource_type").notNull(),
  resourceId: text("resource_id").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "string" }).notNull(),
});

export const operatorTasks = pgTable("operator_tasks", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  status: operatorTaskStatusEnum("status").notNull().default("open"),
  priority: integer("priority").notNull().default(2),
  listingKey: text("listing_key"),
  details: text("details"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
}, (table) => [
  index("operator_tasks_status_priority_created").on(table.status, table.priority, table.createdAt),
]);

export const conversationStateEnum = pgEnum("conversation_state", [
  "BOT_ELIGIBLE",
  "BOT_ACTIVE",
  "HANDOFF_REQUESTED",
  "QUEUED",
  "HUMAN_ACTIVE",
  "RESOLVED",
]);

export const webhookInboxStatusEnum = pgEnum("webhook_inbox_status", [
  "received",
  "processing",
  "processed",
  "failed",
  "duplicate",
]);

export const webhookInbox = pgTable("webhook_inbox", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull().default("chatwoot_agentbot"),
  deliveryId: text("delivery_id"),
  dedupeKey: text("dedupe_key"),
  providerEventType: text("provider_event_type"),
  eventType: text("event_type").notNull(),
  payloadHash: text("payload_hash").notNull(),
  conversationRef: text("conversation_ref"),
  messageRef: text("message_ref"),
  contactRef: text("contact_ref"),
  inboxRef: text("inbox_ref"),
  providerTimestamp: timestamp("provider_timestamp", { withTimezone: true, mode: "string" }),
  rawBody: text("raw_body"),
  rawBodyExpiresAt: timestamp("raw_body_expires_at", { withTimezone: true, mode: "string" }),
  status: webhookInboxStatusEnum("status").notNull().default("received"),
  receivedAt: timestamp("received_at", { withTimezone: true, mode: "string" }).notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true, mode: "string" }),
  attemptCount: integer("attempt_count").notNull().default(0),
  lastError: text("last_error"),
}, (table) => [
  uniqueIndex("webhook_inbox_provider_delivery").on(table.provider, table.deliveryId),
  uniqueIndex("webhook_inbox_provider_hash").on(table.provider, table.payloadHash),
]);

export const conversationSessions = pgTable("conversation_sessions", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull().default("chatwoot"),
  providerThreadId: text("provider_thread_id"),
  providerCustomerId: text("provider_customer_id"),
  providerInboxOrChannelId: text("provider_inbox_or_channel_id"),
  providerLastMessageId: text("provider_last_message_id"),
  chatwootConversationId: text("chatwoot_conversation_id").notNull(),
  chatwootContactId: text("chatwoot_contact_id").notNull(),
  inboxId: text("inbox_id").notNull(),
  state: conversationStateEnum("state").notNull().default("BOT_ELIGIBLE"),
  currentIntent: text("current_intent"),
  customerType: text("customer_type"),
  lastActivityAt: timestamp("last_activity_at", { withTimezone: true, mode: "string" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull(),
}, (table) => [
  uniqueIndex("conversation_sessions_chatwoot_id").on(table.chatwootConversationId),
  uniqueIndex("conversation_sessions_provider_thread").on(table.provider, table.providerThreadId),
]);

export const assistantRuns = pgTable("assistant_runs", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  inboxEventId: text("inbox_event_id").notNull(),
  conversationRef: text("conversation_ref"),
  messageRef: text("message_ref"),
  intent: text("intent"),
  risk: text("risk"),
  classifierVersion: text("classifier_version"),
  policyVersion: text("policy_version"),
  knowledgeVersion: text("knowledge_version"),
  modelProvider: text("model_provider").notNull(),
  modelName: text("model_name"),
  promptVersion: text("prompt_version").notNull(),
  toolNames: text("tool_names"),
  validatorOutcome: text("validator_outcome"),
  handoffReason: text("handoff_reason"),
  latencyMs: integer("latency_ms"),
  tokenUsage: integer("token_usage"),
  outcome: text("outcome").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
});

export const assistantActions = pgTable("assistant_actions", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  actionType: text("action_type").notNull(),
  toolName: text("tool_name"),
  detailsJson: text("details_json"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
});

export const assistantOutboxStatusEnum = pgEnum("assistant_outbox_status", [
  "pending",
  "delivering",
  "delivered",
  "retry",
  "ambiguous",
  "failed",
]);

export const assistantOutbox = pgTable("assistant_outbox", {
  id: text("id").primaryKey(),
  runId: text("run_id"),
  provider: text("provider").notNull().default("chatwoot"),
  providerThreadId: text("provider_thread_id"),
  providerMessageId: text("provider_message_id"),
  conversationRef: text("conversation_ref").notNull(),
  actionType: text("action_type").notNull(),
  payloadFingerprint: text("payload_fingerprint").notNull(),
  payloadJson: text("payload_json").notNull(),
  providerExternalId: text("provider_external_id"),
  status: assistantOutboxStatusEnum("status").notNull().default("pending"),
  attemptCount: integer("attempt_count").notNull().default(0),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull(),
  deliveredAt: timestamp("delivered_at", { withTimezone: true, mode: "string" }),
}, (table) => [
  uniqueIndex("assistant_outbox_fingerprint").on(table.conversationRef, table.payloadFingerprint),
]);

export const assistantRuntimeConfig = pgTable("assistant_runtime_config", {
  key: text("key").primaryKey(),
  valueJson: text("value_json").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull(),
  updatedBy: text("updated_by").notNull(),
});

export const assistantRuntimeConfigAudit = pgTable("assistant_runtime_config_audit", {
  id: text("id").primaryKey(),
  key: text("key").notNull(),
  oldValueJson: text("old_value_json"),
  newValueJson: text("new_value_json").notNull(),
  changedBy: text("changed_by").notNull(),
  changedAt: timestamp("changed_at", { withTimezone: true, mode: "string" }).notNull(),
});

export const knowledgeItems = pgTable("knowledge_items", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  scope: text("scope").notNull(),
  scopeId: text("scope_id"),
  locale: text("locale").notNull().default("id"),
  approvalStatus: text("approval_status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
});

export const knowledgeVersions = pgTable("knowledge_versions", {
  id: text("id").primaryKey(),
  knowledgeId: text("knowledge_id").notNull(),
  version: integer("version").notNull(),
  approvedContent: text("approved_content").notNull(),
  effectiveFrom: timestamp("effective_from", { withTimezone: true, mode: "string" }).notNull(),
  effectiveUntil: timestamp("effective_until", { withTimezone: true, mode: "string" }),
  sourceReference: text("source_reference"),
});

export const assistantEvalCases = pgTable("assistant_eval_cases", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  inputText: text("input_text").notNull(),
  expectedIntent: text("expected_intent").notNull(),
  expectedRisk: text("expected_risk").notNull(),
  expectedOutcome: text("expected_outcome").notNull(),
  locale: text("locale").notNull().default("id"),
  tags: text("tags").notNull().default(""),
});

export const assistantEvalResults = pgTable("assistant_eval_results", {
  id: text("id").primaryKey(),
  caseId: text("case_id").notNull(),
  promptVersion: text("prompt_version").notNull(),
  modelProvider: text("model_provider").notNull(),
  passed: integer("passed").notNull(),
  actualIntent: text("actual_intent"),
  actualRisk: text("actual_risk"),
  actualOutcome: text("actual_outcome"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
});

export const conversationSyncCheckpoints = pgTable("conversation_sync_checkpoints", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  cursorValue: text("cursor_value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull(),
});

export const integrationHealth = pgTable("integration_health", {
  id: text("id").primaryKey(),
  integration: text("integration").notNull(),
  status: text("status").notNull(),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true, mode: "string" }),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true, mode: "string" }).notNull(),
  details: text("details"),
});

export const conversationFlowState = pgTable("conversation_flow_state", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  providerThreadId: text("provider_thread_id").notNull(),
  flowVersion: text("flow_version").notNull().default("deterministic-v1"),
  nodeId: text("node_id").notNull().default("home"),
  contextJsonb: jsonb("context_jsonb").notNull().default({}),
  fallbackCount: integer("fallback_count").notNull().default(0),
  lastTransitionAt: timestamp("last_transition_at", { withTimezone: true, mode: "string" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull(),
}, (table) => [
  uniqueIndex("conversation_flow_state_provider_thread").on(table.provider, table.providerThreadId),
]);

export const conversationFlowEvents = pgTable("conversation_flow_events", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  providerThreadId: text("provider_thread_id").notNull(),
  flowVersion: text("flow_version").notNull(),
  fromNodeId: text("from_node_id"),
  toNodeId: text("to_node_id").notNull(),
  eventType: text("event_type").notNull(),
  metricLabels: jsonb("metric_labels").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
}, (table) => [
  index("conversation_flow_events_thread_created").on(table.provider, table.providerThreadId, table.createdAt),
]);

// ADR-012: Google identity + first-party orders/payments (Xendit).

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  googleSub: text("google_sub").notNull(),
  email: text("email"),
  name: text("name"),
  picture: text("picture"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull(),
}, (table) => [
  uniqueIndex("users_google_sub").on(table.googleSub),
]);

export const authSessions = pgTable("auth_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  tokenHash: text("token_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "string" }),
}, (table) => [
  index("auth_sessions_token_hash").on(table.tokenHash),
]);

export const firstPartyOrders = pgTable("orders", {
  id: text("id").primaryKey(),
  checkoutRef: text("checkout_ref").notNull(),
  checkoutPublicToken: text("checkout_public_token").notNull(),
  status: text("status").notNull().default("pending_payment"),
  userId: text("user_id").references(() => users.id),
  customerEmail: text("customer_email").notNull(),
  customerName: text("customer_name"),
  deliveryJsonb: jsonb("delivery_jsonb"),
  currency: text("currency").notNull().default("IDR"),
  subtotalAmount: integer("subtotal_amount").notNull(),
  shippingAmount: integer("shipping_amount").notNull().default(0),
  discountAmount: integer("discount_amount").notNull().default(0),
  taxAmount: integer("tax_amount").notNull().default(0),
  grandTotalAmount: integer("grand_total_amount").notNull(),
  totalAmount: integer("total_amount").notNull(),
  shippingJsonb: jsonb("shipping_jsonb"),
  linesJsonb: jsonb("lines_jsonb").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull(),
}, (table) => [
  uniqueIndex("orders_checkout_ref").on(table.checkoutRef),
  uniqueIndex("orders_checkout_public_token").on(table.checkoutPublicToken),
  index("orders_user_created").on(table.userId, table.createdAt),
]);

export const orderPayments = pgTable("order_payments", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull().references(() => firstPartyOrders.id),
  provider: text("provider").notNull(),
  providerSessionId: text("provider_session_id"),
  redirectUrl: text("redirect_url"),
  currency: text("currency").notNull().default("IDR"),
  amount: integer("amount").notNull(),
  status: text("status").notNull().default("pending"),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }),
  providerBusinessId: text("provider_business_id"),
  providerPaymentId: text("provider_payment_id"),
  reconciliationState: text("reconciliation_state"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull(),
}, (table) => [
  uniqueIndex("order_payments_provider_session").on(table.provider, table.providerSessionId).where(sql`provider_session_id IS NOT NULL`),
  index("order_payments_order").on(table.orderId),
]);

export const paymentEvents = pgTable("payment_events", {
  id: text("id").primaryKey(),
  paymentId: text("payment_id").notNull().references(() => orderPayments.id),
  dedupeKey: text("dedupe_key").notNull(),
  event: text("event").notNull(),
  outcome: text("outcome").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true, mode: "string" }).notNull(),
}, (table) => [
  uniqueIndex("payment_events_dedupe").on(table.dedupeKey),
  index("payment_events_payment").on(table.paymentId),
]);

export const inventoryLotStatusEnum = pgEnum("inventory_lot_status", ["received", "quarantined", "released", "recalled", "depleted"]);
export const inventoryReservationStatusEnum = pgEnum("inventory_reservation_status", ["active", "consumed", "released"]);

export const inventoryLots = pgTable("inventory_lots", {
  id: text("id").primaryKey(),
  productId: text("product_id").notNull(),
  sizeId: text("size_id").notNull(),
  lotCode: text("lot_code").notNull(),
  quantityOnHand: integer("quantity_on_hand").notNull(),
  expiryDate: date("expiry_date").notNull(),
  status: inventoryLotStatusEnum("status").notNull().default("received"),
  releasedAt: timestamp("released_at", { withTimezone: true, mode: "string" }),
  releaseReason: text("release_reason"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull(),
}, (table) => [
  uniqueIndex("inventory_lots_sku_code").on(table.productId, table.sizeId, table.lotCode),
]);

export const inventoryReservations = pgTable("inventory_reservations", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull().references(() => firstPartyOrders.id),
  lotId: text("lot_id").notNull().references(() => inventoryLots.id),
  productId: text("product_id").notNull(),
  sizeId: text("size_id").notNull(),
  quantity: integer("quantity").notNull(),
  status: inventoryReservationStatusEnum("status").notNull().default("active"),
  reason: text("reason"),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull(),
});

export const inventoryMovements = pgTable("inventory_movements", {
  id: text("id").primaryKey(),
  lotId: text("lot_id").notNull().references(() => inventoryLots.id),
  productId: text("product_id").notNull(),
  sizeId: text("size_id").notNull(),
  movementType: text("movement_type").notNull(),
  quantityDelta: integer("quantity_delta").notNull(),
  orderId: text("order_id"),
  reason: text("reason"),
  occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "string" }).notNull(),
});

// --- Growth + consent (migration 0010) ---

export const newsletterSubscriptions = pgTable("newsletter_subscriptions", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  status: text("status").notNull().default("pending"),
  name: text("name"),
  source: text("source").notNull(),
  consentVersion: text("consent_version").notNull(),
  consentedAt: timestamp("consented_at", { withTimezone: true, mode: "string" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull(),
}, (table) => [
  uniqueIndex("newsletter_subscriptions_email").on(table.email),
]);

export const productWaitlistEntries = pgTable("product_waitlist_entries", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  productId: text("product_id").notNull(),
  status: text("status").notNull().default("waiting"),
  source: text("source").notNull(),
  consentVersion: text("consent_version").notNull(),
  consentedAt: timestamp("consented_at", { withTimezone: true, mode: "string" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull(),
}, (table) => [
  uniqueIndex("product_waitlist_email_product").on(table.email, table.productId),
]);

export const b2bLeads = pgTable("b2b_leads", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  business: text("business").notNull(),
  type: text("type").notNull(),
  city: text("city").notNull(),
  email: text("email").notNull(),
  whatsapp: text("whatsapp").notNull(),
  need: text("need"),
  intent: text("intent").notNull(),
  interest: text("interest").notNull(),
  message: text("message"),
  status: text("status").notNull().default("new"),
  source: text("source").notNull(),
  consentVersion: text("consent_version").notNull(),
  consentedAt: timestamp("consented_at", { withTimezone: true, mode: "string" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull(),
});

export const consentLedger = pgTable("consent_ledger", {
  id: text("id").primaryKey(),
  subjectType: text("subject_type").notNull(),
  subjectKey: text("subject_key").notNull(),
  purpose: text("purpose").notNull(),
  action: text("action").notNull(),
  consentVersion: text("consent_version").notNull(),
  source: text("source").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "string" }).notNull(),
});
