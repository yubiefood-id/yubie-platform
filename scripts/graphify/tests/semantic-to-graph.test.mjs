import fs, { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildSemanticGraphFromCache, rebuildSemanticGraph } from '../semantic-to-graph.mjs';
import { saveSuccessfulExtraction } from '../semantic-cache.mjs';
import { PATHS } from '../lib/paths.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(path.join(__dirname, 'fixtures/valid-extraction.json'), 'utf8'));
const DOC = fixture.document;
const CONTENT = '# ADR-009\nZammad support authority.\n';

before(() => {
  saveSuccessfulExtraction(DOC, CONTENT, fixture, { provider: 'test' });
});

after(() => {
  if (fs.existsSync(PATHS.semanticCache)) {
    for (const file of fs.readdirSync(PATHS.semanticCache)) {
      try {
        const entry = JSON.parse(fs.readFileSync(path.join(PATHS.semanticCache, file), 'utf8'));
        if (entry.path === DOC) fs.unlinkSync(path.join(PATHS.semanticCache, file));
      } catch {
        // ignore
      }
    }
  }
});

test('builds semantic nodes from cache', () => {
  const graph = buildSemanticGraphFromCache();
  assert.ok(graph.nodes.length >= 2);
  const docNode = graph.nodes.find((n) => n.label === DOC);
  assert.ok(docNode);
  assert.equal(docNode._origin, 'semantic');
  const zammad = graph.nodes.find((n) => n.label === 'Zammad');
  assert.ok(zammad);
  const ref = graph.nodes.find((n) => n.label === 'packages/integrations/src/zammad/');
  assert.ok(ref);
});

test('rebuildSemanticGraph writes semantic.json', () => {
  rebuildSemanticGraph();
  assert.ok(fs.existsSync(PATHS.semanticGraph));
  const graph = JSON.parse(fs.readFileSync(PATHS.semanticGraph, 'utf8'));
  assert.ok(Array.isArray(graph.nodes));
  assert.ok(graph.nodes.length > 0);
});
