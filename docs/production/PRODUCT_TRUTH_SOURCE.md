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
| `Eny Palupi_Action Plan dan RAB.xlsx - Informasi dalam kemasan.pdf` | Reviewed from the stakeholder-supplied project source on 2026-10-04; sanitized facts encoded in the domain catalog | Canonical source for four families, pack sizes, prices, ingredients, preparation, producer, and stated Flour shelf life |
| `20 story Yubie.docx` | **ABSENT — not committed** | Canonical brand story for the Our Roots long-form chapters |
| `packages/domain/src/product-discovery.ts` | Present | Current code-side catalog (was 3 families before this revision) |

**Rule applied:** where the Eny Palupi file and code conflict, the Eny Palupi
file wins — but only once its values are actually ingested. Until then, no
conflicting value is silently promoted to customer-facing copy.

## Conflict matrix and resolution state

| # | Current value (code) | Canonical value | Resolution |
|---|---|---|---|
| 1 | 3 families; homepage copy "One root family. Three formats." | 4 families incl. Yubie Mie | **DONE:** four families are in the canonical catalog and homepage/product catalog. |
| 2 | Historical Flour prices 250 g Rp15.000 / 500 g Rp28.000 / 1 kg Rp52.000 | 250 g Rp35.000 / 1 kg Rp120.000 | **DONE:** historical prices and 500 g option removed. |
| 3 | Shake/Ppang coming soon; Mie unpriced | Shake Rp19.500/sachet or Rp129.000/7; Ppang Rp9.000 mini, Rp19.000 maxi, Rp42.000/5 mini; Mie Rp16.000 or Rp45.000/3 | **DONE:** exact variants encoded as available; no nutrition or certification claim was promoted. |
| 4 | Rendered copy "berbasis ubi" (faq, shop, b2b alt, porridge descriptor) | "berbahan" per stakeholder mandate | **DONE:** copy sweep in this revision; code identifiers untouched. |
| 5 | Marketplace-first only | First-party checkout | **DONE IN SOFTWARE (ADR-012):** Xendit hosted checkout, signed webhook processing, idempotency, reconciliation, and server pricing are implemented. Production activation remains gated on credentials and sandbox acceptance. |
| 6 | Five root varieties shared one placeholder photo | Distinct visual per variety | **PARTIALLY RESOLVED (B5):** five root-specific visual studies now replace the repeated placeholder. They are creative direction assets, not documentary sourcing evidence. |

## Render rules for the storefront

1. Price may be rendered **only** for products with
   `status === "available" && verificationStatus === "verified"` and only from
   the domain catalog — never from client state.
2. Product facts may render only when present in the October 2026 brief and
   encoded in the canonical domain catalog. Nutrition values and certification
   remain in a defined pending state.
3. Flour, Shake, Ppang, and Mie may show Add-to-Cart only for their approved
   variants. The server re-resolves every SKU and price during checkout.
4. Health/nutrition claim gating (`publicClaimsFor`) stays authoritative; only
   `approved && publicVisibility` claims may render.

## Blockers requiring human/business decision

- ~~B1~~ **RESOLVED (ADR-012):** Xendit selected; first-party checkout implemented behind `COMMERCE_PROVIDER=xendit`. TEST keys + webhook callback URL (`https://api.yubie.id/v1/webhooks/xendit/payment-session`) still needed before live wiring; live mode prohibited until the ADR-012 sandbox matrix passes.
- ~~B4~~ **RESOLVED (ADR-012):** Google Identity Services implemented (`/login`, `/account*`); needs a real `GOOGLE_CLIENT_ID` with the production origin allow-listed. Until then the login page renders an honest "sedang disiapkan" state.
- **B2** The commercial information file was reviewed and its approved customer-facing facts were encoded on 2026-10-04. The separate 20-story source is still absent and remains a gate for new Our Roots narrative claims.
- **B3** **PARTIALLY RESOLVED:** `transparent_yubie.png` was supplied and ingested. Its alpha channel was a noisy semi-transparent black matte; the alpha was rebuilt (hard threshold of the original alpha, cropped to content) and verified clean at render scale. A cleaner vector master from the designer remains desirable but is no longer blocking. Note: the supplied file renders best on light surfaces; the dark footer uses it at reduced prominence.
- **B5** **PARTIALLY RESOLVED:** hero video supplied and transcoded (720p 1.9 MB / 540p 0.4 MB H.264 + poster WebP, poster-first LCP, reduced-motion + data-saver safe). Root-varietal, application, preparation, harvest, B2B, Ppang, and Mie visual studies have been added. Still missing: approved documentary farm photography, final Ppang/Mie packaging photography, and a complete per-page OG image set.

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

## Generated visual-study notes (2026-10-03)

- Root-varietal, recipe/application, harvest, B2B, Shake-preparation, Ppang,
  and Mie visuals are AI-generated **creative studies** produced for this
  storefront revision. They are not evidence of an ingredient, supplier,
  batch, certification, nutrition value, or commercial product specification.
- Ppang and Mie are now commercially available in the exact domain variants.
  Their current images remain creative studies and therefore avoid certification
  marks, nutrition claims, and unapproved final packaging copy.
- Flour and Shake storefront pack shots were remapped from the user-supplied
  source files by visible product identity because the original filenames were
  swapped. Generated context images use those supplied packs as references.
- Every new visual is stored locally as optimized WebP so customer pages do
  not depend on third-party image hosts.
