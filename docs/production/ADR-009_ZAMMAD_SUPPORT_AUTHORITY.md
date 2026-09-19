# ADR-009: Zammad as Support Operations Authority

## Status

Accepted (M4-Z)

## Context

Yubie is migrating from Chatwoot to self-hosted Zammad for WhatsApp support operations. The assistant stack (policy, knowledge, vLLM, evals) must remain unchanged.

## Decision

- **Zammad** owns ticket operations: inbox, agent UI, WhatsApp channel, human routing, tags, groups.
- **Yubie** owns bot policy: intent/risk routing, approved knowledge, tool allowlist, runtime kill switches, audit, marketplace routing.
- **Yubie bot** receives Zammad trigger webhooks; **Yubie worker** delivers replies via Zammad REST API.
- Zammad native customer-facing AI stays **disabled** during M4-Z to avoid competing response systems.

## Consequences

- Separate Zammad VPS with independent backup scope.
- Dedicated `yubie-bot-service` API token with least privilege.
- Chatwoot retained read-only during rollback window.
