# Commerce V3 engineering acceptance

Tests use synthetic identities, addresses, positions and provider responses.
An isolated PostgreSQL test is real database evidence, not real provider evidence.
No OTP, Maps, carrier, payment or production delivery receipt has been fabricated.

| Axis | Evidence | Result |
| --- | --- | --- |
| R0 baseline | `npm ci`, `npm run check`, `npm run build`; CI39916788355 at cd62959 | PASS all five CI gates |
| PR A identity | CI39970968906 at 0e3efbbe4a9f90c6562ae387292d4747479dff7f | PASS quality, persistence, security, containers, browser |
| PR A focused PostgreSQL | Parallel/single-use proof, wrong/expired code, resend, uncertain send, lease fencing, account linking, session rotation, audit rollback, country revocation, pre-CAPTCHA budgets, disabled-provider retention | PASS thirteen final API/identity cases |
| PR B address domain | Phone normalization, ID-country address fields, explicit finite pin, cached metadata stripping | PASS three cases |
| PR B PostgreSQL/API | Cross-owner rejection, default concurrency, revocation, partial updates, pin expiry, remote-call budgets, immutable historical order address/money, receipt authorization, populated0017→0018 upgrade | PASS six focused cases |
| PR B proof/provider | Browser/point/expiry binding, forgery rejection; fixed/minimal Places requests, foreign/outage handling, response-field allowlist | PASS four focused cases; provider fetch is synthetic |
| PR B browser | Manual save, permission denial, late GPS/new editor, deferred map/latest point/stale reverse | PASS eight desktop/mobile Chromium cases; SDK/API interception only |
| Responsive/accessibility | Open editor widths320/375/768/1440; screenshot375; Axe on account flow | PASS in the focused browser matrix |
| PR B complete repository/DB gates | `npm run check`; full persistence and API suites after bootstrap/upgrade | PASS; persistence48/API50 before the additional upgrade case, which also passes locally |
| PR B CI | CI39995880748 at 6aabd810ce87a70c9225fd4df53696ca939676b8 | PASS all five gates |
| PR C promotion lifecycle | Real PostgreSQL claims, eligibility, server pricing, reservation/consumption/refund, concurrency, audit rollback, unknown outcomes | Focused tests pass; final full-suite receipt pending |
| PR C financial races | Accepted attach cancellation releases eligibility; completion before provider return; coordinated duplicate orphan callbacks | Reproduced failures before fixes, PostgreSQL regressions pass; synthetic PSP only |
| PR C API/browser | Durable preview identity/claim, forged proof/discount rejection, CSRF; nonblocking approved offer and inactive offer | Focused API and four desktop/mobile browser cases PASS; no provider receipt |
| PR C review | Separate specification and security review, including focused rereviews | Three blocking financial lifecycle/race findings fixed and cleared |
| V3 checkout, final candidate | Dependent PR D/E requirements | Not accepted by PR A/B/C evidence |
| Real SMSGate / Google / PSP | Protected infrastructure, approved identities, quota/billing and provider-specific staging receipts | BLOCKED_EXTERNAL |
| Production / named operator UAT | Exact artifact, operator acceptance, release authorization | NO-GO |

Reproduction from the implementation worktree:

```sh
npm run check
npm run test:e2e -- e2e/mock/address-book.spec.ts --project=desktop-chromium --project=mobile-chromium --workers=2
```

With an explicitly provisioned **disposable** `DATABASE_URL`:

```sh
npm run db:migrate
npm run db:seed
npm run test --workspace @yubie/persistence
npm run db:migrate
npm run test --workspace @yubie/api
```

Legacy upgrade fixtures deliberately leave their database on an older schema;
the second migration is required before downstream API tests. Never target a
customer database. The browser fixture uses synthetic public Maps settings and
intercepts the SDK; it does not authorize any real Google request.
