# Executed test inventory and environment boundaries

2026-10-21. Final run counts belong in `VERIFICATION_RECEIPT.json` and the sanitized browser reports. Tests receive no real customer or payment credentials in local CI. Missing external acceptance is not PASS.

| Suite / source | Assertions | Environment |
|---|---|---|
| `e2e/commerce.spec.ts` | Preview guest cart/checkout, unconfigured login, bootstrap failure prevents POST, abort/reload retains key without stored PII, axe homepage/catalog | MOCK_LOCAL |
| `e2e/journeys/storefront.ts` |13 public routes200/h1/no pageerror/no page overflow; nine literal price/variant selections persist through cart refresh; axe8 routes;320/768 reduced-motion layout; robots/sitemap404 semantics | MOCK_LOCAL, STAGING_REAL, PROD_READ_ONLY (same journeys; adapters differ) |
| `e2e/mock/forms.spec.ts` | Newsletter503 + retry preserves input/consent; B2B network abort gives visible failure and preserves enquiry | MOCK_LOCAL |
| `e2e/mock/admin.spec.ts` | Refine viewer pagination/search/server403, Finance exceptions/quarantine/write denial, axe/logout, backend503 honestly unavailable | MOCK_LOCAL; synthetic signed staff identities and real BFF policy |
| `scripts/browser-tests/access-routing.test.mjs` | Two-origin real Chromium302: synthetic Access secret reaches approved origin only | LOCAL_BROWSER_SECURITY, no provider secrets |
| `e2e/remote/preflight.spec.ts` | Actual app origin through Access, API exact SHA, real DB readiness + expected preview/sandbox mode | STAGING_REAL / isolated sandbox; no intercepts |
| `e2e/staging/storefront.spec.ts` | Shared journeys plus real session endpoint200/JSON/no-store/request correlation | STAGING_REAL; currently blocked at preflight |
| `e2e/production-smoke/storefront.spec.ts` | Shared public journeys and actual endpoint metadata; cart changes only isolated browser storage | PROD_READ_ONLY; browser aborts all non-GET/HEAD/OPTIONS requests |
| `e2e/sandbox/financial-gate.spec.ts` | Mandatory provider acceptance block; public-page success cannot imply financial acceptance | PSP_SANDBOX_REAL gate; BLOCKED_PROVIDER_ACCEPTANCE until contract-backed matrix implemented/evidenced |
| `scripts/ipaymu-sandbox-probe.mjs` (existing) | Exact signed sandbox create, official redirect host and safe bounded receipt | PSP_SANDBOX_REAL; NOT_RUN; CREATE_SESSION_PASS at most |
| Application/integration/API suites | Controlled provider failures, callback validation/ownership, amount and signature invariants | LOCAL_CONTRACT; provider doubles |
| Persistence + ops PG suites | Real unique constraints/locks, guest/auth2/10/100 concurrency, final-stock race, rollback/recovery, late/second-charge exception queue and metric, admin read-only queries/logout revocation, fresh/upgrade migration | REAL_LOCAL_POSTGRES, synthetic data/provider doubles |
| Web built-worker tests | Real local HTTP upstream proxy cookies/cache control, canonical metadata/robots and rendered HTTP pages | LOCAL_ARTIFACT, not deployed Worker |

Browsers: desktop Chromium1440×900, Pixel7 Chromium, desktop Firefox, iPhone13 WebKit. Remote uses one worker/no retries. Mock CI uses all four; local default uses two Chromium projects unless `E2E_BROWSER_MATRIX=full`. A retry marks the report flaky; it does not erase initial instability.

## Reproduction

```bash
npm ci
npm run check
npm run build
npm run test:e2e:install
node --test scripts/browser-tests/*.test.mjs
E2E_BROWSER_MATRIX=full npm run test:e2e -- --workers=4
# Supply only a disposable local PostgreSQL URL through the environment:
npm run test --workspace @yubie/persistence
npm run test --workspace @yubie/api
# Remote: explicit reviewed SHA, HTTPS origins and private approved state:
YUBIE_E2E_TIER=staging EXPECTED_RELEASE_SHA=<40-hex> npm run test:e2e
YUBIE_E2E_TIER=production-smoke npm run test:e2e
```

Set `DATABASE_URL` only for the dedicated disposable database. Never run reset/concurrency suites on shared staging. Remote auth state must be under ignored `playwright/.auth/` with0600 mode. Access service credentials are injected only in a single-hop request; redirects use the browser's original headers. Remote reports omit error bodies/DOM/headers/URLs with tokens and disable raw screenshots/traces. Sanitized JSON/JUnit/HTML are stored under ignored private `artifacts/qa/<UTC>/<tier>/` and uploaded by the protected manual workflow. Synthetic local traces are local diagnostics only. Git SHA plus dirty-tree flag prevents an uncommitted run being mistaken for an immutable release.

Remote Actions require current reviewed main with all five latest CI jobs green, protected environment review and no localhost fallback. Sandbox additionally requires separate host/API origins, sandbox mode, written provider-contract reference and current approved window ≤4h. No sandbox create is performed by public journeys. The existing protected provider probe and full PAY matrix remain distinct.

## Evidence limits

Automated axe covers serious/critical WCAG2/2.1/2.2 failures in selected pages, not complete manual accessibility certification. Reduced-motion/layout assertions are not a device lab or performance budget proof. Live Google login with two customer identities, account/order ownership, actual staging order persistence, admin staff roles, ERP-native workflows, support messages, fulfillment, performance/load and scoped DAST still need isolated deployment/fixtures/identities. Readiness is NO-GO until those mandatory results and human sign-offs exist.
