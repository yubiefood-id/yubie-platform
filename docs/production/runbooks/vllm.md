# vLLM Runbook

## Deployment

- Compose: `infrastructure/vllm/docker-compose.yml`
- Profile: `gpu` (requires NVIDIA Container Toolkit)
- Image: `vllm/vllm-openai:v0.29.0`
- Network: `ai_internal` only — **no public port**

## Configuration

| Variable | Default |
|----------|---------|
| `VLLM_MODEL` | `Qwen/Qwen2.5-7B-Instruct-AWQ` |
| `VLLM_BASE_URL` | `http://vllm:8000` (from bot/worker network) |
| `VLLM_API_KEY` | operator-supplied |

## Health check

From bot/worker host on private network:

```bash
curl -s http://<vllm-host>:8000/v1/models
```

## Failure behavior

- Model timeout/OOM → worker handoff; no hallucinated fallback
- Set `MODEL_PROVIDER=fake` to disable inference path

## Activation

**CONDITIONAL GO** until `M2_SH_MODEL_BENCHMARK.md` completed on production GPU.
