import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { validateInitialStaffApproval, type InitialStaffApproval } from "@yubie/domain";

interface ApprovalMetadata { uid: number; mode: number; regular: boolean; directory: boolean; symlink: boolean; links: number }
export function assertRootApprovalMetadata(chain: readonly ApprovalMetadata[]): void {
  const file = chain[0];
  if (!file || chain.length < 2 || !file.regular || file.symlink || file.links !== 1 || file.uid !== 0 || ![0o600, 0o640].includes(file.mode & 0o777)) throw new Error("First-admin approval must be a private root-owned single-link regular file");
  for (const parent of chain.slice(1)) if (!parent.directory || parent.symlink || parent.uid !== 0 || parent.mode & 0o022) throw new Error("Every first-admin approval parent must be root controlled");
}

/** Root prepares the short-lived approval; the runtime can only read its mount. */
export function loadInitialStaffApproval(file: string, binding: { sourceSha: string; audienceSha256: string }): InitialStaffApproval {
  if (resolve(file) !== file || file.includes("\0")) throw new Error("Absolute trusted root approval path required");
  const chain: ApprovalMetadata[] = [];
  for (let path = file;; path = dirname(path)) {
    const info = lstatSync(path);
    chain.push({ uid: info.uid, mode: info.mode, regular: info.isFile(), directory: info.isDirectory(), symlink: info.isSymbolicLink(), links: info.nlink });
    if (path === "/") break;
  }
  assertRootApprovalMetadata(chain);
  const descriptor = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = fstatSync(descriptor);
    assertRootApprovalMetadata([{ uid: info.uid, mode: info.mode, regular: info.isFile(), directory: false, symlink: false, links: info.nlink }, ...chain.slice(1)]);
    if (info.size > 8192) throw new Error("First-admin approval is too large");
    const approval: unknown = JSON.parse(readFileSync(descriptor, "utf8"));
    validateInitialStaffApproval(approval);
    if (approval.sourceSha !== binding.sourceSha || approval.audienceSha256 !== binding.audienceSha256) throw new Error("First-admin approval source or staff audience mismatch");
    if (/TEST_ONLY/.test(JSON.stringify(approval))) throw new Error("Synthetic first-admin approvals cannot enter the production runtime");
    return approval;
  } finally { closeSync(descriptor); }
}
