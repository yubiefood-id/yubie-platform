# Go/no-go and rollback

Yubi production: NO-GO. Website transactional commerce: separately NO-GO.
PUBLIC_CATALOG_NO_SALES and disabled production payments remain unchanged.

| Stage | Exit requirement |
| --- | --- |
| R0 | Source/deployment/channel evidence and external blockers reconciled |
| R1 | Navigation, aliases, ownership, migration and copy tests pass |
| R2 | Four approved final photos, immutable media contract and candidate PDPs pass |
| R3 | Real WhatsApp image/text/link delivery, replay, window and takeover pass |
| R4 | Alerts, recovery, authorized backup/restore, privacy and named UAT accepted |
| R5 | Exact signed artifact, owner approval, window/on-call, rollback and production smoke |

Emergency shutdown uses the existing authenticated API. API_ORIGIN is the verified
API origin; OPS_API_TOKEN comes from protected operator tooling. These commands
are for an authorized operator, not executed by this change:

```sh
curl --fail-with-body --request POST "$API_ORIGIN/ops/assistant/emergency-off" \
  --header "Authorization: Bearer $OPS_API_TOKEN" \
  --header 'Content-Type: application/json' \
  --data '{"changedBy":"named.operator"}'
curl --fail-with-body "$API_ORIGIN/ops/assistant" \
  --header "Authorization: Bearer $OPS_API_TOKEN"
```

Confirm mode=off, assistantEnabled=false and queued customer effects cancelled.
Agents retain Zammad access. Internal food-safety routing remains active under
the approved OFF policy. Already dispatched requests may finish; reconcile their
article marker/status before retrying. Per-ticket OFF is an additional guard.
Stopping workers also pauses safety processing and requires operator queue cover.

Rollback:

1. Emergency OFF; verify no new customer POSTs and record uncertain/in-flight IDs.
2. Retain additive migrations 0015/0016 and receipts. Do not drop data or cast new
   outbox states to make an arbitrary old image run.
3. Use a verified compatible artifact containing both engines. Select V1 through
   /flow-version with that deployed SHA, approvalRef and named changedBy; OFF is
   preserved. Older images need explicit schema/status compatibility proof.
4. Reconcile provider uncertainty and ownership. Never replay accepted articles or
   reset all sessions. After fixing a poison input, an authorized maintainer may
   reset that specific inbox attempt count, retaining receipts/recovery handoff.
5. Validate V1 in shadow. Re-enable only by release-owner decision. Navigation
   resets safely between versions; human ownership/cooldown survive.

Provider migration is a separate [Zammad rollback](../runbooks/zammad-rollback.md),
never an automatic fallback. No rollback mutates website financial/order state.

R5 is manual. Preserve all five required CI gates and the exact verified candidate;
do not rebuild another website artifact after browser acceptance. Archive sanitized
provider and recipient receipts, approver and rollback identity. HTTP success,
mocks, source image pins and CI do not establish live production readiness.
