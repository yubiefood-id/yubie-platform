# Evidence boundaries

| Evidence | Result / scope |
|---|---|
| npm10.9.9 ci | PASS; lockfile reproducible, no dependency redesign |
| npm run test:catalog | Initial 8/8 PASS; emitted-JS, provenance and listing-policy regressions PASS after review fixes; final catalog suite contains 12 tests |
| Real local static Playwright, four browser projects | 176/176 PASS, zero flaky; artifacts/qa/2026-10-21T10-48-44-462Z/catalog. No route.fulfill API mocks; includes keyboard dialog coverage. |
| PostgreSQL17 isolated loopback database | 28/28 PASS, no skips; migrations0001–0014, 2/10/100 guest/auth races, last-unit race, commit/rollback, atomic webhook, FEFO and reader checks. Synthetic provider sessions, not provider-backed PSP acceptance. |
| npm run check with local DATABASE_URL | PASS before final review fixes; includes workspace lint/typechecks, secret/payment/release checks and all unit/integration suites. Final candidate rerun required. |
| Review | Standards: original 2 findings resolved; Spec: original 3 findings resolved. Both re-reviews report no new hard issue in catalog scope. |
| Mocked commerce and private Refine browsers | 180/180 PASS, zero flaky; artifacts/qa/2026-10-21T10-43-59-478Z/mock. Synthetic API/provider and staff fixtures; not staging acceptance. |
| Actual staging | BLOCKED_ACCESS; fresh HTTP302 to Cloudflare Access. No current credential/state; Google handshake not reverified. |
| Provider sandbox callbacks | NOT_VERIFIED_PROVIDER_BACKED; local simulations never count as provider acceptance |
| Production ERP / real operator UAT | NOT_PROVISIONED / NOT_RUN |
| Local native ERP | Pinned site installed, Frappe16.52.0 + ERPNext16.51.1. Six synthetic role logins PASS in actual browser; native procurement/receiving/invoice, BOM/work order/manufacture, QA inspection, released delivery and synthetic finance documents PASS. Not operator UAT or production security acceptance. |
| Email delivery | PENDING_OPERATOR_VERIFICATION; DNS alone is insufficient |

Accessibility automated evidence covers serious/critical WCAG2/2.1/2.2 AA findings with reduced motion so animated opacity does not corrupt contrast measurements. Normal-motion navigation is tested separately. Automated checks are not Legal or operator sign-off. Performance must be measured against the actual approved deployed artifact before release; no local timing is a production SLO receipt.
