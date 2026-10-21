# Reconciled baseline — 2026-10-21

PR #20 is merged in main d321c131d0fe2d9d6fc8b0e2e532b1d9c132dcd3. Its five CI jobs passed in run 39543478355. This implementation reuses its checkout idempotency, webhook verification, PostgreSQL invariants, staff Refine BFF and release tooling. Source changes are on fix/catalog-msp. Uploaded plans remain unchanged.

Read-only production inspection of https://yubiefood.com found the older preview with obsolete yubie.id canonicals and direct commerce navigation. robots.txt and sitemap.xml returned 404; HSTS was present, CSP/nosniff absent. Actual mobile Chromium observed Flour PDP overflow. These observations describe the existing deployment, not the corrected local candidate. No production deployment or DNS change occurred.

Fresh staging probe returned HTTP 302 to Cloudflare Access. The earlier real browser reached the Access login, not Yubie. Neither current Access credentials nor approved browser state was available. The user's previous Google Login success is acknowledged but not reverified. An Access login response is never application acceptance.

Production ERPNext is NOT_PROVISIONED until its isolated URL/version and actual access are verified. The newly installed loopback-only local site is synthetic engineering evidence, not production infrastructure or operator acceptance.
