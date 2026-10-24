# WhatsApp Deferral Record — 2026-10-24 Release

**Status:** WHATSAPP_BOT_DEFERRED (owner decision, 2026-10-24 production mission)

## Scope of deferral

Not in this release (unchanged source, no new work):

- Meta WhatsApp Developer registration / Cloud API onboarding
- WhatsApp Business number onboarding
- Yubi V2 WhatsApp bot traffic (deterministic FSM engine stays implemented and tested)
- Automated replies, media messaging, broadcasts

## What stays intact

- All Yubi V2 source, migrations (`0015`, `0016`), and tests remain on main.
- Production Zammad at `support.yubiefood.com` is UNTOUCHED and keeps serving human support.
- `apps/bot` image keeps building in the release-candidate workflow; it is simply not deployed.

## Runtime posture

- Production worker runs with `SUPPORT_PROVIDER=disabled` (PR #35): payment reconciliation, identity delivery, and webhook cleanup run without any Zammad/WhatsApp credentials. Support queues are dormant; queued support deliveries are held, never faked or dropped.
- `apps/bot` is opt-in in `docker-compose.prod.yml` via `profile: bot`; under `disabled` the bot refuses to start (nothing to verify).
- `createSupportProvider()` throws a loud CONFIG_ERROR under `disabled` — no silent fake deliveries.

## Re-enabling later (separate approved change)

1. Provision/verify Zammad staging credentials and routing IDs (still BLOCKED_EXTERNAL as of 2026-10-24).
2. Set the full Zammad contract in the environment (`SUPPORT_PROVIDER=zammad` + `ZAMMAD_*`).
3. Deploy with `--profile bot`.
4. Verify handoff/escalation flows against staging before production.
