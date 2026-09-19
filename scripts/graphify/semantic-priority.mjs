import fs from 'node:fs';
import path from 'node:path';
import { PATHS } from './lib/paths.mjs';

function globToRegExp(glob) {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '<<<GLOBSTAR>>>')
    .replace(/\*/g, '[^/]*')
    .replace(/<<<GLOBSTAR>>>/g, '.*');
  return new RegExp(`^${escaped}$`);
}

function loadPriorityConfig() {
  const raw = fs.readFileSync(PATHS.semanticPriority, 'utf8');
  return JSON.parse(raw);
}

function matchesAny(filePath, patterns) {
  const normalized = filePath.replace(/\\/g, '/');
  return patterns.some((glob) => globToRegExp(glob).test(normalized));
}

export function getDocumentPriority(filePath) {
  const config = loadPriorityConfig();
  if (matchesAny(filePath, config.p0 ?? [])) return 'P0';
  if (matchesAny(filePath, config.p1 ?? [])) return 'P1';
  return 'P2';
}

export function listSemanticCandidates(repoRoot, { tiers = ['P0', 'P1'], force = false } = {}) {
  const candidates = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'graphify-out') {
          continue;
        }
        walk(full);
        continue;
      }
      if (!entry.name.endsWith('.md')) continue;
      const rel = path.relative(repoRoot, full).replace(/\\/g, '/');
      const tier = getDocumentPriority(rel);
      if (tier === 'P2' && !force) continue;
      if (!tiers.includes(tier) && !force) continue;
      candidates.push({ path: rel, tier });
    }
  };

  for (const root of ['', 'docs']) {
    const target = root ? path.join(repoRoot, root) : repoRoot;
    if (root === '') {
      for (const f of ['AGENTS.md', 'DESIGN.md', 'README.md']) {
        const full = path.join(repoRoot, f);
        if (fs.existsSync(full)) {
          const tier = getDocumentPriority(f);
          if (tiers.includes(tier) || force) candidates.push({ path: f, tier });
        }
      }
    } else {
      walk(target);
    }
  }

  return candidates.sort((a, b) => a.path.localeCompare(b.path));
}
