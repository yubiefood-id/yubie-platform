# M4.5-RC Baseline

**Date:** 2026-09-20  
**Purpose:** Authoritative repository reconciliation before M4 commit and staging validation.

## Milestone SHAs

| Milestone | SHA | Status |
|-----------|-----|--------|
| M1 | `34556fc` | Committed locally |
| M2-SH | `8e46a00` | Committed locally |
| M3-PROD | `d07552f` | Committed locally (HEAD) |
| M4-Z | Uncommitted | Modified + untracked (see inventory) |
| `origin/main` | `6dfd4b4` | Remote; 3 commits behind local |

## Git evidence

### `git status --short`

```
 M apps/bot/src/index.ts
 M apps/bot/tests/bot.test.mjs
 M apps/worker/src/assistant-handler.ts
 M apps/worker/src/index.ts
 M apps/worker/src/reconcile-handler.ts
 M apps/worker/src/reply-delivery-handler.ts
 M apps/worker/tests/outbox-delivery.test.mjs
 M infrastructure/api.env.example
 M infrastructure/docker-compose.m2-sh.single.yml
 M package.json
 M packages/application/src/ports.ts
 M packages/integrations/src/chatwoot/conversation-context.ts
 M packages/integrations/src/index.ts
 M packages/persistence/src/repositories/assistant-outbox-repository.ts
 M packages/persistence/src/repositories/conversation-session-repository.ts
 M packages/persistence/src/repositories/webhook-inbox-repository.ts
 M packages/persistence/src/schema/index.ts
?? .cursor/
?? docs/development/execution/M4_ZAMMAD_ACCEPTANCE_REPORT.md
?? docs/development/execution/M4_ZAMMAD_API_CONTRACT.md
?? docs/development/execution/M4_ZAMMAD_BASELINE.md
?? docs/development/execution/M4_ZAMMAD_IMPLEMENTATION_PLAN.md
?? docs/development/execution/M4_ZAMMAD_MIGRATION_REPORT.md
?? docs/development/execution/M4_ZAMMAD_SECURITY_REVIEW.md
?? docs/development/execution/M4_ZAMMAD_STAGING_REPORT.md
?? docs/production/ADR-009_ZAMMAD_SUPPORT_AUTHORITY.md
?? docs/production/ADR-010_SUPPORT_PROVIDER_BOUNDARY.md
?? docs/production/runbooks/zammad-cutover.md
?? docs/production/runbooks/zammad-rollback.md
?? docs/production/runbooks/zammad.md
?? infrastructure/zammad/
?? packages/application/src/ports/
?? packages/integrations/src/conversation/
?? packages/integrations/src/support/
?? packages/integrations/src/zammad/
?? packages/integrations/tests/zammad.test.mjs
?? packages/persistence/migrations/0004_m4_zammad_provider.sql
```

### `git branch --show-current`

```
main
```

### `git rev-parse HEAD`

```
d07552f82984e75c62153f1318957ce65aa7acee
```

### `git rev-parse origin/main`

```
6dfd4b4044f07fd2ee0d6b6af85513948661e7fb
```

### `git log --oneline --decorate -30`

```
d07552f (HEAD -> main) feat(assistant): deliver M3-PROD reliability and productionization
8e46a00 feat: implement M2-SH self-hosted WhatsApp AI chatbot stack
34556fc feat: deliver M1 marketplace routing foundation
6dfd4b4 (origin/main, origin/HEAD) add
15be254 docs: align production controls with current platform model
486e213 docs: add production VPS handbook
8d065ce docs: add detailed M0-M8 development phase plans
f308249 docs: add full engineering development architecture
fcd83c6 (origin/docs/marketplace-whatsapp-first-architecture) docs: realign commerce CRM and production roadmap
890660c docs: adopt marketplace and WhatsApp first architecture
e9ea691 Merge pull request #4 from yubiefood-id/agent/yubie-product-discovery-revision
fd1d0b0 (origin/agent/yubie-product-discovery-revision) feat: revise Yubie product discovery journey
90ac7a1 Merge pull request #3 from yubiefood-id/agent/development-engineering-handbook
aa75621 (origin/agent/development-engineering-handbook) docs: add development engineering handbook
16846f1 Merge pull request #2 from yubiefood-id/agent/production-readiness-docs
4b5c946 (origin/agent/production-readiness-docs) docs: define production development blueprint
28a286e Merge pull request #1 from yubiefood-id/agent/build-yubie-fullstack-monorepo
a59fbe3 (origin/agent/build-yubie-fullstack-monorepo) Build Yubie full-stack monorepo
0c57803 chore: initialize repository governance
```

