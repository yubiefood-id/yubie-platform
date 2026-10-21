import { readFile, stat } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { homedir } from "node:os";

export async function localCredentials() {
  try {
    const path = resolve(process.env.ERP_LOCAL_CREDENTIALS_FILE ?? "");
    const allowed = join(homedir(), ".local/state/yubie/erp-native/");
    if (!path.startsWith(allowed) || !/^\d{8}\/users\.json$/.test(path.slice(allowed.length))) throw new Error("ERP_LOCAL_CONFIG: use the protected local synthetic credential store");
    if (((await stat(path)).mode & 0o077) || ((await stat(dirname(path))).mode & 0o077)) throw new Error("ERP_LOCAL_CONFIG: private file and directory permissions required");
    const users = JSON.parse(await readFile(path, "utf8"));
    for (const role of ["operations", "warehouse", "manufacturing", "qa", "finance", "management"]) {
      if (users?.[role]?.user !== `${role}@yubie.test` || typeof users[role].password !== "string" || users[role].password.length < 20) throw new Error();
    }
    if (typeof users?.integration?.apiKey !== "string" || users.integration.apiKey.length < 16 || typeof users.integration.apiSecret !== "string" || users.integration.apiSecret.length < 20) throw new Error();
    return { directory: dirname(path), users };
  } catch {
    throw new Error("ERP_LOCAL_CONFIG: protected local credential file is missing or invalid");
  }
}
