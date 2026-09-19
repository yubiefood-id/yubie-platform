import assert from "node:assert/strict";
import test from "node:test";

test("migration SQL file exists", async () => {
  const { readFileSync } = await import("node:fs");
  const { join, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const migration = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../migrations/0001_initial.sql"), "utf8");
  assert.match(migration, /CREATE TABLE marketplace_listings/);
  assert.match(migration, /CREATE TABLE outbound_clicks/);
  const migration2 = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../migrations/0002_assistant.sql"), "utf8");
  assert.match(migration2, /CREATE TABLE webhook_inbox/);
  assert.match(migration2, /CREATE TABLE conversation_sessions/);
});

test("persistence integration runs when DATABASE_URL is set", async (t) => {
  if (!process.env.DATABASE_URL) {
    t.skip("DATABASE_URL not set");
    return;
  }
  const { createDatabase, closeDatabase, PostgresMarketplaceListingRepository } = await import("../dist/index.js");
  const database = createDatabase(process.env.DATABASE_URL);
  const repo = new PostgresMarketplaceListingRepository(database);
  const result = await repo.findActiveByProduct("flour");
  assert.equal(result.ok, true);
  await closeDatabase(database);
});
