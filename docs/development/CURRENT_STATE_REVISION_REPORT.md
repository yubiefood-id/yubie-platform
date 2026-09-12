# Yubie Platform Product Discovery Revision Report

**Scope:** stakeholder revision R0–R5  
**Architecture:** modular monolith; server-first web with bounded client interaction islands  
**Commercial posture:** Yubie Flour available only for explicitly priced/sellable offerings; Shake and Ppang coming soon  
**Revision date:** 2026-09-12

## 1. Outcome

This revision changes Yubie from a flat three-product presentation into a connected discovery system:

```text
ROOT → PRODUCT FORMAT → SELLABLE OFFERING → APPLICATION → RECIPE → B2C/B2B ACTION
```

The existing homepage hero, brand typography, tokens, photography direction, cart boundary, Vinext deployment contract, and modular-monolith structure remain intact.

## 2. Baseline findings

Before feature work:

- the GitHub copy of `package-lock.json` was truncated at exactly 16 KB and could not be parsed by `npm ci`;
- `apps/web/app/globals.css` was also truncated and failed PostCSS after line 476;
- homepage order placed Why Yubie and decorative Flour applications before Five Roots;
- roots were five hardcoded names without canonical relationships;
- product metadata was duplicated between Web and API;
- Flour, Shake, and Ppang shared one generic product-detail composition;
- recipe data was hardcoded in two components, with category-only local state;
- Shake/Ppang showed a generic inert form rather than product-scoped consent;
- public nutrient/health-adjacent root claims had no explicit pending records.

The lockfile was regenerated from all workspace manifests. The complete stylesheet was recovered from the existing Sites source and retained with monorepo design-token imports. Those are restoration fixes, not stakeholder-scope regressions.

## 3. Architecture decisions

### ADR-R1 — Canonical product discovery projection

`packages/domain` now owns the public canonical projection for:

- `Product` / product format;
- `RootVariety`;
- `ProductRootOffering`;
- `FoodApplication`;
- `RecipeSummary`;
- scoped `ProductClaim` records.

Web and API import the same product-family data. Homepage, Our Roots, product detail, applications, and recipes consume the same root/application/recipe relationships. Presentation components do not duplicate the Five Roots copy.

### ADR-R2 — Sellability belongs to the offering

The existence of Yubie Flour does not make every root variety purchasable. Only `flour-ubi-ungu` currently maps to approved public sizes/prices. Other Flour roots are presented as B2B exploration without a price or Add to Cart action. Shake and Ppang have coming-soon offerings and no purchase action.

### ADR-R3 — Claims fail closed

Stakeholder-intended anthocyanin, fibre, beta-carotene, polyphenol, sugar-reduction, and performance statements are represented as private pending claim records. Public UI renders neutral sensory/culinary copy while exact product evidence and wording approval are unavailable.

### ADR-R4 — Recipes remain concepts

Recipe relationships are canonical and navigable, but duration, ingredients, instructions, authorship, and nutrition are not invented. Recipe pages do not emit `Recipe` structured data until a complete verified recipe exists.

### ADR-R5 — Consent remains purpose scoped

Shake and Ppang waitlists submit `productId`, email, and explicit product-specific consent to `/api/waitlist`. They do not imply newsletter enrollment. The endpoint remains a validation-only prototype pending durable persistence/outbox work.

## 4. Before and after information architecture

| Surface | Before | After |
|---|---|---|
| Homepage | Hero → Products → Why → decorative applications → name-only roots → story → B2B → Community | Hero → Products → Five Roots → Why Yubie → Flour Applications → Recipes → Our Roots → B2B → Community |
| Products | Three cards with generic roles | Everyday Ingredient / Premium Convenience / Frozen One-Bite |
| Roots | Repeated names and generic text | Canonical five-root discovery with character, colour, texture direction, applications, and products |
| Flour | Generic size selector | Root selector → offering status → size/price → cart or B2B path |
| Shake | Generic coming-soon panel | Premium-convenience composition, Pour/Add Water/Mix, scoped waitlist |
| Ppang | Generic coming-soon panel | Frozen one-bite composition, Keep Frozen/Heat/Enjoy, scoped waitlist |
| Applications | Decorative words over one image | Keyboard/touch explorer with visual, descriptor, root/product, and recipe CTA |
| Recipes | Category-only component-local filter | URL-addressable Product + Root filters and canonical detail relationships |
| Our Roots | Hero plus two text blocks | Root → preparation → processing → flour → modern-use narrative plus full discovery |
| B2B | Retail & bulk / Sampling / Co-development | Bulk Ingredients / Product Sampling / Product Development |

## 5. Claim and evidence decisions

### Public now

- neutral colour, sensory, and culinary-direction copy;
- product-format positioning;
- current public Flour sizes/prices for the one explicitly available root offering;
- coming-soon status and non-binding interest capture.

### Private/pending

