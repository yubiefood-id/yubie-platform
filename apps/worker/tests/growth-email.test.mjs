import assert from 'node:assert/strict';
import test from 'node:test';
import { GROWTH_EMAIL_EVENT_TYPES, processGrowthEmail } from '../dist/growth-email-handler.js';

const LEAD = {
  id: 'b2b_test_1', name: 'Budi', business: 'Warung Budi', type: 'Bakery', city: 'Bandung',
  email: 'budi@warung.id', whatsapp: '+62812345678', need: '20 kg', intent: 'bulk', interest: 'Yubie Flour',
  message: 'butuh pasokan bulanan', status: 'new', source: 'web', consentVersion: '2026-10',
  consentedAt: '2026-11-12T00:00:00.000Z', createdAt: '2026-11-12T00:00:00.000Z', updatedAt: '2026-11-12T00:00:00.000Z',
};
const CONFIG = {
  host: 'smtp.privateemail.com', port: 465, secure: true, user: 'enquiry@yubiefood.com', password: 'secret',
  from: 'enquiry@yubiefood.com', notifyTo: ['hello@yubiefood.com'], ackEnabled: true,
};

function makeDeps(overrides = {}) {
  const completed = [], failed = [], sent = [], audited = [];
  const store = {
    claim: async () => overrides.claim ?? [
      { id: 'e1', eventType: 'growth.b2b_enquiry_email_requested', aggregateId: 'b2b_test_1', attempt: 1 },
      { id: 'e2', eventType: 'growth.b2b_enquiry_ack_requested', aggregateId: 'b2b_test_1', attempt: 1 },
    ],
    complete: async (event) => completed.push(event.id),
    retry: async (event) => failed.push(event.id),
  };
  const growth = { getB2bLeadById: async () => (overrides.leadMissing ? { ok: true, value: null } : { ok: true, value: LEAD }) };
  const audit = { append: async (entry) => audited.push(entry.action) };
  const email = { send: async (input) => { sent.push(input); return overrides.sendResult ?? { status: 'accepted', providerMessageId: 'm1' }; } };
  return { store, growth, audit, email, completed, failed, sent, audited };
}

test('both enquiry emails send with correct routing and audit entries', async () => {
  const deps = makeDeps();
  const result = await processGrowthEmail(deps.store, { growth: deps.growth, audit: deps.audit, email: deps.email, config: CONFIG });
  assert.deepEqual(result, { completed: 2, failed: 0 });
  assert.deepEqual(deps.completed, ['e1', 'e2']);
  assert.equal(deps.sent.length, 2);
  assert.deepEqual(deps.sent[0].to, ['hello@yubiefood.com'], 'notification goes to the team inbox');
  assert.equal(deps.sent[0].replyTo, 'budi@warung.id', 'team replies reach the lead');
  assert.deepEqual(deps.sent[1].to, ['budi@warung.id'], 'acknowledgment goes to the business');
  assert.equal(deps.sent[1].replyTo, 'hello@yubiefood.com', 'customer replies reach the team');
  assert.deepEqual(deps.audited, ['b2b.enquiry_emailed', 'b2b.enquiry_ack_sent']);
  assert.ok(deps.sent[0].text.includes('butuh pasokan bulanan'), 'the lead content is rendered into the notification body');
});

test('a non-accepted provider outcome retries the event', async () => {
  for (const sendResult of [{ status: 'ambiguous', errorCode: 'SMTP_OUTCOME_UNCERTAIN' }, { status: 'failed', errorCode: 'SMTP_REJECTED_PERMANENT' }]) {
    const deps = makeDeps({ sendResult });
    const result = await processGrowthEmail(deps.store, { growth: deps.growth, audit: deps.audit, email: deps.email, config: CONFIG });
    assert.deepEqual(result, { completed: 0, failed: 2 }, sendResult.status);
    assert.deepEqual(deps.failed, ['e1', 'e2']);
  }
});

test('an unhittable lead releases the event instead of burning retries', async () => {
  const deps = makeDeps({ leadMissing: true });
  const result = await processGrowthEmail(deps.store, { growth: deps.growth, audit: deps.audit, email: deps.email, config: CONFIG });
  assert.deepEqual(result, { completed: 2, failed: 0 });
  assert.equal(deps.sent.length, 0);
});

test('acknowledgment off skips only the ack event', async () => {
  const deps = makeDeps();
  const result = await processGrowthEmail(deps.store, { growth: deps.growth, audit: deps.audit, email: deps.email, config: { ...CONFIG, ackEnabled: false } });
  assert.deepEqual(result, { completed: 2, failed: 0 });
  assert.equal(deps.sent.length, 1);
  assert.deepEqual(deps.audited, ['b2b.enquiry_emailed']);
});

test('event type list is disjoint from the operations outbox set', () => {
  const operationsTypes = ['ops.changed', 'ops.payment_reconcile_requested', 'inventory.count_applied', 'inventory.recall_hold'];
  assert.equal(GROWTH_EMAIL_EVENT_TYPES.filter((type) => operationsTypes.includes(type)).length, 0);
});
