import { randomBytes } from "node:crypto";
import { runSandboxProbe } from "@yubie/integrations";

const report = await runSandboxProbe(process.env, fetch, `probe-${randomBytes(4).toString("hex")}`);
const redacted = JSON.stringify(report);
process.stdout.write(`${redacted}\n`);
if (report.status === "NOT_RUN") process.exit(0);
if (report.status === "BLOCKED_EXTERNAL") process.exit(2);
if (report.status === "PASS") process.exit(0);
process.exit(1);
