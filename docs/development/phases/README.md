# Yubie Detailed Delivery Phases

These phase documents are the execution contract for the current marketplace-first / WhatsApp-first architecture.

## Dependency order

~~~mermaid
flowchart LR
  M0["M0 Channel + Product Truth"] --> M1["M1 Marketplace Routing"]
  M1 --> M2["M2 WhatsApp / Chatwoot"]
  M2 --> M3["M3 Safe Assistant"]
  M3 --> M4["M4 B2B CRM"]
  M1 --> M5["M5 Marketplace Intelligence"]
  M5 --> M6["M6 Marketplace APIs"]
  M4 --> M7["M7 ERP / Back Office"]
  M6 --> M7
  M7 --> M8["M8 Direct Commerce Decision"]
~~~

M2 can begin infrastructure preparation while M1 finishes, but public launch of automation follows the gate order.

## Phase rules

Every phase has:

- problem statement;
- desired business outcome;
- current-state proof;
- scope/non-goals;
- architecture/data/API changes;
- provider prerequisites;
- security/privacy;
- test matrix;
- observability;
- rollout/rollback;
- acceptance evidence;
- explicit GO/NO-GO.

No phase is considered complete merely because code merged.

## Phase index

1. [M0 — Channel Model and Product Truth](./PHASE_M0_CHANNEL_PRODUCT_TRUTH.md)
2. [M1 — Marketplace Routing and Attribution](./PHASE_M1_MARKETPLACE_ROUTING.md)
3. [M2 — WhatsApp and Chatwoot Operations](./PHASE_M2_WHATSAPP_CHATWOOT.md)
4. [M3 — Safe Assistant Automation](./PHASE_M3_SAFE_ASSISTANT.md)
5. [M4 — B2B Qualification and CRM](./PHASE_M4_B2B_CRM.md)
6. [M5 — Marketplace Intelligence](./PHASE_M5_MARKETPLACE_INTELLIGENCE.md)
7. [M6 — Marketplace APIs](./PHASE_M6_MARKETPLACE_APIS.md)
8. [M7 — ERP and Back-office Integration](./PHASE_M7_ERP_BACKOFFICE.md)
9. [M8 — Direct Commerce Decision Gate](./PHASE_M8_DIRECT_COMMERCE_DECISION.md)

## Cross-phase definition of done

~~~text
npm run check                       passes
migration tests                     pass where applicable
provider/fake contracts             pass
assistant eval                      passes where applicable
security/privacy review             complete
operator ownership                  named
dashboard/alerts                    available
rollback/kill switch                tested
docs/runbooks                       current
acceptance evidence                 linked
~~~
