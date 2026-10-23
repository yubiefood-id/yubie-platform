# Operator Blockers — 2026-10-24 Production Release

Everything that requires a human with credentials/authority. Each item names the exact action. Everything NOT listed here is engineering-executable and tracked in DEPLOYMENT_EXECUTION.md.

## P0 — blocks production services from being reachable

| # | Blocker | Exact action needed | Owner | Status |
|---|---|---|---|---|
| B0 | **Deploy SSH to the VPS is refused** (`vps-contabo-yubie-1`, key `id_ed25519_yubie_contabo`: `Permission denied (publickey,password)` — re-verified 2026-10-24; refused since 2026-10-20 per readiness ledger O4) | Restore the deploy user's authorized key on the Contabo VPS (or perform the backend deployment steps from DEPLOYMENT_EXECUTION.md manually with an operator session). Without this, no production DB/api/worker/admin deployment can proceed. | VPS operator | BLOCKED_OPERATOR |
| B1 | `api.yubiefood.com` has no DNS record | Create A record `api.yubiefood.com → 84.247.158.36` (DNS-only/grey-cloud, same pattern as api-staging) in the Cloudflare zone | Cloudflare operator | BLOCKED_OPERATOR |
| B2 | Wrangler token in the engineering sandbox has read scopes only | Run `npx wrangler login` granting **Workers Scripts:Edit + Zone:DNS/Workers Routes:Edit** (or perform the production Worker deploy + secret from an operator machine) | Cloudflare operator | BLOCKED_OPERATOR_SCOPE |
| B3 | Production merchant DNS + TLS for admin | Create A record `ops.yubiefood.com → 84.247.158.36` (DNS-only) + Cloudflare Access policy (named staff emails, MFA) on `ops.yubiefood.com` | Cloudflare operator | BLOCKED_OPERATOR |
| B4 | Staff Google OAuth client for admin | Create (or share) the staff OAuth client ID + allowlisted staff role assignments; place in `/etc/yubie/production-admin.env` | Operator + Google admin | BLOCKED_OPERATOR |
| B5 | Sandbox callback hostname for iPaymu acceptance | A record `api-sandbox.yubiefood.com → 84.247.158.36` (DNS-only) when sandbox acceptance is scheduled | Cloudflare operator | BLOCKED_OPERATOR (needed before gate S1) |

## P1 — blocks live payments (FULL_COMMERCE_LIVE), not the preview deployment

| # | Blocker | Exact action needed | Owner | Status |
|---|---|---|---|---|
| B6 | iPaymu credentials compromised 2026-10-19 | Rotate the pasted VA/API key pair in the iPaymu dashboard; confirm whether it was sandbox or production; treat old pair as unusable forever | Operator | BLOCKED_EXTERNAL |
| B7 | No sandbox credentials in secret store | Inject the ROTATED sandbox VA + API key into GitHub environment `sandbox` (secret names `IPAYMU_SANDBOX_VA`, `IPAYMU_SANDBOX_API_KEY`) | Operator | BLOCKED_EXTERNAL |
| B8 | Six provider contract questions unanswered | Obtain written iPaymu answers: cancel-by-SessionID; lookup by referenceId/SessionID; referenceId reuse; create-timeout discovery; callback timestamp auth + clock skew; JSON-vs-form normalization. Archive in docs | Operator ↔ iPaymu | BLOCKED_EXTERNAL |
| B9 | Merchant production onboarding not started | iPaymu merchant activation: KYC (KTP, selfie, verified bank account), public website + terms/privacy/refund policies, static outbound IP validation, domain validation, callback URL config | Operator ↔ iPaymu | BLOCKED_EXTERNAL |
| B10 | Rotated production VA/API key | After B9: provision production pair directly into the VPS production env file (`/etc/yubie/production.env`, mode 0600) — never through chat/PR/terminal echo | Operator | BLOCKED_EXTERNAL |
| B11 | Refund path undefined | Confirm in writing which refund operations the merchant account supports; until then Finance owns the manual dashboard procedure (ADR-013 §5) | Finance + iPaymu | BLOCKED_OWNER |
| B12 | Finance + release sign-off | Signed release manifest for the exact SHA/digests/domain/payment-mode (G10); approved SKU prices | Finance/CEO | BLOCKED_OWNER |

## P2 — blocks full operations readiness (not launch-blocking for preview commerce)

| # | Blocker | Exact action needed | Owner | Status |
|---|---|---|---|---|
| B13 | No released inventory | Operations enters real released lots (qty, expiry, QA) for the 9 SKUs via SQL/admin before ANY checkout can reserve stock (INVENTORY_MODE=lots enforces this) | Operations | BLOCKED_OWNER |
| B14 | ERPNext host | Isolated host + resources approval (explicitly forbidden on the shared Contabo VPS); then pinned Frappe deployment + 9-SKU mapping + shadow acceptance | Operator + Finance | BLOCKED_EXTERNAL |
| B15 | Monitoring/alerting sink | Provide the alert destination (email/webhook) + on-call owner for payment-exception and reconciler alerts | Operator | BLOCKED_OWNER |
| B16 | Off-host backups target | Verify/rotate the backup destination credentials for prod `pg_dump` offsite copies | Operator | BLOCKED_OPERATOR |

## Credential hygiene (informational)

- No iPaymu secrets exist in Git, GitHub environments (listing empty), or the VPS env files as of 2026-10-24 — verified by name-presence only.
- `.env.local` in the repo workspace holds only `VERCEL_OIDC_TOKEN` (name checked, value never read).
