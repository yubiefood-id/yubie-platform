# M3-PROD Baseline

**Date:** 2026-09-20  
**Recorded by:** M3-PROD controller

## Git state

| Item | Value |
|------|-------|
| Local branch | `main` |
| Local HEAD | `8e46a004c92c271a40e320b56969434e5b5a3efd` |
| M1 SHA | `34556fc194e2` |
| M2-SH SHA | `8e46a004c92c271a40e320b56969434e5b5a3efd` |
| `origin/main` | `6dfd4b4044f07fd2ee0d6b6af85513948661e7fb` |
| M1+M2 pushed | **No** — local `main` is 2 commits ahead of `origin/main` |
| Working tree | Clean (untracked `.cursor/` only) |
| `main` contains M1 | Yes |
| `main` contains M2-SH | Yes |

**Push authorization:** Not granted. Do not push until operator approves.

## Verification results (2026-09-20)

| Command | Result |
|---------|--------|
| `npm ci` | PASS |
| `npm run lint` | PASS (1 web warning, 0 errors) |
| `npm run typecheck` | PASS |
| `npm run test` | PASS |
| `npm run check` | PASS |
| `npm run build` | PASS |
| `docker compose -f infrastructure/docker-compose.yml up -d` | PASS |
| `npm run db:migrate` (empty → 0002) | PASS (`postgresql://yubie:yubie_local@localhost:5432/yubie_dev`) |
| `docker compose -f infrastructure/docker-compose.prod.yml config` | PASS |
| `docker compose -f infrastructure/docker-compose.m2-sh.single.yml config` | PASS |
| `npm run check` (post-M3) | PASS |
| `npm run build` (post-M3) | PASS |
| Migration `0003_m3_prod.sql` | PASS |
| Assistant eval seed (260 cases) | PASS |
| Docker build api/worker/bot | Not run in baseline (compose config validated) |

## CI state

- GitHub Actions: `.github/workflows/ci.yml` runs `npm ci` + `npm run check` + persistence job
- CI does not run `build` or Docker image builds on current `origin/main`
- M1+M2 not on remote — CI has not validated M2-SH commits

## Deployment state

- Production compose: api + worker + migrate (no bot image in prod compose)
- M2 single-host compose: bot only, worker missing
- Chatwoot pinned: `v4.13.0` (upgrade to v4.17.1 planned in M3)
- vLLM pinned: `v0.8.5` (upgrade to v0.29.0 planned in M3)
- No staging Chatwoot deployed yet
- No GPU benchmark on production hardware yet

## Known pre-M3 gaps (addressed in M3)

- `Dockerfile.worker` missing `@yubie/assistant` build step
- `docker-compose.m2-sh.single.yml` missing worker service
- `assistant_runs` / `assistant_actions` not written at runtime
- Inline Chatwoot send (no durable outbox)
- `webhook_inbox.raw_body` retained indefinitely
- Env-only kill switches
- No `/ops/assistant` surface
