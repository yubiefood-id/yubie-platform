# M2-SH Implementation Plan

**Status:** In progress  
**Depends on:** M1 committed (`34556fc+`)

## Architecture

```text
WhatsApp → Chatwoot → AgentBot → apps/bot → webhook_inbox → pg-boss
  → apps/worker → packages/assistant → tools / model → validator
  → Chatwoot reply OR handoff
```

## Work packages

| ID | Package | Deliverable |
|----|---------|-------------|
| E | persistence | `0002_assistant.sql`, inbox + session repos |
| C | assistant | intents, risk, tools, validator, model providers |
| B | apps/bot | signed webhook ingress, metrics |
| W | worker | `assistant.process` job, handoff race check |
| I | integrations | Chatwoot verify, client, fake |
| A | infrastructure | Chatwoot compose, vLLM profile, bot Dockerfile |
| F | eval/security | assistant + webhook tests, CI |

## Frozen contracts

- Webhook: `POST /webhooks/chatwoot-agentbot`
- HMAC: `sha256=HMAC(secret, "{timestamp}.{raw_body}")`
- State: `BOT_ELIGIBLE | BOT_ACTIVE | HANDOFF_REQUESTED | QUEUED | HUMAN_ACTIVE | RESOLVED`
- Kill switch: `ASSISTANT_AUTO_REPLY=false` (default)

## Integration order

1. persistence migration
2. assistant package + FakeModelProvider
3. bot ingress + worker job
4. Chatwoot client + handoff
5. infra compose + runbooks
6. eval suite + acceptance

## Rollout stages

0. fixtures → 1. shadow → 2. suggestion → 3. green auto (6 intents) → 4. per-intent expansion
