#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execSync } from 'node:child_process';
import { PATHS, REPO_ROOT } from './lib/paths.mjs';
import { markSemanticDirty } from './checkpoint.mjs';
import { getDocumentPriority } from './semantic-priority.mjs';

const CODE_DEBOUNCE_MS = 2000;
const SEMANTIC_DEBOUNCE_MS = 30_000;
const WATCH_ROOTS = ['apps', 'packages', 'infrastructure', 'docs'];

let codeTimer = null;
let semanticTimer = null;
const pendingSemantic = new Set();

function isRunning() {
  if (!fs.existsSync(PATHS.watchPid)) return false;
  try {
    const pid = Number(fs.readFileSync(PATHS.watchPid, 'utf8').trim().split('\n')[0]);
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function writePid() {
  fs.mkdirSync(PATHS.graphifyDir, { recursive: true });
  fs.writeFileSync(PATHS.watchPid, `${process.pid}\n${Date.now()}\n`);
}

function clearPid() {
  try {
    fs.unlinkSync(PATHS.watchPid);
  } catch {
    // ignore
  }
}

function rotateLog() {
  const logFile = path.join(PATHS.graphifyDir, 'logs/watch.log');
  if (!fs.existsSync(logFile)) return;
  if (fs.statSync(logFile).size < 1_000_000) return;
  const rotated = `${logFile}.1`;
  if (fs.existsSync(rotated)) fs.unlinkSync(rotated);
  fs.renameSync(logFile, rotated);
}

function log(msg) {
  fs.mkdirSync(path.join(PATHS.graphifyDir, 'logs'), { recursive: true });
  rotateLog();
  const line = `${new Date().toISOString()} ${msg}\n`;
  fs.appendFileSync(path.join(PATHS.graphifyDir, 'logs/watch.log'), line);
}

function scheduleAstUpdate() {
  if (codeTimer) clearTimeout(codeTimer);
  codeTimer = setTimeout(() => {
    log('AST incremental update triggered');
    try {
      execSync('bash scripts/graphify/update.sh --ast-only', { cwd: REPO_ROOT, stdio: 'pipe' });
    } catch (err) {
      log(`AST update failed: ${err.message}`);
    }
  }, CODE_DEBOUNCE_MS);
}

function scheduleSemanticMark(relPath) {
  pendingSemantic.add(relPath);
  if (semanticTimer) clearTimeout(semanticTimer);
  semanticTimer = setTimeout(() => {
    const files = [...pendingSemantic];
    pendingSemantic.clear();
    log(`Marking semantic dirty: ${files.join(', ')}`);
    markSemanticDirty(files);
  }, SEMANTIC_DEBOUNCE_MS);
}

function handleFile(relPath) {
  if (relPath.includes('node_modules') || relPath.includes('graphify-out') || relPath.includes('.graphify/')) {
    return;
  }
  if (relPath.endsWith('.md')) {
    const tier = getDocumentPriority(relPath);
    if (tier === 'P0' || tier === 'P1') {
      scheduleSemanticMark(relPath);
    }
    return;
  }
  if (/\.(ts|tsx|js|mjs|json|yml|yaml|sql|sh)$/.test(relPath)) {
    scheduleAstUpdate();
  }
}

function watchDir(relRoot) {
  const abs = path.join(REPO_ROOT, relRoot);
  if (!fs.existsSync(abs)) return;
  fs.watch(abs, { recursive: true }, (_event, filename) => {
    if (!filename) return;
    handleFile(path.join(relRoot, filename).replace(/\\/g, '/'));
  });
}

function main() {
  if (isRunning()) {
    console.log('[graphify] watcher already running');
    process.exit(0);
  }
  writePid();
  log('watcher started');
  for (const root of WATCH_ROOTS) watchDir(root);
  for (const f of ['AGENTS.md', 'DESIGN.md', 'README.md']) {
    const abs = path.join(REPO_ROOT, f);
    if (fs.existsSync(abs)) {
      fs.watch(abs, () => handleFile(f));
    }
  }
  process.on('SIGINT', () => {
    log('watcher stopped');
    clearPid();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    log('watcher stopped');
    clearPid();
    process.exit(0);
  });
  console.log('[graphify] watching engineering paths (Ctrl+C to stop)');
}

import { fileURLToPath } from 'node:url';
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
