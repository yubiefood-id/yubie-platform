# Phase M4 — B2B Qualification and CRM

## 1. Problem

High-value B2B conversations can be lost among ordinary WhatsApp chats. A CRM is valuable only after Yubie separates real opportunities from routine B2C noise.

## 2. Outcome

The system detects B2B intent, asks progressive qualifying questions, persists a durable Yubie lead signal, assigns ownership and synchronizes qualified opportunities to a replaceable CRM.

## 3. Scope

B2B intents:

~~~text
bulk ingredients
sample
product development
wholesale
food-service/bakery/cafe
distribution/partnership
~~~

Routine product questions stay in Chatwoot.

## 4. Data

~~~text
lead_signals
b2b_qualifications
crm_links
crm_sync_attempts
outbox_events
operator_tasks
~~~

Qualification fields:

~~~text
company
contact refs
city/coverage
business type
use case
product/root interest
volume/range
timeline
sample need
development need
owner
next action
qualification state
source/campaign
~~~

Store only user-provided/operationally justified facts. Do not guess company/person attributes.

## 5. Qualification policy

State:

~~~text
DETECTED
 -> QUALIFYING
 -> QUALIFIED
 -> CRM_SYNC_PENDING
 -> CRM_SYNCED
 -> SALES_ACTIVE
 -> WON / LOST
~~~

Exact CRM stages may differ. Yubie only mirrors enough to coordinate cross-system work.

## 6. CRM selection

Comp AI CRM is a pilot candidate because it is open source and agent-oriented, but Yubie must use a `CrmProvider` interface.

Before production:

- pin tested version;
- security review;
- backup/export;
- auth/allowlist;
- upgrade procedure;
- verify required fields/API capability.

Do not fork deeply unless a business requirement cannot be solved by configuration/adapter.

## 7. Sync algorithm

~~~text
qualification transaction
 + audit
 + outbox
 COMMIT
     |
 worker
     |
 upsert company/contact/opportunity using stable Yubie key
     |
 save external refs
~~~

Timeout-after-create requires lookup/reconciliation before creating another deal.

## 8. Human ownership

Every QUALIFIED lead gets:

- owner;
- next action;
- due time;
- Chatwoot conversation link;
- CRM record link when synced.

No owner = not qualified operationally.

## 9. Sample request

A sample request is more than a CRM note because it may later need SKU/batch traceability.

M4 records sample intent; M7/back-office can add physical allocation/lot workflow when needed.

## 10. Privacy

Do not auto-enroll CRM contacts into newsletter marketing.

Operational follow-up and marketing consent remain separate purposes.

## 11. Tests

- B2C remains out of CRM;
- B2B detection;
- progressive qualification;
- duplicate Chatwoot event;
- CRM 429;
- CRM unavailable;
- remote create success + local timeout;
- retry/reconcile no duplicate opportunity;
- owner/SLA queue.

## 12. Metrics

- B2B detected;
- qualification completion;
- time to owner;
- CRM sync lag/failure;
- sample/meeting/quote progression;
- won/lost later.

## 13. Rollback

Disable CRM delivery while continuing to persist leads. Outbox remains replayable.

## 14. GO gate

A qualified lead cannot disappear even with CRM offline.
