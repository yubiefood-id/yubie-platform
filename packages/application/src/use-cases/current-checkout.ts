import type { TransactionManager } from "../ports.js";

/** Principals come exclusively from validated first-party cookies/session. */
export async function currentCheckout(input:{userId:string|null;guestPrincipal:string|null;attemptKey?:string},tx:TransactionManager) {
  return tx.run("checkout.current",async repos=>{
    const principals:string[]=[];
    if(input.userId)principals.push("user:"+input.userId,...await repos.payments.listCheckoutGuestPrincipals(input.userId));
    if(input.guestPrincipal){
      const owner=await repos.payments.findCheckoutGuestOwner(input.guestPrincipal);
      if(!owner||owner===input.userId)principals.push(input.guestPrincipal);
    }
    if(!principals.length)return null;
    if(input.attemptKey){
      const resources=await repos.idempotency.findResources([...new Set(principals)],input.attemptKey);
      if(!resources.ok)throw new Error("Recovery identity unavailable");
      const ids=[...new Set(resources.value)];
      if(ids.length>1)return {state:"reconciliation_exception" as const};
      if(ids[0]){
        const order=await repos.orders.findById(ids[0]);const payments=await repos.payments.findByOrderId(ids[0]);
        if(!order.ok||!order.value||!payments.ok)throw new Error("Recovery resource unavailable");
        return {state:payments.value.some(p=>p.status==="pending")?"unknown" as const:"resolved" as const,checkoutToken:order.value.checkoutPublicToken,checkoutRef:order.value.checkoutRef};
      }
    }
    const pending=await repos.payments.findUnresolvedByPrincipals([...new Set(principals)]);
    if(!pending.ok)throw new Error("Recovery storage unavailable");
    if(pending.value.length>1)return {state:"reconciliation_exception" as const};
    const payment=pending.value[0];if(!payment)return null;
    const order=await repos.orders.findById(payment.orderId);if(!order.ok||!order.value)throw new Error("Recovery order unavailable");
    return {state:payment.reconciliationState&&payment.reconciliationState!=="none"?"unknown" as const:"pending" as const,checkoutToken:order.value.checkoutPublicToken,checkoutRef:order.value.checkoutRef};
  });
}
