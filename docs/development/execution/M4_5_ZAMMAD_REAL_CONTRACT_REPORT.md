# M4.5 Zammad Real Contract Report

**Date:** 2026-09-20  
**Status:** CODE_VALIDATED — LIVE_STAGING BLOCKED_EXTERNAL (DNS)

## Audit A — Contract (code + docs)

| Item | Expected | Implementation | Live verified |
|------|----------|----------------|---------------|
| HMAC header | `X-Hub-Signature` sha1 | `webhook-verifier.ts` | Pending |
| Delivery ID | `X-Zammad-Delivery` | `buildZammadDedupeKey` | Pending |
| Trigger header | `X-Zammad-Trigger` | Not required for verify | Pending |
| Bearer | `Authorization: Bearer` | Optional + required in prod config | Pending |
| Empty auth | Reject | `missing_auth_config` (M4.5 fix) | Unit test PASS |
| Body limit | 256KB | Enforced | Unit test PASS |
| REST auth | `Token token=` | `HttpZammadClient` | Pending |
| Article create | POST `/api/v1/ticket_articles` | `sendReply` | Fake test PASS |
| Handoff | PATCH ticket + tags | `handoff.ts` | Fake only |
| WhatsApp article type | Discover in staging | Default `whatsapp` | **Not observed** |

## Audit B — Infrastructure

| Item | Status |
|------|--------|
| Image pin | `ghcr.io/zammad/zammad:7.1.3-0014` + amd64 digest in lock |
| Compose upstream | `c305102` pinned (was `master`) |
| `vm.max_map_count` | 262144 documented |
| RAM/CPU sizing | **Gap** — operator must size VPS (min 4GB RAM recommended for ES) |
| Public ports | Only HTTPS via nginx; override blocks data services |
| Staging DNS | `support-staging.yubie.id` — **Could not resolve from CI/agent host** |

## Audit C — Provider boundary

`grep Zammad|Chatwoot packages/assistant` → **zero matches** (PASS)

## Audit D — Database migration 0004

- Expand-only columns on `conversation_sessions`, `assistant_outbox`, `webhook_inbox`
- Backfill from Chatwoot columns preserved
- Unique `(provider, provider_thread_id)`
- Clean DB migrate 0001→0004: PASS on `yubie_test`

## Audit E — Security highlights

| Threat | Control | Gap closed in M4.5 |
|--------|---------|-------------------|
| Forged webhook | HMAC + Bearer | `missing_auth_config` when both unset |
| Replay | `webhook_inbox` dedupe | — |
| Bot loop | `isCustomerInboundArticle` | Live trigger filter pending |
| Cross-ticket | `getArticle` ticket_id check | — |

## Audit F — Test gaps

| Area | Unit/fake | Live |
|------|-----------|------|
| Webhook HMAC | PASS | Pending |
| Outbound delivery | Chatwoot only | Zammad pending |
| Reconcile | No dedicated test | Pending |
| Human race | Assistant pipeline | Zammad path pending |

## Audit G — Documentation truth

M4 docs correctly state CODE_COMPLETE / STAGING_PENDING. No false production claims found.

## Operator actions to unblock LIVE_STAGING

```bash
# On Zammad VPS
sudo sysctl -w vm.max_map_count=262144
git clone --depth 1 https://github.com/zammad/zammad-docker-compose.git /opt/zammad
cd /opt/zammad && git checkout c3051022307a3ff3f522b249c2117b660fbaf617
# copy infrastructure/zammad/.env.example → .env
docker compose -f docker-compose.yml -f <yubie-overlay> up -d
./infrastructure/zammad/scripts/verify.sh
```

Capture real webhook headers from Zammad trigger and compare to fixtures in `packages/integrations/tests/zammad.test.mjs`.
