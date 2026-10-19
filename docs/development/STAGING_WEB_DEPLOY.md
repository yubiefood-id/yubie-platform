# Staging web deployment contract (Vinext on Cloudflare)

Status: **CONTRACT ONLY — not deployed or externally verified.** Operator
reports Cloudflare manages the active `yubiefood.com` zone; this is not proof
that the staging Worker, custom domain, API origin, or TLS exist. Verify the
actual zone and any existing `staging` DNS records before deploying.

## Topology (ADR-012 §1)

```
Browser ──> https://staging.yubiefood.com            (Cloudflare, Vinext worker)
              └─ /api/* same-origin route handlers (server-side only)
                   └─> https://api-staging.yubiefood.com   (core VPS, Caddy → apps/api)
                         hop auth: x-api-proxy-token (API_PROXY_TOKEN)
```

The browser only ever talks to `staging.yubiefood.com`. First-party cookies, no
CORS. Vercel remains **preview-only** (ADR-012) and is never evidence of a
backend deployment.

## Artifact

The production artifact is the repo's existing verified Vinext bundle — no
separate build exists for staging:

```
cd apps/web
npm run build        # scripts/build-verified.sh:
                     #   vinext build -> dist/ + validate-artifact.sh
```

`validate-artifact.sh` proves, on every build:

1. `dist/server/index.js` is an ESM worker exposing `default.fetch(request, env, ctx)`;
2. the hosting manifest is present and parseable;
3. **no server-only secret name (`API_PROXY_TOKEN`, `XENDIT_*`,
   `OPS_API_TOKEN`, `ZAMMAD_API_TOKEN`, `postgresql://`) appears anywhere in
   `dist/client`** — the client bundle is scanned on every build.

## Preflight: avoid modifying production

1. Verify `yubiefood.com` zone is Active and existing production DNS/Workers/routes remain untouched.
2. In Cloudflare DNS, confirm there are no pre-existing records or domain bindings for `staging.yubiefood.com`. If occupied, **STOP** rather than deleting or overriding anything.
3. Check Workers & Pages for any existing `yubie-web-staging` Worker to avoid deploying over another project. Use the account containing the verified zone.
4. Plan restricted staging access with Cloudflare Access (Worker-wide or hostname-scoped); require team login where feasible. Do not accidentally protect all production Workers.
5. Confirm the API staging origin is real and HTTPS-ready before promising functional checkout/auth; frontend pages may render while `/api/*` returns 502.
6. Do not point `api-staging` or `support-staging` to guessed IPs. No NS, apex, `www`, email, or production route edits.

## Deploy (when Cloudflare access is provisioned)

```
cd apps/web
npm run build
npx wrangler deploy                      # uses wrangler.jsonc
npx wrangler secret put API_PROXY_TOKEN  # paste the SAME value as the api's env
```

Binding rules:

- `YUBIE_API_ORIGIN` is a **var** in `wrangler.jsonc`
  (`https://api-staging.yubiefood.com`) — non-secret by design.
- `API_PROXY_TOKEN` is a wrangler **secret**, set per-environment with
  `wrangler secret put`. It must equal the api service's `API_PROXY_TOKEN`.
  It is read only inside server route handlers (`apps/web/lib/api-proxy.ts`);
  nothing with a `NEXT_PUBLIC_`/client import can reach it, and the bundle
  scan above fails the build if it ever leaks.
- The proxy forwards ONLY allowlisted browser headers (`idempotency-key`,
  sanitized `x-request-id`) plus cookies and the hop token
  (`apps/web/lib/proxy-headers.ts`), and the hop is time-bounded (15s).

## Rate budgets (edge-enforced — operator acceptance item)

In-app rate limiting is intentionally absent (single-instance in-memory
limiters are decorative). Budgets to enforce at Cloudflare/WAF during staging
acceptance:

| Route | Budget (per IP) |
|---|---|
| `POST /api/checkout` | 10/min + 30/hour |
| `POST /api/auth/google` | 10/min |
| `POST /api/newsletter`, `/api/waitlist`, `/api/b2b` | 5/min |
| `GET /api/checkout/*` (success-page poll) | 60/min |
| everything else | 120/min |

Record the enforced values in the staging acceptance doc; they are
BLOCKED_EXTERNAL until the edge is configured.

## Acceptance

- `staging.yubiefood.com` resolves to the Worker over valid HTTPS and requires access approval if Access is enabled.
- Existing `yubiefood.com` and `www` continue to behave unchanged.
- Worker `YUBIE_API_ORIGIN` points to `https://api-staging.yubiefood.com`; the API uses `APP_ORIGIN=https://staging.yubiefood.com`.
- `API_PROXY_TOKEN` is a Worker secret equal to the staging API token; it never appears in `dist/client` or git.
- `GET /api/*` may fail 502 while staging API is offline: this is **BLOCKED_EXTERNAL**, not evidence that backend is deployed.
- Google authorized JavaScript origin must include `https://staging.yubiefood.com`; payment callback needs a separate backend route and must not be turned on until verified.

## Rollback

Redeploy the previous worker version (`wrangler rollback` or redeploy a
previous artifact). The static Vercel preview stays online throughout as an
independent fallback surface.
