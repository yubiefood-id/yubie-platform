# ADR-001 — Modular Monolith Before Microservices

**Status:** accepted  
**Decision:** Keep one transactional application boundary with explicit domain modules and provider ports. Deploy web separately where required, but preserve one canonical transaction model and database until extraction criteria are met.

**Why:** Yubie's near-term risk is correctness across product truth, order, payment, inventory, lot and fulfilment—not independent service scale. A distributed system would add partial failure, message contracts, tracing, reconciliation and on-call cost before team/traffic evidence justifies it.

**Consequences:** strict module boundaries and testable ports are mandatory; database access is module-owned; async delivery uses outbox/inbox; extractions require evidence and an ADR.
