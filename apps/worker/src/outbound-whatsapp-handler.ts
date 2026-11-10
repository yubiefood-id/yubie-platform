import type { OutboundTemplateTransport } from "@yubie/application";
import { createOutboundTransportFromEnv } from "@yubie/integrations";
import { PostgresOutboundTemplateRepository, PostgresRuntimeConfigRepository, OUTBOUND_FOLLOWUP_PURPOSE, type Database } from "@yubie/persistence";
import { increment } from "./metrics.js";

const RETRY_DELAYS = [60_000, 10 * 60_000, 60 * 60_000, 6 * 60 * 60_000];

/**
 * WA-05: dispatch + reconcile for the approved outbound template gateway.
 * Every claim is rechecked here — consent revoke precedence, approved
 * template, expiry, cost cap — immediately before the transport call, and
 * ambiguous provider outcomes are reconciled against receipts, never
 * blindly resent. The whole path no-ops while the audited runtime switch is
 * off (default).
 */
export async function processOutboundWhatsapp(database: Database, transport?: OutboundTemplateTransport): Promise<void> {
  const runtime = await new PostgresRuntimeConfigRepository(database).getSnapshot();
  if (!runtime.outboundWhatsappEnabled) return;

  const repo = new PostgresOutboundTemplateRepository(database);
  const sender = transport ?? createOutboundTransportFromEnv();

  await reconcileOutboundReceipts(database, sender);

  const claims = await repo.claimDispatches(10, runtime.outboundDailyContactCap);
  for (const claim of claims) {
    // Recheck chain at dispatch time (GOAL_PLAN WA-05 gate).
    const consent = await repo.effectiveConsent(claim.toWhatsapp, OUTBOUND_FOLLOWUP_PURPOSE);
    if (consent !== "granted") {
      await repo.cancelDraftAndSend(claim.draftId, `consent_${consent}`);
      increment("outbound_cancelled_consent_total");
      continue;
    }
    if (claim.templateStatus !== "approved") {
      await repo.cancelDraftAndSend(claim.draftId, "template_not_approved");
      increment("outbound_cancelled_template_total");
      continue;
    }
    if (claim.expiresAt && Date.parse(claim.expiresAt) <= Date.now()) {
      await repo.cancelDraftAndSend(claim.draftId, "approval_expired");
      increment("outbound_cancelled_expired_total");
      continue;
    }

    const result = await sender.send({
      toWhatsapp: claim.toWhatsapp,
      templateName: claim.templateName,
      templateVersion: claim.templateVersion,
      language: claim.templateLanguage,
      bodyText: claim.bodyText,
      idempotencyKey: claim.draftId,
    });

    if (result.ok) {
      const cost = result.costMicrousd ?? 0;
      if (claim.costCapMicrousd > 0 && cost > claim.costCapMicrousd) {
        // Accepted by the provider but over the draft's cap: record and flag
        // for operator review rather than pretend it fit the budget.
        await repo.updateSend(claim.sendId, { state: "dispatched", providerMessageId: result.providerMessageId, costMicrousd: cost, lastError: "cost_over_cap", nextAttemptAt: new Date(Date.now() + 30_000).toISOString() });
        increment("outbound_cost_over_cap_total");
        continue;
      }
      await repo.updateSend(claim.sendId, { state: "dispatched", providerMessageId: result.providerMessageId, costMicrousd: cost, nextAttemptAt: new Date(Date.now() + 30_000).toISOString() });
      increment("outbound_dispatched_total");
      continue;
    }

    if (result.code === "TIMEOUT" || result.code === "AMBIGUOUS") {
      // The message may exist at the provider: reconcile the receipt before any retry.
      await repo.updateSend(claim.sendId, { state: "ambiguous", lastError: result.code, nextAttemptAt: new Date(Date.now() + 60_000).toISOString() });
      increment("outbound_ambiguous_total");
      continue;
    }
    if (result.code === "VALIDATION_ERROR" || claim.attempt >= 5) {
      await repo.updateSend(claim.sendId, { state: "failed", lastError: result.code ?? "failed" });
      increment("outbound_failed_total");
      continue;
    }
    await repo.updateSend(claim.sendId, { state: "pending", lastError: result.code, nextAttemptAt: new Date(Date.now() + RETRY_DELAYS[Math.min(claim.attempt - 1, RETRY_DELAYS.length - 1)]!).toISOString() });
    increment("outbound_retry_total");
  }
}

/** Resolve dispatched/ambiguous sends from provider receipts; never resend. */
export async function reconcileOutboundReceipts(database: Database, transport: OutboundTemplateTransport): Promise<void> {
  if (!transport.getMessageStatus) return;
  const repo = new PostgresOutboundTemplateRepository(database);
  const candidates = await repo.reconciliationCandidates(20);
  for (const candidate of candidates) {
    if (!candidate.providerMessageId) {
      // Dispatched with no provider id: an attempt died mid-flight. Hold for
      // bounded backoff, then fail closed rather than risk a duplicate send.
      if (Date.now() - Date.parse(candidate.createdAt) > 24 * 60 * 60 * 1000) {
        await repo.updateSend(candidate.sendId, { state: "failed", lastError: "DISPATCH_UNRESOLVED" });
        increment("outbound_failed_total");
      } else {
        await repo.updateSend(candidate.sendId, { nextAttemptAt: new Date(Date.now() + 5 * 60_000).toISOString() });
      }
      continue;
    }
    const status = await transport.getMessageStatus(candidate.providerMessageId);
    if (status === "delivered") {
      await repo.updateSend(candidate.sendId, { state: "delivered" });
      increment("outbound_delivered_total");
    } else if (status === "failed") {
      await repo.updateSend(candidate.sendId, { state: "failed", lastError: "PROVIDER_DELIVERY_FAILED" });
      increment("outbound_failed_total");
    } else if (Date.now() - Date.parse(candidate.createdAt) > 24 * 60 * 60 * 1000) {
      await repo.updateSend(candidate.sendId, { state: "failed", lastError: "RECEIPT_UNRESOLVED" });
      increment("outbound_failed_total");
    } else {
      await repo.updateSend(candidate.sendId, { nextAttemptAt: new Date(Date.now() + 60_000).toISOString() });
    }
  }
}
