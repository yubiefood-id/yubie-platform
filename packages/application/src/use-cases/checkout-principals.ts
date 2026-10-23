import type { ErrorCode } from "@yubie/domain";
import type { TransactionalRepositories } from "../ports.js";
export class CheckoutScopeError extends Error {
  constructor(readonly code: ErrorCode) { super("Checkout recovery requires the correct customer session."); }
}
/** Server-derived principals only. Caller holds the promotion/customer lock if needed.
 * Lock user first, then sorted owned guest keys. Anonymous callers never acquire a user lock.
 * A binding preserves recovery/history attribution; it never rewrites order ownership.
 */
export async function lockCheckoutScope(input: { principal: string; guest?: string }, repos: TransactionalRepositories, now: string): Promise<string[]> {
  if (!/^(user:.+|guest:[0-9a-f]{64})$/.test(input.principal) || (input.guest && !/^guest:[0-9a-f]{64}$/.test(input.guest))) throw new CheckoutScopeError("validation");
  const userId = input.principal.startsWith("user:") ? input.principal.slice(5) : null;
  await repos.payments.lockCheckoutPrincipals([input.principal]);
  if (!userId) {
    if (await repos.payments.findCheckoutGuestOwner(input.principal)) throw new CheckoutScopeError("unauthorized");
    return [input.principal];
  }
  const owned = await repos.payments.listCheckoutGuestPrincipals(userId);
  if (owned.length > 100) throw new CheckoutScopeError("pending_reconciliation");
  const principals = [...new Set([input.principal, ...owned, ...(input.guest ? [input.guest] : [])])];
  await repos.payments.lockCheckoutPrincipals(principals);
  if (input.guest) {
    const owner = await repos.payments.findCheckoutGuestOwner(input.guest);
    if (owner && owner !== userId) throw new CheckoutScopeError("conflict");
    if (!owner) {
      if (!await repos.payments.bindCheckoutGuest(input.guest, userId, now)) throw new CheckoutScopeError("conflict");
      const audit = await repos.audit.append({ action: "checkout.guest_bound", resourceType: "user", resourceId: userId, actor: userId, occurredAt: now });
      const event = await repos.outbox.enqueue({ eventType: "checkout.guest_bound", aggregateType: "user", aggregateId: userId, dedupeKey: `checkout:guest_bound:${input.guest}`, payloadJson: JSON.stringify({ userId }), availableAt: now });
      if (!audit.ok || !event.ok) throw new Error("Checkout recovery persistence unavailable");
    }
  }
  return principals;
}
