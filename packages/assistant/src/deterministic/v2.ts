import type { AssistantIntent } from "@yubie/domain";
import type { KnowledgeLookup } from "../knowledge-tools.js";
import { isHumanAlias, matchesFoodSafety, matchesHealthEscalation } from "./aliases.js";
import { normalizeInput } from "./normalizer.js";
import { B2B_COPY, B2B_FIELDS, navigationFooter, V2_COPY, V2_NODES, V2_VERSION } from "./v2-flow.js";
import type { DeterministicAction, DeterministicTurnInput, DeterministicTurnResult, HandoffDestination } from "./types.js";

export interface WebsiteCapabilities {
  catalog_available: boolean; account_available: boolean; checkout_available: boolean;
  order_portal_available: boolean; human_support_available: boolean;
}
export const NO_WEBSITE_CAPABILITIES: WebsiteCapabilities = {catalog_available:false,account_available:false,checkout_available:false,order_portal_available:false,human_support_available:false};
export interface DiscoveryView {
  id: string; name: string; description: string; variantRows: string[];
  websiteUrl: string; catalogVersion: string; assetId?: string;
}
export type V2Effect =
  | {kind: "REPLY_TEXT" | "SHOW_MENU" | "SHOW_APPROVED_FACT"; text: string; messageId: string}
  | {kind: "SEND_WEBSITE_LINK"; text: string; url: string; messageId: string}
  | {kind: "SEND_PRODUCT_MEDIA"; productId: string; assetId: string; caption: string; websiteUrl: string; catalogVersion: string; fallbackText: string}
  | {kind: "CREATE_HANDOFF"; destination: HandoffDestination; reason: string; intent: AssistantIntent; summary?: Record<string,unknown>}
  | {kind: "SUPPRESS_REPLY" | "RESET_NAVIGATION"; reason: string};
export interface V2Deps {
  knowledge: KnowledgeLookup;
  capabilities?: WebsiteCapabilities | undefined;
  resolveProduct?: ((id: string) => DiscoveryView | null) | undefined;
}
export function validWebsiteUrl(raw: string): boolean {
  try {const u=new URL(raw);return u.origin==="https://yubiefood.com" && !u.username && !u.password && !u.search && !u.hash && /^\/(?:products(?:\/yubie-(?:flour|shake|ppang|mie))?|account\/orders)$/.test(u.pathname);}catch{return false;}
}
export function validateV2Effects(effects: V2Effect[]): void {
  for(const e of effects) {
    if("text" in e && (!e.text || e.text.length>4096)) throw new Error("invalid_effect_text");
    if(e.kind==="SEND_WEBSITE_LINK" && !validWebsiteUrl(e.url)) throw new Error("invalid_website_url");
    if(e.kind==="SEND_PRODUCT_MEDIA" && (!/^(flour|shake|ppang|mie)$/.test(e.productId) || !/^[a-zA-Z0-9_-]{1,96}$/.test(e.assetId) || e.caption.length>1024 || !validWebsiteUrl(e.websiteUrl))) throw new Error("invalid_media_effect");
  }
}

