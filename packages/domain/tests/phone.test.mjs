import assert from 'node:assert/strict';
import test from 'node:test';
import * as domain from '../dist/index.js';

// Synthetic parsing fixtures only; these numbers must never reach a live gateway.
test('phone normalization uses country metadata, local trunks and international paste',()=>{
 assert.equal(typeof domain.normalizePhone,'function');
 for(const [input,country,want] of [
  ['081234567890','ID','+6281234567890'],
  ['+62 812-3456-7890','ID','+6281234567890'],
  ['+1 (202) 555-0100','ID','+12025550100'],
  ['081234567890','SG',null],
  ['abc081234567890','ID',null],
  ['+12025550100 ext 9','US',null],
  ['123','ID',null],
 ])assert.equal(domain.normalizePhone(input,country)?.e164??null,want);
});
