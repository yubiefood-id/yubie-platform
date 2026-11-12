# WA-06 — Existing-Number Coexistence Decision Record (no code)

**Date (UTC):** 2026-11-11 · **Branch:** `feat/whatsapp-trimode-wa00-wa07` · **Base:** WA-05 commit `473e176`

**Stage states:** SOURCE_AUDITED only. This milestone is deliberately **documentation + architecture assertions**; the owner gate (GOAL_PLAN WA-06) is not satisfiable from engineering and nothing was implemented.

## Decision matrix (ADR-015 §"Separate approval gate")

| Path | Description | Status |
| --- | --- | --- |
| **A. Dedicated API test number + native Zammad staging** | Preferred P0 path; does not touch the existing business number or app. | **RECOMMENDED, pending Meta/Zammad-admin provisioning** (BLOCKED_EXTERNAL). WA-01/02/03 staging evidence rides on this path. |
| **B. Existing number + Coexistence BSP** | Requires written provider capability proof for Indonesia (app↔API sync on one number), reply receipts, identity mapping, privacy/DPA, rollback and exclusivity tests on real devices before any code is trusted. | **BLOCKED_EXTERNAL** — no vendor evidence exists; no adapter code was written (a speculative adapter for an unknown vendor would be dead, untested code). |
| **C. API-only migration of the current number** | Deregistering/re-onboarding the active number. | **REJECTED for now** — owner decision required; "do not deregister or migrate an active number just to make a demo work" (ADR-015 non-goals). |

## Standing invariants until an owner decision lands (asserted by tests)

- `apps/worker/tests/wa06-architecture.test.mjs`:
  - **D22**: `apps/bot` exposes exactly one Zammad webhook route (plus the unchanged Chatwoot rollback route) and no BSP/Meta inbound route — no dual inbound consumer can appear silently.
  - **D21**: no Coexistence bridge is wired into the worker; the outbound template queue exists but is independent of Zammad articles.
  - **D21**: the outbound transport factory fails closed with no provider configured — the existing number cannot receive machine-originated messages from this codebase in any default state.
- The mobile WhatsApp Business app's behavior on the existing number is **unaffected** by this branch: no Meta credentials, no channel registration, no number migration anywhere in the diff.

## Owner actions required before any WA-06 implementation

1. Decide whether the WhatsApp Business **mobile app must remain usable** on the current number (this decides B vs A/C).
2. If B: obtain written Coexistence capability proof from an eligible BSP for Indonesia; commission the real-device UAT (app↔API sync, dual-writer exclusivity, rollback) before writing an adapter.
3. Sign the reversible-cutover plan (ADR-015 C) before any migration work order.

## Rollback

Nothing to roll back — no production code changed in this milestone beyond the assertion test file.
