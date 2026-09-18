# 03 — Container and Service Layout

## 1. Why Docker Compose

For current Yubie scale, Docker Compose on a single Core VPS is simpler than Kubernetes and is appropriate for a single-server production deployment when operated carefully.

## 2. Core services

~~~text
caddy
api
worker
postgres
backup-agent
otel-collector   optional
~~~

No source-code bind mounts in production.

## 3. Networks

~~~text
edge
  caddy <-> api

backend
  api <-> postgres
  worker <-> postgres
~~~

Postgres has no published host port.

## 4. Images

Use immutable SHA-based identities:

~~~text
ghcr.io/yubiefood-id/yubie-api:<commit-sha>
ghcr.io/yubiefood-id/yubie-worker:<commit-sha>
~~~

Do not rely on mutable `latest`.

## 5. Production Compose rules

- explicit image tag;
- restart policy;
- health checks;
- no code bind mounts;
- persistent volumes only for state;
- non-root custom app image;
- no Docker socket in app;
- drop unnecessary capabilities;
- logging rotation;
- resource guardrails where useful.

## 6. Example structure

~~~yaml
services:
  api:
    image: ghcr.io/yubiefood-id/yubie-api:${YUBIE_RELEASE}
    restart: unless-stopped
    env_file: /etc/yubie/production.env
    networks: [edge, backend]

  worker:
    image: ghcr.io/yubiefood-id/yubie-worker:${YUBIE_RELEASE}
    restart: unless-stopped
    env_file: /etc/yubie/production.env
    networks: [backend]

  postgres:
    image: postgres:17-alpine
    restart: unless-stopped
    networks: [backend]
    volumes:
      - yubie_pg:/var/lib/postgresql/data
~~~

This is guidance until runtime packages are implemented.

## 7. PostgreSQL upgrades

Pin major version. Test minor image updates. Major upgrades require an explicit pg_upgrade/logical migration and restore plan.

## 8. Health

~~~text
/healthz = process alive
/readyz  = dependencies required to serve are ready
~~~

Worker should expose heartbeat/queue metrics.

## 9. Graceful shutdown

API/worker handle SIGTERM, stop taking new work, finish bounded work/leases, close DB pool and exit before stop timeout.

## 10. Scheduled work

Use pg-boss/worker scheduling for Yubie business jobs. Reserve host cron/systemd timers for host maintenance/backup.

## 11. Resource separation

If import or AI jobs become heavy:

~~~text
worker-critical
worker-import
worker-assistant
~~~

before immediately adding orchestration complexity.
