# 05 — Secrets, Identity and Access

## 1. Secret inventory

Includes database, Chatwoot, Meta WhatsApp, CRM, marketplace OAuth, AI keys, backup storage, Cloudflare/DNS, GHCR/deploy and SMTP credentials.

## 2. Host storage

Early production baseline:

~~~text
/etc/yubie/production.env
root:root
0600
~~~

The human-recovery copy belongs in an approved secret/password manager, not Git or chat.

## 3. CI/CD secrets

Use GitHub environment/repository secrets with least privilege.

Prefer:

- protected production environment;
- read-only GHCR credential on VPS;
- dedicated deploy SSH key;
- host-key verification;
- no broad personal PAT.

## 4. Provider scopes

Request only needed scopes. Marketplace read integration does not request write permissions merely "for later".

## 5. Human access

No shared root/admin/seller credentials where provider supports named users.

## 6. MFA

Require MFA where available on GitHub, VPS provider, Cloudflare, Meta Business, marketplace admin, CRM and Chatwoot admin.

## 7. Rotation register

Track secret, provider, owner, scope, expiry, last rotation, runbook and revocation path.

## 8. Rotation procedure

~~~text
issue new
 -> install alongside old where possible
 -> reload/restart
 -> verify
 -> revoke old
 -> record
~~~

## 9. Redaction

Never log authorization headers, cookies, DB URLs, access tokens, message bodies, CRM notes or marketplace customer data.

## 10. Break-glass

Emergency access is separately stored, MFA protected, audited and rotated after use.
