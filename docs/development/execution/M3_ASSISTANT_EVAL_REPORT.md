# M3 Assistant Eval Report

**Date:** 2026-09-20

## Dataset

- **Source:** `packages/persistence/src/scripts/seed-assistant.ts`
- **Count:** 260 versioned cases in `assistant_eval_cases`
- **Categories:** formal/casual Indonesian, typos, slang, mixed EN/ID, multi-turn references, product/recipe/purchase, price/stock, B2B, certification, health, food safety, refund, human request, prompt injection

## CI results (rule classifier suite)

```bash
npm run test --workspace @yubie/assistant
```

| Suite | Result |
|-------|--------|
| RED-intent eval zero critical misses | PASS |
| Shadow mode | PASS |
| Multi-turn context prefix | PASS |
| Food safety handoff | PASS |
| Prompt injection handoff | PASS |

## GPU / structured classifier eval

**Status:** PENDING — requires `MODEL_PROVIDER=vllm` on GPU host.

Persist results to `assistant_eval_results` after GPU benchmark run.

## Rollout gate alignment

| Stage | Eval requirement | Status |
|-------|------------------|--------|
| Shadow | Zero RED false negatives | PASS (rule suite) |
| Suggestion | Human edit rate tracking | Not started |
| Green auto | Intent + tool accuracy thresholds | Pending GPU eval |
