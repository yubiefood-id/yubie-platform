import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { PATHS, SCHEMA_VERSION } from './lib/paths.mjs';

function cacheKeyForPath(relPath) {
  return crypto.createHash('sha256').update(relPath).digest('hex');
}

function cacheFilePath(relPath) {
  return path.join(PATHS.semanticCache, `${cacheKeyForPath(relPath)}.json`);
}

export function contentSha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

export function resultHash(payload) {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function readCacheEntry(relPath) {
  const file = cacheFilePath(relPath);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

export function writeCacheEntry(relPath, entry) {
  fs.mkdirSync(PATHS.semanticCache, { recursive: true });
  const file = cacheFilePath(relPath);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(entry, null, 2)}\n`);
  fs.renameSync(tmp, file);
}

export function shouldSkipExtraction(relPath, content) {
  const sha = contentSha256(content);
  const cached = readCacheEntry(relPath);
  if (
    cached &&
    cached.content_sha256 === sha &&
    cached.extractor_schema_version === SCHEMA_VERSION &&
    cached.status === 'ok' &&
    cached.extraction
  ) {
    return { skip: true, cached, sha };
  }
  return { skip: false, cached, sha };
}

export function saveSuccessfulExtraction(relPath, content, extraction, meta) {
  const entry = {
    path: relPath,
    content_sha256: contentSha256(content),
    extractor_schema_version: SCHEMA_VERSION,
    cursor_model: meta.cursor_model ?? 'unknown',
    provider: meta.provider ?? 'none',
    last_semantic_indexed_at: new Date().toISOString(),
    result_hash: resultHash(extraction),
    status: 'ok',
    extraction,
  };
  writeCacheEntry(relPath, entry);
  return entry;
}

export function saveFailedExtraction(relPath, content, error, meta) {
  const entry = {
    path: relPath,
    content_sha256: contentSha256(content),
    extractor_schema_version: SCHEMA_VERSION,
    provider: meta.provider ?? 'none',
    last_semantic_indexed_at: new Date().toISOString(),
    status: 'failed',
    error: String(error),
  };
  writeCacheEntry(relPath, entry);
  return entry;
}

export function saveSkippedSecurity(relPath, content, reason) {
  const entry = {
    path: relPath,
    content_sha256: contentSha256(content),
    extractor_schema_version: SCHEMA_VERSION,
    provider: 'none',
    last_semantic_indexed_at: new Date().toISOString(),
    status: 'skipped_security',
    reason,
  };
  writeCacheEntry(relPath, entry);
  return entry;
}

export function loadAllCachedExtractions() {
  if (!fs.existsSync(PATHS.semanticCache)) return [];
  const results = [];
  for (const file of fs.readdirSync(PATHS.semanticCache)) {
    if (!file.endsWith('.json')) continue;
    try {
      const entry = JSON.parse(fs.readFileSync(path.join(PATHS.semanticCache, file), 'utf8'));
      if (entry.status === 'ok' && entry.extraction) {
        results.push(entry);
      }
    } catch {
      // ignore corrupt cache entries
    }
  }
  return results;
}
