import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSemanticExtraction } from '../semantic-schema.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const valid = JSON.parse(readFileSync(path.join(__dirname, 'fixtures/valid-extraction.json'), 'utf8'));

test('accepts valid extraction fixture', () => {
  const result = validateSemanticExtraction(valid, { documentPath: valid.document });
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test('rejects missing document_type', () => {
  const bad = { ...valid, document_type: 'INVALID' };
  const result = validateSemanticExtraction(bad, { documentPath: bad.document });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('document_type')));
});

test('rejects relationship without evidence', () => {
  const bad = {
    ...valid,
    relationships: [{ source: 'A', relationship: 'depends_on', target: 'B' }],
  };
  const result = validateSemanticExtraction(bad, { documentPath: bad.document });
  assert.equal(result.valid, false);
});
