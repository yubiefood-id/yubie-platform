import assert from "node:assert/strict";
import test from "node:test";
import {
  CryptoSessionTokenService,
  FixedClock,
  googleLogin,
  InMemorySessionRepository,
  InMemoryUserRepository,
  logout,
  resolveSession,
  SequentialIdGenerator,
} from "../dist/index.js";

const IDENTITY = { sub: "google-sub-1", email: "hello@yubiefood.id", name: "Hello World", picture: null, emailVerified: true };

function makeVerifier(override = {}) {
  return { async verify() { return { ok: true, value: { ...IDENTITY, ...override } }; } };
}

function makeDeps(verifier = makeVerifier()) {
  return {
    verifier,
    users: new InMemoryUserRepository(),
    sessions: new InMemorySessionRepository(),
    tokens: new CryptoSessionTokenService(),
    clock: new FixedClock("2026-01-01T00:00:00.000Z"),
    ids: new SequentialIdGenerator(),
  };
}

const CSRF = { csrfToken: "csrf-1", csrfCookie: "csrf-1" };

test("google login validates CSRF, creates the user, and issues a Yubie session", async () => {
  const deps = makeDeps();
  const result = await googleLogin({ credential: "valid-token", ...CSRF }, deps);
  assert.equal(result.ok, true);
  assert.equal(result.value.user.email, IDENTITY.email);
  assert.notEqual(result.value.sessionToken, "valid-token");

  const resolved = await resolveSession(result.value.sessionToken, deps);
  assert.equal(resolved.value.id, result.value.user.id);
});

test("csrf mismatch is rejected", async () => {
  const deps = makeDeps();
  const result = await googleLogin({ credential: "valid-token", csrfToken: "a", csrfCookie: "b" }, deps);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "unauthorized");
  const noCookie = await googleLogin({ credential: "valid-token", csrfToken: "a", csrfCookie: null }, deps);
  assert.equal(noCookie.ok, false);
});

test("existing user login reuses the account and updates profile", async () => {
  const deps = makeDeps();
  const first = await googleLogin({ credential: "t", ...CSRF }, deps);
  const secondDeps = {
    verifier: makeVerifier({ name: "Updated Name" }),
    users: deps.users,
    sessions: new InMemorySessionRepository(),
    tokens: new CryptoSessionTokenService(),
    clock: new FixedClock("2026-01-02T00:00:00.000Z"),
    ids: new SequentialIdGenerator(),
  };
  const second = await googleLogin({ credential: "t", ...CSRF }, secondDeps);
  assert.equal(second.value.user.id, first.value.user.id);
  assert.equal(second.value.user.name, "Updated Name");
});

test("unverified email is never persisted as the account email", async () => {
  const deps = makeDeps(makeVerifier({ emailVerified: false }));
  const result = await googleLogin({ credential: "t", ...CSRF }, deps);
  assert.equal(result.value.user.email, null);
});

test("logout revokes the session; expired sessions do not resolve", async () => {
  const deps = makeDeps();
  const login = await googleLogin({ credential: "t", ...CSRF }, deps);
  const token = login.value.sessionToken;

  const laterDeps = { ...deps, clock: new FixedClock("2026-03-01T00:00:00.000Z") };
  const expired = await resolveSession(token, laterDeps);
  assert.equal(expired.value, null);

  const revoked = await logout(token, deps);
  assert.deepEqual(revoked.value, { revoked: true });
  const afterLogout = await resolveSession(token, deps);
  assert.equal(afterLogout.value, null);
});
