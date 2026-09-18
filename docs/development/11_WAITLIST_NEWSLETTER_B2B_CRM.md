# 11 — WhatsApp, B2B, CRM and Demand Capture

## Channel roles

| Interaction | Primary owner |
|---|---|
| routine B2C product question | Chatwoot |
| purchase guidance | Chatwoot bot/human + marketplace links |
| marketplace order help | Chatwoot + marketplace-native support/process |
| B2B bulk/sample/product development | Yubie qualification -> CRM |
| partnership/investor/media | Yubie qualification -> CRM/team |
| complaint/food safety | human + Yubie structured incident |
| newsletter/waitlist | purpose-specific consent flow |

Do not model every WhatsApp contact as a CRM deal.

## Funnel

~~~mermaid
flowchart TD
  Source["Website/Social/Referral"] --> WA["WhatsApp"]
  WA --> CW["Chatwoot"]
  CW --> Intent["Intent Router"]
  Intent --> Routine["Routine B2C"]
  Intent --> Buy["Purchase intent"]
  Intent --> B2B["B2B"]
  Intent --> Risk["Complaint / Safety / Human"]
  Routine --> Bot["Approved bot answer"]
  Buy --> Listing["Marketplace options"]
  B2B --> Qualify["Progressive qualification"]
  Qualify --> CRM["CRM"]
  Risk --> Human["Human agent"]
~~~

## B2B state

~~~
NEW_CHAT
 -> B2B_DETECTED
 -> QUALIFYING
 -> QUALIFIED
 -> CRM_SYNCED
 -> DISCOVERY
 -> SAMPLE / QUOTE / DEVELOPMENT
 -> WON / LOST
~~~

Detailed post-sync sales activity may live only in CRM.

## Progressive qualification

Ask only what is useful:

- company/business;
- city/coverage;
- use case;
- product/root interest;
- approximate need;
- timeline;
- sample/development need;
- follow-up preference.

## CRM projection

~~~
Chatwoot
 -> Yubie lead signal
 -> durable DB commit
 -> outbox
 -> CRM Company/Contact/Deal
 -> external IDs back to Yubie
~~~

CRM outage does not lose the lead.

Comp AI CRM may be piloted, but all CRM calls remain behind a provider interface.

## Consent

An operational response to a WhatsApp enquiry is not marketing consent. Newsletter/community consent remains separate and auditable.

## Human handoff

~~~
BOT_ACTIVE -> NEEDS_HUMAN -> QUEUED -> HUMAN_ACTIVE -> RESOLVED -> BOT_ELIGIBLE
~~~

Human participation pauses bot automation until an explicit re-entry rule.

## Metrics

- WhatsApp starts by source/product;
- intent distribution;
- safe bot resolution;
- handoff rate/reason;
- first human response;
- B2B detected -> qualified -> opportunity -> won.

No raw free text in general analytics.
