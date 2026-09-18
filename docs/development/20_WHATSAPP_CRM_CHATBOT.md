# 20 — WhatsApp CRM Chatbot Architecture

## Stack

~~~
WhatsApp Cloud API
 -> Chatwoot
 -> signed webhook / Agent Bot
 -> Yubie inbox
 -> worker
 -> Assistant Orchestrator
 -> approved knowledge + tools + policy
 -> Chatwoot reply OR human handoff
~~~

Use the official WhatsApp Business/Cloud API path.

## Intent taxonomy

~~~
PRODUCT_INFO
PRODUCT_DISCOVERY
WHERE_TO_BUY
PRICE_OR_PROMO
ORDER_HELP
B2B_BULK
B2B_SAMPLE
B2B_PRODUCT_DEVELOPMENT
PARTNERSHIP
COMPLAINT
FOOD_SAFETY
HUMAN_REQUEST
OTHER
SPAM
~~~

## Safe automation matrix

| Intent | Bot action |
|---|---|
| approved product facts | answer |
| recipes/usage | answer approved content |
| where to buy | listing tool |
| current price/stock | live tool if verified, otherwise marketplace link |
| B2B | progressive qualification |
| cancellation/refund | marketplace/human guidance |
| complaint | human |
| illness/allergen/contamination | immediate safety escalation |
| medical/disease/weight-loss advice | no product medical recommendation |
| uncertain certification | verify/handoff |

## Knowledge

The LLM is not source of truth.

~~~
approved product facts + FAQ + recipes + B2B offer + listing registry
 -> retrieval/tools
 -> LLM
 -> response validator
~~~

## Initial tool allowlist

~~~
get_product
get_purchase_options
get_root
get_recipe
create_b2b_lead
update_b2b_qualification
request_human_handoff
get_business_hours
~~~

No arbitrary browser, SQL or HTTP tools.

## Human handoff

~~~
BOT_ACTIVE -> HANDOFF_REQUESTED -> QUEUED -> HUMAN_ACTIVE -> RESOLVED -> BOT_ELIGIBLE
~~~

Explicit human request, low confidence, complaint/safety, high-value negotiation and repeated failure trigger handoff.

## CRM

Only qualified B2B/partnership signals are projected to CRM. Routine B2C stays in Chatwoot.

## Privacy/evaluation

Use Chatwoot history for active context; store compact structured state instead of duplicating raw chats. Test unsupported claims, prompt injection, wrong links, price/stock hallucination, B2B, safety, human requests and duplicate webhooks.
