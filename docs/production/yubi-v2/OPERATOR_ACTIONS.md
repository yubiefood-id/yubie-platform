# Operator actions

ENGINEERING_CAN_DO: deterministic flows, catalog/media resolver, provider adapter,
regression/security tests, staging preparation, documentation and reviewed release
artifacts. Fixtures grant no product or operational approval.

| OPERATOR_REQUIRED | Required evidence |
| --- | --- |
| Meta Business / official phone | Named owner, verified channel, approved customer-initiated test identities/window; keep phone numbers in protected records |
| Zammad | Running version/digest, named least-privilege service principal and agents, correct article type and signed article/lifecycle triggers |
| Routing | Actual CS/Sales/Food Safety group IDs, high-priority ID, named coverage and approved after-hours schedule |
| DNS/TLS/Access | Approved real support/webhook endpoints and protected ops access |
| Product/Brand | Four final photos with reviewed immutable hashes and exact SKU sign-off; category-specific knowledge evidence |
| Website | Exact clean source, artifact digest, four PDP receipts, origin/profile and approval; separate auth/checkout acceptance |
| Operations | Real alert delivery, recovery drill, authorized backup destination/restore, privacy and named support UAT |
| Release | Owner authorizes exact signed candidate, window/on-call and rollback; R5 stays manual |

Actual code variable names (values belong in protected deployment tooling):

| Variables | Purpose |
| --- | --- |
| DATABASE_URL | Existing PostgreSQL and pg-boss |
| YUBIE_ENV | Runtime environment validation |
| SUPPORT_PROVIDER, CHAT_PROVIDER | Support provider; latter is legacy fallback when former unset |
| BOT_ENGINE | deterministic default; zero-LLM production path |
| ZAMMAD_BASE_URL, ZAMMAD_API_TOKEN | Instance and service principal |
| ZAMMAD_WEBHOOK_SECRET, ZAMMAD_WEBHOOK_BEARER | Webhook auth; both required when both configured |
| ZAMMAD_WHATSAPP_ARTICLE_TYPE | Actual deployed channel article type |
| ZAMMAD_GROUP_BOT_QUEUE | Eligible bot group |
| ZAMMAD_GROUP_CUSTOMER_SUPPORT | Support queue |
| ZAMMAD_GROUP_SALES_PARTNERSHIP | Sales queue |
| ZAMMAD_GROUP_FOOD_SAFETY, ZAMMAD_PRIORITY_HIGH | Priority safety route |
| YUBIE_BUSINESS_HOURS_JSON | Existing approved timezone/hour/weekday configuration |
| OPS_API_TOKEN, RELEASE_SHA | Protected operator bearer and exact bot source revision |
| YUBIE_LAUNCH_PROFILE | Existing release authority; preserve PUBLIC_CATALOG_NO_SALES |
| NEXT_PUBLIC_YUBIE_LAUNCH_PROFILE | Website projection of that profile |
| WORKER_METRICS_ENABLED, WORKER_METRICS_PORT | Existing metrics server |

There are no five capability environment flags. Existing audited runtime keys:
deterministic_flow_version, flow_selection_approval, website_release,
support_acceptance, mode, assistant_enabled and last_bot_reentry.
ASSISTANT_ENABLED is not the emergency runtime authority.

After actual acceptance, an authorized operator imports a reviewed, secret-free
JSON file containing website_release and support_acceptance through the existing
runtime repository. WebsiteReleaseEvidence fields: approvalStatus=APPROVED,
approvalRef, sourceSha, sourceDirty=false, artifactDigest,
canonicalOrigin=https://yubiefood.com, launchProfile, paymentMode, verifiedRoutes.
Optional authenticationAccepted/sandboxCheckoutAccepted require independent
actual acceptance. Support fields: approvalRef, exact bot releaseSha,
operationsAccepted=true only after accepted R3/R4 receipts. An assertion must link
the actual protected approval, never a fixture.

Operator-only write procedure (not executed by this change; build packages first):

```sh
node --input-type=module - approved-evidence.json named.operator <<'JS'
import {readFile} from 'node:fs/promises';
import {createDatabase,closeDatabase,PostgresRuntimeConfigRepository} from '@yubie/persistence';
import {isApprovedWebsiteEvidence,parseLaunchProfile} from '@yubie/config';
const [file,actor]=process.argv.slice(2);
if(!/^[A-Za-z0-9_.-]{1,64}$/.test(actor??''))throw Error('named_actor_required');
const evidence=JSON.parse(await readFile(file,'utf8'));
if(!isApprovedWebsiteEvidence(evidence.website_release,parseLaunchProfile(process.env.YUBIE_LAUNCH_PROFILE)))throw Error('invalid_website_evidence');
if(!evidence.support_acceptance?.approvalRef || evidence.support_acceptance.releaseSha!==process.env.RELEASE_SHA || evidence.support_acceptance.operationsAccepted!==true)throw Error('invalid_support_evidence');
const db=createDatabase(process.env.DATABASE_URL);
try{await new PostgresRuntimeConfigRepository(db).setMany(Object.entries(evidence).filter(([k])=>['website_release','support_acceptance'].includes(k)).map(([key,value])=>({key,value})),actor,new Date().toISOString());}finally{await closeDatabase(db);}
JS
```

POST /ops/assistant/flow-version takes flowVersion=deterministic-v2, releaseSha,
approvalRef and changedBy. SHA must match RELEASE_SHA. AUTO becomes shadow; OFF
remains OFF. Verify GET /ops/assistant. Separate POST /ops/assistant/mode with
mode=auto and changedBy is a release action, blocked in production without four
final photos, approved catalog and exact support/operations acceptance.

Reentry requires resolved case, cleared named owner, intentional ticket AUTO,
≥30-minute cooldown, POST /ops/assistant/reentry (provider, threadId, changedBy),
then customer menu/start. Closure/reopening alone never releases ownership.

Accept alerts for support_provider_error_total, assistant_outbox_failed/ambiguous,
assistant_inbox_dead_letter_total and growing assistant_outbox_pending. Monitor
priority queue age and delivery in Zammad. Metric existence is not proof of alert
delivery. No raw customer/B2B content, phone numbers or credentials in artifacts.
