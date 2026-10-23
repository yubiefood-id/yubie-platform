# Commerce V3 goals

Provide phone-first customer authentication, reusable delivery addresses and
backend-authorized welcome promotions through the existing modular monolith.
The website remains the sole commerce authority; Yubi V2 keeps discovery/support.

Approved decisions:

- SMSGate private pilot; free software is not proof of free carrier delivery.
- International phone UX; Indonesia-only shipping. Real international SMS routes
  require separate carrier/cost/delivery acceptance.
- First qualifying paid purchase per proven identity, including existing accounts
  with no paid history. Unverified historical delivery phones do not identify users.
- Support-assisted conflicting identities; no automatic account merging/reassignment.
- Welcome15%, eligible product subtotal, no stacking, one redemption; paid use
  stays consumed after refunds. Dates/scope centrally approved; seed inactive.
- One unresolved checkout per customer/browser. Resume ambiguity; never create a
  replacement payable session. Existing guest cookie survives sign-in.

Success requires verified phone proof before sessions/entitlements; owned address
APIs; phone-only guest checkout without promo; immutable order snapshots; atomic
promo/payment/inventory behavior; real local DB and browser regression evidence.
Real provider acceptance is separately recorded. No merge, deployment, DNS change,
live payment or customer-number message is authorized by implementation work.
