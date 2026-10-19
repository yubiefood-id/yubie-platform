# Staging E2E master plan

Updated **2026-10-19** from HEAD `7167636e6f2994115e2b84bac779359d7d4170c3`. Evidence: `STAGING_BASELINE_EVIDENCE.md`. This file tracks status. It does not replace the October 18 gates in `STAGING_GATES_LOCAL_PAYMENT_2026-10-18.md` or `IPAYMU_STAGING_OPERATOR_PLAYBOOK_2026-10-18.md`; those remain the operator sequence and are stale on SHA `3a06b46`.

Branch: `feat/staging-e2e-ipaymu-sandbox`. Staging `COMMERCE_PROVIDER` stays `preview` until the iPaymu sandbox gate is explicitly approved.

| Milestone | Status | Notes |
|---|---|---|
| M0 baseline | PASS with gaps | API health, preview commerce, database connected, purchase-options 401, Access redirect, workers.dev off. API image SHA is not HEAD. Access membership, Google client type, and restore drill are not verified. |
| M0 threat model and iPaymu contract | PASS as documentation | `PAYMENT_THREAT_MODEL.md`, `IPAYMU_PROVIDER_CONTRACT.md`. Provider support questions are unanswered. No merchant HTTP call. |
| P1 adapter and checkout intent | PASS in unit tests | Xendit stays. iPaymu sandbox config fails closed. Unsupported cancel does not succeed. Not deployed. |
| P1 automated payment matrix | PASS for mocks | Integrations 38, application suite exit 0, API 29, proxy-attempt 4, at 2026-10-19T18:26:01Z. Live sandbox BLOCKED_EXTERNAL. Postgres unique-index race NOT_RUN. |
| P2 Refine admin | PASS for the BFF tests | `apps/admin` 5 pass. Refine 5.0.12 is pinned and not installed. No DNS deploy. |
| P2 ERPNext shadow | PASS for the read-only client | Writes fail closed. No shared-VPS install. |
| P2 security toolchain | PASS for the in-repo rules | `payment:scan` passed. Semgrep CLI NOT_RUN. Trail of Bits install BLOCKED pending operator permission. |
| P3 acceptance pack | PASS as documentation | `STAGING_E2E_ACCEPTANCE.md`, `OPERATOR_ACTIONS.md`, `STAGING_HANDOFF.md`. Unverified gates stay BLOCKED_EXTERNAL or NOT_RUN. |

## Rollback

- Commerce: `COMMERCE_PROVIDER=preview`. Marketplace and WhatsApp purchase routes stay. Do not delete the Xendit adapter.
- Web: redeploy the previous Worker version `76ad2992-2bc6-49b5-9b5e-d4c8e1d5bc5c` if the active version `4cfac3b5-2898-4e52-ba55-ddaabd67be72` must be reverted. Keep workers.dev and preview URLs off.
- Database: forward-only additive migration `0011`. Restore from a backup taken before migrate. No volume wipe.
