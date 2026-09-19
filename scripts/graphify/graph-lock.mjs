import fs from 'node:fs';
import { PATHS } from './lib/paths.mjs';

const STALE_MS = 5 * 60 * 1000;
const WAIT_MS = 30_000;
const POLL_MS = 200;

function isStaleLock() {
  if (!fs.existsSync(PATHS.updateLock)) return false;
  const stat = fs.statSync(PATHS.updateLock);
  return Date.now() - stat.mtimeMs > STALE_MS;
}

function tryAcquireLock() {
  if (isStaleLock()) {
    try {
      fs.unlinkSync(PATHS.updateLock);
    } catch {
      // ignore
    }
  }
  try {
    const fd = fs.openSync(PATHS.updateLock, 'wx');
    fs.writeFileSync(fd, `${process.pid}\n${Date.now()}\n`);
    fs.closeSync(fd);
    return true;
  } catch {
    return false;
  }
}

function releaseLock() {
  try {
    if (fs.existsSync(PATHS.updateLock)) fs.unlinkSync(PATHS.updateLock);
  } catch {
    // ignore
  }
}

export async function withGraphLock(fn, { waitMs = WAIT_MS } = {}) {
  fs.mkdirSync(PATHS.graphifyDir, { recursive: true });
  const start = Date.now();
  while (!tryAcquireLock()) {
    if (Date.now() - start > waitMs) {
      return { skipped: true, reason: 'lock_timeout' };
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  try {
    const result = await fn();
    return { skipped: false, result };
  } finally {
    releaseLock();
  }
}

export function withGraphLockSync(fn, { waitMs = WAIT_MS } = {}) {
  fs.mkdirSync(PATHS.graphifyDir, { recursive: true });
  const start = Date.now();
  while (!tryAcquireLock()) {
    if (Date.now() - start > waitMs) {
      return { skipped: true, reason: 'lock_timeout' };
    }
    const end = Date.now() + POLL_MS;
    while (Date.now() < end) {
      // busy-wait slice for sync lock acquisition
    }
  }
  try {
    const result = fn();
    return { skipped: false, result };
  } finally {
    releaseLock();
  }
}
