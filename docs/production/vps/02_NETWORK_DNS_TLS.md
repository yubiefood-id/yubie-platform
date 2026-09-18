# 02 — Network, DNS and TLS

## 1. Public surface

Intended public ports:

~~~text
22/tcp   SSH only from approved admin network/VPN if possible
80/tcp   HTTP redirect / ACME
443/tcp  HTTPS
~~~

Do not expose PostgreSQL, Redis or application-internal ports to the internet.

## 2. DNS

Suggested:

~~~text
www.yubie.id      edge public website
api.yubie.id      Yubie Core
ops.yubie.id      restricted internal ops
support.yubie.id  Chatwoot
crm.yubie.id      restricted CRM
~~~

Cloudflare can front public HTTP services for DNS/WAF/CDN.

## 3. Reverse proxy

Caddy is preferred initially because automatic HTTPS and reverse proxy configuration are simple.

Example shape:

~~~caddy
api.yubie.id {
  encode zstd gzip
  reverse_proxy api:8787
}

ops.yubie.id {
  reverse_proxy ops:3000
}
~~~

Finalize access-control directives per environment.

## 4. Container exposure

~~~text
Internet
 -> Caddy :443
 -> Docker private network
      api:8787
      worker
      postgres:5432
~~~

Do not publish API/Postgres on 0.0.0.0.

## 5. Docker/firewall caveat

Docker-published ports can bypass assumptions made by UFW.

Therefore:

- publish only intended reverse-proxy ports;
- use private Docker networks;
- bind local-only admin ports to 127.0.0.1;
- verify `ss -lntup` and perform an external port scan;
- review `DOCKER-USER`/iptables behavior when adding restrictions.

## 6. SSH

Prefer VPN/identity-aware access or strict source allowlist.

If SSH remains public:

- key-only;
- no root login;
- no shared keys;
- auth log review.

## 7. TLS

Use end-to-end verified TLS. Avoid Cloudflare Flexible mode.

Origin can use a public ACME certificate managed by Caddy or a properly verified origin certificate.

Do not use `tls_insecure_skip_verify` to hide configuration errors.

## 8. Proxy trust

Validate forwarded headers and configure trusted proxies where needed. Do not trust spoofed `X-Forwarded-*` headers from arbitrary direct clients.

## 9. Admin surfaces

Ops/CRM/Chatwoot super-admin require stronger control:

- application auth;
- MFA where supported;
- optional Cloudflare Access/VPN;
- no search indexing;
- rate limits/audit.

## 10. Verification

~~~bash
ss -lntup
docker ps
curl -I https://api.yubie.id/healthz
~~~

Then verify from an external network.
