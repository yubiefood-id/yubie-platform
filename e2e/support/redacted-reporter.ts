import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import type { FullConfig, Reporter, TestCase, TestResult } from "@playwright/test/reporter";

/** Remote reports deliberately omit errors, DOM, headers, URLs with tokens,
 * attachments and storageState. Raw traces are disabled on remote tiers. */
export default class RedactedReporter implements Reporter {
  private rows = new Map<string, { id: string; title: string; project: string; status: string; code: string; retry: number; durationMs: number }>();
  private config?: FullConfig;
  onBegin(config: FullConfig) { this.config = config; }
  onTestEnd(test: TestCase, result: TestResult) {
    const message = result.errors.map((error) => error.message || "").join(" ");
    const code = message.match(/BLOCKED_[A-Z_]+/)?.[0] || (result.status === "passed" ? "PASS" : result.status === "skipped" ? "NOT_RUN" : "FAIL");
    this.rows.set(test.id, { id: test.id, title: test.title, project: test.parent.project()?.name || "", status: result.status, code, retry: result.retry, durationMs: result.duration });
  }
  onEnd() {
    const tier = String(this.config?.metadata.tier || "unknown");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const directory = join("artifacts", "qa", stamp, tier);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const tests = [...this.rows.values()];
    const totals = { passed: 0, failed: 0, blocked: 0, notRun: 0, flaky: 0 };
    for (const row of tests) {
      if (row.retry > 0) totals.flaky++;
      if (row.code.startsWith("BLOCKED_")) totals.blocked++;
      else if (row.status === "passed") totals.passed++;
      else if (row.status === "skipped") totals.notRun++;
      else totals.failed++;
    }
    let sourceSha: string | null = process.env.GITHUB_SHA || null;
    let workingTreeDirty: boolean | null = null;
    try {
      sourceSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
      workingTreeDirty = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).length > 0;
    } catch { /* Exported source cannot claim Git provenance. */ }
    const metadata = { tier, expectedSha: this.config?.metadata.expectedSha || null, sourceSha, workingTreeDirty, recordedAt: new Date().toISOString(), acceptanceScope: "selected-browser-suite-only", fullPlatformAcceptance: false };
    const escape = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]!);
    const write = (name: string, content: string) => writeFileSync(join(directory, name), content, { mode: 0o600 });
    write("report.json", JSON.stringify({ ...metadata, totals, tests }, null, 2));
    write("junit.xml", `<?xml version="1.0"?><testsuite name="${escape(tier)}" tests="${tests.length}" failures="${totals.failed + totals.blocked}">${tests.map((row) => `<testcase name="${escape(row.title)}" classname="${escape(row.project)}" time="${row.durationMs / 1000}">${row.status === "passed" ? "" : row.status === "skipped" ? '<skipped message="NOT_RUN"/>' : `<failure message="${escape(row.code)}">Private diagnostic details omitted.</failure>`}</testcase>`).join("")}</testsuite>`);
    write("index.html", `<!doctype html><html lang="en"><meta charset="utf-8"><title>Yubie ${escape(tier)} evidence</title><h1>Yubie ${escape(tier)}</h1><p>This selected suite is not full-platform acceptance.</p><pre>${escape(JSON.stringify({ ...metadata, totals }, null, 2))}</pre><table><caption>Sanitized results</caption><tr><th>Case</th><th>Project</th><th>Outcome</th></tr>${tests.map((row) => `<tr><td>${escape(row.title)}</td><td>${escape(row.project)}</td><td>${escape(row.code)}</td></tr>`).join("")}</table></html>`);
    console.log(JSON.stringify({ event: "qa.browser_results", tier, ...totals, directory }));
  }
}
