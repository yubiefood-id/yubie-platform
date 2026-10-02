import { createPublicKey, verify as verifySignature, type KeyObject } from "node:crypto";
import { err, ok, type UseCaseResult } from "@yubie/domain";
import type { GoogleCredentialVerifier, GoogleIdentity } from "@yubie/application";

const BASE64URL = "base64url" as BufferEncoding;

import type { FetchLike } from "../xendit/xendit-payment-provider.js";

export interface GoogleIdTokenVerifierOptions {
  /** The OAuth client id the token must be issued for (aud). */
  clientId: string;
  jwksUrl?: string;
  fetchFn?: FetchLike;
  /** Injection point for deterministic expiry tests. */
  now?: () => number;
}

interface Jwk {
  kid?: string;
  kty?: string;
  alg?: string;
  use?: string;
  n?: string;
  e?: string;
}

interface IdTokenPayload {
  iss?: string;
  aud?: string;
  sub?: string;
  exp?: number;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

const JWKS_CACHE_MS = 60 * 60 * 1000;
const VALID_ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);

/**
 * Zero-dependency Google ID token verifier (RS256 via node:crypto + Google's
 * public JWKS). Validates signature, issuer, audience and expiry; nothing
 * from the client is trusted without the validated credential. The `sub`
 * claim is the only stable identity used downstream.
 */
export class GoogleIdTokenVerifier implements GoogleCredentialVerifier {
  private readonly clientId: string;
  private readonly jwksUrl: string;
  private readonly fetchFn: import("../xendit/xendit-payment-provider.js").FetchLike;
  private readonly now: () => number;
  private jwksCache: { keys: Jwk[]; fetchedAt: number } | null = null;

  constructor(options: GoogleIdTokenVerifierOptions) {
    this.clientId = options.clientId;
    this.jwksUrl = options.jwksUrl ?? "https://www.googleapis.com/oauth2/v3/certs";
    this.fetchFn = options.fetchFn ?? (fetch as unknown as import("../xendit/xendit-payment-provider.js").FetchLike);
    this.now = options.now ?? (() => Date.now());
  }

  async verify(idToken: string): Promise<UseCaseResult<GoogleIdentity>> {
    const segments = idToken.split(".");
    if (segments.length !== 3) {
      return err({ code: "validation", message: "Malformed Google ID token.", retryable: false, requestId: "auth" });
    }
    const [encodedHeader, encodedPayload, encodedSignature] = segments as [string, string, string];
    let header: { alg?: string; kid?: string };
    let payload: IdTokenPayload;
    try {
      header = JSON.parse(Buffer.from(encodedHeader, BASE64URL).toString("utf8"));
      payload = JSON.parse(Buffer.from(encodedPayload, BASE64URL).toString("utf8"));
    } catch {
      return err({ code: "validation", message: "Malformed Google ID token.", retryable: false, requestId: "auth" });
    }

    if (header.alg !== "RS256" || typeof header.kid !== "string") {
      return err({ code: "unauthorized", message: "Unsupported Google ID token algorithm.", retryable: false, requestId: "auth" });
    }
    if (typeof payload.iss !== "string" || !VALID_ISSUERS.has(payload.iss)) {
      return err({ code: "unauthorized", message: "Google ID token issuer mismatch.", retryable: false, requestId: "auth" });
    }
    if (payload.aud !== this.clientId) {
      return err({ code: "unauthorized", message: "Google ID token audience mismatch.", retryable: false, requestId: "auth" });
    }
    if (typeof payload.exp !== "number" || payload.exp * 1000 <= this.now()) {
      return err({ code: "unauthorized", message: "Google ID token expired.", retryable: false, requestId: "auth" });
    }
    if (typeof payload.sub !== "string" || payload.sub.length === 0) {
      return err({ code: "unauthorized", message: "Google ID token missing subject.", retryable: false, requestId: "auth" });
    }

    const jwk = await this.loadJwk(header.kid);
    if (!jwk || !jwk.n || !jwk.e) {
      return err({ code: "unauthorized", message: "Google signing key not found.", retryable: false, requestId: "auth" });
    }
    let key: KeyObject;
    try {
      key = createPublicKey({ key: { kty: "RSA", n: jwk.n, e: jwk.e }, format: "jwk" });
    } catch {
      return err({ code: "unauthorized", message: "Google signing key unusable.", retryable: false, requestId: "auth" });
    }
    const signingInput = Buffer.from(`${encodedHeader}.${encodedPayload}`, "utf8");
    const signature = Buffer.from(encodedSignature, BASE64URL);
    const valid = verifySignature("RSA-SHA256", signingInput, key, signature);
    if (!valid) {
      return err({ code: "unauthorized", message: "Google ID token signature mismatch.", retryable: false, requestId: "auth" });
    }

    return ok({
      sub: payload.sub,
      email: typeof payload.email === "string" ? payload.email : null,
      name: typeof payload.name === "string" ? payload.name : null,
      picture: typeof payload.picture === "string" ? payload.picture : null,
      emailVerified: payload.email_verified === true,
    });
  }

  private async loadJwk(kid: string): Promise<Jwk | null> {
    if (!this.jwksCache || this.now() - this.jwksCache.fetchedAt > JWKS_CACHE_MS) {
      try {
        const response = await this.fetchFn(this.jwksUrl);
        const json = (await response.json()) as { keys?: Jwk[] };
        this.jwksCache = { keys: Array.isArray(json.keys) ? json.keys : [], fetchedAt: this.now() };
      } catch {
        if (!this.jwksCache) this.jwksCache = { keys: [], fetchedAt: this.now() };
      }
    }
    return this.jwksCache.keys.find((key) => key.kid === kid) ?? null;
  }
}
