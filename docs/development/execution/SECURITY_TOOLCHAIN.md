# Security toolchain for the payment change

Recorded **2026-10-19T18:26:25Z**.

## What ran

| Gate | Result |
|---|---|
| `.semgrep/payment.yml` rules, executed by `node scripts/payment-rule-scan.mjs` | PASS at 2026-10-19T18:26Z. Refuses `https://my.ipaymu.com` and `https://live.ipaymu.com` in `apps/**/src` and `packages/**/src`, refuses `IPAYMU_ENV=production` there, and requires exactly one `this.fetchFn(` in `createPaymentSession`. |
| `apps/web/scripts/validate-artifact.sh` | Names `IPAYMU_API_KEY` and `IPAYMU_VA` are in the client-bundle grep. The script was not run against a fresh web artifact in this session. |
| `npm run secret:scan` | Not re-run after the last doc write. It scans git-tracked files only. |

`npm run check` now calls `payment:scan` before the test suite.

The official Semgrep CLI was not installed. The checked-in rule file is the pin. An operator who already has Semgrep can run `semgrep --config .semgrep/payment.yml --error`. That CLI invocation is NOT_RUN here.

## Trail of Bits

`.agents/skills` was searched for Trail of Bits and Semgrep skills. None are present. No plugin was installed. The plan requires an explicit permission, a license check, and a hook scan before any Trail of Bits subset is added. That install is BLOCKED until the operator approves it.

## Not done

No active DAST, and no request to `sandbox.ipaymu.com`, `my.ipaymu.com`, or an ERP host.
