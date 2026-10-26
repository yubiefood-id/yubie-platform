import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";

export async function artifactDigest(root) {
  const files = [];
  async function walk(directory) {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error("Artifact symlinks are refused");
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && entry.name !== "release-manifest.json") files.push({ path: relative(join(root, "dist"), path), sha256: createHash("sha256").update(await readFile(path)).digest("hex") });
    }
  }
  await walk(join(root, "dist/client"));
  await walk(join(root, "dist/server"));
  if (!files.some(file => file.path.startsWith("client/")) || !files.some(file => file.path.startsWith("server/"))) throw new Error("Complete client/server artifact required");
  return "sha256:" + createHash("sha256").update(JSON.stringify(files)).digest("hex");
}
