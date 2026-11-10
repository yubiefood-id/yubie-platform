# MASTER PROMPT — YUBIE WhatsApp Tri-Mode Engineering Mission

**Copy this whole prompt to a coding agent when implementation is explicitly authorized.**  
**Current branch deliverable:** documentation and proposed ADR only. This prompt does not authorize setting live credentials, turning production bots on, or migrating any phone number.

You are the principal backend / distributed systems engineer, security engineer, AI inference budget engineer, WhatsApp channel integration engineer and SRE responsible for extending the existing **Yubie monorepo**, NOT creating a new repository or chatbot.

## Mission

Build a reliable **single WhatsApp customer-facing number** with:

- **Mode 1 — Yubi Deterministic (default):** safe menus and approved facts, zero model calls.
- **Mode 2 — Tanya AI Yubi (explicit customer opt-in):** bounded low-risk AI Q&A with strict atomic token/request/budget caps, validated approved knowledge, deterministic fallback when exhausted.
- **Mode 3 — Customer Service / Priority Human:** durable Zammad ticket/priority assignment, agent response over the *same WhatsApp channel*, bot suppression until explicitly released, no second active sender.
- **B2B and Partnership:** existing deterministic qualification and sales handoff, project leads to CRM/tasks; later add consent- and approval-controlled outbound template messaging.

Do not confuse “same customer-visible WhatsApp number” with “still using the WhatsApp Business mobile app”. Current native Zammad onboarding and Coexistence vendor capability are different; get real provider evidence before assuming compatibility.

## Required reading before touching code

1. AGENTS.md, README.md, DESIGN.md, docs/DEVELOPMENT_GOALS.md, docs/ARCHITECTURE.md.
2. docs/production/ADR-009_ZAMMAD_SUPPORT_AUTHORITY.md, ADR-010_SUPPORT_PROVIDER_BOUNDARY.md, ADR-011_DETERMINISTIC_CUSTOMER_ENGINE.md and proposed ADR-015.
3. docs/production/2026-10-24/WHATSAPP_DEFERRED.md and latest production deployment receipts.
4. docs/production/yubi-v2/{ARCHITECTURE,CURRENT_STATE,OPERATOR_ACTIONS,TEST_AND_ACCEPTANCE,GO_NO_GO_AND_ROLLBACK}.md.
5. docs/production/whatsapp/{README,GOAL_PLAN,ARCHITECTURE_AND_CONTRACTS,EVALUATION_AND_RELEASE_GATES,OPERATIONS_DAILY_SOP,ONBOARDING_AND_EMERGENCY_RUNBOOK}.md.
6. Existing code: apps/bot/src/index.ts, apps/worker/src/{index,assistant-handler,reply-delivery-handler}.ts, packages/assistant/src/deterministic, packages/application/src/ports/support-conversation-provider.ts, packages/integrations/src/zammad, packages/persistence/src, apps/api/src/ops-assistant.ts, apps/admin.
7. Official current Zammad WhatsApp channel/limitations and Meta Business Messaging Policy at implementation time.

## Hard operational constraints

- **Read-only baseline first:** capture exact local/remote main HEAD, dirty files/worktrees, Graphify index freshness, existing CI, release profiles and migration level. Do not lose user edits or overwrite unexpected files.
- Query npm run graph:context and graph queries before sprawling sub-agent audits; follow AGENTS.md. Inspect, don't invent scripts.
- Preserve ADR-009: Zammad support authority. Chatwoot is migration rollback only. Never install a second active customer bot in parallel.
- Existing production may have SUPPORT_PROVIDER=disabled and bot compose profile opt-in. Do not change live configuration without a separate owner-approved release.
- Don't globally enable BOT_ENGINE=legacy. Keep existing deterministic engine as policy supervisor and add AI opt-in behind per-conversation selection.
- No direct LLM-to-WhatsApp send. The model produces a bounded suggestion, not an authorized side effect.
- No billing, health, certification, nutrition, shelf-life, allergen or medical statements without exact product-truth approval; follow AGENTS.md.
- The existing consent ledger purpose b2b_contact is not blanket marketing consent. Honor opt-outs and approved templates for business-initiated messaging.
- No changes to iPaymu/Xendit admission, shipping provider mode, inventory, site checkout, payment secrets or deployment profile as a side effect.
- Never expose raw phone numbers, customer chat text, credentials, secrets or access tokens in commits, test output, console logs, screenshots or reports.
- Manual approval for pricing, volume discounts, MOQ, wholesale quotes, contracts, outbound marketing and any ambiguous risk.
- Human ownership, complaint/safety priority and emergency OFF override AI state and queued bot replies.

## Execution workflow (complete milestones IN ORDER)

### WA-00: inventory and architectural decision

- Inspect and record audited main HEAD; verify actual Zammad/Meta readiness from authorized staging data; show BLOCKED_EXTERNAL where secrets are missing.
- Check whether current WhatsApp Business mobile app must remain active; select test Cloud API number and separate vendor Coexistence workstream.
- Reconcile proposed ADR-015 with accepted ADRs and obtain owner/engineering review.
- Output: baseline evidence and decision matrix. Do not cross into WA-01 without this gate.

### WA-01: real staging Zammad vertical slice

