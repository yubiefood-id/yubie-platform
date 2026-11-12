# WA-01 — Vertical-Slice Contract Hardening Receipt

**Date (UTC):** 2026-11-11 · **Branch:** `feat/whatsapp-trimode-wa00-wa07` · **Base:** `283d2f46` + WA-00 commit

## Stage states

| Stage | State |
| --- | --- |
| SOURCE_AUDITED | PASS (WA-00 ledger) |
| LOCAL_TESTS_GREEN | PASS — see commands below |
| STAGING_REAL_PROVIDER_E2E | **BLOCKED_EXTERNAL** — no Meta test number, no Zammad staging credentials, no webhook signing secret provisioned (owner/Meta/Zammad-admin items, WA-00 §4) |
| OWNER_APPROVED / PRODUCTION_ENABLED | NOT REQUESTED |

## What changed (code)

No production code changed. The existing vertical slice (bot webhook → durable inbox → worker turn → outbox → Zammad REST) already implements the WA-01 flow; this milestone closed its local contract-test gaps:

- `apps/worker/tests/wa01-slice-hardening.test.mjs` (new, 4 tests):
  1. Queued reply after 24-hour window expiry → `cancelled`/`service_window_closed`, zero customer articles, plus an in-window positive control proving dispatch on the same code path.
  2. No resolvable customer timestamp at all → fail-closed `service_window_closed` (never "assume open").
  3. Media-only inbound article (empty body) → deterministic `unsupported` copy, exactly one reply, no handoff, no crash, no media echo, fallback counter = 1.
  4. Customer article of non-WhatsApp type → ignored as inbound (processed, zero outbox/flow-state rows) — only the configured WhatsApp article type is inbound.

Previously-covered axes re-verified green in the same suite run: duplicate/concurrent replay (one logical response), REST acceptance + lost acknowledgment → AMBIGUOUS → reconcile (never blind resend), lease expiry, poison-input bounded recovery, closure latching, bot signature/outage tests (`apps/bot`), pg-boss durable wakeup.

## Test evidence

~~~
DATABASE_URL=postgresql://…/yubie_test npm run db:migrate && npm run db:seed   # migrations 0001–0028 apply clean
node --test --test-concurrency=1 apps/worker/tests/wa01-slice-hardening.test.mjs
# → tests 4, pass 4, fail 0
node --test --test-concurrency=1 apps/worker/tests/*.test.mjs
# → tests 47, pass 47, fail 0 (after this file's inclusion; 44/44 pre-existing green)
~~~

Run against ephemeral Postgres 16 (docker, throwaway `yubi_wa01_<uuid>` databases created per suite, dropped with FORCE) — same pattern as `yubi-reliability.test.mjs`.

## Residual blockers / owner actions

- Meta Cloud API test number + WABA identity (Meta Business admin) — required for the physical phone-to-phone receipt gate.
- Zammad staging credentials, real channel/group/priority IDs, webhook trigger + secret (Zammad admin) — required for signed staging E2E.
- No staging DNS/TLS probe was performed from this sandbox (BLOCKED_EXTERNAL, not inferred).

## Rollback

Tests only; no runtime behavior changed. `git revert` of this commit removes the new test file.

## Next safe milestone

WA-02 (tri-mode selection & priority human queue) — pure code, default-off.
