import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { PATHS, REPO_ROOT } from './lib/paths.mjs';

export function mergeEngineeringGraph() {
  if (!fs.existsSync(PATHS.astGraph)) {
    return { merged: false, reason: 'missing_ast_graph' };
  }
  if (!fs.existsSync(PATHS.semanticGraph)) {
    return { merged: false, reason: 'missing_semantic_graph' };
  }

  const tmp = `${PATHS.engineeringGraph}.tmp`;
  try {
    execSync(
      `graphify merge-graphs "${PATHS.astGraph}" "${PATHS.semanticGraph}" --out "${tmp}"`,
      { cwd: REPO_ROOT, stdio: 'pipe', encoding: 'utf8' },
    );
    fs.renameSync(tmp, PATHS.engineeringGraph);
    return { merged: true, path: PATHS.engineeringGraph };
  } catch (err) {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    return { merged: false, reason: String(err.stderr ?? err.message ?? err) };
  }
}

export function queryGraphPath() {
  if (fs.existsSync(PATHS.engineeringGraph)) return PATHS.engineeringGraph;
  if (fs.existsSync(PATHS.astGraph)) return PATHS.astGraph;
  return null;
}
