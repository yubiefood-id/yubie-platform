# 09 — Testing and Quality Strategy

## 1. Risk-based pyramid

- **Unit:** domain invariants, totals, state transitions, FEFO, claims visibility, consent and retry decisions.
- **Schema/contract:** Zod/OpenAPI, provider fixtures, backward compatibility.
- **Database integration:** constraints, transactions, idempotency, migrations, concurrent reservation.
- **Adapter integration:** payment/logistics/email sandbox and failure mapping.
- **Component/accessibility:** forms, cart, errors, keyboard, focus and reduced motion.
- **End-to-end:** browse → cart → checkout → sandbox payment event → order visible; fulfilment/refund/complaint operator flows.
- **Operational exercises:** reconciliation, restore, provider outage, security/privacy incident and lot recall.

## 2. Critical scenarios

- same checkout submitted concurrently with same/different idempotency key;
- price or stock changes between cart and checkout;
- duplicate, out-of-order, delayed and forged payment webhooks;
- payment succeeds after reservation/order expiry;
- partial refund, duplicate refund request and provider timeout;
- competing reservations for final stock unit;
- quarantined/expired/recalled lot excluded; FEFO chooses correct lot;
- public projection suppresses pending/expired/mismatched claim;
- consent accepted, withdrawn and export/deletion requested;
- logistics/email/CRM unavailable without transaction loss;
- restore from backup followed by webhook/outbox reconciliation.

## 3. Non-functional verification

- Accessibility target WCAG 2.2 AA for customer/operator critical paths.
- Performance budgets: LCP/INP/CLS and route payload budgets measured on representative mobile network/device profiles.
- Load tests use realistic browse/checkout ratio, database contention and provider latency; include spike and soak.
- Security verification maps to OWASP ASVS L2 applicability.
- Chaos/failure injection is bounded to staging or controlled production experiments with safeguards.

## 4. Test data

Synthetic only outside production. Fixtures include Indonesian addresses/phone formats without real identities, multiple lots/expiry dates, provider states and edge cases. Never use real customer exports in CI or developer machines.

## 5. Release acceptance

Zero unresolved critical/high defects on launch paths; no flaky critical test; migrations proven fresh and upgrade; production artifact verified; dashboards/alerts/runbooks validated; owners sign applicable go-live gates.
