# 28 — Assistant, Knowledge and CRM Automation

## 1. Objective

Create a helpful WhatsApp assistant without turning a generative model into Yubie's product, regulatory or commercial authority.

## 2. Runtime flow

~~~mermaid
flowchart TD
  MSG["Chatwoot message event"] --> INBOX["durable inbox"]
  INBOX --> WORKER["assistant worker"]
  WORKER --> INTENT["intent classifier"]
  INTENT --> POLICY["deterministic policy"]
  POLICY -->|safe automation| TOOLS["approved tools / knowledge"]
  TOOLS --> MODEL["LLM draft"]
  MODEL --> VALIDATE["response validator"]
  VALIDATE --> CW["Chatwoot reply"]
  POLICY -->|handoff| HUMAN["human queue"]
~~~

## 3. Intent taxonomy

Required baseline:

~~~text
PRODUCT_INFO
PRODUCT_DISCOVERY
USAGE_RECIPE
WHERE_TO_BUY
PRICE_OR_PROMO
STOCK_AVAILABILITY
ORDER_HELP

B2B_BULK
B2B_SAMPLE
B2B_PRODUCT_DEVELOPMENT
WHOLESALE
PARTNERSHIP

COMPLAINT
FOOD_SAFETY
ALLERGEN_OR_HEALTH
CERTIFICATION
HUMAN_REQUEST
OTHER
SPAM
~~~

Intent classification can use a model, but routing policy is deterministic.

## 4. Risk classes

### Green — auto-reply eligible

- approved product description;
- recipe/usage from approved content;
- marketplace link lookup;
- business hours;
- general B2B introduction.

### Amber — constrained/handoff if uncertain

- current price/promo/stock;
- shipping/order questions;
- certification questions;
- B2B commercial details;
- product suitability questions.

### Red — human-first

- illness/adverse reaction;
- allergen uncertainty;
- contamination/foreign object;
- medical/weight-loss/disease claims;
- refund/compensation commitment;
- contracts/custom pricing;
- explicit human request;
- abusive/prompt-injection attempts that request secrets/tools.

## 5. Knowledge model

Knowledge is not a free-form vector dump.

Each item has:

~~~text
knowledge_id
type
scope
title
approved_content
locale
version
approval_status
effective_from
effective_until
source_reference
~~~

Retrieval filters APPROVED/effective records before semantic or keyword ranking.

## 6. Tool contracts

Initial tools:

~~~ts
get_product(productId)
get_purchase_options(productId)
get_root(rootId)
get_recipe(recipeId)

create_b2b_signal(input)
update_b2b_qualification(input)
request_handoff(reason)
get_business_hours()
~~~

Tools return typed facts and external refs. Model cannot call arbitrary SQL, browser or HTTP.

## 7. Price/stock behavior

Unless an approved live marketplace data source exists:

~~~text
User: "Shopee harganya berapa?"
Bot: provide verified listing link and state that current marketplace price/promo is shown there.
~~~

Never quote cached promotional price as live truth without freshness metadata.

## 8. Product/health behavior

Research evidence may guide internal R&D, but assistant response uses only approved public facts.

If a question asks whether Yubie prevents obesity, treats disease, guarantees satiety, acts as a medical meal replacement or is suitable for a medical condition, the assistant must avoid unsupported recommendation and hand off when necessary.

## 9. B2B qualification

Ask progressively based on context:

~~~text
business/company
location/coverage
use case
product/root interest
approximate volume
timeline
sample need
product-development need
preferred follow-up
~~~

Do not ask all fields at once.

State:

~~~text
DETECTED -> QUALIFYING -> QUALIFIED -> CRM_SYNC_PENDING -> CRM_SYNCED
~~~

## 10. CRM projection

Only after qualification threshold/policy:

~~~text
Yubie lead state
 + audit
 + outbox
 COMMIT
   |
   v
CRM adapter
 -> Company
 -> Contact
 -> Opportunity
 -> activity/reference
~~~

CRM outage produces a retry/operator exception, never lost lead data.

## 11. Human handoff

State machine:

~~~text
BOT_ACTIVE
 -> HANDOFF_REQUESTED
 -> QUEUED
 -> HUMAN_ACTIVE
 -> RESOLVED
 -> BOT_ELIGIBLE
~~~

A human reply pauses automated outbound replies until explicit policy re-entry.

## 12. Evaluation

Assistant auto-reply cannot be enabled without a versioned evaluation suite covering:

- approved fact exactness;
- unsupported claim refusal/handoff;
- five-root/product mapping;
- wrong/deactivated listing;
- prompt injection;
- PII/secret extraction;
- price/stock hallucination;
- B2B qualification;
- complaint/safety;
- Indonesian informal language;
- duplicate event;
- provider/model timeout.

Record precision/recall for critical intent routing and zero-tolerance red-safety failures.

## 13. Model/provider abstraction

Model provider is replaceable. Persist:

~~~text
provider
model
prompt/policy version
knowledge/tool versions
latency
token/cost metadata
result type
~~~

Do not persist hidden chain-of-thought.

## 14. Rollout

~~~text
offline fixtures
 -> shadow classification
 -> agent-visible suggested reply
 -> low-risk automatic replies
 -> controlled expansion
~~~

Every step has a kill switch independent of Chatwoot availability.
