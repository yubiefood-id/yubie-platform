# ADR-002 — Hosted Payment Provider and Minimal Card Scope

**Status:** accepted direction; provider selection pending evidence review
**Decision:** Use hosted payment pages/components from a provider verified for the required Indonesian payment services. Yubie stores order/payment references and verified provider events, never PAN/CVV.

**Why:** reduces security/compliance scope, accelerates launch and keeps payment authorization/settlement with a specialist provider.

**Required before selection:** licensing verification, methods/fees, webhook signatures, idempotency, reconciliation/refunds, sandbox quality, security/privacy review, support SLA, settlement operations and exit/export plan.
