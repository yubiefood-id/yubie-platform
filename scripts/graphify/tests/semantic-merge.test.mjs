import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mergeEngineeringGraph, queryGraphPath } from '../semantic-merge.mjs';
import { PATHS, REPO_ROOT } from '../lib/paths.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const astFixture = path.join(__dirname, 'fixtures/mini-ast-graph.json');
const semanticFixture = path.join(__dirname, 'fixtures/mini-semantic-graph.json');

let graphifyAvailable = false;
try {
  execSync('graphify --version', { stdio: 'pipe' });
  graphifyAvailable = true;
} catch {
  graphifyAvailable = false;
}

before(() => {
  fs.mkdirSync(PATHS.graphifyOut, { recursive: true });
  fs.copyFileSync(astFixture, PATHS.astGraph);
  fs.copyFileSync(semanticFixture, PATHS.semanticGraph);
});

after(() => {
  try {
    if (fs.existsSync(PATHS.engineeringGraph)) fs.unlinkSync(PATHS.engineeringGraph);
  } catch {
    // ignore
  }
});

test('queryGraphPath prefers engineering graph when present', () => {
  fs.writeFileSync(PATHS.engineeringGraph, '{}');
  assert.equal(queryGraphPath(), PATHS.engineeringGraph);
  fs.unlinkSync(PATHS.engineeringGraph);
  assert.equal(queryGraphPath(), PATHS.astGraph);
});

test('mergeEngineeringGraph uses graphify CLI when available', { skip: !graphifyAvailable }, () => {
  const result = mergeEngineeringGraph();
  assert.equal(result.merged, true);
  assert.ok(fs.existsSync(PATHS.engineeringGraph));
  const merged = JSON.parse(fs.readFileSync(PATHS.engineeringGraph, 'utf8'));
  assert.ok(merged.nodes.length >= 2);
});

test('mergeEngineeringGraph reports missing graphs', () => {
  const missing = path.join(REPO_ROOT, 'graphify-out/missing-semantic.json');
  if (fs.existsSync(missing)) fs.unlinkSync(missing);
  const origSemantic = PATHS.semanticGraph;
  if (fs.existsSync(origSemantic)) fs.unlinkSync(origSemantic);
  const result = mergeEngineeringGraph();
  assert.equal(result.merged, false);
  fs.copyFileSync(semanticFixture, origSemantic);
});
