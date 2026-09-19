import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDeniedPath, scanContentForSecrets, shouldSkipSemantic } from '../secret-scan.mjs';

test('denies .env paths', () => {
  assert.equal(isDeniedPath('.env'), true);
  assert.equal(isDeniedPath('.env.local'), true);
});

test('denies PEM content', () => {
  const result = scanContentForSecrets('-----BEGIN RSA PRIVATE KEY-----\nabc');
  assert.equal(result.denied, true);
});

test('allows normal markdown', () => {
  const result = shouldSkipSemantic('docs/ARCHITECTURE.md', '# Architecture\nNo secrets here.');
  assert.equal(result.skip, false);
});

test('skips credential-like paths', () => {
  const result = shouldSkipSemantic('secrets/api-key.pem', 'dummy');
  assert.equal(result.skip, true);
  assert.equal(result.status, 'skipped_security');
});
