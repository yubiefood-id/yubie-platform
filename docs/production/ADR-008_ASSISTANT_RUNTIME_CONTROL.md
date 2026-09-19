# ADR-008: Assistant Runtime Control

**Status:** Accepted  
**Date:** 2026-09-20

## Context

M2-SH used environment variables only for kill switches (`ASSISTANT_AUTO_REPLY`, per-intent overrides). Emergency OFF required redeploy or container env changes.

## Decision

1. **Durable runtime config** in `assistant_runtime_config` with audited changes in `assistant_runtime_config_audit`.
2. **Controls:** `assistant_enabled`, `mode` (off/shadow/suggestion/auto), per-intent allowlist, model/prompt/knowledge version pointers.
3. **Operator API:** `/ops/assistant` (Bearer `OPS_API_TOKEN`) for status, mode change, and emergency OFF.
4. **Precedence:** Runtime config gates assistant processing; env vars remain as deployment defaults and secondary overrides for auto-reply.

## Consequences

- Emergency OFF does not require application rebuild.
- All mode changes are auditable.
- Ops UI can be added later without changing storage contract.
