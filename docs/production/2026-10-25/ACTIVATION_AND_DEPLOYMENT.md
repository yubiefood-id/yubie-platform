# Disabled release deployment and iPaymu activation

The owner selected iPaymu Redirect Payment. Stock, shipping, merchant and Finance
prerequisites remain independent of a code deployment. WhatsApp, admin, ERPNext,
Zammad and RetroPick are outside this deployment.

## Current external gates

| Gate | Status | Required evidence |
|---|---|---|
| Privileged VPS deployment | BLOCKED_OPERATOR | Approved execution path for Docker and protected production configuration |
| Physical inventory/QC | BLOCKED_OPERATOR | Counts, packaging allocation, lots, expiry and releases in INVENTORY_REPORT |
| Shipping policy/coverage | BLOCKED_OPERATOR | Approved destinations, effective dates, policy and owner |
| Sandbox acceptance | BLOCKED_EXTERNAL | Rotated sandbox secrets, isolated database/host, all ten matrix receipts |
| Provider contracts | BLOCKED_EXTERNAL | Session cancellation, lookup/reference reuse, create-timeout discovery, timestamp authentication/skew and JSON/form normalization |
| Merchant readiness | BLOCKED_EXTERNAL | KYC, validated actual VPS outbound IP, approved application domains and callback |
| Production credentials | BLOCKED_EXTERNAL | Freshly rotated pair provisioned directly in protected server storage |
| Refund/incident ownership | BLOCKED_OPERATOR | Named Finance/refund owner, cancellation/refund policy and escalation |
| Activation | BLOCKED_OPERATOR | Exact release manifest signed by Finance and release owner |
| Monitoring/rollback | BLOCKED_OPERATOR | Named on-call, working alert sink and qualified compatible backend rollback |

Do not reuse any credentials pasted into chat. Credentials never enter source,
client bundles or public evidence. Published documentation does not establish
the merchant account's actual approval state.

## Deployment procedure

1. Freeze and review the source; merge through quality, persistence, security,
   browser and containers checks. Use the existing protected RC publication.
2. Record the merged SHA, full registry digests and image revision labels.
3. Reconcile actual VPS configuration, schema, outstanding payments and stock.
   Keep admission disabled. If real-provider payments are unresolved, preserve
   that PSP and recovery path throughout deployment.
4. Stage the reviewed Compose artifact separately from the existing production
   file. On the approved privileged VPS path, run:

```sh
bash scripts/deploy-commerce-safe.sh <full-sha> <api-image-at-digest> <worker-image-at-digest> <reviewed-compose-file>
```

The script validates pinned artifacts, backs up configuration/PostgreSQL,
restores into a uniquely named scratch database, verifies that restoration,
applies additive migrations and starts only API/worker in `yubie-prod`.
It never enables admission or changes the PSP. Keep backup contents private.
A partial failure stops execution for inspection; it does not restore an older
database or automatically roll back to an incompatible payment worker.

5. Verify API identity/readiness, schema through 0025, frozen admission, customer
   boundaries, availability, inbox processing, reconciliation and exception metrics.
6. Build the exact source with `NEXT_PUBLIC_YUBIE_LAUNCH_PROFILE=DIRECT_COMMERCE_PRODUCTION`
   through the verified build script. Require a clean release identity manifest.
7. Deploy the complete Worker/assets artifact using the existing production
   Wrangler config. Preserve `yubie-web-production`, both custom domains and
   `ASSETS`. Verify HTML, all JS/CSS, lazy modules and read-only browser journeys.
8. Record actual Worker version, artifact digest and backend digests. Follow the
   current Cloudflare rollback runbook; do not restore apex DNS to Vercel.

## Independent live activation

Only after every external gate and sandbox acceptance is evidenced, select the
approved production iPaymu configuration while keeping admission disabled.
Validate non-chargeable account connectivity, callback protection, released
stock, shipping, exception monitoring and worker health. Admission is the final,
independent reversible step. A real-money pilot requires the approved Finance
procedure; ordinary smoke testing never creates charges.

Financial verification exceptions automatically hold new payable checkout.
Operators also freeze the admission flag on an incident, preserving callbacks,
inbox processing, configured PSP, reconciliation and existing attempts. Never
ask a customer to pay again to resolve an unknown outcome.

## Configuration inventory — names only

| Names | Purpose |
|---|---|
| YUBIE_ENV, YUBIE_LAUNCH_PROFILE, NEXT_PUBLIC_YUBIE_LAUNCH_PROFILE | Runtime/build environment and customer routes |
| RELEASE_SHA, YUBIE_API_IMAGE, YUBIE_WORKER_IMAGE | Source and immutable backend artifacts |
| COMMERCE_PROVIDER, YUBIE_CHECKOUT_ADMISSION | PSP selection and independent admission freeze |
| INVENTORY_MODE, PURCHASE_OPTIONS_SOURCE | Authoritative lots and approved purchase channels |
| SHIPPING_POLICY | Legacy policy selection; production additionally requires database approval/coverage |
| APP_ORIGIN, YUBIE_API_ORIGIN | Approved application and API routing |
| IPAYMU_ENV, IPAYMU_API_BASE_URL, IPAYMU_NOTIFY_URL | Environment-bound provider and callback routing |
| IPAYMU_VA, IPAYMU_API_KEY | Protected merchant credentials |
| DATABASE_URL, POSTGRES_PASSWORD | Protected PostgreSQL access |
| API_PROXY_TOKEN, OPS_API_TOKEN | Protected service/operator boundaries |
| GOOGLE_CLIENT_ID | Existing customer Google sign-in |
| SUPPORT_PROVIDER | Keep support automation deferred |