- anthocyanin/antioxidant;
- fibre/high-fibre;
- beta-carotene/Vitamin A;
- polyphenol;
- reduced added sugar;
- dough binding or texture-performance superiority;
- nutrition facts, allergen, shelf-life, BPOM, halal, certification, health, weight, satiety, glycemic, and meal-replacement statements.

The supplied Puravita/Fiber Shake/Goguma Ppang image is treated as a conceptual reference and is not used as Yubie packaging or commercial evidence.

## 6. Asset-gap report

| Required asset | Current safe handling | Gap classification |
|---|---|---|
| Five roots, whole | Existing approved ingredient study reused with visible placeholder note | Need one approved photo per exact variety |
| Five roots, sliced/cross-section | Not represented as a factual variety photo | Need approved cross-section set |
| Flour/powder close-up | Existing ingredient-table study | Need isolated flour/powder macro |
| Sourcing/harvest | Text narrative only | Need verified Yubie sourcing/harvest photography |
| Flour product pack | Existing lifestyle composition | Need current approved pack front/back and size variants |
| Shake pack/use | Existing Yubie concept assets, visibly coming soon | Need commercial pack and approved use sequence |
| Ppang frozen/use | Existing concept box, visibly coming soon | Need frozen/storage/preparation lifestyle set |
| Pancakes | Ingredient-study placeholder disclosed | Need verified result photo |
| Cookies | Brand-study placeholder disclosed | Need verified result photo |
| Brownies | Photography-direction placeholder disclosed | Need verified result photo |
| Cake | Ingredient-study placeholder disclosed | Need verified result photo |
| Noodles | Brand-study placeholder disclosed | Need verified result photo |
| Porridge | Preparation-study placeholder disclosed | Need verified result photo |

No placeholder is described as a verified finished Yubie recipe result.

## 7. Accessibility, responsive, performance, and SEO controls

- Root and Application explorers use actual tab semantics, roving keyboard focus, arrow/Home/End navigation, touch buttons, focus behavior, and non-hover access.
- Filter buttons expose pressed state and provide an announced result count.
- Images use stable fill containers, responsive `sizes`, and meaningful or disclosure-aware alternative text.
- Static editorial sections remain Server Components; only selectors, filters, cart, and forms hydrate.
- Reduced-motion behavior remains global.
- Mobile layouts convert dense five-column discovery into horizontal or stacked touch surfaces.
- `/recipes` defines one canonical URL; query-filter combinations are not added to the sitemap.
- Coming-soon product pages emit no false Offer, price, or InStock data.
- Incomplete recipe pages emit no `Recipe` structured data.

## 8. Privacy-safe analytics contract

The UI emits versioned `yubie:analytics` browser events for required discovery/conversion actions. A central guard rejects property names associated with email, phone, WhatsApp, name, address, message, or free text. No analytics vendor or network delivery is activated by this revision.

## 9. Engineering evidence

Automated coverage proves:

- exactly five canonical roots;
- only the explicitly available Flour/root offering has sellable sizes;
- pending root claims remain private;
- recipe Product + Root filters return canonical relationships;
- product waitlist accepts only Shake/Ppang with explicit consent;
- homepage hero and semantic section order;
- unsupported root claims absent from rendered homepage HTML;
- Flour purchase action and Shake/Ppang purchase suppression;
- Shake/Ppang usage sequence copy;
- recipe Made With relationship and no Recipe schema;
- revised B2B offering language;
- existing commerce/supporting routes continue rendering.

Final verification on 2026-09-12:

- `npm run check` passed: lint, strict TypeScript, and 18 automated tests;
- `npm run build` passed across Domain, Validation, Commerce, UI, API, and Web;
- the Vinext Worker artifact and hosting manifest validated;
- `git diff --check` passed;
- desktop browser verification passed for section order, root/application keyboard behavior, Flour offering gating, cart labeling, Shake waitlist consent, recipe URL state, image alternatives, and horizontal overflow;
- dependency-audit execution was unavailable because the runtime network policy rejected the npm advisory endpoint with HTTP 403. This is recorded as an environment limitation, not a passing security result.

## 10. Remaining blockers by owner

| Class | Blocker | Engineering posture |
|---|---|---|
| Content | Complete verified recipes and final product instructions | Concepts remain clearly labeled |
| Evidence/claim approval | Exact root nutrition/functional and application-performance evidence | Pending claims suppressed |
| Asset | Exact roots, result dishes, sourcing, and commercial packaging photography | Approved studies reused with disclosure |
| Commerce | Durable waitlist/B2B persistence, inventory/lot truth, authoritative quote, payment provider | Existing prototype remains fail-closed/non-payable |
| Regulatory | Product registration, label, halal, nutrition, allergen, shelf-life approval | No status invented or published |
| Operational | B2B sample approval and lot-traceable fulfilment | Form does not claim that a physical sample was sent |

These are content/evidence/asset/commerce/regulatory/operational readiness gaps, not hidden frontend failures.
