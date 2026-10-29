import { lstatSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import type { BrowserContext, TestInfo } from '@playwright/test';

export function redactPublicDiagnostic(value: string): string {
  return value.replace(/https?:\/\/[^\s"<>]+/g, '[URL]').replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[EMAIL]')
    // Discard the remainder of a sensitive line: schemes, quoted values and
    // multiple cookies can contain whitespace or separators inside the value.
    .replace(/\b(authorization|cookie|token|credential|secret|signature)["']?\s*[:=][^\r\n]*/ig, '$1=[REDACTED]')
    .replace(/[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g, '[JWT]')
    .replace(/\+?\d[\d ()-]{8,}\d/g, '[PHONE]').slice(0, 1400);
}
// Optional private diagnostics for anonymous public-storefront acceptance only.
export function observePublicSmoke(context: BrowserContext, info: TestInfo) {
  const root = process.env.YUBIE_P0_DIAGNOSTICS_ROOT;
  if (!root) return () => {};
  if (process.env.YUBIE_E2E_TIER !== 'production-smoke' || process.env.E2E_AUTH_STATE) throw new Error('Anonymous production smoke only');
  if (resolve(root) !== root) throw new Error('Absolute private diagnostics directory required');
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const directory = lstatSync(root);
  if (!directory.isDirectory() || directory.isSymbolicLink() || directory.mode & 0o077) throw new Error('Diagnostics directory must be private mode 0700');
  const scrub = redactPublicDiagnostic;
  const requests: unknown[] = [], errors: unknown[] = [], navigation: unknown[] = [], history: unknown[] = [];
  const timers: Array<ReturnType<typeof setInterval>> = [];
  const path = (raw: string) => { try { const u = new URL(raw); return { host: u.hostname, path: u.pathname.replace(/[A-Za-z0-9_-]{80,}/g, '[OPAQUE]') }; } catch { return { host: '', path: '' }; } };
  context.on('page', page => {
    page.on('pageerror', error => { if (errors.length < 20) errors.push({ kind: 'pageerror', name: error.name, message: scrub(error.message) }); });
    page.on('console', message => { if (message.type() === 'error' && errors.length < 20) errors.push({ kind: 'console', message: scrub(message.text()) }); });
    page.on('framenavigated', frame => { if (frame === page.mainFrame() && navigation.length < 15) navigation.push({ at: Date.now(), ...path(frame.url()) }); });
    page.on('requestfailed', request => { if (requests.length < 100) requests.push({ kind: 'failed', type: request.resourceType(), ...path(request.url()), error: scrub(request.failure()?.errorText || '') }); });
    page.on('response', response => {
      const type = response.request().resourceType();
      if (!['document', 'script', 'stylesheet', 'fetch'].includes(type) || requests.length >= 100) return;
      const headers = response.headers();
      requests.push({ kind: 'response', type, ...path(response.url()), status: response.status(), contentType: headers['content-type'], cache: headers['cf-cache-status'], age: headers.age, requestId: headers['x-request-id'], ray: headers['cf-ray'] });
    });
    let busy = false;
    const timer = setInterval(() => {
      if (busy || page.isClosed()) return;
      busy = true;
      void page.evaluate(() => {
        const elements = ['h1', '.product-detail-image', '.product-detail-image img', '.option-set button', '.b2b-hero', '.cart-page'];
        return { at: Date.now(), width: innerWidth, scrollWidth: document.documentElement.scrollWidth, elements: elements.map(selector => {
          const e = document.querySelector<HTMLElement>(selector); if (!e) return { selector, present: false };
          const s = getComputedStyle(e), r = e.getBoundingClientRect();
          return { selector, present: true, class: e.className, display: s.display, position: s.position, visibility: s.visibility, opacity: s.opacity, inline: { position: e.style.position, width: e.style.width, height: e.style.height, inset: e.style.inset }, box: { x: r.x, y: r.y, width: r.width, height: r.height } };
        }) };
      }).then(snapshot => { history.push(snapshot); if (history.length > 16) history.splice(1, 1); }).catch(() => {}).finally(() => { busy = false; });
    }, 150);
    timers.push(timer);
  });
  return () => {
    for (const timer of timers) clearInterval(timer);
    const id = createHash('sha256').update(info.titlePath.join('|') + info.project.name + info.repeatEachIndex).digest('hex').slice(0, 20);
    writeFileSync(`${root}/${id}.json`, JSON.stringify({ title: info.title, project: info.project.name, repeat: info.repeatEachIndex, status: info.status, assertion: info.errors.map(error => scrub(error.message || '')), requests, errors, navigation, history }, null, 2), { mode: 0o600 });
  };
}
