import { createHmac, randomBytes, randomInt, createCipheriv, createDecipheriv, timingSafeEqual } from "node:crypto";

/** Secrets are provided by protected runtime config, never by a customer. */
export class OtpCryptography {
  private readonly encryptionKey: Buffer;
  constructor(private readonly options: { hashKey: string; encryptionKey: string }) {
    this.encryptionKey = Buffer.from(options.encryptionKey, "base64");
    if (options.hashKey.length < 32 || this.encryptionKey.length !== 32) throw new Error("OTP_KEYS_INVALID");
  }
  hash(value: string): string { return createHmac("sha256", this.options.hashKey).update("identity-v3:" + value).digest("hex"); }
  code(): string { return String(randomInt(0, 1_000_000)).padStart(6, "0"); }
  matches(left: string, right: string): boolean {
    return /^[a-f0-9]{64}$/.test(left) && /^[a-f0-9]{64}$/.test(right) && timingSafeEqual(Buffer.from(left), Buffer.from(right));
  }
  seal(value: string): string {
    const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", this.encryptionKey, iv, { authTagLength: 16 });
    const bytes = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), bytes]).toString("base64url");
  }
  open(value: string): string {
    if (value.length > 8192) throw new Error("OTP_PAYLOAD_INVALID");
    const bytes = Buffer.from(value, "base64url");
    if (bytes.length < 29) throw new Error("OTP_PAYLOAD_INVALID");
    const cipher = createDecipheriv("aes-256-gcm", this.encryptionKey, bytes.subarray(0, 12), { authTagLength: 16 });
    cipher.setAuthTag(bytes.subarray(12, 28));
    return Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString("utf8");
  }
}
