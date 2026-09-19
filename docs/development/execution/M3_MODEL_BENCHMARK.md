# M3 Model Benchmark

**Date:** 2026-09-20  
**Status:** PENDING GPU ENVIRONMENT

## Target runtime

- vLLM: `v0.29.0` (pinned in `infrastructure/vllm/docker-compose.yml`)
- OpenAI-compatible endpoint: `/v1/chat/completions`
- Default candidate: `Qwen/Qwen2.5-7B-Instruct-AWQ`

## Benchmark matrix (to execute on Yubie GPU VPS)

| Model | Indonesian | Structured JSON | Tool selection | TTFT P50 | Tok/s | VRAM | Notes |
|-------|------------|-----------------|----------------|----------|-------|------|-------|
| Qwen2.5-7B-Instruct-AWQ | TBD | TBD | TBD | TBD | TBD | TBD | Primary candidate |
| Qwen2.5-7B-Instruct | TBD | TBD | TBD | TBD | TBD | TBD | Fallback non-quantized |

## Evaluation harness

```bash
MODEL_PROVIDER=vllm VLLM_BASE_URL=http://gpu-host:8000 npm run test --workspace @yubie/assistant
```

Run against seeded `assistant_eval_cases` (260 cases) and record results in `assistant_eval_results`.

## Selection criteria

Smallest model passing:

- RED-risk handoff: zero critical misses
- Intent accuracy ≥ 85% on GREEN intents
- Tool accuracy ≥ 90% on purchase/product tools
- P95 latency < 8s at target concurrency

## Dev machine note

Current development environment has no NVIDIA GPU. Benchmark execution deferred to operator-provisioned GPU VPS.
