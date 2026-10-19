# Operator playbook: Yubie staging, iPaymu sandbox, Zammad and WhatsApp

Updated **2026-10-18**. **Not yet executed against the user's VPS or any third-party account.**
Follow `AGENTS.md`, `infrastructure/staging.env.example`, `infrastructure/docker-compose.prod.yml` and `docs/development/STAGING_WEB_DEPLOY.md`.

## Phase 0 — prerequisites and separation of duties

Operator must confirm actual delivery deadline, available VPS IP/DNS, Cloudflare Worker account, separate Zammad host, staging email, Google Cloud OAuth client, Meta WhatsApp Cloud API test number, and merchant owner (legal individual or company).

- NEVER paste VA, API key, database password, or OAuth/Meta/Zammad secrets into GitHub, PR discussion, screenshots or chat.
- **Payment onboarding action:** register at https://sandbox.ipaymu.com/register ; confirm email; in sandbox dashboard go to **Integrasi** and locate the sandbox VA and API Key. Never copy credentials to the browser bundle.
- iPaymu sandbox has no KYC/IP/domain whitelist requirement: https://docs.ipaymu.com/id/docs/getting-started . **Production does** require merchant approval, IP/domain registration and published merchant policies. Reference https://docs.ipaymu.com/id/docs/verification .
- Production merchant website terms and conditions must reflect approved policy: https://docs.ipaymu.com/id/docs/verification/terms-and-conditions .

## Phase 1 — read-only repo and host checks (execute now)

On **the actual staging VPS** with SSH and a checked-out repository:

```bash
cd ~/project/yubie-platform
git remote -v
git status --short
git branch --show-current
git fetch origin main
git log -1 --oneline origin/main
node --version      # repository requires >=22.13
npm --version
docker version
docker compose version
df -h /
free -h
```

**Stop** if there are uncommitted changes or the VPS is not the intended staging host. Preserve data; never run `docker compose down -v` or `npm run db:reset` on staging.

Local checkout prep **only when clean**:

```bash
git switch main
git pull --ff-only origin main
npm ci
npm run check
```

Run `npm run build` if a reproducible workspace build is needed. Do not run this as root.

## Phase 2 — pin and publish the exact container image SHA

- Read the completed GitHub CI workflow for the target SHA. Current main as of this report: `3a06b46dea980880f62e13660937172c0671698b`.
- In GitHub Actions, manually dispatch `.github/workflows/release-candidate.yml` with a **fully qualified 40-character SHA** that passed all required jobs. Do not assume the old RC run at `aa00c53` published a current image.
- Wait for publication and record digest of each GHCR image: `ghcr.io/yubiefood-id/yubie-api:<SHA>`, `yubie-worker:<SHA>`, `yubie-bot:<SHA>`.
- Only set `RELEASE_SHA=<the published SHA>` after verifying it exists; an unmerged iPaymu adapter branch cannot be deployed by selecting a stale main SHA.

## Phase 3 — staging secret file and **API-only** mode

On staging VPS (repository root):

```bash
sudo install -d -m 700 /etc/yubie
sudo install -m 600 infrastructure/staging.env.example /etc/yubie/staging.env
sudoedit /etc/yubie/staging.env
```

Set fields in root-only `/etc/yubie/staging.env`:

| Name | Current staging value | Operator action |
|---|---|---|
| `RELEASE_SHA` | full published SHA | CI/release evidence |
| `YUBIE_ENV` | `staging` | static |
| `POSTGRES_USER` | `yubie` | staging-only |
| `POSTGRES_PASSWORD` | generated 32+ byte random hex | secret |
| `POSTGRES_DB` | `yubie` | staging-only |
| `DATABASE_URL` | `postgresql://yubie:<same DB password>@postgres:5432/yubie` | secret/internal Compose DNS |
| `APP_ORIGIN` | `https://staging.yubiefood.com` | after DNS/TLS |
| `COMMERCE_PROVIDER` | **`preview` for this phase** | iPaymu not implemented |
| `INVENTORY_MODE` | `lots` | default |
| `PURCHASE_OPTIONS_SOURCE` | `database` | default |
| `SHIPPING_POLICY` | `free_promotional` only if approved | ops decision |
| `XENDIT_*` | empty while inactive | do not overwrite with iPaymu secrets |
| `GOOGLE_CLIENT_ID` | staging OAuth client ID, or empty until configured | Google account owner |
| `API_PROXY_TOKEN` | generated 32+ byte random hex | equal to web-side Wrangler secret |
| `OPS_API_TOKEN` | separate generated 32+ byte random hex | server-only |
| `SUPPORT_PROVIDER` | `zammad` | do not claim connected yet |
| `BOT_ENGINE` | `deterministic` | static |
| `WORKER_METRICS_ENABLED` | `true` | static |
| `ZAMMAD_*` | obtain real values during Phase 6 | do not fake IDs |
| `CHATWOOT_AGENTBOT_SECRET` | empty | rollback only |

