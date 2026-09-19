#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { PATHS, REPO_ROOT } from './lib/paths.mjs';
import { readCheckpoint } from './checkpoint.mjs';
import { getChangedFiles, findPotentiallyStaleDocs } from './stale-docs.mjs';
import { queryGraphPath } from './semantic-merge.mjs';
import { getDocumentPriority } from './semantic-priority.mjs';

function classifyFile(file) {
  const views = [];
  if (file.startsWith('apps/api/') || file.startsWith('packages/integrations/') || file.startsWith('packages/application/')) views.push('contracts');
  if (file.includes('webhook') || file.includes('/ports/')) views.push('contracts');
  if (file.startsWith('infrastructure/') || file.includes('docker-compose') || file.includes('Dockerfile')) views.push('infrastructure');
  if (file.startsWith('apps/') || file.startsWith('packages/')) views.push('boundaries');
  if (file.startsWith('packages/persistence/migrations/') || file.startsWith('packages/persistence/src/')) views.push('database');
  if (file.includes('verif') || file.includes('auth') || file.includes('security') || file.startsWith('apps/api/')) views.push('security');
  if (file.includes('/tests/') || file.endsWith('.test.mjs')) views.push('tests');
  if (file.startsWith('docs/') || file.includes('ADR-')) views.push('documentation');
  return [...new Set(views)];
}

function gitShortHead() {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function main() {
  const checkpoint = readCheckpoint();
  const baseline = checkpoint.code_index_sha || checkpoint.indexed_sha || '';
  const changed = getChangedFiles(baseline);
  const working = getChangedFiles('', 'HEAD');
  const allChanged = [...new Set([...changed, ...working])];

  const viewCounts = {};
  const viewFiles = {};
  for (const file of allChanged) {
    for (const view of classifyFile(file)) {
      viewCounts[view] = (viewCounts[view] ?? 0) + 1;
      viewFiles[view] = `${viewFiles[view] ?? ''}- ${file}\n`;
    }
  }

  const staleDocs = findPotentiallyStaleDocs(allChanged);
  const graphPath = queryGraphPath();

  let lines = [];
  lines.push('# Graphify Impact Report (v2)');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`HEAD: ${gitShortHead()}`);
  lines.push(`Git baseline: ${baseline ? baseline.slice(0, 8) : 'none'}`);
  lines.push(`Freshness: ${checkpoint.freshness_status ?? 'unknown'}`);
  lines.push(`Semantic provider: ${checkpoint.semantic_provider ?? 'none'}`);
  lines.push(`Query graph: ${graphPath ? path.relative(REPO_ROOT, graphPath) : 'none'}`);
  lines.push('');

  lines.push('## Changed files');
  lines.push('');
  if (allChanged.length === 0) {
    lines.push('_No engineering file changes detected since checkpoint._');
  } else {
    for (const f of allChanged) lines.push(`- \`${f}\``);
  }
  lines.push('');

  lines.push('## Views affected');
  lines.push('');
  lines.push('| View | Files |');
  lines.push('|------|-------|');
  for (const view of ['contracts', 'infrastructure', 'boundaries', 'database', 'security', 'tests', 'documentation']) {
    if (viewCounts[view]) lines.push(`| ${view} | ${viewCounts[view]} |`);
  }
  lines.push('');

  for (const view of Object.keys(viewFiles)) {
    lines.push(`## ${view}`);
    lines.push('');
    lines.push(viewFiles[view].trimEnd());
    lines.push('');
  }

  lines.push('## Semantic extraction status');
  lines.push('');
  lines.push(`- Semantic dirty files: ${(checkpoint.semantic_dirty_files ?? []).length}`);
  lines.push(`- Semantic indexed at: ${checkpoint.semantic_indexed_at || 'never'}`);
  lines.push(`- Code indexed at: ${checkpoint.code_indexed_at || checkpoint.indexed_at || 'never'}`);
  lines.push('');

  if (staleDocs.length) {
    lines.push('## Potentially stale documentation');
    lines.push('');
    for (const s of staleDocs) {
      lines.push(`### ${s.document}`);
      lines.push(`- Status: ${s.status}`);
      lines.push(`- Evidence: ${s.evidence}`);
      lines.push(`- Overlapping refs: ${s.changed_symbols_or_paths.join(', ')}`);
      lines.push('');
    }
  }

  lines.push('## Recommended targeted investigations');
  lines.push('');
  if (allChanged.length === 0) {
    lines.push('_No changes — run graph queries only if starting new work._');
  } else {
    for (const view of Object.keys(viewCounts)) {
      lines.push(`- **${view}**: \`npm run graph:query -- --view ${view}\``);
    }
    for (const s of staleDocs.slice(0, 5)) {
      lines.push(`- **documentation**: re-index or review \`${s.document}\` (potentially stale)`);
    }
  }
  lines.push('');

  fs.mkdirSync(path.dirname(PATHS.impactReport), { recursive: true });
  const tmp = `${PATHS.impactReport}.tmp`;
  fs.writeFileSync(tmp, `${lines.join('\n')}\n`);
  fs.renameSync(tmp, PATHS.impactReport);
  console.log(`[graphify] Impact report: ${PATHS.impactReport}`);
}

import { fileURLToPath } from 'node:url';
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
