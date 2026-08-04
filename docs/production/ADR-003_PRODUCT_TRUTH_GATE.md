# ADR-003 — Product Truth as a Separate Release Gate

**Status:** accepted  
**Decision:** Software deployment cannot make a SKU sellable or a claim publishable. Product specifications, claims, artwork, evidence and lots have independent approval/release states enforced by the public projection and commerce invariants.

**Why:** food facts can change by formula, supplier, artwork, law and evidence. Treating them as ordinary CMS copy creates safety, legal and trust risk.

**Consequences:** safe-default suppression; immutable approved versions; explicit approvers/effective dates; lot/spec linkage; critical changes require product/regulatory and food-safety approval in addition to engineering CI.
