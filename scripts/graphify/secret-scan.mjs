import path from 'node:path';

const DENY_PATH_PATTERNS = [
  /^\.env/i,
  /\.pem$/i,
  /credentials/i,
  /secret/i,
  /private[_-]?key/i,
  /\.key$/i,
];

const DENY_CONTENT_PATTERNS = [
  /BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY/i,
  /AKIA[0-9A-Z]{16}/,
  /sk-[a-zA-Z0-9]{20,}/,
  /ghp_[a-zA-Z0-9]{36,}/,
  /xox[baprs]-[a-zA-Z0-9-]+/,
  /Bearer\s+[a-zA-Z0-9._-]{20,}/i,
];

export function isDeniedPath(filePath) {
  const base = path.basename(filePath);
  return DENY_PATH_PATTERNS.some((re) => re.test(base) || re.test(filePath));
}

export function scanContentForSecrets(content) {
  for (const re of DENY_CONTENT_PATTERNS) {
    if (re.test(content)) {
      return { denied: true, reason: `matched pattern: ${re}` };
    }
  }
  return { denied: false };
}

export function shouldSkipSemantic(filePath, content) {
  if (isDeniedPath(filePath)) {
    return { skip: true, status: 'skipped_security', reason: 'denied path' };
  }
  const contentScan = scanContentForSecrets(content);
  if (contentScan.denied) {
    return { skip: true, status: 'skipped_security', reason: contentScan.reason };
  }
  return { skip: false };
}
