# Operator actions

Do not paste replacement secrets into chat, issues, or git. The iPaymu VA and API key that were pasted earlier are exposed. Rotate them in the iPaymu dashboard and treat the old pair as unusable.

## iPaymu sandbox

1. Sign in to the iPaymu sandbox dashboard, not the production merchant.
2. Rotate the exposed API key. Confirm the new merchant is sandbox (`https://sandbox.ipaymu.com`).
3. Inject only these names into the staging secret store for the API and worker: `IPAYMU_ENV=sandbox`, `IPAYMU_VA`, `IPAYMU_API_KEY`, `IPAYMU_API_BASE_URL=https://sandbox.ipaymu.com`, `IPAYMU_NOTIFY_URL` (public HTTPS on the staging API). Leave `COMMERCE_PROVIDER=preview` until the contract questions in `IPAYMU_PROVIDER_CONTRACT.md` are answered and this change is deployed on purpose.
4. Ask iPaymu, in writing: cancel by SessionID, lookup by `referenceId` or SessionID, duplicate `referenceId` behavior, and how to recover a `transactionId` after a timeout. Do not set `COMMERCE_PROVIDER=ipaymu` while those are open.

## Staging web and Access

5. Keep Cloudflare Access on `staging.yubiefood.com` limited to approved emails. Do not enable Everyone or Bypass.
6. Record whether `GOOGLE_CLIENT_ID` is SET or MISSING. Do not copy the client id into git. Confirm in the Google console that the client type is Web application.
7. Take a database backup, then apply migration `0011_checkout_intent.sql` only with the image that contains this change. The running API image is still `aa00c53`, which does not include `0011`. Do not wipe the volume.

## Admin and ERP

8. Do not create DNS for `ops-staging.yubiefood.com` until an Access review. `apps/admin` is a server BFF with deny-by-default RBAC. It is not deployed.
9. Do not install ERPNext on the shared VPS. A separate host needs a recorded cost and resource sign-off. The shadow client is read-only and refuses writes while dual-master stock is unproven.

## Explicitly out of this change

10. No production DNS edits, no RetroPick or Caddy edits, no `docker compose down -v`, no live-money payment, and no DAST against payment hosts.
