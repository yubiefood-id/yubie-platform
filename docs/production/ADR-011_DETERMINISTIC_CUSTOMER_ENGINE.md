# ADR-011: Deterministic-First Customer Engine

**Status:** Accepted  
**Date:** 2026-09-20

## Context

M2–M3 introduced a model-assisted assistant pipeline (`runAssistantPipeline`) for customer replies. M5-D requires production customer automation without LLM invocation, with immediate human handoff and approved-knowledge-only responses.

## Decision

1. Introduce `BOT_ENGINE` with default `deterministic`.
2. Deterministic mode uses a validated finite-state menu engine (`FLOW_VERSION=deterministic-v1`).
3. Model pipeline remains available only when `BOT_ENGINE=legacy` for controlled experiments.
4. Conversation menu state is persisted separately from human-control state (`conversation_flow_state`).
5. Logical handoff destinations (`CUSTOMER_SUPPORT`, `SALES_PARTNERSHIP`, `FOOD_SAFETY`) map to provider group IDs in configuration.

## Consequences

- Zero LLM cost and latency for routine customer menus in production.
- All customer-facing text comes from versioned templates plus approved repository facts.
- Rollback: set `BOT_ENGINE=legacy` and `ASSISTANT_MODE=shadow` without schema rollback.

## Security

Deterministic mode must not instantiate `createModelProviderFromEnv()`. Tests use `ThrowingModelProvider` as a release gate.
