# Phase M0 — Channel Model and Product Truth

## 1. Problem

The current application has a strong brand experience but still contains first-party cart/checkout semantics while the real D2C transaction happens on marketplaces. Product content also needs the stakeholder revision for Five Roots, product detail, recipes and B2B without exposing R&D claims as approved commercial truth.

## 2. Outcome

A customer understands:

- what Yubie is;
- the three product lines;
- five-root differentiation;
- how Flour/Shake/Ppang differ;
- that purchase happens through verified marketplace channels;
- that WhatsApp is available for questions/B2B;
- which products are available vs coming soon.

No public path implies Yubie accepts payment if it does not.

## 3. Required UX revision

Homepage semantic order:

~~~text
Hero
Products
Five Roots
Why Yubie
Flour Applications
Recipes
Our Roots
B2B
Community
~~~

Keep the current hero.

Product introduction:

~~~text
Yubie Flour — Everyday Ingredient
Yubie Shake — Premium Convenience
Yubie Ppang — Frozen One-Bite
~~~

### Five Roots

Upgrade from name list to ingredient discovery.

Per root:

~~~text
name
approved character/benefit copy
best application
related product
image
~~~

Nutrition-like statements are published only if approved. Until then use culinary/sensory character.

### Flour

Dedicated detail supports:

- Flour as product format;
- root variety selector;
- best uses;
- sizes only where commercially verified;
- marketplace purchase options instead of production Add-to-Cart;
- B2B sample CTA;
- recipes/applications.

Do not assume one root's price/SKU applies to all five roots.

### Shake

Dedicated page with convenience/powder/puree-instant positioning and usage steps only where preparation instructions are approved.

Coming-soon until commercial release truth exists.

### Ppang

Dedicated frozen/one-bite page. Preparation/heating detail requires approved product specification.

Coming-soon until commercially released.

### Recipes

Filter/connect by product and root. Complete recipes only; no fake recipe schema.

### Our Roots

Use canonical root records for homepage and detail page.

### B2B

Offer:

~~~text
Bulk Ingredients
Product Sampling
Product Development
Wholesale Product   optional
~~~

Primary contact path can be WhatsApp; structured fallback form remains useful.

## 4. Product truth model

Introduce or prepare canonical content contracts for:

~~~text
RootVariety
ProductFamily
ProductOffering
SKU
ProductFact
Application
Recipe
MarketplacePurchaseOption
~~~

Do not overbuild DB persistence in M0 if M1 will introduce it. Source-controlled canonical configs are acceptable temporarily if clearly marked.

## 5. Commerce correction

Current cart/checkout:

- remove from primary navigation;
- remove active production purchase CTA;
- label preview/demo only if still reachable for engineering;
- no production payment credentials;
- do not delete reusable domain tests until future-commerce decision.

## 6. Files expected

Likely web changes:

~~~text
apps/web/app/page.tsx
apps/web/app/products/[slug]/*
apps/web/app/recipes/*
apps/web/app/our-roots/*
apps/web/app/b2b/*
apps/web/config/products.ts
apps/web/config/claims.ts
new roots/applications/recipes config
components for product/root/application discovery
~~~

Likely domain/validation changes only where needed for canonical content contracts.

## 7. Claim gate

The proposal's high-fiber, satiety, antioxidant, meal-replacement, shelf-life and certification language remains R&D/internal until exact evidence and public approval exists.

Acceptance test must prove pending/private claims do not render in:

- homepage;
- product page;
- structured data;
- assistant-ready public projection.

## 8. Accessibility

- keyboard access to root/application selectors;
- no hover-only content;
- correct focus visibility;
- 44px touch targets where applicable;
- reduced-motion support;
- responsive reflow/zoom;
- meaningful image alt text.

## 9. SEO

- product pages reflect true availability;
- coming-soon products do not emit false Offer/InStock data;
- recipes emit Recipe schema only when complete;
- product/root filter URLs do not create uncontrolled duplicate index pages.

## 10. Tests

Required:

- homepage section order;
- hero remains unchanged;
- 3 product roles visible;
- Five Roots canonical copy;
- product/root selector behavior;
- unavailable root/SKU does not show fake price;
- Shake/Ppang no buy action while coming-soon;
- no unapproved claims;
- recipe filter/relations;
- B2B wording;
- accessibility smoke;
- rendered-output regression.

## 11. Rollout

M0 can release independently of backend M1.

Rollback is ordinary application rollback because no external provider writes are introduced.

## 12. GO gate

GO only when:

- website information architecture matches current business;
- cart/checkout is no longer the customer production path;
- product availability/claims are truthful;
- stakeholder revision is represented without unsafe assumptions;
- `npm run check` passes.
