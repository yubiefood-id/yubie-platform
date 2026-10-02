import assert from "node:assert/strict";
import test from "node:test";
import { CryptoIdGenerator, FixedClock, SequentialIdGenerator, SystemClock } from "../dist/index.js";

test("SystemClock advances with real time (production clock is never frozen)", async () => {
  const clock = new SystemClock();
  let advanced = false;
  for (let i = 0; i < 200 && !advanced; i += 1) {
    const before = clock.now();
    await new Promise((resolve) => setTimeout(resolve, 2));
    const after = clock.now();
    advanced = Date.parse(after) > Date.parse(before);
  }
  assert.ok(advanced, "repeated now() reads must eventually report a later instant");
});

test("session expiry math uses the real current instant under SystemClock", async () => {
  const clock = new SystemClock();
  const issuedAt = clock.now();
  await new Promise((resolve) => setTimeout(resolve, 5));
  const later = clock.now();
  assert.ok(Date.parse(later) > Date.parse(issuedAt));
  const expiresAt = new Date(Date.parse(issuedAt) + 24 * 60 * 60 * 1000).toISOString();
  assert.ok(Date.parse(later) < Date.parse(expiresAt));
});

test("CryptoIdGenerator produces opaque unique ids across instances", () => {
  const generator = new CryptoIdGenerator();
  const ids = new Set();
  for (let i = 0; i < 10_000; i += 1) ids.add(generator.nextId());
  assert.equal(ids.size, 10_000);

  const secondInstance = new CryptoIdGenerator();
  const restartIds = new Set([secondInstance.nextId(), ...ids]);
  assert.equal(restartIds.size, 10_001, "a new generator instance (e.g. after restart) must never reuse ids");

  const id = generator.nextId();
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, "ids are opaque UUIDs, not counters");
});

test("SequentialIdGenerator restart collision is why it stays test-only", () => {
  const first = new SequentialIdGenerator();
  assert.equal(first.nextId(), "id-1");
  const restarted = new SequentialIdGenerator();
  assert.equal(restarted.nextId(), "id-1", "counter resets per process — durable records must not use it");
});

test("FixedClock stays frozen (test determinism primitive)", () => {
  const clock = new FixedClock("2026-01-01T00:00:00.000Z");
  assert.equal(clock.now(), "2026-01-01T00:00:00.000Z");
  assert.equal(clock.now(), "2026-01-01T00:00:00.000Z");
});