Generate secrets on the VPS with `openssl rand -hex 32` (run 3 times, store each securely). Prefer URL-safe hexadecimal for the Postgres password to avoid DSN escaping mistakes. **Do not print, export into shell history, or share values**.

The root-owned env file cannot normally be read by `ubuntu`. Test Compose's syntax without showing secrets:

```bash
sudo docker compose --env-file /etc/yubie/staging.env \
  -f infrastructure/docker-compose.prod.yml config --quiet
```

For API-only runtime validation, from the repository root and with `@yubie/config` built, execute the validator as a process with the staging environment loaded from the root-only file. The validator supports `--service api`. **Do not interpret failure of the full `npm run config:validate` (worker and bot lack Zammad credentials yet) as an API failure.** Never put raw env/secret output into tickets.

## Phase 4 — PostgreSQL and API; no live payment

With exact SHA GHCR images available, and with appropriate DNS/TLS host configuration ready:

```bash
sudo docker compose --env-file /etc/yubie/staging.env \
  -f infrastructure/docker-compose.prod.yml pull
sudo docker compose --env-file /etc/yubie/staging.env \
  -f infrastructure/docker-compose.prod.yml up -d postgres
sudo docker compose --env-file /etc/yubie/staging.env \
  -f infrastructure/docker-compose.prod.yml run --rm migrate
sudo docker compose --env-file /etc/yubie/staging.env \
  -f infrastructure/docker-compose.prod.yml up -d api
sudo docker compose --env-file /etc/yubie/staging.env \
  -f infrastructure/docker-compose.prod.yml ps
```

Verify internally before exposing through Caddy:

```bash
sudo docker compose --env-file /etc/yubie/staging.env \
  -f infrastructure/docker-compose.prod.yml exec -T api \
  node -e 'fetch("http://127.0.0.1:8787/healthz").then(r=>{console.log("status:",r.status);process.exit(r.ok?0:1)}).catch(()=>process.exit(1))'
```

The Compose stack intentionally publishes **no host ports**. Do not expose Postgres to the internet to "make it work". Ensure reverse-proxy joins the designed Docker edge network or has a secure, explicit local connection to API. External verification (after TLS) is `curl -fsS https://api-staging.yubiefood.com/healthz` and the `/readyz` endpoint; confirm readiness responses and proxy-hop 401/200 contracts from the documented runbooks.

Required DB acceptance: fresh migration, inventory_lots schema, released synthetic test inventory for each sellable SKU, non-release/quarantine blocks purchase, backup and isolated restore. **Never reset an existing staging DB to add demo lots.** Synthetic inventory must be labeled and isolated from any real fulfillment.

## Phase 5 — implement iPaymu adapter (a code PR, NOT env-only)

Create a **separate engineering PR**, not a direct push to `main`. Preserve Xendit adapter.

**Provider-neutral payment contract impact:**
- `packages/domain/src/orders.ts`: add iPaymu provider kind.
- `packages/config/src/index.ts`: add `ipaymu` and fail-closed checks (`IPAYMU_ENV=sandbox` until go-live, `IPAYMU_VA`, `IPAYMU_API_KEY`, DB, HTTPS APP_ORIGIN, lot gating).
- `packages/application/src/use-cases/first-party-checkout.ts`: remove hard-coded `provider: "xendit"`; pass actual provider kind. Prevent duplicate remote session creation on ambiguous failures.
- `packages/integrations/src/ipaymu`: signed `POST /api/v2/payment` and safe `POST /api/v2/transaction` status lookups; network timeouts; strict allowed hosts; response validation.
- `apps/api/src/composition/create-app.ts` and `apps/api/src/index.ts`: provider selection, `POST /v1/webhooks/ipaymu` callback with content-type/body cap, signature verification, durable inbox, matching reference+merchant+exact amount, out-of-order-safe transition.
- `apps/worker/src/payment-reconcile-handler.ts`: safe iPaymu reconciliation **only where transaction lookup is authoritative**; never turn a temporary polling failure into cancellation or expiry.
- `infrastructure/docker-compose.prod.yml`: API/worker receive only necessary iPaymu server envs.
- `apps/web/scripts/validate-artifact.sh`: reject leaked `IPAYMU_*` server secrets in client bundle.
- Unit/contract/API/DB tests and superseding payment ADR.

**iPaymu REST reference:** https://docs.ipaymu.com/id/docs/payment/redirect-payment . Its create response has **`SessionID`** but its status API https://docs.ipaymu.com/id/docs/transaction/check-transaction requires **`transactionId`**. The current port assumes lookup/cancel by provider session ID. Confirm with iPaymu how to map the redirect session to a transaction and how to cancel it BEFORE enabling order cancellation, failed-attach remediation or automatic stock release. No unsupported API endpoint is assumed.