### `git log origin/main..HEAD --oneline`

```
d07552f feat(assistant): deliver M3-PROD reliability and productionization
8e46a00 feat: implement M2-SH self-hosted WhatsApp AI chatbot stack
34556fc feat: deliver M1 marketplace routing foundation
```

### `git diff --stat`

```
 apps/bot/src/index.ts                              | 147 ++++++++++++++++---
 apps/bot/tests/bot.test.mjs                        |  42 ++++++
 apps/worker/src/assistant-handler.ts               | 156 ++++++++++++++-------
 apps/worker/src/index.ts                           |  37 +++--
 apps/worker/src/reconcile-handler.ts               |  47 ++++---
 apps/worker/src/reply-delivery-handler.ts          |  80 +++++++++--
 apps/worker/tests/outbox-delivery.test.mjs         |  14 +-
 infrastructure/api.env.example                     |   8 ++
 infrastructure/docker-compose.m2-sh.single.yml     |   7 +
 package.json                                       |   1 +
 packages/application/src/ports.ts                  |   2 +
 .../src/chatwoot/conversation-context.ts           |  21 +--
 packages/integrations/src/index.ts                 |   3 +
 .../repositories/assistant-outbox-repository.ts    |  13 +-
 .../conversation-session-repository.ts             |  65 +++++++--
 .../src/repositories/webhook-inbox-repository.ts   |   2 +
 packages/persistence/src/schema/index.ts           |  10 ++
 17 files changed, 515 insertions(+), 140 deletions(-)
```

### `git diff --cached --stat`

```
(empty — nothing staged)
```

### `git clean -nd` (dry run only — not executed)

Would remove untracked M4 artifacts including `infrastructure/zammad/`, `packages/integrations/src/zammad/`, migration `0004`, and M4 docs. **Do not run `git clean`.**

## M4 file inventory

### Modified tracked (17 files)

- `apps/bot/src/index.ts`, `apps/bot/tests/bot.test.mjs`
- `apps/worker/src/assistant-handler.ts`, `index.ts`, `reconcile-handler.ts`, `reply-delivery-handler.ts`
- `apps/worker/tests/outbox-delivery.test.mjs`
- `infrastructure/api.env.example`, `infrastructure/docker-compose.m2-sh.single.yml`
- `package.json`
- `packages/application/src/ports.ts`
- `packages/integrations/src/chatwoot/conversation-context.ts`, `index.ts`
- `packages/persistence/src/repositories/*`, `schema/index.ts`

### Untracked M4 (exclude `.cursor/`)

- `packages/application/src/ports/support-conversation-provider.ts`
- `packages/integrations/src/zammad/` (9 files)
- `packages/integrations/src/support/` (4 files)
- `packages/integrations/src/conversation/`
- `packages/integrations/tests/zammad.test.mjs`
- `packages/persistence/migrations/0004_m4_zammad_provider.sql`
- `infrastructure/zammad/` (compose overlay, lock, scripts, README)
- `docs/development/execution/M4_ZAMMAD_*` (7 files)
- `docs/production/ADR-009*`, `ADR-010*`
- `docs/production/runbooks/zammad*.md`

## Divergence summary

| Item | Value |
|------|-------|
| Local branch | `main` @ `d07552f` |
| Remote `origin/main` | `6dfd4b4` |
| Commits ahead of remote | 3 (M1, M2, M3) |
| M4 state | Uncommitted working tree |
| Protected actions | No hard reset; no `git clean`; no checkout over local work |

## Pre-commit verification (Phase 1)

| Command | Result | Date |
|---------|--------|------|
| `npm ci` | PASS | 2026-09-20 |
| `npm run check` | PASS (lint warning in b2b-form only) | 2026-09-20 |
| `npm run build` | PASS | 2026-09-20 |
| `npm run db:migrate` (fresh `yubie_test`) | PASS — 0001→0004 applied | 2026-09-20 |
