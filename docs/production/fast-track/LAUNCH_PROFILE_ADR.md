# Catalog launch boundary

Decision: default PUBLIC_CATALOG_NO_SALES on https://yubiefood.com with hello@yubiefood.com. This supersedes active yubie.id first-party origin assumptions; historical evidence is retained. External social handles are not renamed without owner confirmation.

The static storefront exposes four families, nine variants, approved prices and discovery. Direct commerce, customer login/accounts, newsletter, waitlist and B2B collection forms are disabled in navigation, pages and HTTP adapters. Old commerce deep links show an unavailable message and noindex, including forged success query parameters. API paths return 503 FEATURE_DISABLED/no-store. The artifact needs no runtime API or database. Backend financial callbacks remain available for recovery; launch policy must not prevent recording a legitimate prior payment event.

MARKETPLACE_MSP requires approved listing records with exact product/SKU mappings, dated approval reference and allowlisted HTTPS destinations. An empty manifest fails the marketplace build. No official listings are currently approved in the manifest, so catalog is the candidate. DIRECT_COMMERCE_SANDBOX is explicit and separate; it does not enable real-money production.

Unapproved ingredient, preparation, producer and shelf-life specifications were removed from shared public product data, including client JavaScript. Commercial availability is not label approval. Emit and verify HTML, RSC, JS, robots, sitemap, CSP and artifact identity; do not infer acceptance from screenshot appearance alone.

Rollback: restore the approved preceding immutable deployment only if its scope is customer-safe. The presently observed preview is not an acceptable no-sales fallback. Otherwise retain Access/maintenance protection and disabled payment modes. Catalog requires no database migration.
