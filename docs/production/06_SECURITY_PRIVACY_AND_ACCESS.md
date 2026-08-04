# 06 — Security, Privacy and Access

## 1. Security baseline

Use [OWASP ASVS 5.0](https://owasp.org/www-project-application-security-verification-standard/) as the web-application verification baseline, targeting Level 2 for customer and operator production surfaces. Map applicable requirements to tests/evidence rather than claiming certification.

## 2. Threat model priorities

- account/session takeover and operator privilege abuse;
- checkout/order/price tampering and idempotency bypass;
- forged/replayed payment or logistics webhooks;
- inventory/lot manipulation and fraudulent refunds;
- product-claim or label publication without approval;
- personal-data leakage through logs, analytics, support or exports;
- dependency/supply-chain compromise and malicious scripts;
- denial of service and provider dependency failure;
- e-skimming/payment-page compromise.

## 3. Access controls

- Central identity provider, MFA for operators, no shared accounts.
- Roles: support, fulfilment, inventory, finance, product-regulatory, marketing-editor, engineer, incident commander, admin.
- Permissions are action/resource scoped; high-risk actions use four-eyes approval where feasible.
- Production database shell access is exceptional, time-bound, logged and reviewed.
- Quarterly access review and immediate offboarding.

## 4. Application controls

- Secure, HttpOnly, SameSite cookies; CSRF protection for cookie-authenticated mutations.
- Server-side authorization; never trust client totals, roles, prices, stock or claim status.
- Output encoding, CSP, trusted script inventory, dependency pinning, upload type/size/content validation.
- Rate limits by route risk and identity; abuse signals avoid blocking ordinary customers indiscriminately.
- SSRF allowlists for outbound providers, safe redirects and normalized URLs.

## 5. Payment-data scope

Yubie must not store or log PAN, CVV, track data, PIN, or authentication secrets. Prefer provider-hosted checkout/tokenization to minimize scope. Maintain script inventory and tamper detection appropriate to the integration; PCI SSC provides current [PCI DSS v4.0.1](https://blog.pcisecuritystandards.org/just-published-pci-dss-v4-0-1) and [payment-page security guidance](https://blog.pcisecuritystandards.org/new-information-supplement-payment-page-security-and-preventing-e-skimming). Determine Yubie's exact PCI obligations with the provider/acquirer and qualified assessor where required.

## 6. Privacy controls

Indonesia's [Law No. 27 of 2022 on Personal Data Protection](https://jdih.komdigi.go.id/produk_hukum/view/id/832/t/undangundang%2Bnomor%2B27%2Btahun%2B202) is the baseline legal watchpoint. Confirm implementing rules and Yubie's controller/processor responsibilities with counsel.

Maintain purpose, lawful basis, notice version, consent where relied on, recipients/processors, transfer/location, retention, deletion/anonymization, security and data-subject request procedure for each data category.

Marketing consent is separate from transactional communication, unbundled, timestamped, source-attributed and revocable. Analytics identifiers are purpose-limited and consent-aware.

## 7. Secrets and supply chain

- Managed secret store; no `.env` secrets in Git; no long-lived credentials in CI.
- Separate environment credentials and least-privilege provider keys.
- Secret rotation and emergency revocation runbook.
- Lockfile, dependency audit, provenance-aware build, protected branch, review, secret scanning and minimal CI permissions.
- High/critical vulnerability SLA based on exploitability and exposure; documented risk acceptance has owner and expiry.

## 8. Security evidence

Threat model, ASVS mapping, automated scans, dependency report, access review, provider security review, penetration test proportionate to launch risk, remediation evidence, and incident exercise.
