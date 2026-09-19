# M2-SH Model Benchmark

**Status:** CONDITIONAL GO — no GPU on current dev host

## Hardware inventory (dev)

| Resource | Value |
|----------|-------|
| GPU | None |
| RAM | 7.6 GB |
| CPUs | 16 vCPU (WSL2) |

## Candidate models (GPU VPS)

| Model | Quantization | Min VRAM | Notes |
|-------|--------------|----------|-------|
| Qwen2.5-7B-Instruct | AWQ | ~8 GB | Baseline Indonesian + tools |
| Llama-3.1-8B-Instruct | AWQ | ~8 GB | Instruction following |
| Qwen2.5-14B-Instruct | AWQ | ~16 GB | Quality upgrade |

## Recommended production GPU VPS

- **L40S 48GB** or **A100 80GB** dedicated inference host
- Private network connectivity from Conversation VPS bot/worker only
- vLLM image: `vllm/vllm-openai:v0.8.5` (pinned)

## Benchmark methodology

1. Run eval cases from `packages/assistant/tests/assistant.test.mjs` + extended eval DB seed
2. Measure P50/P95 latency, tokens/sec, VRAM, tool-call accuracy
3. Score Indonesian quality, informal language, safety handoff rate
4. Select smallest model passing thresholds

## Activation gate

Production inference GO requires completed benchmark on target GPU hardware with documented results.
