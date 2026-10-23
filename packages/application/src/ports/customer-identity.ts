import type { AuthIdentity, PhoneChallenge } from "@yubie/domain";

/** All methods execute on the enclosing transaction, including locks. */
export interface CustomerIdentityRepository {
  lock(keys: string[]): Promise<void>;
  findIdentity(provider: AuthIdentity["provider"], subject: string): Promise<AuthIdentity | null>;
  findUserIdentity(userId: string, provider: AuthIdentity["provider"]): Promise<AuthIdentity | null>;
  saveIdentity(identity: AuthIdentity): Promise<void>;
  assignPhone(userId: string, phone: string, verifiedAt: string): Promise<void>;
  assignGoogle(userId: string, subject: string): Promise<void>;
  findChallenge(id: string): Promise<PhoneChallenge | null>;
  findRequest(browserHash: string, requestKey: string): Promise<PhoneChallenge | null>;
  latestChallenge(phoneHash: string, browserHash: string): Promise<PhoneChallenge | null>;
  invalidateChallenges(phoneHash: string, browserHash: string, now: string): Promise<void>;
  saveChallenge(challenge: PhoneChallenge): Promise<void>;
  admit(key: string, limit: number, expiresAt: string): Promise<boolean>;
  claimDelivery(now: string): Promise<PhoneChallenge | null>;
  purgeExpired(now: string): Promise<void>;
}
export interface OtpDeliveryPort {
  send(command: { id: string; phone: string; code: string; ttlSeconds: number }): Promise<{ status: "accepted" | "delivered" | "failed" }>;
  lookup(id: string): Promise<{ status: "accepted" | "delivered" | "failed" | "unknown" }>;
}
