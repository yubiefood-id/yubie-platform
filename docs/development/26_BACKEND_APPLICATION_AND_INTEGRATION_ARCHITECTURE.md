# 26 — Backend, Application and Integration Architecture

## 1. Objective

Evolve the current prototype `apps/api` into a modular backend without a framework rewrite. Keep the existing Fetch-compatible `handleRequest(Request): Response` seam so local Node, tests and future runtimes remain portable.

## 2. Target dependency direction

~~~mermaid
flowchart TD
  WEB["apps/web"] --> API["apps/api"]
  API --> APP["packages/application"]
  WORKER["apps/worker"] --> APP
  APP --> DOMAIN["packages/domain"]
  APP --> PORTS["application ports"]
  PERSIST["packages/persistence"] --> PORTS
  INTEG["packages/integrations"] --> PORTS
  ASSIST["packages/assistant"] --> APP
~~~

Rules:

- domain imports nothing from HTTP, React, SQL or provider SDKs;
- application coordinates use cases and transactions;
- persistence/integrations implement ports;
- API maps HTTP to application commands/queries;
- worker maps durable jobs/events to application use cases.

## 3. Bounded modules

### Truth

Owns product/root/offering/SKU, approved facts, evidence status and publication state.

### Channel

Owns marketplace listing registry, outbound routing, source/campaign attribution and imported marketplace projections.

### Conversation

Owns Chatwoot references, structured intent state, bot/human mode, tool/action audit and handoff state.

### B2B

Owns qualification signals, ownership/SLA, sample/development intent and CRM projection references.

### Customer/Consent

Owns minimal contact references and consent history needed outside Chatwoot/CRM.

### Platform

Owns idempotency, inbox, outbox, audit, operator tasks, feature flags and integration health.

### Analytics

Derived views only; never canonical business state.

## 4. Application use cases

Target examples:

~~~text
GetPublicProductProjection
GetPurchaseOptions
ResolveMarketplaceRedirect
RecordOutboundIntent

CaptureChatwootEvent
ClassifyConversationIntent
ExecuteAssistantTurn
RequestHumanHandoff

CaptureB2BSignal
UpdateB2BQualification
SyncQualifiedLeadToCrm

ImportMarketplaceReport
ReconcileMarketplaceProjection
CheckListingHealth

PublishApprovedProductFact
RetireProductFact
~~~

Use-case inputs are typed application commands; outputs are domain/application results, not raw HTTP responses.

## 5. Provider ports

~~~ts
interface ConversationProvider {
  getConversation(ref: ConversationRef): Promise<Result<ConversationSnapshot>>;
  sendMessage(input: SendMessage): Promise<Result<MessageRef>>;
  addLabels(input: LabelMutation): Promise<Result<void>>;
  assign(input: Assignment): Promise<Result<void>>;
}

interface CrmProvider {
  upsertCompany(input: CompanyProjection): Promise<Result<ExternalRef>>;
  upsertContact(input: ContactProjection): Promise<Result<ExternalRef>>;
  upsertOpportunity(input: OpportunityProjection): Promise<Result<ExternalRef>>;
  appendActivity(input: ActivityProjection): Promise<Result<ExternalRef>>;
}

interface MarketplaceProvider {
  listListings?(input: ListingQuery): Promise<Result<ListingSnapshot[]>>;
  listOrders?(input: OrderWindow): AsyncIterable<MarketplaceOrderSnapshot>;
  listStatistics?(input: StatisticsWindow): Promise<Result<MarketplaceStatistics>>;
}

interface AssistantModelProvider {
  generate(input: ConstrainedAssistantInput): Promise<Result<AssistantDraft>>;
}
~~~

No provider-specific enums enter domain state.

## 6. Transaction pattern

Local business state and delivery intent are atomic:

~~~text
BEGIN
  mutate Yubie state
  append audit
  append outbox
COMMIT
~~~

Provider delivery is asynchronous unless the user experience absolutely requires a synchronous read.

## 7. Inbox pattern

For Chatwoot/marketplace/provider webhooks:

1. obtain exact request body where signature scheme requires it;
2. authenticate/signature verify;
3. calculate deterministic event identity/hash;
4. persist inbox event once;
5. acknowledge quickly;
6. worker processes;
7. application transition is monotonic/idempotent;
8. reconciliation corrects missed/out-of-order events.

## 8. Worker topology

One worker process is sufficient initially.

Queues/jobs:

~~~text
outbox.dispatch
chatwoot.event.process
assistant.turn
crm.sync
listing.health
marketplace.import
marketplace.reconcile
retention.sweep
integration.health
~~~

Use pg-boss after PostgreSQL lands so Yubie does not add Redis solely for its own queue. Chatwoot may independently require Redis.

## 9. Error taxonomy

Normalize provider errors:

~~~text
VALIDATION
UNAUTHORIZED
FORBIDDEN
NOT_FOUND
CONFLICT
RATE_LIMITED
TIMEOUT
UNAVAILABLE
UNKNOWN
~~~

Each carries `retryable` and safe external request ID.

Ambiguous timeout after a create-like request becomes `UNKNOWN`, not an automatic blind retry.

## 10. API shape

Current route matcher can be incrementally split:

~~~text
apps/api/src/
  index.ts
  server.ts
  middleware/
  routes/
    public/
    webhooks/
    internal/
    ops/
  composition/
~~~

Target current-model endpoints:

~~~text
GET  /healthz
GET  /readyz
GET  /v1/products
GET  /v1/products/:slug/purchase-options
GET  /go/:channel/:listingKey
GET  /go/whatsapp/:intentKey

POST /v1/b2b/enquiries

POST /v1/webhooks/chatwoot
POST /v1/webhooks/marketplaces/:provider

POST /v1/internal/assistant/turns
POST /v1/internal/imports/marketplace
~~~

## 11. Operator surface

Do not rebuild Chatwoot/CRM/Seller Center.

A future thin `apps/ops` is limited to cross-domain exceptions:

- integration failures;
- listing health;
- B2B sync exceptions;
- product-truth approval status;
- assistant safety/evaluation status;
- food-safety escalation references.

Deep-link to the native system for detailed work.
