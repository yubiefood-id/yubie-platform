# M2-SH Security Review

**Date:** 2026-09-19

## Threat model

| Threat | Control |
|--------|---------|
| Webhook forgery | HMAC-SHA256 + dedicated AgentBot secret |
| Replay | 5-minute timestamp window |
| Duplicate delivery | `webhook_inbox` dedupe by delivery ID + payload hash |
| Prompt injection | Rule classifier → RED → handoff; validator blocks secrets |
| Tool abuse | Allowlisted tools only; no HTTP/SQL/shell |
| Cross-conversation leakage | Tool context scoped to `conversationId` |
| Model endpoint exposure | Private Docker network; no public vLLM port |
| Token exhaustion | `maxTokens`, model timeout, queue bounds |
| PII in logs/metrics | Structured events only; no message text in metric labels |
| Unsafe health claims | Deterministic RED routing + validator prohibited patterns |

## Mandatory controls implemented

- Signed Chatwoot AgentBot webhook verification
- Constant-time signature compare
- Max webhook body size (256 KB)
- Human-active gate before auto-send
- `ASSISTANT_AUTO_REPLY` global kill switch
- Fake providers for CI without external dependencies

## Residual risks

- Production Chatwoot/Meta credentials not in repo (operator-managed)
- GPU inference activation pending benchmark on dedicated hardware
- Rule-based intent classifier requires eval expansion for slang edge cases

## Verification

- `packages/assistant/tests/assistant.test.mjs` — RED intents, shadow mode
- `packages/integrations/tests/chatwoot.test.mjs` — signature verification
- `apps/bot/tests/bot.test.mjs` — auth rejection, signed acceptance
