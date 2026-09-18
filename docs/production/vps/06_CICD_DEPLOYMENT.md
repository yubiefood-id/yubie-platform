# 06 — CI/CD and Deployment

## 1. Build model

Build immutable images in CI rather than pulling source and compiling production in place.

~~~text
commit
 -> CI
 -> test/build/scan
 -> GHCR image by SHA
 -> deploy SHA
~~~

## 2. CI gate

Current:

~~~text
npm ci
npm run check
~~~

Target adds DB migration tests, provider contracts, assistant eval, container scan and browser smoke as phases land.

## 3. Production artifact

Record image digest + commit SHA. Mutable aliases may exist but are never sole identity.

## 4. Environment protection

Deploy production from main/release commit with approval appropriate to team maturity.

## 5. Migration sequence

~~~text
backup readiness
 -> expand migration
 -> compatible app
 -> backfill
 -> verify
 -> later contract
~~~

## 6. Deployment procedure

Conceptual:

~~~bash
export YUBIE_RELEASE=<commit-sha>
docker compose pull
docker compose run --rm migrate
docker compose up -d --remove-orphans
curl -f https://api.yubie.id/healthz
curl -f https://api.yubie.id/readyz
~~~

Then synthetic channel checks and observation hold.

## 7. Rollback

Keep last-known-good image. Roll application back only if schema remains compatible. Provider writes require reconciliation/compensation, not just code rollback.

## 8. Concurrency

One production deploy at a time.

## 9. Provider activation

Use feature flags:

~~~text
off -> shadow/read -> limited -> full
~~~

Separate code deployment from provider activation.

## 10. Hold metrics

Observe 5xx, redirect errors, webhook lag, queue age, assistant errors, CRM sync, DB resources and provider rate limits.

## 11. Supply chain

Minimal workflow permissions, no untrusted PR secrets, pinned dependencies/actions where practical, image/dependency/secret scans.

## 12. Runner security

Do not place a general-purpose privileged self-hosted GitHub runner on the production VPS.
