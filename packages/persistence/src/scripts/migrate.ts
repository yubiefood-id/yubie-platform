import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "../../migrations");
const sql = postgres(databaseUrl, { max: 1 });

async function migrate() {
  await sql`CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
  const applied = new Set((await sql<{ version: string }[]>`SELECT version FROM schema_migrations`).map((row) => row.version));
  const files = readdirSync(migrationsDir).filter((file) => file.endsWith(".sql")).sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const body = readFileSync(join(migrationsDir, file), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`INSERT INTO schema_migrations (version) VALUES (${file})`;
    });
    console.log(`Applied ${file}`);
  }

  await sql.end();
  console.log("Migrations complete");
}

migrate().catch((error) => {
  console.error(error);
  process.exit(1);
});
