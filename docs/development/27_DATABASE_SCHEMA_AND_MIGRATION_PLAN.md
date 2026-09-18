# 27 — Database Schema and Migration Plan

## 1. Database purpose

PostgreSQL stores **Yubie-owned operational truth**, not copies of every provider database.

Initial logical modules can be implemented as prefixed tables in one database; physical PostgreSQL schemas are optional until they improve operational clarity.

## 2. Core tables

### Product truth

~~~text
products
root_varieties
product_offerings
skus
product_facts
fact_evidence
fact_approvals
publication_snapshots
~~~

Important fact fields:

~~~text
fact_key
scope_type
scope_id
value_json
evidence_status
approval_status
effective_from
effective_until
visibility
source_reference
approved_by
approved_at
~~~

Only APPROVED + effective + PUBLIC facts appear in public projections.

### Marketplace channel

~~~text
marketplace_listings
listing_health_checks
outbound_clicks
whatsapp_intents
marketplace_imports
marketplace_import_rows
marketplace_order_snapshots
marketplace_daily_metrics
~~~

Key listing constraint:

~~~text
UNIQUE(marketplace, listing_key)
UNIQUE(marketplace, external_listing_id) WHERE external_listing_id IS NOT NULL
~~~

### Conversation

~~~text
conversation_sessions
conversation_intent_events
assistant_actions
conversation_handoffs
~~~

Store provider references and structured decisions. Do not mirror entire Chatwoot messages.

### B2B/CRM bridge

~~~text
lead_signals
b2b_qualifications
crm_links
crm_sync_attempts
~~~

Qualification fields are nullable/progressive. Do not force an early chat to complete a giant form.

### Platform reliability

~~~text
idempotency_keys
inbox_events
outbox_events
audit_events
operator_tasks
integration_links
integration_cursors
integration_health
feature_flags
~~~

## 3. Indexes

At minimum:

- active marketplace listing by product/channel;
- `outbox_events(status, available_at)`;
- `inbox_events(provider, provider_event_id)` unique where ID exists;
- `operator_tasks(status, priority, created_at)`;
- conversation by Chatwoot conversation ID;
- B2B qualifications by state/owner/next-action time;
- marketplace import by checksum;
- analytics/event tables partition or retention index only after measured volume.

Avoid speculative indexing; verify with `EXPLAIN (ANALYZE, BUFFERS)`.

## 4. Idempotency

~~~text
scope
principal_key
operation
idempotency_key
request_hash
status
resource_type?
resource_id?
response_status?
response_body_json?
expires_at?
~~~

Unique:

~~~text
(scope, principal_key, operation, idempotency_key)
~~~

Same key/same request returns prior safe result. Same key/different request is conflict.

## 5. Inbox/outbox

Outbox:

~~~text
id
event_type
aggregate_type
aggregate_id
schema_version
payload_json
correlation_id
dedupe_key UNIQUE
available_at
attempt_count
published_at?
last_error_code?
~~~

Inbox:

~~~text
id
provider
provider_account
provider_event_id?
payload_hash
verified_at
received_at
processing_status
attempt_count
correlation_id
last_error_code?
~~~

Do not keep unrestricted raw webhook payloads forever. Store only where required and apply a retention/access policy.

## 6. Marketplace import staging

Never write an uploaded seller report directly into canonical projection tables.

~~~text
import batch
 -> raw object/checksum
 -> parsed staging rows
 -> schema validation
 -> SKU/status mapping
 -> exception rows
 -> publish normalized projection
~~~

A batch is either reproducibly published or clearly failed.

## 7. PII minimization

Prefer:

~~~text
chatwoot_contact_id
crm_contact_id
marketplace_external_order_id
~~~

over copied phone/email/address.

Where PII is Yubie-owned, document:

- purpose;
- access role;
- retention;
- deletion/anonymization;
- export behavior;
- audit.

No free-text conversation bodies in analytics tables.

## 8. Migration location

When persistence lands:

~~~text
packages/persistence/
  src/schema/
  src/repositories/
  migrations/
  scripts/
    migrate
    seed
    reset
~~~

Drizzle remains the preferred mapping/migration tool because it already exists in the repository.

## 9. Migration rules

- migration files are immutable after production application;
- no auto-migrate on web/API startup;
- production deploy runs an explicit migration step;
- destructive change follows expand -> deploy compatible code -> backfill -> verify -> contract;
- indexes on large tables use an online/concurrent strategy where supported;
- every backfill is restartable and measurable.

## 10. Seed/reset

Local seed contains only synthetic:

- three product families;
- five roots;
- representative approved/pending facts;
- active/disabled marketplace links;
- B2B qualification states;
- assistant handoff cases.

Reset command refuses production/staging.

## 11. Retention defaults

Exact durations require privacy/business approval, but implementation must support:

- short retention for raw webhook/import staging;
- longer audit for high-risk approvals;
- configurable analytics retention;
- explicit Chatwoot/CRM reference cleanup;
- legal/safety hold override.

Do not encode a guessed legal retention period as an irreversible database default.

## 12. Database acceptance

Persistence phase is not complete until:

- clean bootstrap;
- upgrade from previous schema;
- crash/restart behavior;
- duplicate inbox/outbox;
- idempotency conflict;
- backup/restore;
- retention sweep;
- representative query plans

all pass automated or scripted evidence.
