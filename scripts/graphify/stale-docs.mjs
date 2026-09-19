import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { REPO_ROOT } from './lib/paths.mjs';
import { loadAllCachedExtractions, contentSha256 } from './semantic-cache.mjs';

export function getChangedFiles(fromSha, toSha = 'HEAD') {
  try {
    const range = fromSha ? `${fromSha}..${toSha}` : toSha;
    const out = execSync(`git diff --name-only ${range}`, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    return out.split('\n').map((l) => l.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export function findPotentiallyStaleDocs(changedFiles) {
  const changedSet = new Set(changedFiles);
  const entries = loadAllCachedExtractions();
  const stale = [];

  for (const entry of entries) {
    const refs = entry.extraction?.code_references ?? [];
    const overlap = refs.filter((ref) =>
      changedFiles.some((f) => f === ref || f.endsWith(ref) || ref.endsWith(f)),
    );
    if (overlap.length === 0) continue;

    const full = `${REPO_ROOT}/${entry.path}`;
    if (!fs.existsSync(full)) continue;
    const currentSha = contentSha256(fs.readFileSync(full, 'utf8'));
    if (currentSha !== entry.content_sha256) {
      continue;
    }

    stale.push({
      document: entry.path,
      status: 'POTENTIALLY_STALE',
      changed_symbols_or_paths: overlap,
      related_changes: changedFiles.filter((f) => overlap.some((o) => f.includes(o) || o.includes(f))),
      last_indexed_sha: entry.content_sha256,
      indexed_at: entry.last_semantic_indexed_at,
      evidence: `Code paths changed (${overlap.join(', ')}) but document SHA unchanged since last semantic index`,
    });
  }

  return stale;
}
