import fs from 'node:fs';
import path from 'node:path';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  shouldSkipExtraction,
  saveSuccessfulExtraction,
  contentSha256,
} from '../semantic-cache.mjs';
import { PATHS } from '../lib/paths.mjs';

const TEST_PATH = 'docs/test-cache-fixture.md';
const TEST_CONTENT = '# Cache test fixture\n';

after(() => {
  const key = contentSha256(TEST_PATH);
  const cacheDir = PATHS.semanticCache;
  if (fs.existsSync(cacheDir)) {
    for (const file of fs.readdirSync(cacheDir)) {
      if (file.endsWith('.json')) {
        try {
          const entry = JSON.parse(fs.readFileSync(path.join(cacheDir, file), 'utf8'));
          if (entry.path === TEST_PATH) fs.unlinkSync(path.join(cacheDir, file));
        } catch {
          // ignore
        }
      }
    }
  }
});

test('cache miss on first extraction', () => {
  const result = shouldSkipExtraction(TEST_PATH, TEST_CONTENT);
  assert.equal(result.skip, false);
});

test('cache hit after successful save', () => {
  saveSuccessfulExtraction(
    TEST_PATH,
    TEST_CONTENT,
    {
      document: TEST_PATH,
      document_type: 'OTHER',
      summary: 'test',
      entities: [],
      relationships: [],
      decisions: [],
      constraints: [],
      code_references: [],
      security_boundaries: [],
      data_authorities: [],
      operational_dependencies: [],
    },
    { provider: 'test' },
  );
  const result = shouldSkipExtraction(TEST_PATH, TEST_CONTENT);
  assert.equal(result.skip, true);
  assert.equal(result.cached.status, 'ok');
});

test('cache miss when content changes', () => {
  const result = shouldSkipExtraction(TEST_PATH, `${TEST_CONTENT}\nchanged`);
  assert.equal(result.skip, false);
});
