import { err, ok, type AppError, type PublicUser, type UserAccount } from "@yubie/domain";
import type {
  Clock,
  GoogleCredentialVerifier,
  IdGenerator,
  SessionRepository,
  SessionTokenService,
  UserRepository,
  TransactionManager,
  CustomerIdentityRepository,
} from "../ports.js";
import { isCustomerProofValid, type CustomerProof } from "./phone-auth.js";

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
  tx?: TransactionManager;
  previousSessionHash?: string;
}

const DEFAULT_SESSION_TTL_DAYS = 30;

function toPublicUser(user: UserAccount): PublicUser {
  return { id: user.id, email: user.email, name: user.name, picture: user.picture, phone: user.phone ?? null, phoneVerified: !!user.phoneVerifiedAt };
}
class AuthWriteError extends Error { constructor(readonly safeError: AppError) { super("AUTH_WRITE_FAILED"); } }

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

  const persist = async (deps: AuthDeps, identities?: CustomerIdentityRepository): Promise<import("@yubie/domain").UseCaseResult<GoogleLoginResult>> => {
  const now = deps.clock.now();
  const linked = identities ? await identities.findIdentity("google", identity.value.sub) : null;
  const existingResult = linked ? await deps.users.findById(linked.userId) : await deps.users.findByGoogleSub(identity.value.sub);
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
  const savedUser = await deps.users.save(user);
  if (!savedUser.ok) return savedUser;
  if (identities && !linked) await identities.saveIdentity({ id: "aid_" + deps.ids.nextId(), provider: "google", subject: identity.value.sub, userId: user.id, verifiedAt: now, createdAt: now });
  if (identities) await identities.assignGoogle(user.id, identity.value.sub);
  if (deps.previousSessionHash) {
    const old = await deps.sessions.findByTokenHash(deps.previousSessionHash);
    if (!old.ok) return old;
    if (old.value) { const revoked = await deps.sessions.save({ ...old.value, revokedAt: now }); if (!revoked.ok) return revoked; }
  }

  const { token, tokenHash } = deps.tokens.issue();
  const ttlDays = deps.sessionTtlDays ?? DEFAULT_SESSION_TTL_DAYS;
  const expiresAt = new Date(Date.parse(now) + ttlDays * 24 * 60 * 60 * 1000).toISOString();
  const savedSession = await deps.sessions.save({
    id: `ses_${deps.ids.nextId()}`,
    userId: user.id,
    tokenHash,
    createdAt: now,
    expiresAt,
    revokedAt: null,
  });
  if (!savedSession.ok) return savedSession;

  return ok({ sessionToken: token, expiresAt, user: toPublicUser(user) });
  };
  if (!deps.tx) return persist(deps);
  try { return await deps.tx.run("identity.google_login", async repos => {
    if (!repos.customerIdentity || !repos.users || !repos.authSessions) throw new Error("CUSTOMER_STORAGE_UNAVAILABLE");
    await repos.customerIdentity.lock(["google:" + deps.tokens.hash(identity.value.sub)]);
    const result = await persist({ ...deps, users: repos.users, sessions: repos.authSessions }, repos.customerIdentity);
    if (!result.ok) throw new AuthWriteError(result.error);
    return result;
  }); } catch (error) {
    return error instanceof AuthWriteError ? err(error.safeError) : err({ code: "unavailable", message: "Customer storage is unavailable.", retryable: true, requestId: "auth" });
  }
}

