import assert from 'node:assert/strict';
import test from 'node:test';
import { DeterministicConversationEngine } from '../../dist/deterministic/engine.js';

const knowledge = { async getEffectivePublicKnowledge() { return null; } };
const engine = new DeterministicConversationEngine({ knowledge, flowVersion: 'deterministic-v2' });
const state = (nodeId = 'HOME', context = {}) => ({ nodeId, flowVersion: 'deterministic-v2', context, fallbackCount: 0 });
const turn = (text, persisted = state(), conversationState = 'BOT_ACTIVE') => engine.processTurn({text, persisted, conversationState});

test('V2 migrates old numeric navigation without executing it', async () => {
  const r = await turn('1', {nodeId:'buy',flowVersion:'deterministic-v1',context:{company:'private'},fallbackCount:1});
  assert.equal(r.nextState.nodeId, 'HOME');
  assert.equal(r.nextState.flowVersion, 'deterministic-v2');
  assert.match(r.action.text, /diperbarui/);
  assert.deepEqual(r.nextState.context, {});
});

test('V2 all HOME choices route to their declared menus', async () => {
  for (const [input, target] of [['1','PRODUCT_MENU'],['2','ABOUT_MENU'],['3','ORDER_MENU'],['4','PROMO_MENU'],['5','SUPPORT_MENU'],['6','B2B_MENU']]) {
    assert.equal((await turn(input)).nextState.nodeId, target);
  }
});

test('V2 global aliases work from nested states with normalized input', async () => {
  for (const [input, target] of [[' HALO!! ','HOME'],['belanja','PRODUCT_MENU'],['cek pesanan','ORDER_MENU'],['alamat pengiriman','ADDRESS_GUIDANCE'],['diskon','PROMO_MENU'],['komplain','SUPPORT_MENU'],['reseller','B2B_MENU'],['harga tepung','PRODUCT_DETAIL'],['beli shake','PRODUCT_DETAIL'],['info ppang','PRODUCT_DETAIL'],['mau mie','PRODUCT_DETAIL']]) {
    assert.equal((await turn(input,state('ABOUT_MENU'))).nextState.nodeId,target,input);
  }
  assert.equal((await turn('9',state('ORDER_MENU'))).nextState.nodeId,'HOME');
});

test('V2 priority safety is internal while human owned and survives version migration', async () => {
  const r = await turn('produk berjamur, hubungi admin', {nodeId:'buy',flowVersion:'deterministic-v1',context:{},fallbackCount:0}, 'HUMAN_ACTIVE');
  assert.equal(r.action.kind,'handoff');
  assert.equal(r.action.destination,'FOOD_SAFETY');
  assert.equal(r.action.text,'');
  assert.equal(r.effects.filter(e=>e.kind==='CREATE_HANDOFF').length,1);
  assert.equal((await turn('menu',state(),'HUMAN_ACTIVE')).action.kind,'noop');
});

test('V2 fallback is bounded to three attempts and persists across restart', async () => {
  let s=state();
  for(let i=1;i<=3;i++) {
    const r=await turn('tidak dikenal xyz',s); s=r.nextState;
    assert.equal(r.action.kind,i===3?'handoff':'reply');
  }
});

test('V2 disabled account/checkout never advertises order portal or payment availability', async () => {
  for(const input of ['1','2','3']) {
    const r=await turn(input,state('ORDER_MENU'));
    assert.doesNotMatch(r.action.text,/https:\/\/[^\s]*(?:account|checkout)/);
    assert.doesNotMatch(r.action.text,/checkout langsung|pembayaran berhasil/i);
  }
});

test('V2 every product has contextual info/browse/back and zero default unapproved media', async () => {
  for(const input of ['1','2','3','4']) {
    const r=await turn(input,state('PRODUCT_MENU'));
    assert.equal(r.nextState.nodeId,'PRODUCT_DETAIL');
    assert.equal(r.effects.some(e=>e.kind==='SEND_PRODUCT_MEDIA'),false);
    assert.equal((await turn('2',r.nextState)).nextState.nodeId,'PRODUCT_INFO');
    assert.equal((await turn('3',r.nextState)).nextState.nodeId,'PRODUCT_MENU');
    assert.equal((await turn('9',r.nextState)).nextState.nodeId,'PRODUCT_MENU');
  }
});

test('V2 B2B collects only after explicit consent then sends Sales handoff', async () => {
  let r=await turn('1',state('B2B_MENU'));
  assert.equal(r.nextState.nodeId,'B2B_CONSENT');
  r=await turn('2',r.nextState); assert.equal(r.action.destination,'SALES_PARTNERSHIP');
  r=await turn('1',state('B2B_CONSENT',{category:'bulk'}));
  for(const value of ['Bisnis contoh','Pembelian grosir','flour','Bandung','lewati']) r=await turn(value,r.nextState);
  assert.equal(r.action.destination,'SALES_PARTNERSHIP');
  assert.equal(r.nextState.context.consent,true);
});

test('V2 missing category-specific knowledge cannot reuse broad product summary as allergy fact', async () => {
  const seen=[];
  const e=new DeterministicConversationEngine({flowVersion:'deterministic-v2',knowledge:{async getEffectivePublicKnowledge(type,id){seen.push([type,id]);return type==='product'?{data:{summary:'general'},source:'test',version:1,effectiveAt:'2026-01-01'}:null;}}});
  const r=await e.processTurn({text:'5',persisted:state('ABOUT_MENU'),conversationState:'BOT_ACTIVE'});
  assert.doesNotMatch(r.action.text,/general/);
  assert.deepEqual(seen,[['nutrition_allergens','brand:yubie']]);
});
