import type {BrowserContext,Page} from "@playwright/test";
// Synthetic browser fixtures only. These quantities are never production stock.
const variants=[
 ["flour","250g",35000],["flour","1kg",120000],["shake","sachet",19500],["shake","pack-7",129000],
 ["ppang","mini",9000],["ppang","maxi",19000],["ppang","mini-pack-5",42000],["mie","single",16000],["mie","pack-3",45000],
] as const;
export async function syntheticCommerceReads(target:BrowserContext|Page) {
 await target.route("**/api/catalog/availability",route=>route.fulfill({json:{ok:true,data:variants.map(([productId,sizeId])=>({productId,sizeId,maxQuantity:20,status:"available"}))}}));
 await target.route("**/api/checkout/current",route=>route.fulfill({json:{ok:true,data:null}}));
 await target.route("**/api/checkout/session",route=>route.fulfill({json:{ok:true,data:{ready:true,admission:"enabled"}}}));
 await target.route("**/api/checkout/quote",route=>{
  const request=route.request().postDataJSON() as {lines:Array<{productId:string;sizeId:string;quantity:number}>};
  const subtotalAmount=request.lines.reduce((sum,line)=>sum+(variants.find(([p,s])=>p===line.productId&&s===line.sizeId)?.[2]??0)*line.quantity,0);
  return route.fulfill({json:{ok:true,data:{subtotalAmount,discountAmount:0,shippingAmount:0,totalAmount:subtotalAmount,stockAvailable:true,shippingAvailable:true,currency:"IDR"}}});
 });
}
