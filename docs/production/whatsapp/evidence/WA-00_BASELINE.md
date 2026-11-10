# WA-00 — Read-only Baseline Evidence Ledger

**Mission ID:** YUBIE-WA-TRIMODE-2026-11 (GOAL_PLAN WA-00)
**Date (UTC):** 2026-11-11
**Executed by:** engineering coding agent under explicit mission authorization (feature branch `feat/whatsapp-trimode-wa00-wa07`).
**Stage states claimed here:** SOURCE_AUDITED only. No production mutation, no provider calls, no credentials handled.

## 1. Repository baseline

| Fact | Value | Source |
| --- | --- | --- |
| main HEAD at start | `283d2f46390093ce560b3eecf276bc97d4a8eeda` (Merge PR #88, 2026-11-11) | `git rev-parse HEAD` |
| GOAL_PLAN stated baseline | `195e856…` (2026-11-02) — **stale**, superseded by #87 (security patch) + #88 (docs) | `docs/production/whatsapp/GOAL_PLAN.md` header |
| Working tree (main checkout) | 4 untracked operator files preserved uncommitted per mission constraints | `git status --porcelain` |
| Implementation worktree | `/home/ubuntu/project/yubie-wa-trimode` on `feat/whatsapp-trimode-wa00-wa07` (isolated worktree; main checkout untouched) | `git worktree list` |
| Migration set | `0001`–`0028` present; next free migration number **0029**; runner forward-only, own transaction per file (`packages/persistence/src/scripts/migrate.ts`) | migrations dir audit |
| Graphify index | `graphify-out/graph.json` + `engineering-graph.json` written 2026-11-11 00:02 (after HEAD commit 00:00:31) — fresh | file mtimes |

## 2. Deployed production baseline (from latest receipt, not inferred)

| Fact | Value | Source |
| --- | --- | --- |
| Production release | `4e799d90…` DEPLOYED_LIVE 2026-11-02 (shipping hardening; commerce only) | `docs/production/2026-11-02/DEPLOYMENT_RECEIPT.md` |
| Live images | api `ghcr.io/yubiefood-id/yubie-api@sha256:29faf029…`, worker `@sha256:067a90a0…` | same receipt |
| WhatsApp acceptance | NOT cleared by that release; bot image builds in CI but is **not deployed** | receipt + WHATSAPP_DEFERRED |
| Runtime posture | worker `SUPPORT_PROVIDER=disabled`; support queues dormant (held, never faked); `apps/bot` opt-in `profile: bot`, refuses to start under `disabled` | `docs/production/2026-10-24/WHATSAPP_DEFERRED.md`, `infrastructure/docker-compose.prod.yml` |
| Runtime config defaults | `assistant_enabled=true`, `mode=shadow`, `flowVersion=deterministic-v1` (V2 + auto require separate ops activation; production `auto`+v2 gate additionally requires 4 approved product photos which do not exist yet) | `runtime-config-repository.ts` DEFAULT_CONFIG, `apps/api/src/ops-assistant.ts` |

## 3. Existing engineering surface (verified in code, reused not rebuilt)

- **Inbound:** `apps/bot/src/index.ts` — HMAC-SHA1/bearer-verified Zammad webhook, 256 KiB body cap, `webhook_inbox` dedupe (provider+deliveryId / payload hash), pg-boss `assistant.process` wakeup, 503-without-ack on DB outage.
- **Turn processing:** `apps/worker/src/assistant-handler.ts` — per-conversation advisory lock, lifecycle-first ordering, priority-escalation bypass, 5-attempt dead-letter to human handoff, provider watermark, HUMAN_ACTIVE/RESOLVED latching, 30-min reentry cooldown + customer `menu`/`start`.
- **Engines:** deterministic-v1 (`flows.ts`/`pre-router.ts`) and deterministic-v2 (`v2-flow.ts`/`v2.ts`, HOME 1–6, B2B consent→collect→SALES_HANDOFF, food-safety overrides human ownership). `BOT_ENGINE` = `deterministic|legacy` only; legacy vLLM pipeline exists but inactive and is **not** the Mode-A vehicle (ADR-015).
- **Outbound:** `assistant_outbox` → `support.reply` queue + 10s sweep → `reply-delivery-handler.ts` (fresh runtime-mode, human-state, capability and 24h-window rechecks immediately before dispatch; RETRY_DELAYS 30s/2m/10m/30m; TIMEOUT/AMBIGUOUS → reconcile, never blind resend) → `ZammadSupportProvider.sendReply` (idempotency via `yubie_delivery_key` article preference, `getOutboundStatus` reconciliation) → Zammad REST article on the WhatsApp channel.
- **Safety:** food-safety keyword guard (`aliases.ts`) outranks everything incl. OFF; handoff to dedicated Food Safety group under `FOOD_SAFETY` intent is the only dispatch path allowed while automation is off.
- **Kill switch:** `POST /ops/assistant/emergency-off` (bearer `OPS_API_TOKEN`) → DB snapshot (`assistant_enabled=false`, `mode=off`) + `cancelPendingCustomer`; enforced at intake, dispatch and provider `mayDispatch` layers; audited (`assistant_runtime_config_audit`, `audit_events`).
- **Zammad:** pinned `ghcr.io/zammad/zammad:7.1.3-0014` (`infrastructure/zammad/zammad.lock.json`); 4 groups (Bot Queue / Customer Support / Sales-Partnership / Food Safety) provisioned via `npm run zammad:provision`; ticket `yubie_bot_mode` custom attribute is an operator provisioned object attribute.
- **B2B lead source:** `POST /v1/b2b-leads` → `b2b_leads` + `consent_ledger` (purpose `b2b_contact`, version `2026-10`) + transactional outbox event `growth.b2b_lead_created` (dedupe `b2b_lead:{id}`, payload free-text-free). **No consumer exists yet** (WA-04 gap confirmed).

## 4. Owner/external decision matrix (GOAL_PLAN §7) — BLOCKED_EXTERNAL

| Decision / input | Owner | Status |
| --- | --- | --- |
| Existing-number fate (mobile app keep/migrate/Coexistence) | Yubie owner | BLOCKED_EXTERNAL — no phone/WABA identity evidence in repo |
| WABA/phone-number ID, test number, BSP selection | Meta Business admin | BLOCKED_EXTERNAL |
| Zammad staging credentials + real channel/group/priority IDs + webhook signing secret | Zammad admin/DevOps | BLOCKED_EXTERNAL (staging validation axes remain BLOCKED_EXTERNAL) |
| AI spend caps (USD/month), model choice, SLA staffing values | Yubie owner | BLOCKED_EXTERNAL — code ships fail-closed defaults (disabled) |
| Named on-call, queue owners, business hours confirmation | Sales/CS lead | BLOCKED_EXTERNAL |
| Verified claims corpus + consent/retention text | Product/R&D + legal | BLOCKED_EXTERNAL (existing `knowledge_items` used only) |
| DNS/TLS probe of bot/staging endpoints | DevOps | BLOCKED_EXTERNAL from this sandbox (no staging host credentials; not inferred from README) |

**Authorization note:** WA-00's formal gate ("owner-signed architecture/phone decision") cannot be satisfied from engineering. Per mission authorization, execution proceeds with **every new capability default-OFF / fail-closed** so that no merged code activates WhatsApp messaging, AI spend, or channel behavior without the owner-held gates above. Real staging E2E (WA-01 physical receipts) and any production activation remain blocked until those decisions land.

## 5. Reconciliations with GOAL_PLAN

- GOAL_PLAN "what exists" table (§1): all ten rows verified accurate against code.
- Layer boundaries (§6) match actual package layout; `packages/assistant` has zero provider imports (grep verified).
- Migration numbering instruction ("reuse 0001–0028, assign 0029+") matches reality.
- Known drift: (a) baseline SHA stale (see §1); (b) `0010_growth_and_consent.sql` waitlist uniqueness predates 0022's phone-first switch — irrelevant to this mission, no growth-schema edits planned beyond new additive tables; (c) `ZammadConversationContextProvider` human-active heuristic diverges from authoritative `isHumanActiveTicket` — documented, will not be used for ownership decisions.

## 6. Next safe milestone

WA-01 (local contract-test hardening of the existing vertical slice). Real staging/device acceptance axes are BLOCKED_EXTERNAL and will be recorded as such, never fabricated.
