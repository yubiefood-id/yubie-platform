# Release blocker register

Decision: NO-GO, 2026-10-21. Beads epic `yubie-fnf` owns work state. Source fixes below remain unverified on the intended deployed artifact until staging access/deployment is restored.

| ID / severity | Reproduction / observed result | Resolution or next action | Owner |
|---|---|---|---|
| R01 P0 | Staging `/healthz` returns aa00c53 while main is fabb8c2; initial browser preflight reported BLOCKED_RELEASE_DRIFT. Final Playwright API transport resets with ECONNRESET; independent read-only fetch still confirms the same drift. | Publish reviewed RC and verify all image/Worker identities. | SRE |
| R02 P1 | Navigate staging storefront; origin becomes Cloudflare Access. Strict verified SSH alias refuses authentication. Final Playwright API health also encounters ECONNRESET while native fetch returns200. | Provide scoped Access state/service identity and audited deploy-user access or operator-generated receipts; never bypass Access. | Infrastructure operator |
| R03 P0 | Sandbox environment secret-name listing empty; no written responses to six contract questions. | Provision fresh secret-store pair, isolated callback/database, approved test method/window and provider contract; execute PAY matrix. | Finance/provider/operator |
| R04 P1 | Production GET `/api/auth/session`, `/api/checkout/session`, `/robots.txt`, `/sitemap.xml` gives404. Existing deployment serves static export. | Deploy reviewed Cloudflare Worker only under authorized cutover; retest dynamic endpoints, cookies, SEO and parity. | Web/SRE |
| R05 P1 | Chromium production homepage/Flour at320px overflows. | Focused CSS fixes pass locally; production retest pending deployment. | Web/QA |
| R06 P0 | Late verified capture after expiry previously dropped; distinct second capture not surfaced. Concurrent pending callback could overwrite a prior transition. | Serialized callback processing and durable payment.exception audit/outbox + queue/metric added; PG regression includes rollback/redelivery/concurrent replay. Deployed proof pending. | Payments |
| R07 P0 | Same exact signed callback hash after initially unavailable authoritative lookup was deduped despite later success. | Processing hash now includes authoritative outcome even when HTTP supplies raw-body hash. Real PG red test then green. | Payments |
| R08 P1 | Ambiguous checkout then reload minted a new attempt key; failed bootstrap could submit. HTTP500/PSP409 were not conservatively retained. | Session-storage opaque UUID+fingerprint, bootstrap gate and ambiguous classification regressions added. No PII persisted; deployed proof pending. | Commerce |
| R09 P1 | Proxy dropped no-store; production SEO origin wrong. Login `next=//host` allowed external navigation. | Preserve no-store, canonical domain/robots rules and same-origin return-path validator; regression coverage added. | Web/Security |
| R10 P1 | Playwright `route.continue` header overrides follow cross-origin302. Two-origin Chromium test leaked a synthetic Access secret. | Single-hop API fetch with maxRedirects0 + browser fulfill; regression confirms target receives no injected secret. No real credential used in reproduction. | QA/Security |
| R11 P1 | Staff console not deployed. | Local Refine/BFF exists with real readers, role removal, revocation and audit. Approve staff OAuth subjects/roles, private host/Access, migration0014 and digest. CRM/support summaries, trends/export and approved reconciliation actions remain NOT_IMPLEMENTED. | Admin/Security |
| R12 P1 | No approved isolated ERP host or native ERP fixture set. | Review pinned upstream/overrides, capacity/cost and backup plan; provision elsewhere, approve COA/BOM/UOM/tax and execute native operations matrix. | Operations/Finance |
| R13 P1 | No Zammad/WhatsApp staging credentials or real fulfillment/returns evidence. | Provision test channel/users, named escalation and fulfillment owners, then run full journey/outage/replay. | CS/Operations |
| R14 P0 | iPaymu refunds/partial refunds/settlement and production-capable adapter unsupported/unaccepted. | Provider/Finance must approve implementation and acceptance; never simulate a refund or enable LIVE. | Finance/Payments |
| R15 P0 | No signed product/legal evidence or exact release authorization. | SKU-specific regulatory/claims review, legal policies, channel ADR and G10 manifest approval. | Legal/Product/Release owner |
| R16 P1 | No current off-host encrypted backup/restore, real alert delivery, payment drain or rollback receipts. | Operator performs controlled drill and records RPO/RTO, checksums, recovered pending attempts and actual on-call notification. | SRE/Finance |
| R17 P1 | Newsletter503 silently left user without result. | Visible failure preserves fields/consent and allows retry; Chromium regression passed. B2B transport-abort feedback now has regression coverage and preserves enquiry/consent. The unused product-waitlist form still needs failure-UX coverage before reactivation. | Web/QA |

| R18 P1 | Fresh image built/scanned but startup failed with missing @yubie/config/dist. API/worker shared the omitted build step. | Build runtime dependency explicitly; add credential-free import smoke to CI/RC and retest final images. | Engineering/SRE |

Provider answers required: SessionID cancellation; lookup by reference/session; duplicate reference behavior; transaction-ID recovery after accepted-create timeout; callback timestamp authentication/skew; exact JSON/form signature normalization. No guessed contract closes R03/R14.

No production active attack, destructive migration, real-money operation, ERP stock write or external support message was performed. Do not put credentials or customer/provider payloads into this register.

Dependency scan: Vite8.0.16 failed with a newly published HIGH advisory. Upgraded to8.1.6 without vulnerability ignores; lock regenerated with the container npm10.9.9 to include required optional WASM peers. Final scan/build receipts determine closure.
