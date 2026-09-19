import { index, pgEnum, pgTable, text, timestamp, uniqueIndex, integer } from "drizzle-orm/pg-core";

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
