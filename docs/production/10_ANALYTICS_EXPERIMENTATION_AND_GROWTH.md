# 10 — Analytics, Experimentation and Growth

## 1. Measurement hierarchy

Business source-of-truth metrics come from canonical order/payment/inventory data. Product analytics explains behavior but never replaces financial reconciliation.

North-star supporting metrics: approved product discovery, add-to-cart, checkout start, verified payment, successful fulfilment, repeat purchase, qualified B2B lead and sample conversion.

## 2. Event governance

Every event has owner, purpose, trigger, schema/version, allowed properties, data classification, consent requirement, retention, validation test and deprecation plan.

Core events: `product_viewed`, `variant_selected`, `cart_item_added`, `checkout_started`, `payment_session_created`, `payment_verified`, `order_fulfilled`, `newsletter_consented`, `b2b_lead_submitted`. Avoid embedding email, phone, address, free text, raw URL queries or provider payloads.

## 3. Consent and attribution

Essential operational events are separated from optional analytics/marketing. Consent state is evaluated before optional collection and stored independently from analytics vendor state. Campaign parameters are normalized, allowlisted and retained only as needed.

## 4. Experiments

Each experiment defines hypothesis, primary metric, guardrails, unit of randomization, eligibility, minimum runtime/sample approach, exposure event, stopping rule and owner. Guardrails include checkout errors, refund/support rate, performance/accessibility, margin and truthful product communication.

Never experiment on unapproved claims, required disclosures, consent, security controls, food-safety information, hidden fees, or misleading scarcity.

## 5. Dashboard integrity

Document metric SQL/semantic definition, timezone, exclusions, late-arriving data, bot/internal traffic and revision history. Reconcile paid-order revenue dashboards to finance/provider settlement before executive use.
