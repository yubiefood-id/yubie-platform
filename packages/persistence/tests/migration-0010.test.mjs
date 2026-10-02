import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import postgres from "postgres";
import { PostgresGrowthRepository, PostgresTransactionManager, closeDatabase, createDatabase } from "../dist/index.js";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "../migrations");
const databaseUrl = process.env.DATABASE_URL;
const NOW = "2026-10-02T00:00:00.000Z";

async function createIsolatedDatabase() {
  const admin = postgres(databaseUrl, { max: 1 });
  const dbName = `yubie_0010_test_${String(Date.now())}_${Math.floor(Math.random() * 10000)}`;
  await admin`CREATE DATABASE ${admin(dbName)}`;
  await admin.end();
  const url = new URL(databaseUrl);
  url.pathname = `/${dbName}`;
  return { testUrl: url.toString(), dbName };
}

async function dropIsolatedDatabase(dbName) {
  const admin = postgres(databaseUrl, { max: 1 });
  await admin`DROP DATABASE ${admin(dbName)} WITH (FORCE)`;
  await admin.end();
}

async function applyMigrations(sql) {
  await sql`CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
  const applied = new Set((await sql`SELECT version FROM schema_migrations`).map((row) => row.version));
  const files = readdirSync(migrationsDir).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const body = readFileSync(join(migrationsDir, file), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`INSERT INTO schema_migrations (version) VALUES (${file})`;
    });
  }
}

test("migration 0010 creates growth tables; submissions are durable and deduped", { skip: !databaseUrl }, async () => {
  const { testUrl, dbName } = await createIsolatedDatabase();
  const bootstrap = postgres(testUrl, { max: 1 });
  await applyMigrations(bootstrap);
  await bootstrap.end();

  const database = createDatabase(testUrl);
  const tx = new PostgresTransactionManager(database);

  try {
    const growth = new PostgresGrowthRepository(database);
    await tx.run("growth.newsletter", async (repos) => {
      await repos.growth.recordNewsletterConsent({ email: "pg@example.com", name: null, source: "footer", consentVersion: "2026-10", consentedAt: NOW });
      await repos.growth.appendConsent({ id: "csl_pg_1", subjectType: "email", subjectKey: "pg@example.com", purpose: "marketing_newsletter", action: "granted", consentVersion: "2026-10", source: "footer", occurredAt: NOW });
    });
    await tx.run("growth.newsletter", async (repos) => {
      const replay = await repos.growth.recordNewsletterConsent({ email: "pg@example.com", name: null, source: "footer", consentVersion: "2026-10", consentedAt: NOW });
      assert.equal(replay.value.outcome, "already_subscribed");
    });

    const rows = await database.client`SELECT email, status, source FROM newsletter_subscriptions`;
    assert.equal(rows.length, 1, "unique email dedupes resubmissions");
    assert.equal(rows[0].status, "pending");
    assert.equal(rows[0].source, "footer");

    const ledger = await database.client`SELECT purpose, action FROM consent_ledger`;
    assert.deepEqual(ledger.map((row) => [row.purpose, row.action]), [["marketing_newsletter", "granted"]]);

    const waitlistDupes = await database.client`
      INSERT INTO product_waitlist_entries (id, email, product_id, status, source, consent_version, consented_at, created_at, updated_at)
      VALUES ('wtl_1', 'w@example.com', 'shake', 'waiting', 'pdp', '2026-10', ${NOW}, ${NOW}, ${NOW}),
             ('wtl_2', 'w@example.com', 'shake', 'waiting', 'pdp', '2026-10', ${NOW}, ${NOW}, ${NOW})
      ON CONFLICT DO NOTHING
      RETURNING id
    `;
    assert.equal(waitlistDupes.length, 1, "unique (email, product) dedupes waitlist entries");
  } finally {
    await closeDatabase(database);
    await dropIsolatedDatabase(dbName);
  }
});
