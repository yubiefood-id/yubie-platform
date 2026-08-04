# 08 — CI/CD and Release Engineering

## 1. Protected change flow

All changes use reviewed pull requests. Default branch protection requires current CI, resolved review comments and no direct force push. CODEOWNERS cover commerce/payment/inventory, product-truth, security/privacy, infrastructure and migrations.

## 2. CI gates

1. locked dependency install;
2. formatting/lint and strict typecheck;
3. unit, contract, integration and rendered-route tests;
4. production build and artifact validation;
5. migration lint/fresh install/upgrade tests;
6. dependency, secret and source security scans;
7. license/policy check as dependencies grow;
8. generated API/schema drift check;
9. accessibility and critical browser flow smoke tests.

Critical paths fail closed. Flaky tests are defects with owner/expiry, not silently retried forever.

## 3. Deployment

- Build once, promote the same immutable artifact and configuration schema.
- Environment configuration is validated before startup.
- Database expand migration precedes compatible app deployment; contract cleanup occurs in a later release.
- Progressive rollout: internal/synthetic → small traffic/customer cohort → wider rollout → full.
- Observe predefined metrics and business invariants during each hold period.

## 4. Rollback vs roll-forward

Application rollback is allowed only when compatible with current schema and provider events. Database rollback is exceptional; prefer forward fixes and compensating actions. Payment, inventory and financial events are not erased by deploying older code.

Every high-risk PR states: migration compatibility, feature flag, rollout increments, success/abort metrics, recovery action and owner.

## 5. Feature flags

Use flags for risky capability exposure, provider switch, checkout rollout and operator workflow—not permanent branching. Flags have owner, default, environments, cohort rule, created/expiry dates, kill-switch behavior and cleanup task. Authorization cannot depend solely on a client-visible flag.

## 6. Release record

Commit/artifact digest, release notes, migrations, configuration changes, approvers, checks, rollout events, dashboards, incident references and final outcome. Product/claim/label releases additionally carry food/regulatory approval evidence.
