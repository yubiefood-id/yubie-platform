# Assistant emergency OFF runbook

Disable Yubie AI responses without rebuilding containers or losing human support.

## Fast path (recommended)

Set on **core Yubie VPS** (bot + worker):

```bash
ASSISTANT_ENABLED=false
```

Or per-ticket in Zammad:

```
yubie_bot_mode = OFF
```

Restart is **not** required when using env toggle if process reads env on each request; worker assistant jobs will no-op when disabled.

## Provider-level stop

```bash
SUPPORT_PROVIDER=chatwoot   # rollback path only — use when cut back from Zammad
```

For Zammad cutover rollback, follow [`zammad-rollback.md`](./zammad-rollback.md) instead.

## Verify emergency OFF

1. Send customer WhatsApp test message
2. Confirm Zammad ticket created
3. Confirm **no** outbound bot article from Yubie
4. Confirm human agent can reply normally in Zammad

## Metrics to watch

- `assistant_outbox_pending` should not grow for new customer messages
- `zammad_webhook_received_total` may still increment (ingress only)
- No new `assistant_run` rows with `outcome=reply` when OFF

## Re-enable

1. Set `ASSISTANT_ENABLED=true`
2. Set `yubie_bot_mode=SHADOW` in Zammad (staging first)
3. Run SHADOW validation before SUGGEST or AUTO
