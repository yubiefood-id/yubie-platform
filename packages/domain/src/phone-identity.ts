export type PhoneChallengePurpose = "login" | "link_phone" | "reauth";
export type PhoneDeliveryState = "queued" | "sending" | "ambiguous" | "accepted" | "delivered" | "failed";
export interface AuthIdentity {
  id: string; userId: string; provider: "google" | "phone"; subject: string;
  verifiedAt: string; createdAt: string;
}
export interface PhoneChallenge {
  id: string; browserHash: string; phoneHash: string; requestKey: string; requestHash: string;
  purpose: PhoneChallengePurpose; targetUserId: string | null;
  state: "active" | "used" | "expired" | "failed"; attempts: number;
  verifier: string | null; phoneCiphertext: string | null; deliveryCiphertext: string | null;
  deliveryState: PhoneDeliveryState; deliveryAttempts: number; leaseUntil: string | null;
  nextAttemptAt: string; createdAt: string; updatedAt: string; expiresAt: string;
}
