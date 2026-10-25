import { aggregateLineQuantities, buildOrderTotals, err, isPayableTotal, MAX_CART_LINE_QUANTITY, ok, productFamilies, type OrderLineRecord } from "@yubie/domain";
import type { Clock, TransactionManager } from "../ports.js";
import { authorizeCheckoutPromotion, PromotionAuthorizationError } from "./verified-promotions.js";
import type { CustomerProof } from "./phone-auth.js";

export function priceCheckoutLines(lines:Array<{productId:string;sizeId:string;quantity:number}>): OrderLineRecord[] {
  if (!lines.length || lines.some(line=>!Number.isSafeInteger(line.quantity)||line.quantity<1)) throw new RangeError("Invalid checkout quantity");
  return aggregateLineQuantities(lines).map(line=>{
    if (line.quantity>MAX_CART_LINE_QUANTITY) throw new RangeError("Checkout quantity exceeds limit");
    const product=productFamilies.find(p=>p.id===line.productId&&p.status==="available");
    const size=product?.sizes.find(s=>s.id===line.sizeId&&s.available&&typeof s.price==="number");
    if(!product||!size||typeof size.price!=="number")throw new Error("Unavailable catalog line");
    return {id:product.id+"-"+size.id,productId:product.id,productName:product.name,sizeId:size.id,sizeLabel:size.label,quantity:line.quantity,unitPrice:size.price};
  });
}

export async function quoteCheckout(input:{
  lines:Array<{productId:string;sizeId:string;quantity:number}>; city?:string;
  promoCode?:string; userId?:string|null; customerProof?:CustomerProof;
},deps:{tx:TransactionManager;clock:Clock}) {
  try {
    const lines=priceCheckoutLines(input.lines);
    return await deps.tx.run("checkout.quote",async repos=>{
      const now=deps.clock.now();
      const shipping=await repos.shipping?.authorize(input.city??"",now);
      const promotion=await authorizeCheckoutPromotion({lines,...(input.userId?{userId:input.userId}:{}),...(input.customerProof?{actor:input.customerProof}:{}),...(input.promoCode?{code:input.promoCode}:{})},repos,now);
      const subtotalAmount=lines.reduce((sum,line)=>sum+line.quantity*line.unitPrice,0);
      const discountAmount=promotion?.quote.discountAmount??0;
      const totals=buildOrderTotals(subtotalAmount,shipping?.amount??0,0,discountAmount);
      const stockAvailable=await repos.inventory.canFulfill?.(lines,now)??false;
      return ok({lines,subtotalAmount,discountAmount,shippingAmount:shipping?.amount??null,totalAmount:shipping&&isPayableTotal(totals.grandTotalAmount)?totals.grandTotalAmount:null,currency:"IDR" as const,stockAvailable,shippingAvailable:!!shipping});
    });
  }catch(error){
    if(error instanceof PromotionAuthorizationError)return err(error.safeError);
    return err({code:"validation",message:"Checkout cannot be quoted.",retryable:false,requestId:"checkout"});
  }
}
