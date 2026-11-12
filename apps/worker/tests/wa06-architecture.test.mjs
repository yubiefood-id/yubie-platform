import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

// WA-06 architecture assertions (D21/D22): until an owner-accepted
// Coexistence/cutover plan exists, the existing WhatsApp Business app number
// stays untouched — no second inbound consumer and no dual active sender can
// silently appear from this codebase.

test('D22: exactly one inbound provider webhook route exists (no dual consumer)', async () => {
  // Assert against the authoritative SOURCE, not a build artifact: the worker
  // test script does not build the bot workspace, so apps/bot/dist does not
  // exist in a fresh checkout (CI root cause, run 43084752180). Reading src
  // keeps the invariant checkable from any clean installation.
  const botSource = await readFile(new URL('../../bot/src/index.ts', import.meta.url), 'utf8');
  const zammadRoutes = botSource.match(/\/webhooks\/zammad/g) ?? [];
  assert.equal(zammadRoutes.length, 1, 'apps/bot exposes exactly one Zammad webhook route');
  assert.equal((botSource.match(/\/webhooks\/chatwoot-agentbot/g) ?? []).length, 1, 'legacy rollback route unchanged');
  assert.ok(!/\/webhooks\/(bsp|meta|cloud)/.test(botSource), 'no BSP/Meta inbound route is registered');
});

test('D21: no Coexistence bridge or second sender is wired into the worker', async () => {
  const workerSource = await readFile(new URL('../dist/index.js', import.meta.url), 'utf8');
  // Outbound templates travel their own disabled-by-default queue; they must
  // not be routed through Zammad articles or the support reply path.
  assert.ok(workerSource.includes('"outbound.whatsapp"'), 'outbound template queue registered');
  assert.ok(!/coexistence|CoexistenceBridge|bsp-inbound/.test(workerSource), 'no Coexistence adapter exists');
});

test('D21: the outbound gateway ships fail-closed regardless of database state', async () => {
  const { createOutboundTransportFromEnv } = await import('@yubie/integrations');
  const previous = process.env.OUTBOUND_WHATSAPP_PROVIDER;
  delete process.env.OUTBOUND_WHATSAPP_PROVIDER;
  try {
    const transport = createOutboundTransportFromEnv();
    assert.equal(transport.name, 'fail-closed');
    const result = await transport.send({ toWhatsapp: '+1', templateName: 't', templateVersion: '1', language: 'id', bodyText: 'x', idempotencyKey: 'k' });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'UNAVAILABLE');
  } finally {
    if (previous !== undefined) process.env.OUTBOUND_WHATSAPP_PROVIDER = previous;
  }
});
