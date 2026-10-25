import { paymentStatusFromProviderSession } from "@yubie/domain";
import type { Clock,IdGenerator,PaymentProviderPort,TransactionManager,VerifiedPaymentNotification } from "../ports.js";
import {flagPaymentMismatch} from "./payment-session-verification.js";
import {applyIpaymuCallback} from "./process-ipaymu-callback.js";

export async function processPaymentNotification(notification:VerifiedPaymentNotification,deps:{
  provider:PaymentProviderPort;merchant:string;tx:TransactionManager;clock:Clock;ids:IdGenerator;
}) {
  if(!notification.trxId)return {terminal:false,outcome:"pending" as const,reason:"transaction_id_unknown"};
  const checked=await deps.provider.getPaymentSession(notification.trxId);
  if(!checked.ok||!checked.value)return {terminal:false,outcome:"pending" as const,reason:"lookup_unavailable"};
  if(!checked.value.referenceId || !Number.isSafeInteger(checked.value.amount) || Number(checked.value.amount)<=0)return {terminal:false,outcome:"pending" as const,reason:"authoritative_incomplete"};
  const authoritativeStatus=paymentStatusFromProviderSession(checked.value.rawStatus);
  if(!authoritativeStatus)return {terminal:false,outcome:"pending" as const,reason:"status_unknown"};
  const result=await applyIpaymuCallback({
    ...notification,merchant:checked.value.providerBusinessId??deps.merchant,expectedMerchant:deps.merchant,
    authoritativeSessionId:checked.value.providerSessionId,
    authoritativeStatus,authoritativeReferenceId:checked.value.referenceId??null,authoritativeAmount:checked.value.amount??null,
    dedupeKey:`ipaymu:${notification.referenceId}:${notification.trxId}:${authoritativeStatus}`,
  },deps);
  if(!result.persisted)return {terminal:false,outcome:"pending" as const,reason:"storage_unavailable"};
  if(result.result==="rejected"){
    const paymentId=await deps.tx.run("payment.notification_exception",async repos=>{
      const order=await repos.orders.findByCheckoutRef(notification.referenceId);if(!order.ok||!order.value)return null;
      const payments=await repos.payments.findByOrderId(order.value.id);if(!payments.ok)throw new Error("Payment exception unavailable");
      return payments.value.find(p=>p.provider==="ipaymu")?.id??null;
    });
    if(paymentId)await flagPaymentMismatch(paymentId,deps);
  }
  return {terminal:result.result!=="pending",outcome:result.result,...("reason" in result?{reason:result.reason}:{})};
}
