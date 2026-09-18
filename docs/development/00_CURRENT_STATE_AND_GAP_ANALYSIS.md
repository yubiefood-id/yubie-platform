# 00 — Current State and Gap Analysis

## Executive assessment

The repository is a strong public brand/product-discovery foundation, but its original first-party commerce roadmap is no longer aligned with the current operating model.

Yubie now sells D2C primarily through marketplaces and uses WhatsApp for product questions, B2C assistance and B2B. The highest-value software work is therefore **channel routing + conversational CRM + measurement**, not a custom checkout/payment stack.

## Current strengths

- multi-route Yubie brand/product experience;
- product/root/application/recipe discovery;
- B2B page and form prototype;
- local cart/checkout prototype;
- shared TypeScript/Zod/domain packages;
- safe preview commerce adapter;
- CI quality gate.

## Current gaps ranked by business impact

| Rank | Gap | Business risk |
|---|---|---|
| P0 | product pages do not make marketplace purchase the primary transaction path | software contradicts actual sales process |
| P0 | no official WhatsApp/Chatwoot operating system | questions and leads depend on manual chat handling |
| P0 | no chatbot product-truth/policy boundary | AI can invent unsafe claims, price, stock or policy |
| P1 | no durable B2B qualification and CRM projection | valuable opportunities get buried in chat |
| P1 | no canonical marketplace listing registry | listing/SKU links can drift |
| P1 | no first-party outbound attribution | marketing cannot explain owned-site intent |
| P2 | no marketplace report/API ingestion | business analysis remains manual |
| P2 | no integrated inventory/ERP automation | relevant only when operations reach real pain |
| Deferred | first-party checkout/payment | duplicates marketplace transaction capabilities |

## Immediate corrections

1. Replace Add-to-Cart/Checkout as the primary purchase CTA with marketplace purchase options.
2. Keep legacy cart/checkout clearly non-production until removed or reconsidered.
3. Add a server-owned listing registry and safe tracked redirect.
4. Integrate official WhatsApp Cloud API through Chatwoot.
5. Add a Yubie-owned assistant policy/tool layer behind Chatwoot.
6. Persist B2B qualification and project qualified opportunities to CRM.
7. Measure offsite intent, then import marketplace outcome data separately.
8. Keep marketplace APIs and ERP automation behind replaceable adapters.

## Exit condition

The current platform exits prototype status when:

~~~
product discovery
 -> verified marketplace destination OR WhatsApp
 -> safe bot/human assistance
 -> durable B2B pipeline when relevant
 -> measurable channel intent
 -> recoverable provider failure
~~~

works without founder-only knowledge or fragile manual copying.
