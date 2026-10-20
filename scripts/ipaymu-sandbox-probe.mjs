import { randomBytes } from "node:crypto";
import { runSandboxProbe } from "@yubie/integrations";

const report = await runSandboxProbe(process.env, fetch, `probe-${randomBytes(4).toString("hex")}`);
process.stdout.write(`${JSON.stringify(report)}\n`);
const required = process.env.YUBIE_SANDBOX_PROBE_REQUIRED === "1";
if (report.status === "CREATE_SESSION_PASS") process.exit(0);
if (report.status === "NOT_RUN") process.exit(required ? 1 : 0);
if (report.status === "BLOCKED_EXTERNAL") process.exit(2);
process.exit(1);
