# Review notes and rollback

Standards and specification reviews were performed separately against baseline main `fabb8c2b0b7a495867372b89d60a2af547de69cd` and the working diff. The Graphify engineering context was queried first; it reported code fresh, semantic dirty/stale. Beads is the task tracker.

## Standards axis

One confirmed hard finding: Playwright request-header overrides cross redirect boundaries. Two-origin Chromium reproduction with a synthetic secret failed before the fix and passed after single-hop `route.fetch(maxRedirects:0)` + fulfill. No real secret was used. A suggested policy deduplication for financial exception reasons remains a maintainability consideration; explicit `checks:read` permission was added to the remote workflow gate.

## Specification axis

One additional financial defect: raw callback hash uniqueness could drop a newly authoritative outcome. Real PostgreSQL same-hash unavailable→success regression failed before the fix and passed after processing identity included the authoritative result. No guessed provider contract was introduced.

The review also identified partial implementation: sandbox storefront checks are not provider acceptance; a separate mandatory blocking financial project now prevents a false green. Staff CRM/support summaries, trends/export and approved reconciliation controls remain NOT_IMPLEMENTED and are release blockers, separately from missing live staff credentials/deployment. Both reviews found the Access redirect issue; it is one shared defect, not two separate fixes.

## Scope and rollback

Payment exception changes preserve terminal business/stock state and first successful charge identity. Roll back application only after draining/holding new sessions and reconciling in-flight payments; preserve new exception audit/outbox and all callback data. Do not restore a database over active payments. Actual exception delivery and alerting remain operational gates.

Migration0014 is expand-only: staff session token hashes + expiry index. Review lock behavior and backup/restore before remote application; retain table on application rollback. No remote migration was executed. Admin is opt-in with separate staff identity/Access and no financial/stock writes. Removing it is an application rollback, not a schema drop. ERP config is prepared for a separate approved host; no shared infrastructure or stock authority is changed.

Storefront CSS/metadata/proxy/session changes are reversible by application rollback. Keep the same-origin checkout proxy and guest binding intact. Vite is updated to8.1.6 following a fresh vulnerability-scan failure, with rebuild/browser rerun required. The upstream [Vite advisory](https://github.com/vitejs/vite/security/advisories/GHSA-rq7h-c2jc-7f22) lists8.1.6 among patched versions for its filesystem boundary issue; the local scanner also reported CVE-2026-112942 against8.0.16. Final scanner results determine closure; no vulnerability ignore was added.

No product claims, SKU safety facts, production payment credentials, support policy or legal approvals were invented. Readiness documents are evidence and explicit limits; G0–G10 remain NO-GO.

Follow-up standards review independently reran the two-origin browser regression and reported no introduced correctness blocker in its scope. Specification follow-up found the callback hash/redirect fixes correct and the NO-GO limits accurately stated; it did not independently rerun financial tests. Later artifact smoke found omitted config compilation in admin/API/worker; Dockerfiles now build it and CI/RC import the runtime dependency graph before scan/publication. Final artifact results must be recorded separately from the earlier image build.
