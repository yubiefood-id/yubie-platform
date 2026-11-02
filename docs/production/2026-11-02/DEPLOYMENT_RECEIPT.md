# Controlled release 4e799d9 — shipping hardening (#73) — DEPLOYED

Date: 2026-11-02 UTC. Process: docs/production/2026-10-26/CONTROLLED_RELEASE.md.

## Chain of custody

| Step | Evidence |
|---|---|
| main SHA | 4e799d90dcbd76d281bc0c484f3953606938acad (PRs #76 hardening, #80 compose-chain fix, #81 schema-baseline fix; main CI 41516204970 success, 5/5) |
| RC run | 41518513692 (bot-dispatched; staging deployment approved as designated reviewer, deployment 7502460854); publish success |
| Artifact | commerce-release-4e799d9… (id 13176264095); zip digest 244c6f016113ebc49e4b36f7a27fe053542a92a7b31551bc62d3840fd6778c84 matches the protected job summary; SHA256SUMS all OK locally and after scp |
| Stage | /home/yubie-deploy/yubie-release-4e799d9 (checksums re-verified on host) |
| Bootstrap | OWNER_SETUP executed in root session (checksum-verified); WRAPPER_INSTALLED_NO_DEPLOYMENT_AUTHORIZATION; manifest digest 70a5e7bf9bfbd99f09ba734e480a62b3b17d933eb06579756e97dd8273c105e1; production compose bytes preserved (127a3810…); sudoers validated |
| Preflight | BLOCKED ADMISSION_NOT_FROZEN → admission frozen at runtime (env backup production.env.before-83a35d6-20261102T194654Z; api recreated; container env verified) → BLOCKED UNREVIEWED_SCHEMA_BASELINE → fixed by PR #81 (accepted reviewed boundary expected[:26] = the deployed d8a660d state) → preflight clean |
| Authorization | root-private authorization.json (owner-approved: mAsyamJ; approvalRef = owner directive 2026-11-02 + PRs #76/#80/#81 CI green; 50-minute window; manifest digest + baseline image IDs + provider ipaymu bound) |
| Execution | BACKEND_DEPLOYED_DISABLED; 63 audited commands |
| Verification rerun | ALREADY_DEPLOYED_VERIFIED (read-only) |

## Deployed runtime

- api: ghcr.io/yubiefood-id/yubie-api@sha256:29faf029b83e8e06c842a234ad5c355ebc9fd6eff355169235f60cdfa158cb7e
- worker: ghcr.io/yubiefood-id/yubie-worker@sha256:067a90a02b203685c260d4f6e7cda33f816ba8785189f3334642935fe775efb5
- schema_migrations: 0001…0028_shipping_hardening.sql (additive; 0027 shipping execution + 0028 hardening)
- worker.started releaseSha 4e799d9…; api /healthz releaseSha 4e799d9…, /readyz database connected, commerceProvider ipaymu
- Shipping execution INERT by default: /v1/shipping/rates → {"mode":"unavailable","reason":"provider_unconfigured"}; webhook surface accepts/ignores unknown events (inbound stays reconcilable)

## Post-deploy acceptance

- Admission re-enabled (env restored, api recreated): /v1/checkouts/session → {"ready":true,"admission":"enabled"}
- Quote authority intact: flour 250g ×1 = Rp35.000; free_promotional coverage Kabupaten Bogor live
- Public: api.yubiefood.com/healthz 200 @ 4e799d9; yubiefood.com 200; /checkout 200

## Rollback

Code rollback safe (schema additive). Emergency freeze: YUBIE_CHECKOUT_ADMISSION=disabled + api recreate (R1). Shipping stays inert until the ADR-014 mode ladder is explicitly armed (see docs/shipping/BITESHIP_ONBOARDING_MANUAL.md).
