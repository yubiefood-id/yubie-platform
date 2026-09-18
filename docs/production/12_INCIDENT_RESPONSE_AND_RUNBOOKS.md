# 12 — Incident Response and Runbooks

## 1. Incident classes

| Class | Examples |
|---|---|
| Platform | VPS/API/database outage, disk exhaustion |
| Channel | broken/poisoned marketplace destination, marketplace API outage |
| Conversation | WhatsApp/Chatwoot delivery/inbox failure |
| AI | unsafe, incorrect or uncontrolled automated response |
| CRM | duplicate/missing B2B projection |
| Data | corrupt/bad marketplace import |
| Security | credential compromise, malicious access |
| Privacy | unauthorized personal-data disclosure |
| Food Safety | adverse event, contamination, allergen/mislabel concern |

## 2. Severity

- **SEV-1:** immediate safety risk, major compromise/data loss, or widespread critical channel failure.
- **SEV-2:** substantial customer/operational impact with bounded scope/workaround.
- **SEV-3:** limited production impact requiring timely correction.
- **SEV-4:** low-impact defect/observation.

Severity can increase as evidence develops.

## 3. Universal response

1. detect/declare and assign severity;
2. protect people and contain further harm;
3. preserve evidence/timeline;
4. establish affected scope from canonical systems;
5. apply safest reversible mitigation;
6. communicate on a defined cadence;
7. recover and reconcile external/provider state;
8. close with owner approval and tracked follow-up.

## 4. Required scenarios

Detailed infrastructure procedures are in [vps/11_DISASTER_RECOVERY_RUNBOOKS.md](./vps/11_DISASTER_RECOVERY_RUNBOOKS.md).

Maintain runbooks for:

- Core VPS loss;
- database corruption/restore;
- broken marketplace listing;
- WhatsApp/Chatwoot outage;
- unsafe assistant response;
- CRM outage/duplicate;
- bad marketplace import;
- credential compromise;
- food-safety escalation.

## 5. Food-safety incident

Human-first:

- collect facts without diagnosing;
- identify product/SKU/order/batch reference where available;
- notify responsible food/product owner;
- preserve conversation/timeline;
- apply stop-sale/quarantine/recall only through approved operational authority;
- assistant does not close the case.

## 6. Security/privacy incident

Revoke/rotate access, isolate affected path, preserve evidence, determine affected data/accounts, involve accountable privacy/security/business owners and follow applicable notification requirements.

Avoid copying sensitive incident evidence into broad team chat.

## 7. Post-incident review

Capture:

- timeline;
- impact;
- detection gap;
- contributing factors;
- what worked;
- customer/data/safety outcome;
- corrective actions with owner/due date.

Measure action completion, not merely publication of the review.
