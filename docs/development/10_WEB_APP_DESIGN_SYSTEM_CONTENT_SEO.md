# 10 — Web Application, Design System, Content and SEO

## 1. Product experience objective

The web app must feel premium, tactile and contemporary while communicating food products plainly. Conversion cannot rely on fabricated urgency, unsupported benefits or hidden commercial terms. The first commercial path prioritizes Yubie Flour; Shake and Ppang use honest coming-soon/waitlist behavior.

## 2. Route and feature matrix

| Route | Primary job | Required state handling |
|---|---|---|
| `/` | Brand proposition, product family and route to shop/waitlist | Approved copy/assets, responsive hero, fast first load. |
| `/shop` | Browse/filter products by honest availability | All/available/coming-soon, search, URL state, empty/error state. |
| `/products/[slug]` | Understand/select product or join waitlist | Approved facts, variants, availability, evidence status suppression. |
| `/recipes` and detail | Learn use cases | Filter/share, approved product references, editorial disclaimer where needed. |
| `/our-roots`, `/impact` | Provenance and company story | No unverifiable supplier/sustainability claims. |
| `/cart` | Review device cart | Quantity/removal, server re-quote entry, stale/unavailable handling. |
| `/checkout` | Contact/delivery → quote → payment | Field recovery, server totals, expiry, duplicate-submit prevention. |
| `/order/[token]` | Explain order timeline | Minimal disclosure, polling/revalidation, support link. |
| `/b2b` | Capture and qualify business demand | Consent, realistic response expectation, stable reference. |
| `/faq`, `/privacy`, `/terms` | Reduce uncertainty and establish policy | Version/date, accessible links from relevant flows. |
| `/ops/*` | Operate critical workflows | Auth, authorization, no-cache, audit and safe confirmation. |

## 3. Design system

Canonical brand tokens:

| Token | Value | Usage |
|---|---|---|
| Yubie Purple | `#6417A8` | Signature surfaces and primary accents. |
| Root Green | `#197A32` | Ingredient/provenance cues and positive state. |
| Warm Gold | `#D9A72E` | Premium detail and focus/highlight use. |
| Nourish White | `#FFFDF7` | Warm canvas. |
| Root Ink | `#24152E` | Text/deep surfaces. |

Cormorant Garamond is the expressive display face; Manrope is the interface/body face. Components encode typography, spacing, radius, elevation, focus and motion tokens rather than copying raw values across pages.

Minimum primitives: Button/LinkButton, Input, Select, Textarea, Checkbox, FormField/ErrorSummary, Badge, ProductCard, Price/Availability, Dialog/Drawer, Toast/InlineStatus, Tabs/Filter, Breadcrumb, DataTable, Pagination and operator confirmation patterns.

## 4. Product content architecture

Separate:

- editorial content owned by marketing/content;
- protected facts owned by approved product-truth projection;
- commerce state owned by price/inventory projections;
- UI labels owned by product engineering/design.

CMS integration may compose pages but cannot author or override protected ingredients, allergens, nutrition, net content, certification, storage, shelf-life or health-adjacent claims without product-truth approval.

## 5. SEO and structured data

- Canonical URLs, unique titles/descriptions and sitemap only for intended public routes.
- Product structured data includes only current public price/availability and approved identifiers/facts.
- Recipe structured data requires complete, truthful recipe authorship/instructions and approved product references.
- Coming-soon pages do not emit false `InStock`, price, review or offer data.
- Operator, checkout, cart, tokenized order and confirmation routes are not indexed.
- Social previews use approved assets and product naming hierarchy: Yubie master brand; Shake and Ppang product names without duplicated branding.

## 6. Forms and abuse controls

Client validation improves feedback; server validation is authoritative. Add origin/CSRF protection where appropriate, hidden honeypot or risk signal, per-IP/session/email rate limits, payload size limits and generic responses that avoid contact enumeration. CAPTCHA is a measured escalation, not the default accessibility cost.

## 7. Performance budgets

Set budgets per route class for JavaScript, total image bytes and Core Web Vitals on representative Indonesian mobile profiles. Avoid unnecessary client libraries; stream server content; use responsive images; preload only critical fonts/assets; cache public projections with explicit revalidation. A product page must remain usable when optional analytics or marketing scripts fail.

## 8. Frontend acceptance evidence

- Mobile, tablet and desktop behavior with real supplied product assets.
- Keyboard navigation and screen-reader labels/status/error review.
- Reduced-motion and zoom/reflow checks.
- Empty, loading, validation, conflict, dependency failure and recovery states.
- No unsupported claim/price/certification exposed in HTML, metadata or structured data.
- Analytics event assertions without personal/free-text payload.
