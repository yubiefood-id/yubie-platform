import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { PATHS, SCHEMA_VERSION, REPO_ROOT } from './lib/paths.mjs';

const FRESHNESS = {
  FRESH: 'FRESH',
  CODE_FRESH_SEMANTIC_STALE: 'CODE_FRESH_SEMANTIC_STALE',
  STALE: 'STALE',
  DEGRADED_NO_CURSOR: 'DEGRADED_NO_CURSOR',
  BROKEN: 'BROKEN',
};

export function readCheckpoint() {
  if (!fs.existsSync(PATHS.checkpoint)) {
    return defaultCheckpoint();
  }
  try {
    const data = JSON.parse(fs.readFileSync(PATHS.checkpoint, 'utf8'));
    return { ...defaultCheckpoint(), ...data };
  } catch {
    return defaultCheckpoint();
  }
}

export function defaultCheckpoint() {
  return {
    code_index_sha: '',
    code_indexed_at: '',
    semantic_index_sha: '',
    semantic_indexed_at: '',
    semantic_dirty_files: [],
    semantic_provider: 'none',
    semantic_schema_version: SCHEMA_VERSION,
    freshness_status: FRESHNESS.STALE,
    graphify_version: '',
    indexed_sha: '',
    indexed_at: '',
    changed_files: [],
    mode: '',
    docs_semantic: false,
  };
}

export function writeCheckpoint(data) {
  fs.mkdirSync(PATHS.graphifyDir, { recursive: true });
  const tmp = `${PATHS.checkpoint}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`);
  fs.renameSync(tmp, PATHS.checkpoint);
}

export function gitHead() {
  try {
    return execSync('git rev-parse HEAD', { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

export function markSemanticDirty(files) {
  const checkpoint = readCheckpoint();
  const set = new Set(checkpoint.semantic_dirty_files ?? []);
  for (const f of files) set.add(f);
  checkpoint.semantic_dirty_files = [...set];
  checkpoint.freshness_status = computeFreshnessStatus(checkpoint);
  writeCheckpoint(checkpoint);
}

export function computeFreshnessStatus(checkpoint) {
  const head = gitHead();
  const codeFresh = checkpoint.code_index_sha && checkpoint.code_index_sha === head;
  const semanticFresh =
    checkpoint.semantic_index_sha &&
    checkpoint.semantic_index_sha === head &&
    (checkpoint.semantic_dirty_files?.length ?? 0) === 0;

  if (checkpoint.semantic_provider === 'none' && !checkpoint.semantic_indexed_at) {
    return codeFresh ? FRESHNESS.CODE_FRESH_SEMANTIC_STALE : FRESHNESS.DEGRADED_NO_CURSOR;
  }
  if (checkpoint.semantic_provider === 'none') {
    return codeFresh ? FRESHNESS.CODE_FRESH_SEMANTIC_STALE : FRESHNESS.DEGRADED_NO_CURSOR;
  }
  if (codeFresh && semanticFresh) return FRESHNESS.FRESH;
  if (codeFresh) return FRESHNESS.CODE_FRESH_SEMANTIC_STALE;
  return FRESHNESS.STALE;
}

export { FRESHNESS };
