import { spawnSync } from "node:child_process";

export function sourceTreeDirty(root) {
  // Inspect release inputs without disclosing private operator attachments.
  const result = spawnSync("git", ["status", "--porcelain", "--untracked-files=normal", "--", "apps", "packages", "scripts", "package.json", "package-lock.json", "vercel.json", "tsconfig*.json", ".github", "infrastructure"], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error("CATALOG_CONFIG: cannot establish source cleanliness");
  return result.stdout.trim().length !== 0;
}
