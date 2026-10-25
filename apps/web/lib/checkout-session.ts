export interface CheckoutSessionReadiness {ready:boolean;admission:"enabled"|"disabled"}

/** Shared browser lock prevents two first visits from minting two guest cookies. */
export async function withCheckoutLock<T>(work:()=>Promise<T>):Promise<T> {
  if(!navigator.locks)throw new Error("Safe checkout coordination unavailable");
  return navigator.locks.request("yubie.checkout",work);
}
export async function prepareCheckoutSession():Promise<CheckoutSessionReadiness> {
  const response=await fetch("/api/checkout/session",{cache:"no-store",signal:AbortSignal.timeout(10000)});
  const body=await response.json();
  return {ready:response.ok&&body?.ok===true&&body.data?.ready===true,admission:body.data?.admission==="enabled"?"enabled":"disabled"};
}
