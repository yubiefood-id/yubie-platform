# Assistant emergency OFF runbook

Use the authenticated database-backed runtime endpoint. ASSISTANT_ENABLED is not
an environment hot-reload control. No container rebuild/restart is required.

```sh
curl --fail-with-body --request POST "$API_ORIGIN/ops/assistant/emergency-off" \
  --header "Authorization: Bearer $OPS_API_TOKEN" \
  --header 'Content-Type: application/json' \
  --data '{"changedBy":"named.operator"}'
curl --fail-with-body "$API_ORIGIN/ops/assistant" \
  --header "Authorization: Bearer $OPS_API_TOKEN"
```

Verify mode=off and assistantEnabled=false. Pending customer effects are cancelled;
fresh worker/adapter guards stop subsequent public sends. Already dispatched
requests may finish and require marker/status reconciliation. Under approved Yubi
V2 policy, internal food-safety routing remains active without a public bot reply.
Human agents retain Zammad access. Per-ticket yubie_bot_mode=OFF is an additional
guard. Do not switch providers as an emergency toggle.

Use approved test identities to confirm inbound availability, no new customer bot
article after the dispatch boundary, agent reply and silent priority safety routing.
Watch assistant_outbox_pending/ambiguous/failed, support_provider_error_total and
assistant_inbox_dead_letter_total. Keep raw conversations and PII out of diagnostics.

Re-enable shadow first through POST /ops/assistant/mode with a named changedBy.
Flow selection requires exact RELEASE_SHA and approvalRef and cannot inherit AUTO.
Production V2 AUTO requires accepted catalog, four final photos and support/
operations approval. Closure/reopening alone never releases human ownership.
See [Yubi rollback](../yubi-v2/GO_NO_GO_AND_ROLLBACK.md) and
[Zammad rollback](./zammad-rollback.md) for compatible recovery paths.
