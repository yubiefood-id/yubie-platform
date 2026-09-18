# 01 — VPS Host Baseline

## 1. Operating system

Recommended baseline:

~~~text
Ubuntu 24.04 LTS
x86_64 or arm64 supported by all chosen images
UTC system timezone
NTP/time synchronization enabled
~~~

Use UTC in server logs/database; render business dates in the appropriate user/business timezone.

## 2. Core VPS sizing

Initial planning class:

~~~text
4 vCPU
8 GB RAM
80-160 GB NVMe
~~~

This is a starting point for a small Yubie API/worker/Postgres workload, not a guarantee for Chatwoot.

## 3. Chatwoot host sizing

As of Sep 2026, official Chatwoot self-host guidance recommends production around:

~~~text
4+ CPU cores
8 GB RAM minimum
60 GB SSD
PostgreSQL 14+
Redis 7+
~~~

A dedicated Chatwoot host is recommended when self-hosting.

## 4. Provisioning checklist

Create a named deploy/ops user and add SSH key **before** disabling password/root login.

Example conceptually:

~~~bash
sudo adduser deploy
sudo usermod -aG sudo deploy
sudo install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
# install reviewed authorized_keys
~~~

After key-based login is independently verified:

~~~text
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
~~~

Keep an existing session open while validating SSH changes.

## 5. Required host packages

Prefer only required packages:

~~~text
ca-certificates
curl
git
jq
unzip
docker-ce
docker-ce-cli
containerd.io
docker-buildx-plugin
docker-compose-plugin
caddy if host-managed
~~~

Install Docker from Docker's official apt repository rather than a convenience script for production.

## 6. Updates

Enable unattended **security** updates or an equivalent scheduled patch process.

Application/container updates remain explicit releases.

Kernel/runtime updates that require reboot are scheduled with:

- maintenance owner;
- backup verification;
- post-reboot checks.

## 7. Host identity

Suggested:

~~~text
hostname: yubie-core-prod-01
timezone: UTC
locale: UTF-8
~~~

Use stable environment/service fields in telemetry rather than IP address as application identity.

## 8. Paths

~~~text
/opt/yubie/
  compose/
  releases/
  scripts/

/etc/yubie/
  production.env
~~~

Secret config should be owned by root and mode 0600.

## 9. Swap

A small swap area can provide emergency headroom, but it is not capacity. Alert on sustained swapping and resize/fix workload.

## 10. Host evidence

Retain non-secret evidence:

~~~text
uname -a
lsb_release
docker version
docker compose version
disk map
memory/cpu
firewall status
listening ports
SSH policy
time sync status
~~~
