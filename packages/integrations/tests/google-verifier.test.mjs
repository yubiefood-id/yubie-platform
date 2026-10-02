import assert from "node:assert/strict";
import test from "node:test";
import { createHash, createPublicKey, generateKeyPairSync, sign as cryptoSign } from "node:crypto";
import { createServer } from "node:http";
import { GoogleIdTokenVerifier } from "../dist/index.js";

const CLIENT_ID = "test-client-id.apps.googleusercontent.com";
const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "test-kid", alg: "RS256", use: "sig" };

let jwksServer;
let jwksUrl;

test.before(async () => {
  await new Promise((resolve) => {
    jwksServer = createServer((request, response) => {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ keys: [jwk] }));
    });
    jwksServer.listen(0, "127.0.0.1", resolve);
  });
  jwksUrl = `http://127.0.0.1:${jwksServer.address().port}/certs`;
});

test.after(() => { jwksServer.close(); });

function base64url(buffer) {
  return Buffer.from(buffer).toString("base64url");
}

function makeToken({ payload, signatureKey = privateKey, tamper = false } = {}) {
  const header = { alg: "RS256", kid: "test-kid" };
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const signature = base64url(cryptoSign("RSA-SHA256", Buffer.from(`${encodedHeader}.${encodedPayload}`), signatureKey));
  const finalSignature = tamper ? base64url(Buffer.from("tampered-signature")) : signature;
  return `${encodedHeader}.${encodedPayload}.${finalSignature}`;
}

function makeVerifier(now = () => Date.now()) {
  return new GoogleIdTokenVerifier({ clientId: CLIENT_ID, jwksUrl, now });
}

const VALID_PAYLOAD = {
  iss: "accounts.google.com",
  aud: CLIENT_ID,
  sub: "google-sub-42",
  exp: Math.floor(Date.now() / 1000) + 3600,
  email: "hello@yubiefood.id",
  email_verified: true,
  name: "Hello World",
  picture: "https://pictures.example/hello.png",
};

test("verifier accepts a correctly signed token and returns the identity", async () => {
  const result = await makeVerifier().verify(makeToken({ payload: VALID_PAYLOAD }));
  assert.equal(result.ok, true);
  assert.equal(result.value.sub, "google-sub-42");
  assert.equal(result.value.email, "hello@yubiefood.id");
  assert.equal(result.value.emailVerified, true);
});

test("verifier rejects wrong audience, expiry, bad signature, and malformed tokens", async () => {
  const verifier = makeVerifier();
  const wrongAudience = await verifier.verify(makeToken({ payload: { ...VALID_PAYLOAD, aud: "other-client" } }));
  assert.equal(wrongAudience.ok, false);

  const expired = await verifier.verify(makeToken({ payload: { ...VALID_PAYLOAD, exp: Math.floor(Date.now() / 1000) - 10 } }));
  assert.equal(expired.ok, false);

  const tampered = await verifier.verify(makeToken({ payload: VALID_PAYLOAD, tamper: true }));
  assert.equal(tampered.ok, false);

  const wrongKey = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const forged = await verifier.verify(makeToken({ payload: VALID_PAYLOAD, signatureKey: wrongKey.privateKey }));
  assert.equal(forged.ok, false);

  const malformed = await verifier.verify("not-a-jwt");
  assert.equal(malformed.ok, false);

  const wrongIssuer = await verifier.verify(makeToken({ payload: { ...VALID_PAYLOAD, iss: "https://evil.example" } }));
  assert.equal(wrongIssuer.ok, false);
});

test("verifier deterministically applies the injected clock to expiry", async () => {
  const now = Math.floor(Date.now() / 1000) + 7200;
  const verifier = new GoogleIdTokenVerifier({ clientId: CLIENT_ID, jwksUrl, now: () => now * 1000 });
  const result = await verifier.verify(makeToken({ payload: VALID_PAYLOAD }));
  assert.equal(result.ok, false);
});
