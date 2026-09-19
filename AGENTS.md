# Engineering Operating Guide

This file is binding guidance for coding agents and human contributors.

## 1. Product truth

Yubie is an Indonesian food brand and food-tech startup. It is **not** a medical product or supplement platform.

Do not publish or infer:

- unverified nutrition values;
- unapproved "high fiber", antioxidant, glycemic, satiety or meal-replacement claims;
- weight-loss, obesity-prevention, disease-prevention or therapeutic claims;
- certification/halal/BPOM/P-IRT/SNI status that is not verified for the exact product/entity/channel;
- allergen, shelf-life, storage, preparation or safety statements that have not been approved for the exact specification.

The R&D proposal is evidence of development intent and testing plans. It is not itself a commercial label approval.

Yubie Flour is the currently available catalog line. Yubie Shake and Yubie Ppang remain coming-soon until commercial truth is verified.

## 2. Current commerce model

Production D2C is marketplace-first.

- Public purchase CTAs route to approved marketplace listings.
- WhatsApp is used for questions, assisted B2C and B2B.
- Direct payment on yubie.id is deferred by ADR-004.
- Do not connect production payment credentials to the current preview checkout.
- Do not scrape Shopee, Tokopedia, TikTok Shop or Seller Center. Use approved APIs, webhooks, official exports or explicit operator imports.

## 3. Conversation architecture

- Chatwoot owns conversation/inbox operations.
- Yubie owns bot policy, product knowledge approval, tool allowlist, handoff logic, B2B qualification and integration audit.
- Routine B2C remains in Chatwoot.
- Qualified B2B/partnership opportunities may be projected to CRM.
- The LLM is never the source of truth for product facts, health claims, marketplace price/stock, certification or order state.
- Complaint, food-safety, uncertain-health, explicit-human and sensitive negotiation intents support immediate human handoff.

## 4. Architecture rules

- `apps/web` owns presentation/navigation and thin route adapters.
- `apps/api` owns public HTTP/webhook boundaries.
- `apps/worker` owns durable asynchronous work when introduced.
- Business language and invariants live in `packages/domain`.
- Use cases and provider-neutral ports live in `packages/application`.
- PostgreSQL implementation belongs in `packages/persistence`.
- Provider-specific APIs/SDKs stay inside `packages/integrations`.
- Assistant policy/retrieval/tool contracts stay inside `packages/assistant`.
- Request validation belongs in `packages/validation`.
- React/client state never becomes authority for listing destination, product truth, consent or CRM qualification.
- External provider objects/enums do not leak into domain or UI code.

## 5. Reliability rules

For a durable local business change:

~~~text
business state + audit + outbox
COMMIT
~~~

then deliver to failure-prone providers asynchronously.

Inbound provider events use:

~~~text
verify -> durable inbox -> acknowledge -> async process -> reconcile
~~~

Every create-like remote write requires a stable idempotency identity or a reconciliation path before retry.

## 6. Security/privacy

- Never commit credentials, personal chat exports or real customer data.
- No production secrets in browser bundles.
- Marketplace redirect destinations are server-owned allowlisted records; never accept arbitrary redirect URLs.
- Redact auth headers, tokens, phone numbers, email bodies, addresses and free-text conversations from diagnostic logs.
- Analytics receives structured events, not raw WhatsApp content.
- Production operator access uses named accounts, MFA where supported and least privilege.

## 7. Change gate

Before review:

~~~bash
npm ci
npm run check
~~~

As phases land, the quality gate expands to database bootstrap/upgrade, provider contract tests, assistant evaluations, accessibility smoke tests, container/image scans and production artifact checks.

Changes touching product claims, food-safety workflows, privacy/retention, marketplace integrations, chat automation, CRM automation, production infrastructure or database migrations require explicit review notes and rollback behavior.

## 8. Engineering graph (Graphify)

Before launching broad repository audit subagents, query the Yubie Graphify knowledge graph first:

~~~bash
npm run graph:context
~~~

Use `npm run graph:query` for contracts, infrastructure, boundaries, database, security, tests, and documentation views. Spawn audit subagents only when graph evidence is missing or stale. See [docs/development/GRAPHIFY_WORKFLOW.md](docs/development/GRAPHIFY_WORKFLOW.md).

## Learned User Preferences

- Do not edit attached plan files during implementation; implement from them as specified.
- Use plan to-dos as created; do not recreate them; mark in_progress and complete all before stopping.
- Execute milestone work in order; do not skip ahead to later phases while an earlier milestone is still open.
- Run read-only codebase or doc audits before large implementation or release-candidate work.
- Verify execution docs and acceptance claims against code evidence; flag aspirational or overstated claims.
- Prefer minimal, focused diffs scoped to the current milestone rather than broad rewrites.

## Learned Workspace Facts

- Milestones progress M0 → M1 → M2-SH → M3-PROD → M4-Z → M4.5-RC for marketplace, assistant, and support cutover.
- Production support authority is self-hosted Zammad (ADR-009); Chatwoot remains for migration rollback only.
- Support provider is selected via `SUPPORT_PROVIDER` (falls back to `CHAT_PROVIDER`); implementations live in `packages/integrations`.
- `SupportConversationProvider` port in `packages/application` abstracts Zammad and Chatwoot; `packages/assistant` has no provider imports.
- Worker outbound paths use `support.reply` and `support.reconcile` queues (Chatwoot queue names temporarily aliased).
- Migration `0004_m4_zammad_provider.sql` adds provider columns; legacy `chatwoot_*` columns retained until post-cutover cleanup.
- Zammad stack is pinned in `infrastructure/zammad/zammad.lock.json` (image `ghcr.io/zammad/zammad:7.1.3-0014`).
- Graphify incremental workflow (`npm run graph:context`) lets agents query an architectural code graph instead of repeated manual audits.
