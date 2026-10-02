# Product Truth Source Freeze — Frontend Revision (M5-D → commerce UX revision)

Status: **ACTIVE — partially frozen**. This document records which product facts
the storefront may render, which source each fact comes from, and which facts
remain blocked pending a business decision or document ingestion.

It operationalizes [ADR-003_PRODUCT_TRUTH_GATE.md](ADR-003_PRODUCT_TRUTH_GATE.md)
for the current frontend revision. Software deployment alone can never make a
SKU sellable or a claim publishable.

## Canonical sources

| Source | Status in repo | Role |
|---|---|---|
| `Eny Palupi_Action Plan dan RAB.xlsx - Informasi dalam kemasan.pdf` | **ABSENT — not committed** (lives outside the repo) | User-declared canonical source for product-facing information: four families (Flour, Shake, Ppang, **Mie**), pack sizes, prices, packaging wording |
| `20 story Yubie.docx` | **ABSENT — not committed** | Canonical brand story for the Our Roots long-form chapters |
| `packages/domain/src/product-discovery.ts` | Present | Current code-side catalog (was 3 families before this revision) |

**Rule applied:** where the Eny Palupi file and code conflict, the Eny Palupi
file wins — but only once its values are actually ingested. Until then, no
conflicting value is silently promoted to customer-facing copy.

## Conflict matrix and resolution state

| # | Current value (code) | Canonical value | Resolution |
|---|---|---|---|
| 1 | 3 families; homepage copy "One root family. Three formats." | 4 families incl. Yubie Mie | **DONE (gated):** Mie added to the domain catalog as `coming-soon` + `verificationStatus: "required"` with no sizes, no offering, and no invented facts. Homepage copy updated to "Four formats." AGENTS.md §1 still lists three families — owner must update the governance doc (see Blockers). |
| 2 | Yubie Flour sizes 250 g Rp15.000 / 500 g Rp28.000 / 1 kg Rp52.000, `verificationStatus: "verified"` | TBD from Eny Palupi file | **PENDING VERIFICATION (B2).** Values are repo-verified product truth and remain the only rendered prices, gated on `status === "available" && verificationStatus === "verified"`. If the Eny Palupi file differs, update `product-discovery.ts` in one commit referencing this document. |
| 3 | Shake/Ppang descriptors | Newer packaging wording TBD | **PENDING (B2)** — existing copy retained; no new claims introduced. |
| 4 | Rendered copy "berbasis ubi" (faq, shop, b2b alt, porridge descriptor) | "berbahan" per stakeholder mandate | **DONE:** copy sweep in this revision; code identifiers untouched. |
| 5 | Direct payment on yubie.id forbidden (ADR-004, AGENTS.md §2) | Stakeholder wants eventual on-site purchase | **BLOCKED (B1):** requires a superseding ADR + gateway selection + credentials. Until then the cart/checkout UI renders honest "not yet enabled" states and purchase completes through allowlisted marketplace redirects. No payment is ever faked. |
| 6 | Five root varieties share one placeholder photo | Distinct photography per variety | **BLOCKED (B5):** asset-gap manifest maintained in the frontend plan; honest placeholder alts remain. |

## Render rules for the storefront

1. Price may be rendered **only** for products with
   `status === "available" && verificationStatus === "verified"` and only from
   the domain catalog — never from client state.
2. Unverified sections (ingredients, nutrition, certification, shelf life,
   Mie's full detail) render a defined "awaiting verification" state. They are
   never fabricated and internal placeholder text is never exposed to
   customers.
3. Yubie Mie must never show a price, a size, an Add-to-Cart action, or a
   nutrition/certification statement until the product-truth gate approves the
   SKU.
4. Health/nutrition claim gating (`publicClaimsFor`) stays authoritative; only
   `approved && publicVisibility` claims may render.

## Blockers requiring human/business decision

- ~~B1~~ **RESOLVED (ADR-012):** Xendit selected; first-party checkout implemented behind `COMMERCE_PROVIDER=xendit`. TEST keys + webhook callback URL (`https://api.yubie.id/v1/webhooks/xendit/payment-session`) still needed before live wiring; live mode prohibited until the ADR-012 sandbox matrix passes.
- ~~B4~~ **RESOLVED (ADR-012):** Google Identity Services implemented (`/login`, `/account*`); needs a real `GOOGLE_CLIENT_ID` with the production origin allow-listed. Until then the login page renders an honest "sedang disiapkan" state.
- **B2** Commit sanitized extracts of the Eny Palupi and 20-story documents to the repo so facts and Our Roots chapters can be frozen against them. Still the gate for PH-4 (product re-audit) and PH-5 (scrollytelling copy).
- **B3** **PARTIALLY RESOLVED:** `transparent_yubie.png` was supplied and ingested. Its alpha channel was a noisy semi-transparent black matte; the alpha was rebuilt (hard threshold of the original alpha, cropped to content) and verified clean at render scale. A cleaner vector master from the designer remains desirable but is no longer blocking. Note: the supplied file renders best on light surfaces; the dark footer uses it at reduced prominence.
- **B5** **PARTIALLY RESOLVED:** hero video supplied and transcoded (720p 1.9 MB / 540p 0.4 MB H.264 + poster WebP, poster-first LCP, reduced-motion + data-saver safe). Still missing: five-root varietal photography, Ppang/Mie pack imagery, per-page OG images.

## Asset provenance notes (2026-10-02)

- The supplied pack-shot filenames were **swapped relative to their content**:
  `yubie flour.png` contains the *Shake* pouch render and
  `yubie shake (4).png` contains the *Flour* pouch render. They were mapped
  by CONTENT, not filename, into `public/products/yubie-{flour,shake}.webp`.
- The pack renders have an AI-generated feel; they are treated as **concept
  packaging imagery** (alt texts say "Konsep kemasan"). On-pack wording
  (e.g. "100% Bahan Pilihan Alami", "Tanpa Pengawet") is NOT transcribed
  into site copy — that conversion stays behind the product-truth gate.
- `yubie.id Design Brand Guidelines (2).pdf` is available in the shared
  vault as a design reference; it is not a product-truth source.
