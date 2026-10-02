/**
 * Identity records for Google sign-in (ADR-012). Google authenticates the
 * user; Yubie owns the application session. The Google `sub` is the stable
 * external identity — email/name are mutable profile data, never keys.
 */

export interface UserAccount {
  id: string;
  googleSub: string;
  email: string | null;
  name: string | null;
  picture: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthSession {
  id: string;
  userId: string;
  /** SHA-256 hash of the bearer token; the raw token is never stored. */
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

export interface PublicUser {
  id: string;
  email: string | null;
  name: string | null;
  picture: string | null;
}
