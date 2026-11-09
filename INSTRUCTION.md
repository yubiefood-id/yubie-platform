# INSTRUCTION.md — Agent delivery loop

Use this short procedure for every Yubie platform change.

## Choices → Plan → Workflow

1. **Orient:** read [AGENTS.md](AGENTS.md), [SOUL.md](SOUL.md), and the relevant ADR in `docs/production/`. Inspect the current branch, code, tests, and product authority before making claims about what is live.
2. **Choose:** define the user outcome, smallest viable diff, affected boundaries, acceptance checks, risks, and rollback. For broad architecture work, consult `npm run graph:context` before duplicating audits.
3. **Implement:** change one concern at a time. Respect `apps/*` and `packages/*` ownership in AGENTS.md. Do not introduce provider-specific state into the domain or UI.
4. **Protect:** never commit secrets or customer PII. Do not enable payment admission, override human handoff, change verified food claims, or run production mutations without explicit approval and release evidence.
5. **Validate:** run focused tests, then `npm ci` and `npm run check`; run `npm run build` for application changes. For docs-only edits, inspect Markdown links and the PR diff; rely on GitHub CI for full execution evidence. Report skipped checks honestly.
6. **Deliver:** commit to a scoped branch, open a PR to `main`, and preserve the required `quality`, `persistence`, `security`, `browser`, and `containers` gates. Do not force-push or bypass branch protection. Merge only when GitHub permits it.
7. **Verify:** confirm the merged commit on `main`. State exactly what changed, checks passed or pending, and any remaining blockers.

## Sources of authority

- Product/claims: approved, product-specific records; see `docs/production/01_PRODUCT_TRUTH_AND_FOOD_COMPLIANCE.md`.
- Commerce: `docs/production/ADR-013_IPAYMU_DIRECT_COMMERCE.md`; new payment admission stays gated.
- Support: `docs/production/ADR-009_ZAMMAD_SUPPORT_AUTHORITY.md`; Zammad is the support authority.
- Current catalog variants: `packages/domain/src/product-discovery.ts`.
- UI: [DESIGN.md](DESIGN.md).

If a document, implementation, or provider state disagrees, surface the discrepancy instead of guessing or silently changing production policy.
