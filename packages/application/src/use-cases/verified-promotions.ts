import { err, ok, isPromotionCampaignActive, quoteApprovedCampaign, type AppError, type ErrorCode, type ApprovedPromotionQuote, type PromotionEntitlement, type PaymentStatus, type UseCaseResult } from "@yubie/domain";
import type { Clock, IdGenerator, TransactionManager, TransactionalRepositories } from "../ports.js";
import { isCustomerProofValid, type CustomerProof } from "./phone-auth.js";
interface PromotionDeps { tx: TransactionManager; clock: Clock; ids: IdGenerator; }
const failure = (code: ErrorCode) => err({ code, message: "Promotion requires verified eligibility and an approved campaign.", retryable: code === "unavailable" || code === "pending_reconciliation", requestId: "promotion" });
function store(repos: TransactionalRepositories) { if (!repos.promotions) throw new Error("CUSTOMER_STORAGE_UNAVAILABLE"); return repos.promotions; }
async function requireWrite(result: Promise<UseCaseResult<unknown>>) { if (!(await result).ok) throw new Error("CUSTOMER_STORAGE_UNAVAILABLE"); }
async function phoneIdentity(repos: TransactionalRepositories, actor: CustomerProof, now: string) {
  if (!repos.customerIdentity || !await isCustomerProofValid(repos, actor, now, false)) return null;
  const phone = await repos.customerIdentity.findUserIdentity(actor.userId, "phone");
  return phone && Number.isFinite(Date.parse(phone.verifiedAt)) && Date.parse(phone.verifiedAt) <= Date.parse(now) ? phone : null;
}
export interface WelcomePromotionView {
  available: boolean; requiresPhoneVerification: true; percentage?: number; endsAt?: string;
  eligibility?: "verification_required" | "eligible" | "not_eligible" | "pending";
  hasEntitlement?: boolean;
}
export async function getWelcomePromotion(input: { actor?: CustomerProof }, deps: PromotionDeps): Promise<UseCaseResult<WelcomePromotionView>> {
  try { return await deps.tx.run("promotion.eligibility", async repos => {
    const promotions = store(repos), campaign = await promotions.findWelcomeCampaign(), now = deps.clock.now();
    if (!campaign || !isPromotionCampaignActive(campaign, now)) return ok({ available: false, requiresPhoneVerification: true as const });
    const view: WelcomePromotionView = { available: true, requiresPhoneVerification: true, percentage: campaign.basisPoints / 100, endsAt: campaign.endsAt!, eligibility: "verification_required" };
    if (!input.actor || !await phoneIdentity(repos, input.actor, now)) return ok(view);
    const own = await promotions.findEntitlement(input.actor.userId, campaign.id), used = own ? await promotions.findCurrentRedemption(own.id) : null;
    return ok({ ...view, hasEntitlement: !!own, eligibility: used?.state === "reserved" ? "pending" : used?.state === "consumed" || await promotions.hasPaidOrPendingHistory(input.actor.userId) ? "not_eligible" : "eligible" });
  }); } catch { return failure("unavailable"); }
}
export interface ClaimedPromotionView { entitlementId: string; code: string; percentage: number; endsAt: string; state: "available" | "reserved"; }
export async function claimWelcomePromotion(input: { actor: CustomerProof; guestPrincipal?: string }, deps: PromotionDeps): Promise<UseCaseResult<ClaimedPromotionView>> {
  try { return await deps.tx.run("promotion.claim", async repos => {
    const promotions = store(repos); await promotions.lockCustomer(input.actor.userId);
    const now = deps.clock.now(), phone = await phoneIdentity(repos, input.actor, now);
    if (!phone) return failure("forbidden");
    const campaign = await promotions.findWelcomeCampaign(); if (!campaign || !isPromotionCampaignActive(campaign, now)) return failure("forbidden");
    let entitlement = await promotions.findEntitlement(input.actor.userId, campaign.id);
    if (entitlement && entitlement.phoneIdentityId !== phone.id) return failure("forbidden");
    const current = entitlement ? await promotions.findCurrentRedemption(entitlement.id) : null;
    if (current?.state === "consumed") return failure("forbidden");
    if (!current && await promotions.hasPaidOrPendingHistory(input.actor.userId, input.guestPrincipal)) return failure("forbidden");
    if (!entitlement) {
      entitlement = { id: "ent_" + deps.ids.nextId(), campaignId: campaign.id, userId: input.actor.userId, phoneIdentityId: phone.id, claimedAt: now };
      await promotions.saveEntitlement(entitlement);
      await requireWrite(repos.audit.append({ action: "promotion.entitled", resourceType: "promotion_entitlement", resourceId: entitlement.id, actor: input.actor.userId, occurredAt: now }));
      await requireWrite(repos.outbox.enqueue({ eventType: "promotion.entitled", aggregateType: "promotion_entitlement", aggregateId: entitlement.id, dedupeKey: "promotion:entitled:" + entitlement.id, payloadJson: JSON.stringify({ entitlementId: entitlement.id, campaignId: campaign.id }), availableAt: now }));
    }
    return ok({ entitlementId: entitlement.id, code: campaign.code, percentage: campaign.basisPoints / 100, endsAt: campaign.endsAt!, state: current?.state === "reserved" ? "reserved" as const : "available" as const });
  }); } catch { return failure("unavailable"); }
}

