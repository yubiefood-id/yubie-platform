export interface CheckoutSessionReadiness {ready:boolean;admission:"enabled"|"disabled"}

/**
 * AbortSignal with a bounded lifetime, resilient to browsers without
 * AbortSignal.timeout (Safari/iOS < 16.4 — exactly the devices that must
 * still be able to fill the checkout form). The fallback timer is always
 * cleared so a late tick can never abort an already-settled request.
 */
export function timeoutSignal(ms:number):AbortSignal {
  if(typeof AbortSignal!=="undefined"&&typeof AbortSignal.timeout==="function")return AbortSignal.timeout(ms);
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),ms);
  controller.signal.addEventListener("abort",()=>clearTimeout(timer),{once:true});
  return controller.signal;
}

/**
 * Shared browser lock prevents two first visits from minting two guest
 * cookies. The lock is best-effort tab coordination, never a safety
 * boundary — server-side idempotency and the guest-cookie mint remain
 * authoritative — so browsers without Web Locks (Safari/iOS < 16.4, some
 * in-app browsers) run the work directly instead of failing checkout.
 */
export async function withCheckoutLock<T>(work:()=>Promise<T>):Promise<T> {
  if(typeof navigator==="undefined"||!navigator.locks)return work();
  return navigator.locks.request("yubie.checkout",work);
}
export async function prepareCheckoutSession():Promise<CheckoutSessionReadiness> {
  const response=await fetch("/api/checkout/session",{cache:"no-store",signal:timeoutSignal(10000)});
  const body=await response.json();
  return {ready:response.ok&&body?.ok===true&&body.data?.ready===true,admission:body.data?.admission==="enabled"?"enabled":"disabled"};
}