For callbacks, default `application/x-www-form-urlencoded` must either be supported or the sandbox dashboard switched explicitly to JSON. Verify `X-Signature` with the *merchant VA as callback secret*, normalized types and sorted keys, per https://docs.ipaymu.com/id/docs/callback . **Do not reuse request HMAC procedure for callback signatures.** Cross-check payment via authoritative provider status before marking paid.

**Proposed future env ONLY after PR merge and all sandbox gate tests pass**:

```dotenv
COMMERCE_PROVIDER=ipaymu
IPAYMU_ENV=sandbox
IPAYMU_VA=<sandbox_merchant_VA>
IPAYMU_API_KEY=<sandbox_API_key>
IPAYMU_API_BASE_URL=https://sandbox.ipaymu.com
IPAYMU_NOTIFY_URL=https://api-staging.yubiefood.com/v1/webhooks/ipaymu
```

The names above are design proposals; they are NOT runtime-supported by the current main SHA. Leave Xendit credentials empty/inactive for now, and never replace them with iPaymu values.

Acceptance: create redirect, verified successful payment, duplicate callback, forged signature, order+amount mismatch, redirect-before-callback, callback-before-redirect, worker restart, service timeout, provider ambiguous state, expired-but-late-paid race, replay, and DB down/recovery. Use only iPaymu SANDBOX credentials and synthetic customers/products.

## Phase 6 — Zammad and official WhatsApp Cloud API

- Deploy pinned Zammad on the separately provisioned VPS following `infrastructure/zammad/README.md`, `infrastructure/zammad/zammad.lock.json` and the override file. Keep its PostgreSQL/Redis/Elasticsearch private.
- Confirm `https://support-staging.yubiefood.com` is HTTPS reachable and login succeeds, then create least-privilege Zammad API service token.
- Run `npm run zammad:provision -- --dry-run`; inspect expected changes; then `npm run zammad:provision` with authorized approval. Read discovered `ZAMMAD_GROUP_*`, `ZAMMAD_PRIORITY_HIGH`, `ZAMMAD_WHATSAPP_ARTICLE_TYPE` from **actual instance**.
- Configure `ZAMMAD_WEBHOOK_SECRET` and/or `ZAMMAD_WEBHOOK_BEARER` on bot service; ensure bot cannot see `ZAMMAD_API_TOKEN`.
- Integrate Meta official WhatsApp Cloud API test number into Zammad, not personal WhatsApp Business app login.
- Once verified, validate worker and bot env contracts, start worker and bot; follow `docs/development/execution/M5_D_RC_LIVE_STAGING_PLAYBOOK.md`.
- Test B2C auto-reply, `admin` human takeover, B2B/Sales Partnership, and food-safety complaint queue with high priority. Never make medical/health claims from an assistant.

## Phase 7 — product imagery and ERPNext

**Images:** audit `apps/web/public/products/`, `apps/web/public/photography/`; verify each published SKU maps to a real approved product and optimized image (responsive/mobile, alt text, no invented nutrition/certifications). Concept products must be clearly identified.

**ERPNext:** isolated PostgreSQL? No: ERPNext's supported database/runtime must follow ERPNext's own official deployment architecture and should use a **separate ERP datastore** rather than Yubie commerce Postgres. Pilot `Item`, `Warehouse`, `Batch`, `Stock Entry`, `Quality Inspection`, procurement; model supplier raw lot → production batch → finished SKU → customer order/recall. See `docs/development/phases/PHASE_M7_ERP_BACKOFFICE.md`.

**Authority split:** ERPNext = physical stock/batch/QA, Yubie = order/payment/reservation and authorized public product information. At pilot phase **one writable stock owner only**; all integration writes are idempotent and reconciled.

## Phase 8 — evidence/go-live

Record each axis as `PASS`, `FAIL`, or `BLOCKED_EXTERNAL` with timestamp + Git SHA + anonymized evidence:

```text
BACKEND_HEALTH:
POSTGRES_MIGRATION:
POSTGRES_BACKUP_RESTORE:
INVENTORY_FEFO:
CLOUDFLARE_WEB:
IPAYMU_SANDBOX_REDIRECT:
IPAYMU_SANDBOX_CALLBACK_SIGNATURE:
IPAYMU_PROVIDER_RECONCILIATION:
GOOGLE_OAUTH:
IMAGES_APPROVED:
ZAMMAD_STAGING:
WHATSAPP_STAGING:
ERP_BATCH_TRACE:
LIVE_MERCHANT_KYC:
```

**GO-LIVE PROHIBITED** until real merchant iPaymu activation, full payment acceptance matrix, DNS/TLS/WAF controls, backup restore evidence, marketing/food-label verification, fulfillment and manual rollback owners are signed off. Preview checkout must be conspicuously non-paying.
