import fs from 'node:fs';
import path from 'node:path';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { selectSemanticBatch } from '../cursor-semantic.mjs';
import { saveSuccessfulExtraction } from '../semantic-cache.mjs';
import { PATHS, REPO_ROOT } from '../lib/paths.mjs';

const CACHED = 'README.md';
const UNCACHED = 'docs/development/GRAPHIFY_WORKFLOW.md';

after(() => {
  const cacheDir = PATHS.semanticCache;
  if (!fs.existsSync(cacheDir)) return;
  for (const file of fs.readdirSync(cacheDir)) {
    try {
      const entry = JSON.parse(fs.readFileSync(path.join(cacheDir, file), 'utf8'));
      if (entry.path === CACHED || entry.path === UNCACHED) {
        fs.unlinkSync(path.join(cacheDir, file));
      }
    } catch {
      // ignore
    }
  }
});

test('selectSemanticBatch skips cache-fresh documents', () => {
  const content = fs.readFileSync(path.join(REPO_ROOT, CACHED), 'utf8');
  saveSuccessfulExtraction(
    CACHED,
    content,
    {
      document: CACHED,
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

  const targets = [
    { path: CACHED, tier: 'P0' },
    { path: UNCACHED, tier: 'P0' },
  ];
  const batch = selectSemanticBatch(targets, { limit: 5 });
  assert.deepEqual(batch.map((t) => t.path), [UNCACHED]);
});

test('selectSemanticBatch returns empty when all targets are cache-fresh', () => {
  const content = fs.readFileSync(path.join(REPO_ROOT, UNCACHED), 'utf8');
  saveSuccessfulExtraction(
    UNCACHED,
    content,
    {
      document: UNCACHED,
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

  const batch = selectSemanticBatch([{ path: CACHED, tier: 'P0' }, { path: UNCACHED, tier: 'P0' }], {
    limit: 5,
  });
  assert.deepEqual(batch, []);
});
