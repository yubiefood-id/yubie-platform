# ADR-006: Self-Hosted AI Inference

## Status

Accepted — 2026-09-19 (production activation **CONDITIONAL** on GPU benchmark)

## Context

M2-SH requires a self-hosted model endpoint. Dev/CI environments have no suitable GPU. Production must not rely on third-party chatbot SaaS or send customer conversations to external inference APIs.

## Decision

1. Implement `ModelProvider` abstraction in `packages/assistant`.
2. Use `FakeModelProvider` for local dev and CI.
3. Use `VllmModelProvider` against a private vLLM OpenAI-compatible server (`vllm/vllm-openai` pinned image).
4. Deploy inference on a dedicated GPU VPS on a private network; no public port 8000.
5. Select production model only after benchmark documented in `M2_SH_MODEL_BENCHMARK.md`.

## Consequences

- Production auto-reply GO is blocked until GPU VPS provisioned and benchmark passes.
- CPU-only inference is not considered production-ready.

## Rollback

Set `MODEL_PROVIDER=fake` or `ASSISTANT_AUTO_REPLY=false`; human Chatwoot operations continue.
