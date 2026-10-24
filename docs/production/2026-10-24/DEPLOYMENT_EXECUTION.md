# Deployment Execution Log — 2026-10-24

Running log; every entry names evidence (SHA, run, digest, URL, timestamp UTC). Statuses use the release vocabulary. This file is updated as execution proceeds — unexecuted steps say NOT_RUN, never predicted as done.

## Baseline (verified)

- `origin/main` = `007808f2255c4753602cbbb24c0b5fcc551e2eb7` — CI run 40025843576 all 5 checks success (quality, persistence, security, browser, containers).
- Migrations present through `0021_checkout_guest_bindings.sql`.
- Live state at start: `yubiefood.com` = Vercel static catalog (git deploys disabled); `staging.yubiefood.com` = Worker behind Cloudflare Access; `api-staging.yubiefood.com` = API `aa00c53` (STALE, pre-Commerce-V3) behind Caddy on Contabo 84.247.158.36; `support.yubiefood.com` = live Zammad (same VPS); `api.yubiefood.com` = NO DNS.
- iPaymu production capability: refused at four layers (adapter/factory/config/scanners) — by design.
- Credentials: no iPaymu secrets anywhere (verified by name-presence); GitHub `sandbox` environment secret listing empty; 2026-10-19 pasted pair considered compromised.

## Code changes (PRs)

| PR | Scope | Status |
|---|---|---|
| #34 `feat/ipaymu-production-path` | `IPAYMU_ENV=production` across 4 layers + `DIRECT_COMMERCE_PRODUCTION` launch profile + scanner allowlists + negative test matrix | **MERGED** (all 5 checks green) |
| #35 `feat/worker-support-disabled` (stacked) | `SUPPORT_PROVIDER=disabled` bot-off worker; compose Commerce V3 env pass-throughs; bot opt-in profile; regression tests | **MERGED** (all 5 checks green) |
| #36 `docs/production-release-2026-10-24` (+ undici 7.30.1 security bump for CVE-2026-109869, flagged mid-release by Trivy) | ADR-013 + 2026-10-24 release artifacts + wrangler.prod.jsonc + env contracts | **MERGED** (all 5 checks green) |

**Merged main:** `de837d07379393eadcf93dbc9bf47d2d25f5de34` (CI run 40060240923 on main in progress at time of writing; per-PR check runs all green above).

## Release candidate

- Dispatched workflow run **40060244646** on `de837d0` at 2026-10-24T03:55Z.
- **Status: WAITING on `staging` environment approval — blocker B17** (required reviewer mAsyamJ; engineering token cannot self-approve: `current_user_can_approve: false`).
- Expected digests: `ghcr.io/yubiefood-id/{yubie-api,yubie-worker,yubie-admin}:de837d0…` (+ bot built, NOT deployed) — filled into RELEASE_MANIFEST.json after approval.

## Production backend (Contabo, compose project `yubie-prod`)

- **BLOCKED_OPERATOR (B0): deploy SSH refused.** `ssh vps-contabo-yubie-1` → `Permission denied (publickey,password)` re-verified 2026-10-24 (refused since 2026-10-20, readiness ledger O4). All steps below execute the moment access is restored; exact commands are in ROLLBACK.md/README patterns and this section.
- Isolation: own project name, volumes (`yubie-prod_pgdata`), internal network, DB credentials; Zammad/RetroPick untouched. NOT_RUN
- Fresh DB, migrations `0001–0021` once via migrate one-shot. NOT_RUN
- Post-migration `pg_dump` baseline + restore verification into scratch container. NOT_RUN
- api+worker up (bot profile omitted), `COMMERCE_PROVIDER=preview`, `SUPPORT_PROVIDER=disabled`, `YUBIE_LAUNCH_PROFILE=DIRECT_COMMERCE_PRODUCTION`. NOT_RUN
- Caddy: append-only `api.yubiefood.com` route, reload (not restart). NOT_RUN
- Health: `/healthz` SHA match, `/readyz` 200, webhook route reachable → 503 `WEBHOOK_NOT_CONFIGURED` (no forged events sent). NOT_RUN
- DNS B1 pending → verify via host-header curl to VPS IP until record exists. NOT_RUN

