import { err, ok, type AppError, type PublicUser, type UserAccount } from "@yubie/domain";
import type {
  Clock,
  GoogleCredentialVerifier,
  IdGenerator,
  SessionRepository,
  SessionTokenService,
  UserRepository,
} from "../ports.js";

export interface GoogleLoginInput {
  credential: string;
  /** GIS double-submit CSRF: body value + g_csrf_token cookie must match. */
  csrfToken: string | null;
  csrfCookie: string | null;
}

export interface GoogleLoginResult {
  sessionToken: string;
  expiresAt: string;
  user: PublicUser;
}

export interface AuthDeps {
  verifier: GoogleCredentialVerifier;
  users: UserRepository;
  sessions: SessionRepository;
  tokens: SessionTokenService;
  clock: Clock;
  ids: IdGenerator;
  sessionTtlDays?: number;
}

const DEFAULT_SESSION_TTL_DAYS = 30;

function toPublicUser(user: { id: string; email: string | null; name: string | null; picture: string | null }): PublicUser {
  return { id: user.id, email: user.email, name: user.name, picture: user.picture };
}

/**
 * Google authenticates identity; Yubie owns the session. The Google ID token
 * is validated server-side (signature/issuer/audience/expiry inside the
 * verifier) and only then exchanged for a Yubie session token. The raw
 * Google credential is never persisted or used as a session token.
 */
export async function googleLogin(
  input: GoogleLoginInput,
  deps: AuthDeps,
): Promise<{ ok: true; value: GoogleLoginResult } | { ok: false; error: AppError }> {
  if (!input.csrfToken || !input.csrfCookie || input.csrfToken !== input.csrfCookie) {
    return err({ code: "unauthorized", message: "Google CSRF token mismatch.", retryable: false, requestId: "auth" });
  }
  const identity = await deps.verifier.verify(input.credential);
  if (!identity.ok) return identity;

  const now = deps.clock.now();
  const existingResult = await deps.users.findByGoogleSub(identity.value.sub);
  if (!existingResult.ok) return existingResult;
  const existing = existingResult.value;
  const profileChanged = existing
    ? (identity.value.emailVerified && identity.value.email !== existing.email)
      || identity.value.name !== existing.name
      || identity.value.picture !== existing.picture
    : false;
  const user: UserAccount = !existing
    ? {
        id: `usr_${deps.ids.nextId()}`,
        googleSub: identity.value.sub,
        email: identity.value.emailVerified ? identity.value.email : null,
        name: identity.value.name,
        picture: identity.value.picture,
        createdAt: now,
        updatedAt: now,
      }
    : profileChanged
      ? {
          ...existing,
          email: identity.value.emailVerified ? (identity.value.email ?? existing.email) : existing.email,
          name: identity.value.name ?? existing.name,
          picture: identity.value.picture ?? existing.picture,
          updatedAt: now,
        }
      : existing;
  await deps.users.save(user);

  const { token, tokenHash } = deps.tokens.issue();
  const ttlDays = deps.sessionTtlDays ?? DEFAULT_SESSION_TTL_DAYS;
  const expiresAt = new Date(Date.parse(now) + ttlDays * 24 * 60 * 60 * 1000).toISOString();
  await deps.sessions.save({
    id: `ses_${deps.ids.nextId()}`,
    userId: user.id,
    tokenHash,
    createdAt: now,
    expiresAt,
    revokedAt: null,
  });

  return ok({ sessionToken: token, expiresAt, user: toPublicUser(user) });
}

export async function resolveSession(
  token: string | null,
  deps: Pick<AuthDeps, "sessions" | "users" | "tokens" | "clock">,
): Promise<{ ok: true; value: PublicUser | null }> {
  if (!token) return ok(null);
  const sessionResult = await deps.sessions.findByTokenHash(deps.tokens.hash(token));
  if (!sessionResult.ok) return ok(null);
  const session = sessionResult.value;
  if (!session || session.revokedAt) return ok(null);
  if (Date.parse(session.expiresAt) <= Date.parse(deps.clock.now())) return ok(null);
  const userResult = await deps.users.findById(session.userId);
  if (!userResult.ok || !userResult.value) return ok(null);
  return ok(toPublicUser(userResult.value));
}

export async function logout(
  token: string | null,
  deps: Pick<AuthDeps, "sessions" | "tokens" | "clock">,
): Promise<{ ok: true; value: { revoked: boolean } }> {
  if (!token) return ok({ revoked: false });
  const sessionResult = await deps.sessions.findByTokenHash(deps.tokens.hash(token));
  if (!sessionResult.ok || !sessionResult.value || sessionResult.value.revokedAt) {
    return ok({ revoked: false });
  }
  await deps.sessions.save({ ...sessionResult.value, revokedAt: deps.clock.now() });
  return ok({ revoked: true });
}
