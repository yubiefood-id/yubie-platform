# 14 — Security, Privacy and Identity Development

## 1. Trust model

All browser input, provider payloads, uploaded files, operator claims and analytics parameters are untrusted until validated and authorized. Authentication proves identity; authorization decides whether that identity may perform a specific action on a specific resource in its current state.

## 2. Identity strategy

| Identity | Initial mechanism | Authorization scope |
|---|---|---|
| Anonymous visitor | Signed/scoped session where state is needed | Own cart quote, checkout and token-scoped order view only. |
| Customer | Account deferred; use secure order/contact verification where necessary | Minimum self-service actions; prevent enumeration. |
| Operator | Managed identity provider with MFA | Server-side RBAC/permission checks per action/resource. |
| Workload | Short-lived workload identity or rotated scoped credential | Specific database/provider/bucket operations. |
| Provider webhook | Cryptographic signature + source/environment metadata | Capture declared provider/account event only. |

## 3. Operator permissions

Roles are starting points; server checks capabilities such as `claim.approve`, `lot.release`, `lot.quarantine`, `refund.request`, `refund.approve`, `reconciliation.resolve`, `sample.ship`, `privacy.export` and `access.manage`. High-risk separation prevents marketing self-approving claims, fulfilment releasing quarantined lots, support changing settlement truth or engineers silently editing orders.

## 4. Web security controls

- Secure, HTTP-only, same-site cookies; rotation and bounded sessions.
- CSRF/origin protection for cookie-authenticated state changes.
- CSP and security headers tuned to actual dependencies; no unsafe expansion for convenience.
- Output encoding and sanitization for free text/editorial input.
- Rate limit and abuse defense for login, waitlist, B2B, checkout, support and token endpoints.
- Body/upload limits, file type/content inspection and malware scan for evidence uploads.
- SSRF allowlist/proxy policy for server-side fetches; no arbitrary URLs.
- Parameterized queries and repository access; no raw user-composed SQL.
- Generic public errors with request IDs; no stack/provider/database leakage.

## 5. Payment scope

Use hosted provider pages/components so primary account number and CVV do not transit or persist in Yubie systems. Store only provider references and permitted display metadata. Browser redirects, client callbacks and unverified webhook bodies do not prove payment.

## 6. Personal-data map

| Data | Purpose | Minimum protection |
|---|---|---|
| Email/name/preferences | waitlist/newsletter/service communication | Purpose consent, suppression, restricted exports, retention. |
| B2B phone/business/free text | enquiry and relationship management | Role restriction, audit, encryption where appropriate, no analytics payload. |
| Delivery address/contact | fulfilment and support | Need-to-know access, masked UI, retention/hold policy. |
| Order/payment references | transaction, dispute, finance | Integrity/audit, least privilege, reconciliation retention. |
| Complaint/safety data | investigation/recall | Restricted safety access, careful free text, legal/safety hold. |
| Operator identity/action | accountability/security | Immutable audit, retention, incident access. |

## 7. Consent engineering

Consent is an append-oriented ledger: subject/contact, purpose, channel, policy/version, action, timestamp, capture source and evidence metadata. Current permission is derived from grants, withdrawals, suppressions and legal/purpose rules. Provider marketing status is a projection and must reconcile back to Yubie.

## 8. Data-subject workflows

Authenticated/verified request → discover data across transactional records/providers → classify legal/safety/dispute holds → export/correct/delete/anonymize permissible scope → propagate to processors → record evidence and completion. Do not promise erasure of records required for transaction, tax, fraud, dispute or food-safety purposes; document decision and scope.

## 9. Secrets and environment controls

- Secrets only in managed runtime stores; never source, screenshots, logs or PR descriptions.
- Separate secrets/accounts by environment and provider.
- Rotate without code change; maintain owner, purpose, creation/rotation/expiry and break-glass procedure.
- Production database/bucket/provider permissions are least privilege; developers do not use shared admin credentials.
- Secret scanning, dependency audit, code scanning and access review are release controls.

## 10. Threat-driven tests

Test IDOR/resource enumeration, CSRF, XSS in B2B/support content, forged/replayed webhooks, idempotency abuse, privilege escalation, rate-limit bypass, malicious upload, SSRF, secret/error leakage and vulnerable dependency policy. Map applicable controls to OWASP ASVS L2 and review deviations explicitly.