## Admin

- Deploy via `docker-compose.admin.yml` behind Caddy + Cloudflare Access on `ops.yubiefood.com`. NOT_RUN (blockers B3/B4).

## Production web (Worker)

- `apps/web/wrangler.prod.jsonc` added; deploy BLOCKED_OPERATOR_SCOPE (B2) — Vercel catalog stays live meanwhile.

## Sandbox acceptance

- Prep complete in-repo; execution BLOCKED_EXTERNAL (B5–B8). Status: `IPAYMU_SANDBOX_ACCEPTED = NOT_RUN`.

## Cutover snapshot (fill at cutover)

- Prior apex DNS/Worker route state: `<capture before switching>` NOT_RUN.

## Live activation

- `IPAYMU_LIVE_ACCEPTED = NO` / `FULL_COMMERCE_LIVE = NO_GO` until ADR-013 gates pass.

---

## Recovery session addendum (2026-10-24, later)

### Flake fix (PR #38 — MERGED)

Run 40060240923 browser job failed honestly: `locator('.newsletter-form').getByLabel('Email')` strict-mode violation — the SSR form and hydrated client form coexided during hydration on mobile-chromium (both elements named in the error; `getByPlaceholder(...).nth(1)` proves the transient duplicate). Fixed by asserting `toHaveCount(1)` before interaction (race removed, single-form invariant kept). Main run 40061874864 (bdfbaaa) passed 5/5; the fix removes the latent race regardless.

### Payment-safe emergency switch (PR #39 — MERGED)

Verified ROLLBACK R1 gap: `COMMERCE_PROVIDER=preview` mid-incident would 503 `/v1/webhooks/ipaymu` (WEBHOOK_NOT_CONFIGURED) and no-op the reconciler — in-flight callbacks dropped. Implemented `YUBIE_CHECKOUT_ADMISSION=disabled` (config enum fail-closed; API gate before any checkout work; compose pass-through; regression tests; ROLLBACK R1 rewritten). Freeze now stops NEW sessions only; callbacks, reconciliation, recovery reads and reservation resolution keep running.

### Release candidate

- Stale run 40060244646 (de837d0) CANCELLED (main moved). Premature run 40064081145 (e4799b3) CANCELLED (dispatched before #39 merged).
- **Authoritative RC: run 40065176432 on `678725463a95b500e772403a72ef807f8662d152`** — RC_WAITING_APPROVAL.
- B17 analysis: the gh CLI token IS the owner (mAsyamJ) and mAsyamJ is the sole required reviewer, but GitHub blocks self-approval of a run dispatched by the same actor (`current_user_can_approve:false`; approval POST → 422 "No pending deployment requests to approve"). Approval must come from the owner's web session.

### B0 (SSH) — still refused, recovery kit prepared

- `vps-contabo-yubie-1` re-tested 2026-10-24: `Permission denied (publickey,password)`.
- Fresh agent keypair generated: `~/.ssh/id_ed25519_yubie_release_agent` (public fingerprint `SHA256:EFWl19r7Hg/9Opu0qI4JxUlU7AT5yS8JhoaRsPwmv98`). Operator appends the public key to `yubie-deploy`'s authorized_keys via an existing authorized session (exact commands in OPERATOR_BLOCKERS B0).
- Production env with CSPRNG secrets (POSTGRES_PASSWORD / API_PROXY_TOKEN / OPS_API_TOKEN; mode 0600, outside Git) staged at `~/.yubie-prod-secrets/production.env` on the engineering host, RELEASE_SHA filled to 6787254 — deploy is one `scp` away once SSH works.

### Browser automation

No authenticated owner browser session exists in the engineering sandbox (fresh Chrome + Playwright only, no CDP/auth profiles, and extracting cookies is forbidden). All dashboard actions (Cloudflare DNS/token, iPaymu dashboard, Contabo panel) remain precise operator handoffs.
