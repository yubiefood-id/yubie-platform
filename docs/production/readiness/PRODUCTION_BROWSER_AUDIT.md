# Production read-only browser audit

Observed 2026-10-21 Asia/Bangkok. Actual URL `https://yubiefood.com`; `www` redirects to apex. No business POST, order, provider call or support message was performed. Cart interactions affected disposable local browser storage only. No active production security scan was run.

Actual Chromium selected-suite result: **31 pass,3 fail,0 blocked**. Sanitized evidence: `artifacts/qa/2026-10-20T21-05-15-385Z/production-smoke/report.json`. Passing selected routes/variants/automated accessibility do not establish complete platform acceptance or identify the deployed artifact cryptographically.

| Finding | Evidence / implication | Current source |
|---|---|---|
| Static runtime | Homepage/PDPs200; session/auth/checkout and robots/sitemap404. Vercel project serves `apps/web/dist/client`. | Dynamic endpoints already exist in source; deploy reviewed Cloudflare Worker under authorized cutover. Do not duplicate checkout/session route. |
| Narrow layout | Homepage/Flour320px overflow failed. | Focused grid shrink rules added; Firefox/WebKit additionally revealed support-card overflow, now under regression. Production retest pending. |
| SEO origin | Existing metadata points at an obsolete domain; static export omits dynamic metadata handlers. | Approved apex canonical/sitemap + non-production robots disallow added; local Worker tests only. |
| Security headers | HSTS observed; CSP not independently observed on production response. | Admin has CSP/frame restrictions; complete storefront edge/header policy remains a staging/security release gate. |

Real staging preflight: **0 pass,0 failed,2 blocked**, Access and release drift. Final receipt: `artifacts/qa/2026-10-21T02-31-17-919Z/staging/report.json`. One intervening attempt also had an unclassified API transport failure; the explicit network classification was added and the final retest reported Access + BLOCKED_NETWORK. A separate Playwright API diagnostic identified read ECONNRESET; a separate native read-only fetch returned200/aa00c53/preview, independently confirming release drift. Actual staging readiness says connected DB + preview; API SHA aa00c53 differs from reviewed main. No screenshots containing authenticated/customer content were captured. Remote traces/screenshots are disabled by policy; sanitized network/header assertions are retained.

Local four-browser expansion initially produced165pass/7fail; the failures exposed Firefox homepage color contrast, Firefox/WebKit320px support-card overflow, two WebKit promo-dialog races and a WebKit axe page-closed result. Diagnosed CSS/contrast and interaction fixes passed the final four-browser matrix: **176pass/0fail/0blocked/0skipped/0retries**, `artifacts/qa/2026-10-21T02-29-35-258Z/mock/report.json`; initial failures remain evidence and are not hidden with retries/skips. See final verification receipt for latest outcome.

No real customer Google login, account data, provider hosted payment, staging admin, ERPNext or Zammad/WhatsApp acceptance is claimed. Performance, full manual keyboard/screen-reader review and staging ASVS/DAST require the deployed isolated environment. Product/legal claims need signed SKU evidence independently of browser rendering.
