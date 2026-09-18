# 30 — Product Truth, Content and Food-tech Governance

## 1. Purpose

Yubie's software sits between R&D, commercial product development, marketing and consumers. The platform must preserve the difference between **research evidence**, **commercially verified specification** and **approved public claim**.

## 2. Product information architecture

Canonical conceptual model:

~~~text
Root Variety
   |
   v
Product Offering
   |
   +--> Yubie Flour
   +--> Yubie Shake
   +--> Yubie Ppang
   |
   v
SKU / commercial configuration

Root/Product
 -> Application
 -> Recipe

Product/Root/SKU
 -> Fact / Claim
 -> Evidence
 -> Approval
 -> Public Projection
~~~

## 3. Website stakeholder revision

Homepage semantic order:

~~~text
Hero
 -> Products
 -> Five Roots
 -> Why Yubie
 -> Flour Applications
 -> Recipes
 -> Our Roots
 -> B2B
 -> Community
~~~

The current hero remains unchanged.

Three product roles are explicit:

- Yubie Flour — Everyday Ingredient;
- Yubie Shake — Premium Convenience;
- Yubie Ppang — Frozen One-Bite.

Five Roots becomes ingredient discovery with root character, best application and related product.

Flour gets a root selector and B2C/B2B ingredient-platform detail experience.

Applications become interactive discovery rather than decoration.

Recipes connect to product + root.

Our Roots reuses the same canonical root data instead of hard-coded duplicate copy.

B2B offering emphasizes Bulk Ingredients, Product Sampling, Product Development and optional Wholesale Product.

## 4. Claim governance

Fact state:

~~~text
DRAFT
EVIDENCE_PENDING
REVIEW_PENDING
APPROVED_PRIVATE
APPROVED_PUBLIC
REJECTED
RETIRED
~~~

Public UI and assistant only read APPROVED_PUBLIC effective facts.

## 5. R&D proposal boundary

The 2026 innovation proposal describes development of purple-sweet-potato instant puree and goguma ppang, including formulation, laboratory/sensory work, market testing, packaging and commercialization/licensing work.

It also contains research-oriented targets around fiber, antioxidant activity, satiety, shelf life, functional positioning and future certifications.

Engineering interpretation:

- store evidence/version references;
- support approval workflows;
- support prototype/commercial lifecycle;
- never convert a proposal target into a public claim automatically.

## 6. Certification truth

Certification is an entity with:

~~~text
certification_type
product/spec scope
legal_entity
certificate/reference
status
issued_at?
expires_at?
evidence_file_ref
approved_public_wording
~~~

Status may include:

~~~text
PLANNED
SUBMITTED
UNDER_REVIEW
APPROVED
EXPIRED
REVOKED
NOT_APPLICABLE
~~~

Website cannot say "Halal", "BPOM", "P-IRT" or equivalent merely because preparation/application is planned.

## 7. Specification/versioning

A commercial product specification version includes:

- formulation reference;
- ingredient/allergen basis;
- pack/net content;
- preparation/storage instructions;
- lab/QA evidence references;
- packaging/artwork version;
- effective date;
- status.

A public page points to an approved projection, not mutable draft R&D data.

## 8. Root data

Root characteristics requested by stakeholder revision should be canonical records.

Nutrition-like root benefits such as anthocyanin, beta-carotene, polyphenol or "high fiber" are subject to evidence/public-copy review. Culinary/sensory character can be used as a safe fallback when benefit language is not approved.

## 9. Recipe governance

A Recipe record becomes publishable only when:

- product/root relationship is valid;
- ingredients/method are complete;
- preparation language does not conflict with product instructions;
- nutrition/health claims follow approval rules;
- media is approved.

Structured-data `Recipe` markup is emitted only for complete truthful recipes.

## 10. Commercial availability

Product lifecycle:

~~~text
RND
PILOT
MARKET_TEST
COMING_SOON
AVAILABLE
PAUSED
RETIRED
~~~

Marketplace listing availability is separate from product lifecycle.

An AVAILABLE product with a broken marketplace listing can remain visible but its purchase channel must fail safely.

## 11. Evidence storage

Evidence metadata belongs in PostgreSQL; binary reports/certificates/artwork belong in private object storage.

Use checksum, content type, source, uploader, access classification and retention.

No confidential research/licensing document is exposed by a public object URL.

## 12. Food-safety escalation

Product truth connects to support:

~~~text
complaint
 -> product/SKU
 -> batch/order reference when available
 -> evidence/QA owner
 -> structured incident
~~~

The assistant never diagnoses an adverse event.

## 13. Acceptance

No content path—source config, CMS, assistant, API or import—can bypass the same public fact approval gate.
