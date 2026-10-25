# Initial inventory allocation and reconciliation

Status: **BLOCKED_OPERATOR — physical quantities and released lots are unverified.**
No production stock has been initialized or adjusted by this release session.
Unknown quantities below are not zero-stock assertions.

| Family | Target physical units | Verified physical count | Released allocation |
|---|---:|---|---|
| Flour | 20 | UNKNOWN | Not supplied |
| Shake | 20 | UNKNOWN | Not supplied |
| Ppang | 20 | UNKNOWN | Not supplied |
| Mie | 20 | UNKNOWN | Not supplied |

The target is four family allocations, not nine independent inventories of 20.

| Family | Size | SKU | Approved price IDR | Actual quantity | Lot/QC status |
|---|---|---|---:|---|---|
| Flour | 250g | YBF-250 | 35000 | UNKNOWN | Unverified |
| Flour | 1kg | YBF-1000 | 120000 | UNKNOWN | Unverified |
| Shake | sachet | YBS-045 | 19500 | UNKNOWN | Unverified |
| Shake | pack-7 | YBS-7X45 | 129000 | UNKNOWN | Unverified |
| Ppang | mini | YBP-MINI-035 | 9000 | UNKNOWN | Unverified |
| Ppang | maxi | YBP-MAXI | 19000 | UNKNOWN | Unverified |
| Ppang | mini-pack-5 | YBP-MINI-5 | 42000 | UNKNOWN | Unverified |
| Mie | single | YBM-075 | 16000 | UNKNOWN | Unverified |
| Mie | pack-3 | YBM-3X75 | 45000 | UNKNOWN | Unverified |

Code catalog prices match this table. Production balances and any independent
operator price records require privileged read-only reconciliation before release.
Retail prices were not changed.

## Required operator record

For each physical allocation supply: family, physical SKU, UOM, counted quantity,
count timestamp, lot/batch identity, expiry date, QC release reference, approver,
and whether a multipack is independently packaged or consumes component units.
Record reserved and paid/unfulfilled stock separately: the onboarding input's
counted quantity is **uncommitted physical stock**, not total warehouse stock.

The approved possible component conversions are Shake pack ×7 sachets, Mini
Ppang pack ×5 Mini, and Mie pack ×3 single packets. They are capabilities, not
assertions about actual packaging. Independent sealed packs use their own
verified balances. Flour sizes and Maxi Ppang remain distinct physical SKUs.

## Onboarding procedure

Freeze new admission and reconcile existing commitments. Store the count input
outside the checkout in protected operator storage. Validate real evidence, then:

```sh
npm run inventory:onboard --workspace @yubie/persistence -- /protected/count.json
npm run inventory:onboard --workspace @yubie/persistence -- /protected/count.json --apply --confirm-count
```

The first command is a dry-run. Apply requires disabled admission. Review each
before/after/delta, family allocation and evidence reference before applying.
Count freshness is 15 minutes; stale balances or changed operation payloads
are rejected. Replaying an applied operation returns its original result,
without adding stock after sales. New counts need new operation identities.

Existing balances are preserved by migration. Packaging and QC approvals must
be supplied explicitly before they become sellable. Quantity, movement, audit,
operation evidence and outbox commit together. Routine recounts cannot reverse
a recall or change historical lot expiry/UOM. Recalled or expired allocations
hold affected fulfillment while preserving verified payment truth.

The public availability API exposes SKU capacity only; lot/supplier data stays
inside protected operational records. ERPNext remains a read-only shadow.
