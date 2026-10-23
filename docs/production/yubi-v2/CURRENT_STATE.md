# Yubi V2 current state

Read-only baseline observed 2026-10-22. Engineering implementation and release
acceptance are separate. No production configuration was changed.

| Axis | Evidence | Verdict |
| --- | --- | --- |
| Main | Local and remote `2563d8af616043047fba065600eb8b995764267e` | VERIFIED |
| CI | Run `39644015374`: quality, persistence, security, browser, containers | PASS (baseline) |
| Local assistant | 25 tests, no failures or skips | PASS (baseline V1) |
| Production website | Vercel `dpl_9GSJiRbcwEgMmMJutiNRv4YuNcQs`, domain yubiefood.com, source `fabb8c2b0b7a495867372b89d60a2af547de69cd` | Older deployment |
| Website identity | Public `/release-manifest.json` returned 404 | Acceptance absent |
| PDPs | All four `/products/yubie-{flour,shake,ppang,mie}` returned 200 | Route reachability only |
| Account | `/account/orders` returned 200 | Authentication/order capability NOT_ACCEPTED |
| API staging | `/healthz` reported `aa00c53fe543f385eff4237ceeb1a27fdc878fd4` | Source drift |
| Zammad | Source pin 7.1.3 / ghcr image digest in lock; actual instance unverified; example staging hostname ENOTFOUND | BLOCKED_EXTERNAL |
| Meta/WhatsApp | No approved channel, test identity/window or recipient receipt available | BLOCKED_EXTERNAL |
| Product photos | Four existing catalog assets describe concepts/studies; only final photographs qualify | BLOCKED_EXTERNAL |
| Operator UAT / backup / alerts | No accepted receipts for this candidate | BLOCKED_EXTERNAL |

V1 has text-only effects, marketplace-specific navigation, unsupported checkout
copy, content-based outbox dedupe, and separate state/outbox commits. Human-active
pre-routing currently swallows food-safety classification. These are engineering
gaps; HTTP success or mocks cannot close live acceptance.

User decisions: safe V1 navigation reset on the next eligible turn; retain human
ownership. Emergency OFF suppresses customer messages but allows internal safety
escalation. Stop remaining effects on takeover; already-dispatched requests are
reconciled. Use final approved product photos only.

The dirty main checkout (favicon and prompt attachments) and ERP worktree are
preserved. Work occurs on feat/yubi-v2 in a dedicated persistent worktree.

Initial verdict: Yubi production NO-GO; website transactional commerce separately
NO-GO. PUBLIC_CATALOG_NO_SALES and payment disabled remain unchanged.

## Engineering delta

The dedicated implementation adds an opt-in deterministic-v2 flow, server catalog
and immutable photo resolver, native Zammad image article support, capability-aware
website navigation, atomic durable turns and ordered/reconciled outbound effects.
V1 remains the default until an audited version selection. Human ownership is
separate from navigation; closure does not release it. OFF still routes internal
food-safety reports without customer replies. PostgreSQL outage returns 503 before
acknowledgment; queue restart and replay are covered with real local pg-boss.

All existing catalog illustrations fail the final-photograph requirement, so the
approved photo manifest is empty. Honest text fallback is implemented. This does
not meet R2 or real image delivery acceptance. No live deployment, product/media
approval or operator acceptance occurred. See TEST_AND_ACCEPTANCE.md and the
candidate RELEASE_RECEIPT.json for scoped test and release status.
