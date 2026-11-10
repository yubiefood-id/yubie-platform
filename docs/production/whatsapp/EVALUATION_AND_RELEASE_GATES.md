# Test strategy and release gates — WhatsApp tri-mode

**Status:** REQUIRED EVIDENCE DESIGN; no pass claim until actual test run and receipts.

## Gate philosophy

A code build, simulated provider or HTTP 200 is **not** evidence of a real message reaching a customer. Separate:
1. SOURCE_AUDITED
2. LOCAL_TESTS_GREEN
3. STAGING_REAL_PROVIDER_E2E
4. OWNER_APPROVED
5. PRODUCTION_ENABLED
6. POST_RELEASE_MONITORING_ACCEPTED

Any missing evidence = BLOCKED_EXTERNAL, not PASS. Preserve existing production release/approval system and live commerce/shipping toggles.

## Unit and policy corpus

| ID | Test | Expected |
| --- | --- | --- |
| D01 | Deterministic menu input and navigation | Stable approved FSM; zero model invocations |
| D02 | Explicit AI option but no consent | No model call; disclosure/consent |
| D03 | Valid AI opt-in, approved question | At most one bounded model call; grounded answer |
| D04 | Exit AI / “menu” / “0” | Deterministic transition, no model token usage |
| D05 | Quota exhausted before model call | 0 model calls; safe fallback |
| D06 | 50 concurrent AI requests same contact | Atomic cap upheld; no budget overshoot |
| D07 | Two simultaneous workers same inbound ID | Exactly one state transition and approved send |
| D08 | Model timeout, malformed JSON, unsafe claim | Rejected; safe deterministic fallback / human |
| D09 | Prompt injection demands new policy/payment credentials | No escalation of capability or secret leak |
| D10 | Food-safety, allergy or illness language | P0 human, zero AI invocations, no medical reply |
| D11 | Explicit human option | One handoff, Zammad priority and owner/task |
| D12 | Human active while bot reply pending | Pending reply cancelled; no customer bot delivery |
| D13 | Ticket closed but no explicit bot reentry | Remains human-owned; no automatic release |
| D14 | B2B pricing/MOQ/contract | Human review; no autonomous price promise |
| D15 | Contact revoked marketing permission | No outbound promotional send, including retries |
| D16 | Template outside 24h without approval | No send; approved template path only |
| D17 | Daily/monthly cost cap reached | Hard failure before provider request |
| D18 | Inbound webhook invalid/replayed signature | Rejected / deduped |
| D19 | Zammad createArticle times out after success | AMBIGUOUS, reconcile before retry |
| D20 | OFF/emergency stop during AI generation | No subsequent auto customer dispatch |
| D21 | Existing app-number coexistence unsupported | No migration or deletion; channel stays inactive |
| D22 | Zammad/native and BSP inbound on same event | Exactly one canonical conversation; no double reply |
| D23 | Agent replies via Zammad on connected number | Actual delivery receipt to same customer-visible WA number |
| D24 | Unassigned P0 or P1 customer ticket | Alert and owner assignment task |
| D25 | CRM provider offline during lead capture | Transactional outbox retained; replay exactly once |

## Integration and acceptance

- Real Postgres and pg-boss; webhook signature, retries, process restart and transactional boundaries.
- Real Zammad staging version and REST/webhook fixture diff; staged signed delivery with known customer article type.
- Meta/WABA staging number, actual WhatsApp customer device, user-initiated inbound, customer-visible outbound receipt.
- Exercise 24-hour window; use test clock for boundary cases and actual permitted messaging for positive cases.
- Verify CS handoff with a named agent in the Zammad UI. Confirm agent reply and new inbound messages appear once, with HUMAN_ACTIVE suppression.
- App coexistence has **separate UAT** on existing number, only with authorized provider and written reversible cutover.
- Human staffing, claims approval, consent, retention and operator billing cap are business acceptance prerequisites.

## Suggested test runner and commands

~~~
npm ci
npm run graph:context
npm run check
~~~

Then run the existing bot/worker/persistence/assistant tests, full live provider tests and release tooling appropriate to the affected phases. Do not invent commands; inspect package.json and scripts. Collect actual test output and CI links.

## Go / No-Go

**NO-GO** if live WhatsApp provider contract unavailable, high-priority owner unassigned, token caps absent, Zammad double-sender risk unresolved, phone app coexistence ambiguous, unknown product claims present, failed signature verification, stale code/release SHA, missing rollback drill or unresolved P0 safety route.

**GO** only with explicit named owner approval tied to exact commit SHA and image/artifact digest, test receipts, confirmed live message ID/delivery and agreed human staffing hours. Automatic AI requires its own staged gate beyond deterministic AUTO.

## Incident thresholds and indicators

Alert on: P0 unassigned or delivery stalled, P1 approaching internal SLA; ai_usage_reserved > budget warning threshold; AI failure/refusal spike; support outbox ambiguous > 0 growing; webhook 401 surge; message receipt lag; CRM unprojected lead age. Alert values must be reviewed against traffic and staffing, not copied from examples as production promises.

Evidence file template per stage: date/UTC, env, commit SHA, Zammad version, Meta app/provider (IDs redacted), approved operator, test IDs, real provider receipt IDs (hash/masked), queue IDs, results, blockers, rollback test, decision. Do not commit customer PII or tokens.
