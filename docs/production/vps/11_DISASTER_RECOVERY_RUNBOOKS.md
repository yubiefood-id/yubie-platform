# 11 — Disaster Recovery and Runbooks

## Priority

1. people/food safety;
2. security containment;
3. canonical data integrity;
4. customer communication;
5. service restoration;
6. analytics/non-critical automation.

## Core VPS lost

Provision replacement, restore secrets, restore Postgres to approved point, deploy last-good images, restore DNS/origin, verify invariants and reconcile external events.

## Bad migration/database corruption

Freeze writes, preserve failed volume, isolated restore, verify, cut over, reconcile and postmortem.

## Credential compromise

Revoke/rotate, disable integration, preserve evidence, inspect actions and reconcile provider state.

## Bad assistant release

Auto-reply OFF, human-only Chatwoot, preserve policy/tool/version refs, review affected chats, add regression test, re-evaluate.

## Marketplace link compromise

Pause listing, switch only to verified alternative, audit change and rotate relevant admin credential if needed.

## Chatwoot lost

Restore independent Chatwoot DB/media/config, verify WhatsApp credentials and reconcile missed events.

## CRM lost

Restore or replace CRM, then re-project durable Yubie qualified leads.

## Bad marketplace import

Quarantine batch and revert to previous published projection; fix and replay immutable source checksum.

## Exercise

Quarterly rotate scenarios and record actual RPO/RTO, missing steps/credentials and remediation owners.