/** Linking proves the current session and the new Google identity separately. */
export async function linkGoogleIdentity(input: GoogleLoginInput & { actor: CustomerProof }, deps: AuthDeps): Promise<import("@yubie/domain").UseCaseResult<GoogleLoginResult>> {
  const denied = (code: "unauthorized" | "conflict" | "unavailable") => err({ code, message: "Identity linking requires valid proofs or assisted resolution.", retryable: code === "unavailable", requestId: "identity-link" });
  if (!deps.tx || !input.csrfToken || input.csrfToken !== input.csrfCookie) return denied("unauthorized");
  const verified = await deps.verifier.verify(input.credential); if (!verified.ok) return verified;
  const now = deps.clock.now();
  try { return await deps.tx.run("identity.google_link", async repos => {
    const store = repos.customerIdentity;
    if (!store || !repos.users || !repos.authSessions) throw new Error("CUSTOMER_STORAGE_UNAVAILABLE");
    await store.lock(["google:" + deps.tokens.hash(verified.value.sub), "user:" + input.actor.userId]);
    if (!await isCustomerProofValid(repos, input.actor, now, true)) return denied("unauthorized");
    const owner = await store.findIdentity("google", verified.value.sub), own = await store.findUserIdentity(input.actor.userId, "google");
    const legacy = await repos.users.findByGoogleSub(verified.value.sub);
    if (!legacy.ok) throw new Error("CUSTOMER_STORAGE_UNAVAILABLE");
    if ((owner && owner.userId !== input.actor.userId) || (own && own.subject !== verified.value.sub) || (legacy.value && legacy.value.id !== input.actor.userId)) return denied("conflict");
    const found = await repos.users.findById(input.actor.userId);
    if (!found.ok || !found.value) throw new Error("CUSTOMER_STORAGE_UNAVAILABLE");
    if (!owner) await store.saveIdentity({ id: "aid_" + deps.ids.nextId(), userId: input.actor.userId, provider: "google", subject: verified.value.sub, verifiedAt: now, createdAt: now });
    await store.assignGoogle(input.actor.userId, verified.value.sub);
    const user = { ...found.value, googleSub: verified.value.sub, name: found.value.name ?? verified.value.name, picture: found.value.picture ?? verified.value.picture, email: found.value.email ?? (verified.value.emailVerified ? verified.value.email : null), updatedAt: now };
    const saved = await repos.users.save(user); if (!saved.ok) throw new Error("CUSTOMER_STORAGE_UNAVAILABLE");
    const previous = await repos.authSessions.findByTokenHash(input.actor.sessionHash);
    if (!previous.ok || !previous.value) throw new Error("CUSTOMER_STORAGE_UNAVAILABLE");
    const revoked = await repos.authSessions.save({ ...previous.value, revokedAt: now }); if (!revoked.ok) throw new Error("CUSTOMER_STORAGE_UNAVAILABLE");
    const issued = deps.tokens.issue(), expiresAt = new Date(Date.parse(now) + 30 * 86400_000).toISOString();
    const session = await repos.authSessions.save({ id: "ses_" + deps.ids.nextId(), userId: user.id, tokenHash: issued.tokenHash, createdAt: now, expiresAt, revokedAt: null });
    if (!session.ok) throw new Error("CUSTOMER_STORAGE_UNAVAILABLE");
    const audit = await repos.audit.append({ action: "identity.google_linked", resourceType: "user", resourceId: user.id, actor: user.id, occurredAt: now }); if (!audit.ok) throw new Error("CUSTOMER_STORAGE_UNAVAILABLE");
    return ok({ user: toPublicUser(user), sessionToken: issued.token, expiresAt });
  }); } catch { return denied("unavailable"); }
}

export async function resolveSession(
  token: string | null,
  deps: Pick<AuthDeps, "sessions" | "users" | "tokens" | "clock">,
): Promise<import("@yubie/domain").UseCaseResult<PublicUser | null>> {
  if (!token) return ok(null);
  const sessionResult = await deps.sessions.findByTokenHash(deps.tokens.hash(token));
  if (!sessionResult.ok) return sessionResult;
  const session = sessionResult.value;
  if (!session || session.revokedAt) return ok(null);
  if (Date.parse(session.expiresAt) <= Date.parse(deps.clock.now())) return ok(null);
  const userResult = await deps.users.findById(session.userId);
  if (!userResult.ok) return userResult;
  if (!userResult.value) return ok(null);
  return ok(toPublicUser(userResult.value));
}

export async function logout(
  token: string | null,
  deps: Pick<AuthDeps, "sessions" | "tokens" | "clock">,
): Promise<import("@yubie/domain").UseCaseResult<{ revoked: boolean }>> {
  if (!token) return ok({ revoked: false });
  const sessionResult = await deps.sessions.findByTokenHash(deps.tokens.hash(token));
  if (!sessionResult.ok) return sessionResult;
  if (!sessionResult.value || sessionResult.value.revokedAt) {
    return ok({ revoked: false });
  }
  const saved = await deps.sessions.save({ ...sessionResult.value, revokedAt: deps.clock.now() });
  if (!saved.ok) return saved;
  return ok({ revoked: true });
}
