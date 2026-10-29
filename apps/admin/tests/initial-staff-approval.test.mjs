import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initialStaffApprovalMatches } from "@yubie/domain";

const now = Date.parse("2026-10-29T08:00:00Z");
const approval = { action: "bootstrap_first_named_admin", role: "admin", approvalId: "isolated-approval", sourceSha: "a".repeat(40), audienceSha256: "b".repeat(64), emailSha256: "c".repeat(64), approvedBy: "isolated-owner", approvalRef: "isolated-owner-instruction", notBefore: "2026-10-29T07:59:00Z", expiresAt: "2026-10-29T08:30:00Z" };
const binding = { sourceSha: approval.sourceSha, audienceSha256: approval.audienceSha256, emailSha256: approval.emailSha256, nowMs: now };

test("first-admin approval binds one email, source, audience and a limited active window", () => {
  assert.equal(initialStaffApprovalMatches(approval, binding), true);
  for (const change of [{ emailSha256: "d".repeat(64) }, { audienceSha256: "d".repeat(64) }, { sourceSha: "d".repeat(40) }, { nowMs: Date.parse(approval.expiresAt) }, { nowMs: Date.parse(approval.notBefore) - 1 }]) assert.equal(initialStaffApprovalMatches(approval, { ...binding, ...change }), false);
  for (const change of [{ role: "finance" }, { action: "create_arbitrary_staff" }, { approvedBy: "PENDING" }, { expiresAt: "2026-10-29T09:01:00Z" }, { notBefore: "invalid" }]) assert.equal(initialStaffApprovalMatches({ ...approval, ...change }, binding), false);
});

test("bootstrap file requires root-controlled parents, single-link regular file and nonwritable group", async () => {
  const { assertRootApprovalMetadata, loadInitialStaffApproval } = await import("../dist/initial-staff-approval.js");
  const file = { uid: 0, mode: 0o640, regular: true, directory: false, symlink: false, links: 1 };
  const parent = { uid: 0, mode: 0o750, regular: false, directory: true, symlink: false, links: 2 };
  assert.doesNotThrow(() => assertRootApprovalMetadata([file, parent]));
  for (const change of [{ uid: 10001 }, { mode: 0o660 }, { symlink: true }, { links: 2 }, { regular: false }]) assert.throws(() => assertRootApprovalMetadata([{ ...file, ...change }, parent]));
  for (const change of [{ uid: 10001 }, { mode: 0o777 }, { symlink: true }, { directory: false }]) assert.throws(() => assertRootApprovalMetadata([file, { ...parent, ...change }]));
  const directory = mkdtempSync(join(tmpdir(), "untrusted-approval-"));
  try {
    const path = join(directory, "approval.json"); writeFileSync(path, JSON.stringify(approval), { mode: 0o600 });
    assert.throws(() => loadInitialStaffApproval(path, binding), /root|trusted/i);
    assert.throws(() => loadInitialStaffApproval("relative.json", binding), /absolute|root|trusted/i);
  } finally { rmSync(directory, { recursive: true }); }
});