export async function processV2(input: DeterministicTurnInput, deps: V2Deps): Promise<DeterministicTurnResult> {
  const caps=deps.capabilities??NO_WEBSITE_CAPABILITIES;
  const n=normalizeInput(input.text);
  const effects: V2Effect[]=[];
  const metrics=["deterministic_message_total"];
  let s={...input.persisted,context:{...input.persisted.context}};
  const owned=["HUMAN_ACTIVE","HANDOFF_REQUESTED","QUEUED","RESOLVED"].includes(input.conversationState);
  const finish=(action: DeterministicAction): DeterministicTurnResult => {validateV2Effects(effects);return {action,nextState:s,metrics,effects};};
  const handoff=(destination: HandoffDestination,reason: string,intent: AssistantIntent): DeterministicTurnResult => {
    effects.push({kind:"CREATE_HANDOFF",destination,reason,intent,...(destination==="SALES_PARTNERSHIP" && s.context.consent===true ? {summary:{...s.context}}:{})});
    const text=owned?"":V2_COPY[destination==="FOOD_SAFETY"?"safety":destination==="SALES_PARTNERSHIP"?"sales":"handoff"]!;
    s={...s,nodeId:destination==="FOOD_SAFETY"?"FOOD_SAFETY_HANDOFF":destination==="SALES_PARTNERSHIP"?"SALES_HANDOFF":"HUMAN_HANDOFF",fallbackCount:0};
    metrics.push("deterministic_handoff_total");
    return finish({kind:"handoff",destination,reason,intent,risk:destination==="SALES_PARTNERSHIP"?"AMBER":"RED",nodeId:s.nodeId,text});
  };
  if(matchesFoodSafety(n)) return handoff("FOOD_SAFETY","food_safety","FOOD_SAFETY");
  if(owned) {effects.push({kind:"SUPPRESS_REPLY",reason:"human_ownership"});return finish({kind:"noop",nodeId:s.nodeId,intent:"OTHER",risk:"GREEN"});}
  if(isHumanAlias(n)) return handoff("CUSTOMER_SUPPORT","human_request","HUMAN_REQUEST");
  if(matchesHealthEscalation(n)) return handoff("CUSTOMER_SUPPORT","health_escalation","ALLERGEN_OR_HEALTH");
  let prefix="";
  let target: string|undefined;
  const aliases: Record<string,string>={menu:"HOME",start:"HOME",mulai:"HOME",halo:"HOME",hai:"HOME",beli:"PRODUCT_MENU",produk:"PRODUCT_MENU",belanja:"PRODUCT_MENU",pesanan:"ORDER_MENU",pengiriman:"ORDER_MENU",resi:"ORDER_MENU","cek pesanan":"ORDER_MENU","pesanan saya":"ORDER_MENU","alamat pengiriman":"ADDRESS_GUIDANCE",promo:"PROMO_MENU",diskon:"PROMO_MENU",bantuan:"SUPPORT_MENU",komplain:"SUPPORT_MENU",bisnis:"B2B_MENU",reseller:"B2B_MENU",partnership:"B2B_MENU","tentang yubie":"ABOUT_MENU"};
  if(s.flowVersion!==V2_VERSION || !V2_NODES[s.nodeId]) {
    s={nodeId:"HOME",flowVersion:V2_VERSION,context:{},fallbackCount:0};
    effects.push({kind:"RESET_NAVIGATION",reason:"flow_version"});prefix=V2_COPY.migration+"\n\n";target="HOME";
  } else if(aliases[n]) target=aliases[n];
  else if(["9","kembali","back"].includes(n)) target=V2_NODES[s.nodeId]!.parent;
  else if(s.nodeId==="B2B_COLLECT") {
    const index=Number(s.context.collectIndex??0);
    if(!n || input.text.length>256) target=undefined;
    else if(s.context.consent===true && index>=0 && index<B2B_FIELDS.length) {
      s.context[B2B_FIELDS[index]!]=n==="lewati"&&index===4?null:input.text.trim();
      s.context.collectIndex=index+1;target=index===4?"SALES_HANDOFF":"B2B_COLLECT";
    }
  } else target=V2_NODES[s.nodeId]?.choices[n];
  if(!target) {
    const match=n.match(/^(?:beli|harga|info|mau|produk) (?:yubie )?(tepung|flour|shake|ppang|mie)$/);
    if(match) {s.context.productId=match[1]==="tepung"?"flour":match[1];target="PRODUCT_DETAIL";}
  }
  if(!target) {
    s.fallbackCount++;
    if(s.fallbackCount>=3)return handoff("CUSTOMER_SUPPORT","bounded_fallback","OTHER");
    const text=V2_COPY[s.fallbackCount===1?"unknown":"unknown_again"]!+navigationFooter;
    effects.push({kind:"REPLY_TEXT",text,messageId:`v2.fallback.${s.fallbackCount}`});
    return finish({kind:"reply",nodeId:s.nodeId,text});
  }
  if(s.nodeId==="PRODUCT_MENU" && target==="PRODUCT_DETAIL")s.context.productId=["flour","shake","ppang","mie"][Number(n)-1];
  if(s.nodeId==="B2B_MENU" && target==="B2B_CONSENT")s.context={category:["bulk","reseller","sample-development","partnership"][Number(n)-1]};
  if(s.nodeId==="B2B_CONSENT" && target==="B2B_COLLECT")s.context={...s.context,consent:true,collectIndex:0};
  if(target==="HOME" || target==="B2B_MENU")s.context={};
  if(target==="FOOD_SAFETY_HANDOFF")return handoff("FOOD_SAFETY","food_safety","FOOD_SAFETY");
  if(target==="HUMAN_HANDOFF")return handoff("CUSTOMER_SUPPORT","support_request","HUMAN_REQUEST");
  if(target==="SALES_HANDOFF")return handoff("SALES_PARTNERSHIP","b2b_qualification","B2B_INTRO");
  let text="";
  let messageId=`v2.${target.toLowerCase()}`;
  if(!V2_NODES[target]) {
    const productFact=target.startsWith("product_");
    const category=productFact?target.slice(8):target;
    const scope=productFact?String(s.context.productId??""):"brand:yubie";
    const fact=await deps.knowledge.getEffectivePublicKnowledge(category,scope);
    const data=fact?.data;
    text=typeof data==="string"?data:(data && typeof data==="object" && "summary" in data && typeof data.summary==="string"?data.summary:V2_COPY.unavailable!);
    if(text===V2_COPY.unavailable)metrics.push(`unsupported_information_${category}_total`);
    s.context.factCategory=category;target=productFact?"PRODUCT_INFO":"ABOUT_DETAIL";
    messageId=`v2.fact.${category}`;
  }
  s={...s,nodeId:target,flowVersion:V2_VERSION,fallbackCount:0};
  if(!text)text=V2_COPY[V2_NODES[target]!.copy]??"";
  const product=deps.resolveProduct?.(String(s.context.productId??""));
  if(target==="PRODUCT_DETAIL") {
    text=product?`${product.name}\n\n${product.description}\n\nVarian:\n${product.variantRows.join("\n")}\n\n${caps.catalog_available?product.websiteUrl+"\n\n":""}1. ${caps.checkout_available?"Beli":"Lihat"} di Website\n2. Info Produk\n3. Lihat Produk Lain`:V2_COPY.product_unavailable!;
    if(product?.assetId && caps.catalog_available)effects.push({kind:"SEND_PRODUCT_MEDIA",productId:product.id,assetId:product.assetId,caption:text+navigationFooter,websiteUrl:product.websiteUrl,catalogVersion:product.catalogVersion,fallbackText:text+navigationFooter});
    else text=V2_COPY.media_unavailable+"\n\n"+text;
  }
  if(target==="WEBSITE_HANDOFF")text=caps.catalog_available && product && validWebsiteUrl(product.websiteUrl)?`Siap! 💜\n\n${caps.checkout_available?"Kamu bisa memilih varian, jumlah, dan melanjutkan pembelian melalui website resmi Yubie.":"Kamu bisa melihat detail produk melalui katalog resmi Yubie. Checkout website belum tersedia untuk layanan ini."}\n\n${product.websiteUrl}`:V2_COPY.product_unavailable!;
  if(target==="ORDER_PORTAL")text=V2_COPY[caps.account_available&&caps.order_portal_available?"order_available":"order_unavailable"]!;
  if(target==="PAYMENT_GUIDANCE")text=V2_COPY[caps.checkout_available?"payment_available":"payment_unavailable"]!;
  if(target==="PROMO_MENU" && caps.catalog_available)text+="\nhttps://yubiefood.com/products";
  if(target==="B2B_COLLECT")text=B2B_COPY[Number(s.context.collectIndex)]??V2_COPY.unavailable!;
  text=prefix+text+navigationFooter;
  if(!effects.some(e=>e.kind==="SEND_PRODUCT_MEDIA"))effects.push({kind:target.endsWith("MENU")||target==="HOME"?"SHOW_MENU":"REPLY_TEXT",text,messageId});
  return finish({kind:"reply",nodeId:s.nodeId,text});
}
