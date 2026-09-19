# M4-Z Baseline

**Date:** 2026-09-20  
**Recorded by:** M4-Z controller

## Git state

| Item | Value |
|------|-------|
| Local branch | `main` |
| Pre-M4 HEAD (M2-SH) | `8e46a004c92c271a40e320b56969434e5b5a3efd` |
| M1 SHA | `34556fc194e2` |
| M2-SH SHA | `8e46a004c92c271a40e320b56969434e5b5a3efd` |
| `origin/main` | `6dfd4b4044f07fd2ee0d6b6af85513948661e7fb` |
| M1+M2 pushed | **No** — local `main` is 2 commits ahead of `origin/main` |
| M3-PROD | Committed locally before M4 work began |
| Push authorization | Not granted |

## Verification (pre-M4)

| Command | Result |
|---------|--------|
| `npm ci` | PASS |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm run test` | PASS |
| `npm run check` | PASS |
| `npm run build` | PASS |

## Existing components confirmed

| Component | Status |
|-----------|--------|
| `apps/bot` | Present |
| `apps/worker` | Present |
| `packages/assistant` | Present — provider-neutral |
| `packages/application` | Present |
| `packages/persistence` | Present |
| `packages/integrations` | Present — Chatwoot adapter |
| `assistant_outbox` | Present (M3 migration `0003`) |
| `webhook_inbox` | Present |
| `conversation_sessions` | Present — Chatwoot-keyed columns |
| `assistant_runs` | Present |
| Runtime assistant config | Present |
| Knowledge repository | Present |
| `ConversationContextProvider` | Present (Chatwoot) |
| Chatwoot webhook verifier | Present (HMAC-SHA256 + timestamp) |
| Chatwoot infrastructure | Present (`infrastructure/chatwoot/`) |

## Chatwoot coupling inventory

| Classification | Locations |
|----------------|-----------|
| PROVIDER ADAPTER | `packages/integrations/src/chatwoot/*` |
| TRANSPORT ONLY | `apps/bot`, `apps/worker` handlers |
| PERSISTENCE LEAK | `conversation_sessions.chatwoot_*` |
| DOMAIN LEAK | None |
| INFRA ONLY | `infrastructure/chatwoot/`, compose env |
| DOC ONLY | ~40 files |

## Provider-neutral code (preserve)

- `packages/domain/src/assistant.ts`
- `packages/assistant/src/pipeline.ts`, risk policy, validator, classifiers
- `assistant_outbox`, `assistant_runs`, `webhook_inbox` (mostly)
- `assistant_runtime_config` + ops API
- Human-over-bot invariant (pipeline, validator, ingest, delivery, reconcile)

## Data migration decision

No production Chatwoot deployment exists (M3 baseline: "No staging Chatwoot deployed yet"). **No historical import required.**

## Migration risks

| Risk | Mitigation |
|------|------------|
| Zammad HMAC differs (SHA1, no timestamp) | Separate `verifyZammadWebhook` |
| M3 uncommitted work | Committed before M4 |
| WhatsApp article type unknown | Staging discovery + contract tests |
| Dedicated VPS required | Zammad on separate host from Yubie core |
| Dual-provider duplicate replies | `SUPPORT_PROVIDER` flag; never dual auto-reply |

## Target topology

- **Zammad VPS:** `support-staging.yubie.id` / `support.yubie.id`
- **Yubie core VPS:** API, worker, bot, vLLM, Yubie Postgres
- Zammad owns separate PG, Redis, Memcached, Elasticsearch
