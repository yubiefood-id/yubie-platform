# Production Smoke Results — 2026-10-24

Filled ONLY from real executions (command + observed output + UTC time). Clean browser profile per run. Anything not yet executed reads NOT_RUN.

## Backend (api.yubiefood.com / VPS)

| Check | Command | Expected | Result |
|---|---|---|---|
| Health identity | `GET /healthz` | `{ok:true, releaseSha:"<RC SHA>"}` | NOT_RUN |
| Readiness | `GET /readyz` | 200 | NOT_RUN |
| Launch gate open | `GET /v1/checkouts/session` (no proxy token) | non-503, non-FEATURE_DISABLED (401/429 path expected without token) | NOT_RUN |
| Webhook reachability | `POST /v1/webhooks/ipaymu` unsigned | 503 WEBHOOK_NOT_CONFIGURED (preview mode) | NOT_RUN |
| Metrics not public | port scan 8787/8789 from public | closed | NOT_RUN |

## Worker

| Check | Result |
|---|---|
| Container up, `worker.started` with `supportDisabled:true` | NOT_RUN |
| `payment.reconcile` schedule registered | NOT_RUN |
| No Zammad env present in container (`docker inspect` names only) | NOT_RUN |

## Web (after Worker cutover — BLOCKED_OPERATOR_SCOPE until then)

| Check | Result |
|---|---|
| `/`, 4 product families, 9 variants render | NOT_RUN |
| Login (Google), account, addresses | NOT_RUN |
| Cart → checkout UI (preview mode honest) → order history | NOT_RUN |
| robots.txt / sitemap.xml / canonical yubiefood.com / CSP | NOT_RUN |
| Mobile 320px no overflow | NOT_RUN |
| Vercel fallback still live | PASS (untouched) |

## Admin (after B3/B4)

| Check | Result |
|---|---|
| Anonymous → Cloudflare Access login | NOT_RUN |
| Staff login → read-only orders/payments/exceptions/inventory | NOT_RUN |
| Audit rows written | NOT_RUN |

## Statuses

See RELEASE_MANIFEST.json `status` block.
