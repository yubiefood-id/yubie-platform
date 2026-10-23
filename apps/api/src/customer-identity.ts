import { isIP } from "node:net";
import { startPhoneChallenge, verifyPhoneChallenge, linkGoogleIdentity } from "@yubie/application";
import { normalizePhone, type AppError } from "@yubie/domain";
import { phoneChallengeSchema, phoneVerifySchema, googleLoginSchema } from "@yubie/validation";
import type { AppContext } from "./composition/create-app.js";
import { authorizeCustomerMutation, currentCustomerProof, customerCookie, customerSessionCookie, customerBootstrap } from "./customer-security.js";
const json = (data: unknown, status = 200, headers: Record<string, string> = {}) => Response.json(data, { status, headers: { "cache-control": "no-store", ...headers } });
function failure(error: AppError): Response {
  const status = { validation: 400, unauthorized: 401, forbidden: 403, conflict: 409, rate_limited: 429 }[error.code as "validation" | "unauthorized" | "forbidden" | "conflict" | "rate_limited"] ?? 503;
  return json({ ok: false, code: error.code === "conflict" ? "ASSISTED_IDENTITY_CONFLICT" : error.code.toUpperCase() }, status, status === 429 ? { "retry-after": "60" } : {});
}
async function body(request: Request): Promise<unknown> {
  const reader = request.body?.getReader(); if (!reader) return null;
  let length = 0; const chunks: Uint8Array[] = [];
  for (;;) { const part = await reader.read(); if (part.done) break; length += part.value.byteLength; if (length > 8192) { await reader.cancel(); throw new Error("BODY_TOO_LARGE"); } chunks.push(part.value); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return null; }
}
export async function handleCustomerIdentity(request: Request, ctx: AppContext): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  const match = path.match(/^\/v1\/auth\/phone\/challenges(?:\/(otp_[A-Za-z0-9_-]{1,96})(?:\/(verify|resend))?)?$/);
  const googleLink = path === "/v1/account/identities/google";
  if (!match && !googleLink) return null;
  const browser = request.method === "GET" ? customerCookie(request, "yubie_browser") : authorizeCustomerMutation(request, ctx);
  if (!browser) return json({ ok: false, code: "CSRF_INVALID" }, 403);
  if (!ctx.identityTransactions) return json({ ok: false, code: "CUSTOMER_STORAGE_UNAVAILABLE" }, 503);
  try {
    const actor = await currentCustomerProof(request, ctx);
    if (googleLink) {
      if (request.method !== "POST") return json({ ok: false, code: "NOT_FOUND" }, 404);
      if (!actor) return json({ ok: false, code: "UNAUTHORIZED" }, 401);
      if (!ctx.verifier) return json({ ok: false, code: "AUTH_NOT_CONFIGURED" }, 503);
      const parsed = googleLoginSchema.safeParse(await body(request)); if (!parsed.success) return json({ ok: false, code: "INVALID_REQUEST" }, 400);
      const result = await linkGoogleIdentity({ credential: parsed.data.credential, csrfToken: parsed.data.g_csrf_token, csrfCookie: customerCookie(request, "g_csrf_token"), actor }, { verifier: ctx.verifier, users: ctx.users, sessions: ctx.authSessions, tokens: ctx.tokens, clock: ctx.clock, ids: ctx.ids, tx: ctx.identityTransactions });
      return result.ok ? json({ ok: true, data: { user: result.value.user } }, 200, { "set-cookie": customerSessionCookie(result.value.sessionToken, result.value.expiresAt, ctx) }) : failure(result.error);
    }
    if (!ctx.phoneAuth) return json({ ok: false, code: "PHONE_AUTH_UNAVAILABLE" }, 503);
    const deps = { tx: ctx.identityTransactions, clock: ctx.clock, ids: ctx.ids, tokens: ctx.tokens, ...ctx.phoneAuth };
    const id = match![1], action = match![2];
    const challenge = id ? await ctx.identityTransactions.run("identity.challenge_read", async repos => repos.customerIdentity!.findChallenge(id)) : null;
    if (id && (!challenge || challenge.browserHash !== ctx.phoneAuth.crypto.hash("browser:" + browser))) return json({ ok: false, code: "NOT_FOUND" }, 404);
    if (request.method === "GET" && challenge && !action) return json({ ok: true, data: { id, state: Date.parse(challenge.expiresAt) <= Date.parse(ctx.clock.now()) ? "expired" : challenge.state === "active" ? challenge.deliveryState : challenge.state, expiresAt: challenge.expiresAt } });
    if (request.method !== "POST") return json({ ok: false, code: "NOT_FOUND" }, 404);
    const input = await body(request);
    if (action === "verify" && id) {
      const parsed = phoneVerifySchema.safeParse(input); if (!parsed.success) return json({ ok: false, code: "INVALID_REQUEST" }, 400);
      const result = await verifyPhoneChallenge({ id, code: parsed.data.code, browser, ...(actor ? { actor } : {}) }, deps);
      return result.ok ? json({ ok: true, data: { user: result.value.user } }, 200, { "set-cookie": customerSessionCookie(result.value.sessionToken, result.value.expiresAt, ctx) }) : failure(result.error);
    }
    if (!id || action === "resend") {
      const parsed = phoneChallengeSchema.safeParse(input); if (!parsed.success) return json({ ok: false, code: "INVALID_REQUEST" }, 400);
      const normalized = normalizePhone(parsed.data.phone, parsed.data.country);
      if (challenge && (!normalized || challenge.phoneHash !== ctx.phoneAuth.crypto.hash("phone:" + normalized.e164))) return json({ ok: false, code: "INVALID_REQUEST" }, 400);
      if (challenge?.targetUserId && challenge.targetUserId !== actor?.userId) return json({ ok: false, code: "UNAUTHORIZED" }, 401);
      const ip = request.headers.get("x-yubie-client-ip") ?? "";
      if (!isIP(ip)) return json({ ok: false, code: "TRUSTED_CLIENT_CONTEXT_UNAVAILABLE" }, 503);
      const verifyCaptcha = () => ctx.phoneAuth!.verifyCaptcha(parsed.data.captchaToken, ip);
      const result = await startPhoneChallenge({ ...parsed.data, purpose: challenge?.purpose ?? parsed.data.purpose, browser, ip, idempotencyKey: request.headers.get("idempotency-key") ?? "", captchaVerified: false, ...(actor ? { actor } : {}) }, { ...deps, verifyNewChallengeProof: verifyCaptcha });
      return result.ok ? json({ ok: true, data: result.value }, 202, customerBootstrap(request, ctx).headers) : failure(result.error);
    }
    return json({ ok: false, code: "NOT_FOUND" }, 404);
  } catch (error) {
    return json({ ok: false, code: error instanceof Error && error.message === "BODY_TOO_LARGE" ? "BODY_TOO_LARGE" : "CUSTOMER_STORAGE_UNAVAILABLE" }, error instanceof Error && error.message === "BODY_TOO_LARGE" ? 413 : 503);
  }
}
