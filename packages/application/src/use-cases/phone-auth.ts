import { normalizePhone, ok, err, type PhoneChallenge, type PhoneChallengePurpose, type PublicUser, type UseCaseResult, type ErrorCode } from "@yubie/domain";
import type { Clock, IdGenerator, SessionTokenService, TransactionManager, TransactionalRepositories, CustomerIdentityRepository, OtpDeliveryPort } from "../ports.js";
import type { OtpCryptography } from "../auth/otp-cryptography.js";

export interface CustomerProof { userId: string; authenticatedAt: string; sessionHash: string; }
export interface PhoneAuthDeps {
  tx: TransactionManager; clock: Clock; ids: IdGenerator; tokens: SessionTokenService;
  crypto: OtpCryptography; allowedCountries: string[];
  verifyNewChallengeProof?: () => Promise<boolean>;
}
export interface StartPhoneInput {
  phone: string; country: string; browser: string; ip: string; idempotencyKey: string;
  purpose: PhoneChallengePurpose; captchaVerified: boolean; actor?: CustomerProof;
}
const fail = (code: ErrorCode) => err({ code, message: "Phone verification unavailable or invalid.", retryable: code === "unavailable" || code === "rate_limited", requestId: "phone-auth" });
function identity(repos: TransactionalRepositories): CustomerIdentityRepository {
  if (!repos.customerIdentity || !repos.users || !repos.authSessions) throw new Error("CUSTOMER_STORAGE_UNAVAILABLE");
  return repos.customerIdentity;
}
function requireWrite(result: UseCaseResult<unknown>): void { if (!result.ok) throw new Error("CUSTOMER_STORAGE_UNAVAILABLE"); }
function recent(actor: CustomerProof | undefined, now: number): boolean {
  const time = Date.parse(actor?.authenticatedAt ?? "");
  return Number.isFinite(time) && time <= now && now - time <= 300_000;
}
export async function isCustomerProofValid(repos: TransactionalRepositories, actor: CustomerProof | undefined, now: string, fresh: boolean): Promise<boolean> {
  if (!actor || !repos.authSessions) return false;
  const found = await repos.authSessions.findByTokenHash(actor.sessionHash);
  if (!found.ok) throw new Error("CUSTOMER_STORAGE_UNAVAILABLE");
  const s = found.value;
  return !!s && s.userId === actor.userId && !s.revokedAt && Date.parse(s.expiresAt) > Date.parse(now) && (!fresh || recent({ ...actor, authenticatedAt: s.createdAt }, Date.parse(now)));
}
export async function startPhoneChallenge(input: StartPhoneInput, deps: PhoneAuthDeps): Promise<UseCaseResult<{ id: string; state: string; expiresAt: string; resendAfter: string }>> {
  const phone = normalizePhone(input.phone, input.country), now = deps.clock.now(), ms = Date.parse(now);
  if (!phone || !phone.country || !deps.allowedCountries.includes(phone.country) || input.browser.length < 24 || input.browser.length > 128 || input.idempotencyKey.length < 16 || input.idempotencyKey.length > 128) return fail("validation");
  if (input.purpose !== "login" && (!input.actor || (input.purpose === "link_phone" && !recent(input.actor, ms)))) return fail("unauthorized");
  const browserHash = deps.crypto.hash("browser:" + input.browser), phoneHash = deps.crypto.hash("phone:" + phone.e164);
  const requestHash = deps.crypto.hash(JSON.stringify([phone.e164, input.purpose, input.actor?.userId ?? null]));
  try {
    if (!input.captchaVerified) {
      const admitted = await deps.tx.run("identity.captcha_admission", async repos => {
        const store = identity(repos); await store.lock(["captcha:" + browserHash]);
        if (input.purpose !== "login" && !await isCustomerProofValid(repos, input.actor, now, input.purpose === "link_phone")) return fail("unauthorized");
        const existing = await store.findRequest(browserHash, input.idempotencyKey);
        if (existing) return existing.requestHash === requestHash ? ok({ replay: existing }) : fail("conflict");
        const hour = Math.floor(ms / 3600_000), end = new Date((hour + 1) * 3600_000).toISOString();
        for (const [key, limit] of [["captcha-browser:" + browserHash, 10], ["captcha-ip:" + deps.crypto.hash(input.ip), 40], ["captcha-global", 120]] as const) {
          if (!await store.admit(key + ":" + hour, limit, end)) return fail("rate_limited");
        }
        return ok({ replay: null });
      });
      if (!admitted.ok) return admitted;
      const replay = admitted.value.replay;
      if (replay) return ok({ id: replay.id, state: replay.deliveryState, expiresAt: replay.expiresAt, resendAfter: new Date(Date.parse(replay.createdAt) + 60_000).toISOString() });
      // External proof runs after committing admission, with no open DB locks.
      let verified = false;
      try { verified = await deps.verifyNewChallengeProof?.() ?? false; } catch { /* Fail closed, preserving the request budget. */ }
      if (!verified) return fail("forbidden");
    }
    return await deps.tx.run("identity.challenge", async repos => {
    const now = deps.clock.now(), ms = Date.parse(now);
    const store = identity(repos); await store.lock(["otp:" + phoneHash, "browser:" + browserHash]);
    if (input.purpose !== "login" && !await isCustomerProofValid(repos, input.actor, now, input.purpose === "link_phone")) return fail("unauthorized");
    const existing = await store.findRequest(browserHash, input.idempotencyKey);
    if (existing) return existing.requestHash === requestHash ? ok({ id: existing.id, state: existing.deliveryState, expiresAt: existing.expiresAt, resendAfter: new Date(Date.parse(existing.createdAt) + 60_000).toISOString() }) : fail("conflict");
    if (input.purpose === "reauth") {
      const own = await store.findUserIdentity(input.actor!.userId, "phone");
      if (own?.subject !== phone.e164) return fail("unauthorized");
    }
    const latest = await store.latestChallenge(phoneHash, browserHash);
    if (latest && ms - Date.parse(latest.createdAt) < 60_000) return fail("rate_limited");
    const hour = Math.floor(ms / 3600_000), day = Math.floor(ms / 86400_000);
    for (const [key, limit, end] of [
      [phoneHash + ":" + hour, 5, (hour + 1) * 3600_000],
      [browserHash + ":" + hour, 5, (hour + 1) * 3600_000],
      [deps.crypto.hash("ip:" + input.ip) + ":" + hour, 20, (hour + 1) * 3600_000],
      ["pilot-hour:" + hour, 30, (hour + 1) * 3600_000],
      ["pilot-day:" + day, 200, (day + 1) * 86400_000],
    ] as const) if (!await store.admit(key, limit, new Date(end).toISOString())) return fail("rate_limited");
    await store.invalidateChallenges(phoneHash, browserHash, now);
    const id = "otp_" + deps.ids.nextId(), code = deps.crypto.code(), expiresAt = new Date(ms + 300_000).toISOString();
    await store.saveChallenge({ id, browserHash, phoneHash, requestKey: input.idempotencyKey, requestHash, purpose: input.purpose, targetUserId: input.purpose === "login" ? null : input.actor!.userId, state: "active", attempts: 0, verifier: deps.crypto.hash(id + ":" + code), phoneCiphertext: deps.crypto.seal(phone.e164), deliveryCiphertext: deps.crypto.seal(JSON.stringify({ phone: phone.e164, code })), deliveryState: "queued", deliveryAttempts: 0, leaseUntil: null, nextAttemptAt: now, createdAt: now, updatedAt: now, expiresAt });
    requireWrite(await repos.audit.append({ action: "identity.challenge_requested", resourceType: "phone_challenge", resourceId: id, actor: input.actor?.userId ?? "anonymous", occurredAt: now }));
    requireWrite(await repos.outbox.enqueue({ eventType: "identity.otp.requested", aggregateType: "phone_challenge", aggregateId: id, dedupeKey: "otp:" + id, payloadJson: JSON.stringify({ challengeId: id }), availableAt: now }));
    return ok({ id, state: "queued", expiresAt, resendAfter: new Date(ms + 60_000).toISOString() });
  }); } catch { return fail("unavailable"); }
}
export async function verifyPhoneChallenge(input: { id: string; code: string; browser: string; actor?: CustomerProof }, deps: PhoneAuthDeps): Promise<UseCaseResult<{ user: PublicUser; sessionToken: string; expiresAt: string }>> {
  const now = deps.clock.now(), ms = Date.parse(now);
  try { return await deps.tx.run("identity.verify", async repos => {
    const store = identity(repos), first = await store.findChallenge(input.id);
    if (!first) return fail("unauthorized");
    await store.lock(["otp:" + first.phoneHash, "browser:" + first.browserHash]);
    const c = await store.findChallenge(input.id);
    if (!c || c.browserHash !== deps.crypto.hash("browser:" + input.browser) || c.state !== "active") return fail("unauthorized");
    if (Date.parse(c.expiresAt) <= ms || c.attempts >= 5 || c.deliveryState === "failed") {
      await store.saveChallenge({ ...c, state: "expired", verifier: null, phoneCiphertext: null, deliveryCiphertext: null, updatedAt: now }); return fail("unauthorized");
    }
    if (c.targetUserId && (input.actor?.userId !== c.targetUserId || !await isCustomerProofValid(repos, input.actor, now, c.purpose === "link_phone"))) return fail("unauthorized");
    if (!/^\d{6}$/.test(input.code) || !c.verifier || !deps.crypto.matches(c.verifier, deps.crypto.hash(c.id + ":" + input.code))) {
      await store.saveChallenge({ ...c, attempts: c.attempts + 1, ...(c.attempts >= 4 ? { state: "failed" as const, verifier: null, phoneCiphertext: null, deliveryCiphertext: null } : {}), updatedAt: now }); return fail("unauthorized");
    }
    const phone = deps.crypto.open(c.phoneCiphertext!);
    const existing = await store.findIdentity("phone", phone);
    await store.saveChallenge({ ...c, state: "used", verifier: null, phoneCiphertext: null, deliveryCiphertext: null, updatedAt: now });
    if (c.targetUserId) {
      const own = await store.findUserIdentity(c.targetUserId, "phone");
      if ((existing && existing.userId !== c.targetUserId) || (own && own.subject !== phone)) return fail("conflict");
    }
    const userId = c.targetUserId ?? existing?.userId ?? "usr_" + deps.ids.nextId();
    let user = await repos.users!.findById(userId); if (!user.ok) throw new Error("CUSTOMER_STORAGE_UNAVAILABLE");
    if (!user.value) {
      requireWrite(await repos.users!.save({ id: userId, googleSub: null, email: null, name: null, picture: null, createdAt: now, updatedAt: now }));
      user = await repos.users!.findById(userId); if (!user.ok || !user.value) throw new Error("CUSTOMER_STORAGE_UNAVAILABLE");
    }
    if (!existing) await store.saveIdentity({ id: "aid_" + deps.ids.nextId(), userId, provider: "phone", subject: phone, verifiedAt: now, createdAt: now });
    await store.assignPhone(userId, phone, now);
    if (input.actor) {
      const previous = await repos.authSessions!.findByTokenHash(input.actor.sessionHash);
      if (!previous.ok) throw new Error("CUSTOMER_STORAGE_UNAVAILABLE");
      if (previous.value) requireWrite(await repos.authSessions!.save({ ...previous.value, revokedAt: now }));
    }
    const issued = deps.tokens.issue(), expiresAt = new Date(ms + 30 * 86400_000).toISOString();
    requireWrite(await repos.authSessions!.save({ id: "ses_" + deps.ids.nextId(), userId, tokenHash: issued.tokenHash, createdAt: now, expiresAt, revokedAt: null }));
    requireWrite(await repos.audit.append({ action: "identity.phone_verified", resourceType: "user", resourceId: userId, actor: userId, occurredAt: now }));
    return ok({ user: { id: userId, email: user.value!.email, name: user.value!.name, picture: user.value!.picture, phone, phoneVerified: true }, sessionToken: issued.token, expiresAt });
  }); } catch { return fail("unavailable"); }
}
export async function dispatchPhoneChallenges(deps: PhoneAuthDeps & { delivery: OtpDeliveryPort }): Promise<void> {
  for (let i = 0; i < 20; i++) {
    const now = deps.clock.now();
    const c = await deps.tx.run("identity.delivery.claim", async repos => { const s = identity(repos); await s.purgeExpired(now); return s.claimDelivery(now); });
    if (!c) break;
    let state: PhoneChallenge["deliveryState"] = "ambiguous";
    try {
      if (c.deliveryAttempts === 1 && c.deliveryCiphertext) {
        const payload = JSON.parse(deps.crypto.open(c.deliveryCiphertext)) as { phone: string; code: string };
        const destination = normalizePhone(payload.phone);
        state = destination?.country && deps.allowedCountries.includes(destination.country)
          ? (await deps.delivery.send({ id: c.id, ...payload, ttlSeconds: Math.max(1, Math.floor((Date.parse(c.expiresAt) - Date.parse(now)) / 1000)) })).status
          : "failed";
      } else {
        const status = (await deps.delivery.lookup(c.id)).status; state = status === "unknown" ? "ambiguous" : status;
      }
    } catch { /* A failed acknowledgment never authorizes another POST. */ }
    await deps.tx.run("identity.delivery.receipt", async repos => {
      const store = identity(repos); await store.lock(["otp:" + c.phoneHash]); const fresh = await store.findChallenge(c.id);
      if (!fresh || fresh.state !== "active" || fresh.deliveryAttempts !== c.deliveryAttempts) return;
      await store.saveChallenge({ ...fresh, deliveryState: state, deliveryCiphertext: null, leaseUntil: null, nextAttemptAt: new Date(Date.parse(now) + 30_000).toISOString(), updatedAt: now });
    });
  }
}

/** Retention must continue when all customer routes and SMS are disabled. */
export async function purgePhoneChallenges(deps: { tx: TransactionManager; clock: Clock }): Promise<void> {
  await deps.tx.run("identity.retention", async repos => {
    if (!repos.customerIdentity) throw new Error("CUSTOMER_STORAGE_UNAVAILABLE");
    await repos.customerIdentity.purgeExpired(deps.clock.now());
  });
}