- Provision scoped credentials in operator-managed secrets (operator does that; do not ask for tokens in chat or Git).
- Confirm Zammad version, article type and group IDs from live server, not fixtures; establish webhook validation.
- Test inbound customer -> Zammad -> signed bot webhook -> persistent inbox -> worker -> deterministic reply -> Zammad -> Meta receipt.
- Add contract tests: replay, duplicates, 24-hour window, timeout-after-accept, human takeover, unsupported attachment and outage recovery.
- Output: genuine device-to-device receipt, redacted IDs, exact SHA, blocker ledger.

### WA-02: deterministic / AI / priority CS menu

- Add backward-compatible deterministic-v2 menu options and state machine. Do not erase B2B consent path or break existing v1.
- Define explicit opt-in disclosure, exit AI, return to deterministic and always-available human command.
- Create persisted mode state with typed transitions and independent human-control ownership. Priority customer requests result in durable Zammad handoff + named task/assignment and SLA due time. Ensure no customer bot output after HUMAN_ACTIVE.
- Food safety P0 takes precedence even when customer automation is off; internal escalation remains possible. Human reentry only via existing explicit ops semantics and customer next turn.
- Output: transition/property tests including races and rollback.

### WA-03: bounded AI helper

- Add typed provider-neutral model interface within packages/assistant; use existing model integration only behind deterministic risk and feature gates.
- Implement strict token input/output budgets, calls/session/day, total spend caps and concurrency using atomic DB reservation BEFORE inference. Cap prompt/context length and timeout. Reconcile usage once, idempotently; handle failures.
- Use approved SKU retrieval and source/freshness checks; no unverified claim; validation and injection/PII defenses.
- Implement quota-exhausted and model-down deterministic fallbacks; no recursive model retries, no unexpected model calls for menu commands.
- Prove zero AI calls in deterministic mode via ThrowingModelProvider.
- Output: eval corpus, cost ledger, concurrency tests and SHADOW evidence; no automatic production enablement.

### WA-04: CRM lead/task pipeline

- Consume growth.b2b_lead_created outbox event; create/update one opportunity and responsible human with next action. Make projection replay safe.
- Connect Yubi sales handoff to opportunity/ticket reference; document privacy/consent and source.
- Add minimal operator view if needed, but don't build a duplicate Zammad console.
- Correct B2B form text only when wiring and tested persistence/CRM behavior justify the copy.
- Output: source-to-task tests and dead-letter/outage recovery.

### WA-05: B2B outbound templates (separate approval)

- Design provider transport and Meta approved template registry. Require recipient/purpose opt-in, opt-out precedence, template approval/version and human signoff.
- Use transactional outbox and single-sender policy. Persist approved drafts with immutable content hash, expiry, approver and cost/frequency caps. Recheck all at dispatch.
- Reconcile delivery receipts with ambiguous timeout recovery; never assume accepted=delivered or blindly resend.
- Output: no-consent/no-template/no-approval test matrix, cost alerts, traceable receipts.

### WA-06: existing phone number Coexistence (separate high-risk gate)

- Confirm eligible BSP/onboarding path and number ownership with operator; do not deregister app.
- Evaluate if a feature-gated bridge can map events and ownership into Zammad (one authoritative inbox/sender). Require app/API cross-channel UAT and explicit rollback.
- If not supported, do not migrate existing production phone and do not disguise a test number as the original.
- Output: owner decision, signed UAT and reversible cutover plan; no automatic cutover.

### WA-07: security, QA, production planning

- Run npm ci, npm run check, all impacted package tests, actual Postgres/pg-boss integration, security/secret scans, staging end-to-end device tests and release checks.
- Supply receipts separated into source/test/staging/operator/production states. Record config-key names not values and artifact digest.
- Produce exact release GO/NO-GO, on-call coverage, monitoring thresholds, rollback and emergency OFF drill.
- Follow repository's controlled production workflow; no live deployment from an unreviewed PR.

## Definition of done

The project is NOT done because it builds or a demo mocks WhatsApp. It is done only after:
1. Verified Cloud API/Zammad staging inbound-outbound real phone round-trip, one sender.
2. Deterministic zero-model path remains correct; AI runs **only** with explicit opt-in and valid budget reservation.
3. Concurrent quota test proves hard limits and once-only accounting.
4. Human request produces visible owned Zammad priority ticket and CS response to the same customer-visible WhatsApp number; automated sends remain suppressed.
5. Food-safety escalation works during OFF; no unsafe or unapproved claims.
6. B2B lead->CRM owner/task mapping and approved outbound policy pass.
7. Existing phone app remains unaffected unless an independently accepted Coexistence/migration plan says otherwise.
8. Live release has explicit owner approval, CI receipts, telemetry, spend alarm and rollback.

## Output at each milestone

Write a concise verification receipt with: exact code SHA, changed files, source facts vs assumptions, test commands/results, real provider IDs masked, denied risks, owner-required actions, residual blockers, and next safe milestone. Mark unprovisioned Meta/Zammad credentials as **BLOCKED_EXTERNAL**, not PASS.

## Your first action

Run a read-only repo baseline, build a dependency/impact map for the tri-mode flow, compare with current GOAL_PLAN, then implement **only the first authorized milestone**. Do not generate another grand redesign instead of executing that milestone. Do not assume anything is deployed merely because this prompt exists.
