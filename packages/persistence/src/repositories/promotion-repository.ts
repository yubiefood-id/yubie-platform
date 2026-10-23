import { and, eq, inArray, sql } from "drizzle-orm";
import type { PromotionRepository } from "@yubie/application";
import type { PromotionEntitlement, PromotionRedemption } from "@yubie/domain";
import type { Database } from "../client.js";
import { promotionCampaigns, promotionEntitlements, promotionRedemptions } from "../schema/index.js";
export class PostgresPromotionRepository implements PromotionRepository {
  constructor(private readonly database: Database) {}
  async lockCustomer(userId: string): Promise<void> { await this.database.db.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${"promotion:" + userId},0))`); }
  async findWelcomeCampaign() { const [row] = await this.database.db.select().from(promotionCampaigns).where(and(eq(promotionCampaigns.kind, "welcome"), eq(promotionCampaigns.status, "active"))).limit(1).for("share"); return row ?? null; }
  async findCampaignByCode(code: string) { const [row] = await this.database.db.select().from(promotionCampaigns).where(eq(promotionCampaigns.code, code)).limit(1).for("share"); return row ?? null; }
  async findEntitlement(userId: string, campaignId: string): Promise<PromotionEntitlement | null> {
    const [row] = await this.database.db.select().from(promotionEntitlements).where(and(eq(promotionEntitlements.userId, userId), eq(promotionEntitlements.campaignId, campaignId))).limit(1);
    return row ? { id: row.id, userId: row.userId, campaignId: row.campaignId, phoneIdentityId: row.phoneIdentityId, claimedAt: row.claimedAt } : null;
  }
  async saveEntitlement(value: PromotionEntitlement): Promise<void> { await this.database.db.insert(promotionEntitlements).values(value); }
  async findCurrentRedemption(entitlementId: string): Promise<PromotionRedemption | null> {
    const [row] = await this.database.db.select().from(promotionRedemptions).where(and(eq(promotionRedemptions.entitlementId, entitlementId), inArray(promotionRedemptions.state, ["reserved", "consumed"]))).limit(1); return row ?? null;
  }
  async hasReservedForUser(userId: string): Promise<boolean> {
    const [row] = await this.database.db.select({ id: promotionRedemptions.id }).from(promotionRedemptions).where(and(eq(promotionRedemptions.userId, userId), eq(promotionRedemptions.state, "reserved"))).limit(1); return !!row;
  }
  async hasPaidOrPendingHistory(userId: string, guestPrincipal?: string): Promise<boolean> {
    const guest = guestPrincipal ?? null;
    const rows = await this.database.db.execute(sql`
      SELECT id FROM orders o WHERE
      (o.user_id=${userId} OR (${guest}::text IS NOT NULL AND EXISTS(SELECT 1 FROM order_payments own WHERE own.order_id=o.id AND own.principal_key=${guest})))
      AND (o.status IN('draft','pending_payment','paid','processing','shipped','completed') OR EXISTS(
        SELECT 1 FROM order_payments p WHERE p.order_id=o.id AND (p.status IN('succeeded','refunded') OR p.reconciliation_state IN('late_success_after_terminal','multiple_successful_transactions'))
      )) LIMIT 1`);
    return rows.length > 0;
  }
  async reserve(value: PromotionRedemption): Promise<void> { await this.database.db.insert(promotionRedemptions).values(value); }
  async settleForOrder(orderId: string, state: "consumed" | "released", now: string): Promise<string[]> {
    const rows = await this.database.db.update(promotionRedemptions).set({ state, updatedAt: now, consumedAt: state === "consumed" ? now : null, releasedAt: state === "released" ? now : null }).where(and(eq(promotionRedemptions.orderId, orderId), eq(promotionRedemptions.state, "reserved"))).returning({ id: promotionRedemptions.id });
    return rows.map(row => row.id);
  }
}
