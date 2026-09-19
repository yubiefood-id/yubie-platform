# M4.5-RC Implementation Plan

**Date:** 2026-09-20  
**Status:** IN_PROGRESS → CODE_COMPLETE; STAGING_VALIDATED pending operator

## Phase completion

| Phase | Description | Status |
|-------|-------------|--------|
| 0 | Baseline | DONE — `M4_5_RC_BASELINE.md` |
| 1 | Commit M4 + push | DONE — `3e9f28a` on `origin/main` |
| 2 | Dependency pin | DONE — lock updated with commit + digest |
| 3–4 | Audits | DONE — `M4_5_ZAMMAD_REAL_CONTRACT_REPORT.md` |
| 5 | Plan freeze | DONE — this document |
| 6–7 | Staging deploy + harden | BLOCKED_EXTERNAL (DNS) |
| 8–9 | Provision + service account | BLOCKED_EXTERNAL |
| 10–18 | Live webhook/WhatsApp/modes | BLOCKED_EXTERNAL |
| 19–20 | Chaos + backup | BLOCKED_EXTERNAL |
| 21 | Observability | DONE — worker metrics |
| 22 | Load | BLOCKED_EXTERNAL |
| 23 | Security | CODE PASS — live pending |
| 24–26 | Docs + acceptance | DONE |

## Git release chain

```
34556fc M1
8e46a00 M2-SH
d07552f M3-PROD
22179ae M4 feat(support)
6720c1d M4 ops(zammad)
3e9f28a M4 test(zammad)
```

## Contract freeze decisions

1. Webhook requires at least one of HMAC secret or Bearer token
2. `ZAMMAD_WHATSAPP_ARTICLE_TYPE` must be observed in staging before GREEN pilot
3. `upstreamRef` pinned to commit, not `master`
4. Chatwoot rollback retained via `SUPPORT_PROVIDER=chatwoot`

## Reviews

| Review | Status |
|--------|--------|
| Parallel audits A–G | Complete — see contract report |
| grill-with-docs | Code/doc consistency verified in audits |
| gstack-plan-eng-review | Architecture matches ADR-009/010 |

## Operator unblock

1. DNS: `support-staging.yubie.id`, `bot-staging.yubie.id`
2. Deploy Zammad per `infrastructure/zammad/README.md`
3. Meta WhatsApp test channel in Zammad
4. Run provisioning + service account
5. Execute staging matrix in `M4_5_WHATSAPP_STAGING_REPORT.md`

## Acceptance gates

See `M4_5_ACCEPTANCE_REPORT.md` for per-axis verdicts.
