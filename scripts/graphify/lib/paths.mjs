import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '../../..');

export const PATHS = {
  graphifyOut: path.join(REPO_ROOT, 'graphify-out'),
  astGraph: path.join(REPO_ROOT, 'graphify-out/graph.json'),
  semanticGraph: path.join(REPO_ROOT, 'graphify-out/semantic.json'),
  engineeringGraph: path.join(REPO_ROOT, 'graphify-out/engineering-graph.json'),
  graphifyDir: path.join(REPO_ROOT, '.graphify'),
  checkpoint: path.join(REPO_ROOT, '.graphify/checkpoint.json'),
  semanticCache: path.join(REPO_ROOT, '.graphify/semantic-cache'),
  semanticPriority: path.join(REPO_ROOT, '.graphify/semantic-priority.json'),
  updateLock: path.join(REPO_ROOT, '.graphify/update.lock'),
  watchPid: path.join(REPO_ROOT, '.graphify/watch.pid'),
  impactReport: path.join(REPO_ROOT, '.graphify/reports/latest-impact.md'),
};

export const SCHEMA_VERSION = '1';