export class PromotionAuthorizationError extends Error {
  readonly safeError: AppError;
  constructor(code: ErrorCode) { super("PROMOTION_NOT_AUTHORIZED"); this.safeError = { code, message: "Promotion requires verified eligibility or completion of the pending checkout.", retryable: code === "unavailable" || code === "pending_reconciliation", requestId: "promotion" }; }
}
export interface CheckoutPromotionAuthorization { entitlement: PromotionEntitlement; quote: ApprovedPromotionQuote; }
/** Caller holds the customer lock and has already handled stored checkout replays. */
export async function authorizeCheckoutPromotion(input: { userId?: string | null; actor?: CustomerProof; code?: string; guestPrincipal?: string; lines: ReadonlyArray<{ productId: string; quantity: number; unitPrice: number }> }, repos: TransactionalRepositories, now: string): Promise<CheckoutPromotionAuthorization | null> {
  const code = input.code?.trim().toUpperCase();
  if (!code) {
    if (input.userId && repos.promotions && await repos.promotions.hasReservedForUser(input.userId)) throw new PromotionAuthorizationError("pending_reconciliation");
    return null;
  }
  if (!repos.promotions || !repos.customerIdentity) throw new PromotionAuthorizationError("unavailable");
  if (!input.userId || input.actor?.userId !== input.userId) throw new PromotionAuthorizationError("forbidden");
  const phone = await phoneIdentity(repos, input.actor, now); if (!phone) throw new PromotionAuthorizationError("forbidden");
  const campaign = await repos.promotions.findCampaignByCode(code), quote = campaign ? quoteApprovedCampaign(campaign, input.lines, now) : null;
  if (!quote || !campaign) throw new PromotionAuthorizationError("forbidden");
  const entitlement = await repos.promotions.findEntitlement(input.userId, campaign.id);
  if (!entitlement || entitlement.phoneIdentityId !== phone.id) throw new PromotionAuthorizationError("forbidden");
  const current = await repos.promotions.findCurrentRedemption(entitlement.id);
  if (current) throw new PromotionAuthorizationError(current.state === "reserved" ? "pending_reconciliation" : "forbidden");
  if (await repos.promotions.hasPaidOrPendingHistory(input.userId, input.guestPrincipal)) throw new PromotionAuthorizationError("forbidden");
  return { entitlement, quote };
}
export async function reserveCheckoutPromotion(authorization: CheckoutPromotionAuthorization, orderId: string, repos: TransactionalRepositories, deps: Pick<PromotionDeps, "clock" | "ids">): Promise<void> {
  const now = deps.clock.now(), id = "red_" + deps.ids.nextId(), { entitlement, quote } = authorization;
  await store(repos).reserve({ id, entitlementId: entitlement.id, campaignId: entitlement.campaignId, userId: entitlement.userId, orderId, state: "reserved", eligibleSubtotalAmount: quote.eligibleSubtotalAmount, discountAmount: quote.discountAmount, basisPoints: quote.basisPoints, createdAt: now, updatedAt: now, consumedAt: null, releasedAt: null });
  await requireWrite(repos.audit.append({ action: "promotion.reserved", resourceType: "promotion_redemption", resourceId: id, actor: entitlement.userId, occurredAt: now }));
  await requireWrite(repos.outbox.enqueue({ eventType: "promotion.reserved", aggregateType: "promotion_redemption", aggregateId: id, dedupeKey: "promotion:reserved:" + id, payloadJson: JSON.stringify({ orderId, redemptionId: id, campaignId: entitlement.campaignId }), availableAt: now }));
}
/** Authoritative financial transitions only; timeouts/local expiry never release. */
export async function settlePromotionForPayment(repos: Pick<TransactionalRepositories, "promotions"> & Partial<Pick<TransactionalRepositories, "audit" | "outbox">>, orderId: string, status: PaymentStatus, now: string): Promise<void> {
  if (!repos.promotions || status === "pending") return;
  const state = status === "succeeded" || status === "refunded" ? "consumed" : "released";
  const changed = await repos.promotions.settleForOrder(orderId, state, now);
  for (const id of changed) {
    if (!repos.audit || !repos.outbox) throw new Error("CUSTOMER_STORAGE_UNAVAILABLE");
    await requireWrite(repos.audit.append({ action: "promotion." + state, resourceType: "promotion_redemption", resourceId: id, actor: "payment-transition", occurredAt: now }));
    await requireWrite(repos.outbox.enqueue({ eventType: "promotion." + state, aggregateType: "promotion_redemption", aggregateId: id, dedupeKey: `promotion:${state}:${id}`, payloadJson: JSON.stringify({ orderId, redemptionId: id }), availableAt: now }));
  }
}
