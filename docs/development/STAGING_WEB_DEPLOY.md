# Staging web deployment contract (Vinext on Cloudflare)

Status: **CONTRACT ONLY — not deployed.** Cloudflare account access and DNS
are operator actions outside the pre-staging engineering milestone. This
document plus `apps/web/wrangler.jsonc` make the deploy deterministic once
access exists.

## Topology (ADR-012 §1)

```
Browser ──> https://staging.yubie.id            (Cloudflare, Vinext worker)
              └─ /api/* same-origin route handlers (server-side only)
                   └─> https://api-staging.yubie.id   (core VPS, Caddy → apps/api)
                         hop auth: x-api-proxy-token (API_PROXY_TOKEN)
```

The browser only ever talks to `staging.yubie.id`. First-party cookies, no
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

## Deploy (when Cloudflare access is provisioned)

```
cd apps/web
npm run build
npx wrangler deploy                      # uses wrangler.jsonc
npx wrangler secret put API_PROXY_TOKEN  # paste the SAME value as the api's env
```

Binding rules:

- `YUBIE_API_ORIGIN` is a **var** in `wrangler.jsonc`
  (`https://api-staging.yubie.id`) — non-secret by design.
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

## Rollback

Redeploy the previous worker version (`wrangler rollback` or redeploy a
previous artifact). The static Vercel preview stays online throughout as an
independent fallback surface.
