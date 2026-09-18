# 08 — CI/CD and Release Engineering

## 1. Change flow

Reviewed pull requests are the preferred production change path. Direct changes to main are exceptional and still require green CI and production evidence appropriate to risk.

Enable branch protection/required checks as team workflow matures.

## 2. Current CI gate

~~~text
npm ci
npm run check
~~~

Current `check` includes repository lint/type/test gates.

## 3. Target CI gate as phases land

~~~text
locked install
lint
strict typecheck
unit/application tests
real-PostgreSQL tests
migration bootstrap + upgrade
provider contract fixtures
assistant evaluation
render/browser/accessibility smoke
production build
container build
container/dependency/secret scan
docs/ADR link validation
~~~

Do not introduce a gate before the corresponding subsystem exists; once introduced, critical-path gates fail closed.

## 4. Artifact strategy

Build immutable application container images in CI.

~~~text
commit SHA
 -> CI
 -> image build/test/scan
 -> GHCR
 -> deploy exact SHA/digest
~~~

Do not compile a mutable Git checkout on the production VPS.

## 5. Database deployment

Use expand/contract:

~~~text
backup/recovery readiness
 -> expand migration
 -> deploy compatible code
 -> backfill
 -> verify
 -> later contract cleanup
~~~

Do not combine an irreversible destructive migration with an incompatible application release.

## 6. Production rollout

~~~text
staging
 -> migration test
 -> provider contract/smoke
 -> production pull
 -> explicit migration
 -> service rollout
 -> health/readiness
 -> synthetic channel checks
 -> observation hold
~~~

## 7. Feature flags

High-risk capabilities have independent kill switches:

- assistant auto-reply by intent;
- CRM sync;
- marketplace read API;
- marketplace write API;
- experimental model/knowledge version.

Authorization must not depend solely on a client-side flag.

## 8. Rollback

Application rollback is allowed only if current database schema remains compatible.

External provider writes are not undone by deploying old code. Use reconciliation/compensating actions.

## 9. Release record

Retain:

- commit/image digest;
- migrations;
- config schema and flag changes;
- CI result;
- assistant evaluation version where applicable;
- provider contract/smoke evidence;
- deployer/approver;
- observation metrics;
- outcome/rollback reference.
