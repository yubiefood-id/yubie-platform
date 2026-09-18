# 10 — Security Hardening

## Threat priorities

- control-plane account takeover;
- WhatsApp/marketplace token leakage;
- webhook spoof/replay;
- open redirect/link poisoning;
- prompt injection/tool misuse;
- unsafe product claim publication;
- support/CRM PII leakage;
- malicious report import;
- DB/backup compromise;
- container/host privilege escalation;
- dependency supply chain.

## Host

Key-only SSH, no root SSH, security patching, minimal packages, firewall/port verification, named accounts.

## Containers

Non-root custom images, no privileged mode, no Docker socket, private networks, minimal capabilities, pinned/scanned images.

## Application

Strict validation, no arbitrary redirects, authorization, webhook verification, output encoding/CSP, rate limits, safe imports, SSRF allowlist, body/time limits.

## AI

Approved knowledge, deterministic tools, no arbitrary SQL/web/shell, red-intent handoff, kill switch and evaluation.

## Database

Least-privilege roles, no internet exposure, off-host encrypted backup, separate migration privileges, audit high-risk approvals.

## Secrets

No secrets in Git/image/log. Separate env credentials and immediate rotation after exposure.

## Control planes

MFA on GitHub, VPS provider, Cloudflare, Meta Business, seller/developer portals, CRM/Chatwoot admin.

## Privacy

Minimize copied contact/conversation/order data and define retention/deletion.

## Verification

Dependency/secret scan, external port scan, auth review, webhook negative tests, prompt/tool abuse tests, restore and incident tabletop.
