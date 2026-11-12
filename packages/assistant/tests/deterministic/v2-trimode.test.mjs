import assert from 'node:assert/strict';
import test from 'node:test';
import { DeterministicConversationEngine } from '../../dist/deterministic/engine.js';

const knowledge = { async getEffectivePublicKnowledge() { return null; } };
const engine = (aiPolicy) => new DeterministicConversationEngine({ knowledge, flowVersion: 'deterministic-v2', ...(aiPolicy ? { aiPolicy } : {}) });
const state = (nodeId = 'HOME', context = {}) => ({ nodeId, flowVersion: 'deterministic-v2', context, fallbackCount: 0 });
const turn = (text, persisted = state(), conversationState = 'BOT_ACTIVE', aiPolicy) => engine(aiPolicy).processTurn({ text, persisted, conversationState });
const effectsOf = (r, kind) => (r.effects ?? []).filter((e) => e.kind === kind);

// WA-02 D01/D02: the AI entry is reachable in the menu but is a deterministic
// dead end while the policy is disabled; no REQUEST effect can ever appear.
test('AI menu entry is a deterministic dead end while the policy is disabled', async () => {
  const r = await turn('7');
  assert.equal(r.action.kind, 'reply');
  assert.equal(r.nextState.nodeId, 'HOME');
  assert.match(r.action.text, /belum tersedia/i);
  assert.equal(effectsOf(r, 'REQUEST_AI_ANSWER').length, 0);
  assert.equal(effectsOf(r, 'ENTER_AI_MODE').length, 0);
});

test('AI entry without consent never opens a session (disclosure only)', async () => {
  const intro = await turn('7', state(), 'BOT_ACTIVE', { available: true });
  assert.equal(intro.nextState.nodeId, 'AI_INTRO');
  assert.match(intro.action.text, /bukan manusia/i);
  assert.equal(effectsOf(intro, 'ENTER_AI_MODE').length, 0);
  // Declining returns to the menu with no session state.
  const decline = await turn('2', state('AI_INTRO'), 'BOT_ACTIVE', { available: true });
  assert.equal(decline.nextState.nodeId, 'HOME');
  assert.equal(effectsOf(decline, 'ENTER_AI_MODE').length, 0);
  assert.equal(effectsOf(decline, 'EXIT_AI_MODE').length, 0);
});

test('explicit consent opens the AI session with an audit effect', async () => {
  const r = await turn('1', state('AI_INTRO'), 'BOT_ACTIVE', { available: true });
  assert.equal(r.nextState.nodeId, 'AI_ACTIVE');
  assert.equal(r.nextState.context.aiActive, true);
  assert.equal(effectsOf(r, 'ENTER_AI_MODE').length, 1);
  assert.match(r.action.text, /silakan ketik pertanyaanmu/i);
});

test('free text in the AI session becomes a bounded request, never a send', async () => {
  const r = await turn('Apa itu ubi ungu?', state('AI_ACTIVE', { aiActive: true }), 'BOT_ACTIVE', { available: true });
  assert.equal(r.action.kind, 'reply');
  assert.equal(r.nextState.nodeId, 'AI_ACTIVE');
  const requests = effectsOf(r, 'REQUEST_AI_ANSWER');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].question, 'Apa itu ubi ungu?');
  // No text effect: the deterministic worker owns the answer decision.
  assert.equal((r.effects ?? []).some((e) => 'text' in e), false);
});

// WA-02 D04: navigation and human commands inside the AI session never become
// model requests.
test('menu, keluar and human commands exit the session without any AI request', async () => {
  for (const word of ['menu', 'keluar', '9', 'kembali']) {
    const r = await turn(word, state('AI_ACTIVE', { aiActive: true }), 'BOT_ACTIVE', { available: true });
    assert.equal(r.nextState.nodeId, 'HOME', word);
    assert.equal(effectsOf(r, 'EXIT_AI_MODE').length, 1, word);
    assert.equal(effectsOf(r, 'REQUEST_AI_ANSWER').length, 0, word);
    assert.equal(r.nextState.context.aiActive, undefined, word);
  }
  const human = await turn('0', state('AI_ACTIVE', { aiActive: true }), 'BOT_ACTIVE', { available: true });
  assert.equal(human.action.kind, 'handoff');
  assert.equal(human.action.destination, 'CUSTOMER_SUPPORT');
  assert.equal(effectsOf(human, 'EXIT_AI_MODE').length, 1);
  assert.equal(effectsOf(human, 'REQUEST_AI_ANSWER').length, 0);
});

test('navigation aliases that leave the session still work inside AI; others stay questions', async () => {
  // "produk" is a PRODUCT_MENU alias in normal nodes, but inside an AI session
  // it is a question, not navigation.
  const question = await turn('produk', state('AI_ACTIVE', { aiActive: true }), 'BOT_ACTIVE', { available: true });
  assert.equal(question.nextState.nodeId, 'AI_ACTIVE');
  assert.equal(effectsOf(question, 'REQUEST_AI_ANSWER').length, 1);
  // "mulai" maps to HOME and therefore exits the session.
  const exit = await turn('mulai', state('AI_ACTIVE', { aiActive: true }), 'BOT_ACTIVE', { available: true });
  assert.equal(exit.nextState.nodeId, 'HOME');
  assert.equal(effectsOf(exit, 'EXIT_AI_MODE').length, 1);
});

// WA-02 D10-adjacent: food safety outranks the AI session; zero model requests.
test('food-safety language inside the AI session escalates immediately', async () => {
  const r = await turn('produk berbau busuk', state('AI_ACTIVE', { aiActive: true }), 'BOT_ACTIVE', { available: true });
  assert.equal(r.action.kind, 'handoff');
  assert.equal(r.action.destination, 'FOOD_SAFETY');
  assert.equal(effectsOf(r, 'REQUEST_AI_ANSWER').length, 0);
  assert.equal(effectsOf(r, 'EXIT_AI_MODE').length, 1);
});

test('AI session fails closed to a deterministic exit when the policy drops mid-session', async () => {
  const r = await turn('berapa harga?', state('AI_ACTIVE', { aiActive: true }), 'BOT_ACTIVE');
  assert.equal(r.nextState.nodeId, 'HOME');
  assert.match(r.action.text, /belum tersedia/i);
  assert.equal(effectsOf(r, 'EXIT_AI_MODE').length, 1);
  assert.equal(effectsOf(r, 'REQUEST_AI_ANSWER').length, 0);
});

test('oversized AI questions are truncated to the request bound', async () => {
  const r = await turn(`${'a'.repeat(2500)}?`, state('AI_ACTIVE', { aiActive: true }), 'BOT_ACTIVE', { available: true });
  const request = effectsOf(r, 'REQUEST_AI_ANSWER')[0];
  assert.equal(request.question.length, 2000);
});
