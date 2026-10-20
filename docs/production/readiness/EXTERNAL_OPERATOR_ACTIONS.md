# External operator actions

Engineering cannot do these. Each blocks the milestone shown. Never paste secret values into chat, git, docs, or PRs.

| # | Action | Blocks | Status |
|---|---|---|---|
| O1 | Rotate the iPaymu VA and API key that were exposed in chat. Treat the old pair as compromised. | M2 | BLOCKED_EXTERNAL |
| O2 | Inject a confirmed iPaymu **sandbox** pair through the staging secret store only. | M2 | BLOCKED_EXTERNAL |
| O3 | Get written iPaymu answers: cancel by session, lookup by reference, duplicate reference behaviour, SessionID to transactionId mapping. | M2 | BLOCKED_EXTERNAL |
| O4 | Restore read-only SSH for the deploy user on `vps-contabo-yubie-1`, or provide `docker ps`, image digests, `SELECT version FROM schema_migrations`, and the backup listing. The configured deploy key was refused on 2026-10-20. | M3 | BLOCKED_EXTERNAL |
| O5 | Grant `read:packages` to the CI/operator GitHub token, or supply GHCR digests for api, worker, and bot. | M3 | BLOCKED_EXTERNAL |
| O6 | Approve copying a staging dump off the VPS for the restore drill. | M3 | BLOCKED_EXTERNAL |
| O7 | Approve applying `0011` and `0012` to staging after a verified backup. | M3 | BLOCKED_EXTERNAL |
| O8 | Confirm Cloudflare Access membership for staging, and the Google OAuth client type (record only SET or MISSING). | M3, M4 | BLOCKED_EXTERNAL |
| O9 | Approve DNS and Access for an `ops-staging` admin host. | M4 | BLOCKED_EXTERNAL |
| O10 | Approve an isolated ERPNext host and its cost. | M5 | BLOCKED_EXTERNAL |
| O11 | Approve Trail of Bits skill installation after permission, license, and hook review. | M3 | BLOCKED_EXTERNAL |
| O12 | Legal and compliance sign-off on storefront terms, refund policy, privacy notice, and product claims. | M6 to M8 | BLOCKED_EXTERNAL |
| O13 | Approve LIVE payment credentials. Not before M2 and M3 pass. | M8 | BLOCKED_EXTERNAL |

Existing detail: [OPERATOR_ACTIONS](../../development/execution/OPERATOR_ACTIONS.md), [EXTERNAL_ACTIONS](../../development/execution/EXTERNAL_ACTIONS.md).
