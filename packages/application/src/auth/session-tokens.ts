import { createHash, randomBytes } from "node:crypto";
import type { SessionTokenService } from "../ports.js";

/**
 * Yubie session tokens: 256-bit random bearer values. Only the SHA-256 hash
 * is persisted; Google ID tokens are never used as Yubie session tokens.
 */
export class CryptoSessionTokenService implements SessionTokenService {
  issue(): { token: string; tokenHash: string } {
    const token = randomBytes(32).toString("base64url");
    return { token, tokenHash: this.hash(token) };
  }

  hash(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }
}
