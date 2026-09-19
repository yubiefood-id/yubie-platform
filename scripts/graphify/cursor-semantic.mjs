#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { REPO_ROOT, PATHS } from './lib/paths.mjs';
import { shouldSkipSemantic } from './secret-scan.mjs';
import { listSemanticCandidates, getDocumentPriority } from './semantic-priority.mjs';
import {
  shouldSkipExtraction,
  isExtractionCacheFresh,
  saveSuccessfulExtraction,
  saveFailedExtraction,
  saveSkippedSecurity,
  contentSha256,
} from './semantic-cache.mjs';
import {
  validateSemanticExtraction,
  buildExtractionPrompt,
  buildCorrectionPrompt,
  parseCliJsonOutput,
} from './semantic-schema.mjs';
import { CursorCliSemanticProvider } from './providers/cursor-cli.mjs';
import { CursorAcpSemanticProvider } from './providers/cursor-acp.mjs';
import { rebuildSemanticGraph } from './semantic-to-graph.mjs';
import { mergeEngineeringGraph } from './semantic-merge.mjs';
import { readCheckpoint, writeCheckpoint, computeFreshnessStatus, gitHead } from './checkpoint.mjs';
import { withGraphLock } from './graph-lock.mjs';

function parseArgs(argv) {
  const opts = { limit: 5, tiers: ['P0'], force: false, files: [] };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--limit') opts.limit = Number(argv[++i] ?? 5);
    else if (a === '--p1') opts.tiers = ['P0', 'P1'];
    else if (a === '--force') opts.force = true;
    else if (a === '--file') opts.files.push(argv[++i]);
    else if (a === '--all-p0') opts.tiers = ['P0'];
  }
  return opts;
}

/** Pick up to `limit` targets that still need Cursor extraction (skips cache-fresh docs). */
export function selectSemanticBatch(targets, { limit = 5 } = {}) {
  const selected = [];
  for (const target of targets) {
    if (selected.length >= limit) break;

    const full = path.join(REPO_ROOT, target.path);
    if (!fs.existsSync(full)) {
      selected.push(target);
      continue;
    }

    const content = fs.readFileSync(full, 'utf8');
    if (isExtractionCacheFresh(target.path, content)) continue;

    selected.push(target);
  }
  return selected;
}

async function pickProvider(forceAcp = false) {
  const cli = new CursorCliSemanticProvider();
  const acp = new CursorAcpSemanticProvider();
  if (!forceAcp && (await cli.isAvailable())) return cli;
  if (await acp.isAvailable()) return acp;
  return null;
}

async function extractWithProvider(provider, documentPath, content) {
  const sha = contentSha256(content);
  const prompt = buildExtractionPrompt(documentPath, content, sha);
  let lastStdout = '';
  let lastErrors = [];

  for (let attempt = 0; attempt < 2; attempt++) {
    const usePrompt =
      attempt === 0 ? prompt : buildCorrectionPrompt(documentPath, lastErrors, lastStdout);
    const { stdout } = await provider.extract(usePrompt);
    lastStdout = stdout;
    let data;
    try {
      data = parseCliJsonOutput(stdout);
    } catch (err) {
      lastErrors = [`JSON parse failed: ${err.message}`];
      continue;
    }
    data.document = documentPath;
    const validation = validateSemanticExtraction(data, { documentPath });
    if (validation.valid) {
      return { data, provider: provider.name };
    }
    lastErrors = validation.errors;
  }

  throw new Error(`Invalid semantic JSON after retry: ${lastErrors.join('; ')}`);
}

export async function processDocument(relPath, provider) {
  const full = path.join(REPO_ROOT, relPath);
  if (!fs.existsSync(full)) {
    return { path: relPath, status: 'missing' };
  }
  const content = fs.readFileSync(full, 'utf8');
  const security = shouldSkipSemantic(relPath, content);
  if (security.skip) {
    saveSkippedSecurity(relPath, content, security.reason);
    return { path: relPath, status: security.status, reason: security.reason };
  }

  const cache = shouldSkipExtraction(relPath, content);
  if (cache.skip) {
    return { path: relPath, status: 'cached', extraction: cache.cached.extraction };
  }

  try {
    const { data, provider: usedProvider } = await extractWithProvider(provider, relPath, content);
    saveSuccessfulExtraction(relPath, content, data, { provider: usedProvider });
    return { path: relPath, status: 'ok', extraction: data, provider: usedProvider };
  } catch (err) {
    saveFailedExtraction(relPath, content, err, { provider: provider.name });
    return { path: relPath, status: 'failed', error: String(err) };
  }
}

export async function runSemanticIndexing(opts = {}) {
  const lock = await withGraphLock(async () => {
    const provider = await pickProvider(process.env.GRAPHIFY_FORCE_ACP === '1');
    if (!provider) {
      const checkpoint = readCheckpoint();
      checkpoint.semantic_provider = 'none';
      checkpoint.freshness_status = computeFreshnessStatus(checkpoint);
      writeCheckpoint(checkpoint);
      return { processed: [], provider: 'none', degraded: true };
    }

    let targets = [];
    if (opts.files?.length) {
      targets = opts.files.map((f) => ({ path: f, tier: getDocumentPriority(f) }));
    } else {
      targets = listSemanticCandidates(REPO_ROOT, { tiers: opts.tiers ?? ['P0'], force: opts.force });
      const checkpoint = readCheckpoint();
      const dirty = new Set(checkpoint.semantic_dirty_files ?? []);
      if (dirty.size > 0 && !opts.force) {
        targets = targets.filter((t) => dirty.has(t.path));
      }
    }

    const limit = opts.limit ?? 5;
    const batch = selectSemanticBatch(targets, { limit });
    const results = [];
    for (const t of batch) {
      results.push(await processDocument(t.path, provider));
    }

    rebuildSemanticGraph();
    const merge = mergeEngineeringGraph();

    const checkpoint = readCheckpoint();
    checkpoint.semantic_provider = provider.name;
    checkpoint.semantic_index_sha = gitHead();
    checkpoint.semantic_indexed_at = new Date().toISOString();
    checkpoint.semantic_dirty_files = (checkpoint.semantic_dirty_files ?? []).filter(
      (f) => !results.some((r) => r.path === f && (r.status === 'ok' || r.status === 'cached')),
    );
    if (!merge.merged) {
      checkpoint.freshness_status = 'CODE_FRESH_SEMANTIC_STALE';
    } else {
      checkpoint.freshness_status = computeFreshnessStatus(checkpoint);
    }
    writeCheckpoint(checkpoint);

    return { processed: results, provider: provider.name, degraded: false, merge };
  });

  if (lock.skipped) {
    return { processed: [], provider: 'none', degraded: true, skipped: true, reason: lock.reason };
  }
  return lock.result;
}

async function main() {
  const opts = parseArgs(process.argv);
  const result = await runSemanticIndexing(opts);
  console.log(JSON.stringify(result, null, 2));
  if (result.degraded && !result.processed?.length) {
    process.exit(0);
  }
}

import { fileURLToPath } from 'node:url';
const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
