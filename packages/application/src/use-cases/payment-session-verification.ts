import type { OrderRecord, PaymentRecord } from "@yubie/domain";
import type { Clock,IdGenerator,PaymentSessionHandle,TransactionManager,TransactionalRepositories } from "../ports.js";

/** A provider status is never sufficient proof for another reference/amount. */
export function paymentSessionMatches(payment:PaymentRecord,order:OrderRecord,session:PaymentSessionHandle):boolean {
  if(session.provider!==payment.provider || (session.currency!=null&&session.currency!==payment.currency))return false;
  if(payment.provider==="ipaymu") {
    if(session.referenceId!==order.checkoutRef || session.amount!==payment.amount)return false;
    if(payment.providerSessionId&&session.providerSessionId!==payment.providerSessionId)return false;
    if(payment.providerPaymentId&&session.providerPaymentId!==payment.providerPaymentId)return false;
  } else {
    if(session.referenceId!=null&&session.referenceId!==order.checkoutRef)return false;
    if(session.amount!=null&&session.amount!==payment.amount)return false;
  }
  return true;
}

export async function flagPaymentMismatch(paymentId:string,deps:{tx:TransactionManager;clock:Clock;ids:IdGenerator}) {
  await deps.tx.run("payment.provider_mismatch",async repos=>{
    const locked=await repos.payments.lockById(paymentId);
    if(!locked.ok||!locked.value)throw new Error("Payment verification persistence unavailable");
    await recordPaymentMismatch(locked.value,repos,deps.clock.now());
  });
}

export async function recordPaymentMismatch(payment:PaymentRecord,repos:Pick<TransactionalRepositories,"payments"|"audit"|"outbox">,now:string) {
  if(["provider_mismatch","late_success_after_terminal","multiple_successful_transactions"].includes(payment.reconciliationState??""))return;

    const results=[
      await repos.payments.save({...payment,reconciliationState:"provider_mismatch",updatedAt:now}),
      await repos.audit.append({action:"payment.verification_rejected",resourceType:"payment",resourceId:payment.id,actor:"payment-reconciliation",occurredAt:now}),
      await repos.outbox.enqueue({eventType:"payment.exception",aggregateType:"payment",aggregateId:payment.id,dedupeKey:"payment:provider_mismatch:"+payment.id,payloadJson:JSON.stringify({reason:"provider_mismatch",orderId:payment.orderId,paymentId:payment.id}),availableAt:now}),
    ];
    if(results.some(result=>!result.ok))throw new Error("Payment verification persistence unavailable");
}
