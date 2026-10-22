import type {
  HandoffCommand,
  HumanControlState,
  ProviderSendResult,
  SendReplyCommand,
  SendProductMediaCommand,
  OutboundDeliveryStatus,
  SupportConversationProvider,
  SupportMessage,
  SupportThread,
  SupportThreadRef,
} from "@yubie/application";
import type { ZammadClient } from "./client.js";
import { mapArticle, mapTicket } from "./mapper.js";
import { defaultProductMediaStore,loadProductPhoto,type ProductMediaStore } from "../media/product-media.js";

function toErrorResult(error: unknown): ProviderSendResult {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("timeout")) return { ok: false, code: "TIMEOUT", message };
  if (message.includes("ambiguous")) return { ok: false, code: "AMBIGUOUS" };
  if (message.includes("validation")) return { ok: false, code: "VALIDATION_ERROR" };
  if (message.includes("rate_limited")) return { ok: false, code: "RATE_LIMITED", message };
  if (message.includes("unauthorized")) return { ok: false, code: "UNAUTHORIZED", message };
  if (message.includes("forbidden")) return { ok: false, code: "FORBIDDEN", message };
  if (message.includes("not_found")) return { ok: false, code: "NOT_FOUND", message };
  if (message.includes("5xx")) return { ok: false, code: "UNAVAILABLE", message };
  return { ok: false, code: "UNAVAILABLE", message };
}

export class ZammadSupportProvider implements SupportConversationProvider {
  readonly provider = "zammad" as const;
  private principal: Promise<number> | undefined;
  private botId() {
    this.principal ??= this.client.getCurrentUser ? this.client.getCurrentUser().then(u=>u.id) : Promise.resolve(0);
    return this.principal;
  }
  private async mayDispatch(ref: SupportThreadRef, guard?: () => Promise<boolean>, receipt=false) {
    const human=await this.getCurrentHumanState(ref);
    if(human.humanActive || human.serviceWindowOpen===false || (human.automationDisabled && !receipt))return false;
    // Production sends additionally require a worker-owned final authorization callback.
    if(["production","staging"].includes(process.env.YUBIE_ENV??"") && !guard)return false;
    return !guard || await guard();
  }

  constructor(
    private readonly client: ZammadClient,
    private readonly whatsappArticleType: string,
    private readonly mediaStore: ProductMediaStore = defaultProductMediaStore,
  ) {}

  private ref(threadId: string): SupportThreadRef {
    return { provider: "zammad", threadId };
  }

  async getThread(ref: SupportThreadRef): Promise<SupportThread> {
    const [ticket, states] = await Promise.all([
      this.client.getTicket(ref.threadId),
      this.client.getStates(),
    ]);
    return mapTicket(ref, ticket, states, await this.botId());
  }

  async getRecentMessages(ref: SupportThreadRef, options?: { limit?: number }): Promise<SupportMessage[]> {
    const limit = options?.limit ?? 10;
    const articles = await this.client.getTicketArticles(ref.threadId);
    const botId=await this.botId();
    return articles
      .filter((a) => !a.internal)
      .slice(-limit)
      .map(a=>mapArticle(a,botId));
  }

  async getArticle(ref: SupportThreadRef, articleId: string): Promise<SupportMessage | null> {
    try {
      const article = await this.client.getArticle(articleId);
      if (String(article.ticket_id) !== ref.threadId) return null;
      if(article.sender==="Customer" && article.type!==this.whatsappArticleType)return null;
      return mapArticle(article,await this.botId());
    } catch(error) {
      if(error instanceof Error && error.message.includes("not_found"))return null;
      throw error;
    }
  }

  async sendReply(command: SendReplyCommand): Promise<ProviderSendResult> {
    try {
      if(command.threadRef.provider!=="zammad" || !/^[1-9]\d*$/.test(command.threadRef.threadId) || !command.content || command.content.length>4096)return {ok:false,code:"VALIDATION_ERROR"};
      const existing=await this.getOutboundStatus(command.threadRef,command.idempotencyKey);
      if(existing.providerMessageId)return {ok:true,code:"SUCCESS",providerMessageId:existing.providerMessageId};
      if(!await this.mayDispatch(command.threadRef,command.authorizeDispatch,command.handoffReceipt))return {ok:false,code:"FORBIDDEN"};
      const article = await this.client.createArticle({
        ticketId: command.threadRef.threadId,
        body: command.content,
        type: this.whatsappArticleType,
        internal: false,
        preferences: {yubie_delivery_key:command.idempotencyKey},
      });
      return { ok: true, code: "SUCCESS", providerMessageId: String(article.id) };
    } catch (error) {
      return toErrorResult(error);
    }
  }

  async sendProductMedia(command: SendProductMediaCommand): Promise<ProviderSendResult> {
    try {
      if(command.threadRef.provider!=="zammad" || !/^[1-9]\d*$/.test(command.threadRef.threadId) || command.caption.length>1024 || command.websiteUrl!==`https://yubiefood.com/products/yubie-${command.productId}` || !/^(flour|shake|ppang|mie)$/.test(command.productId))return {ok:false,code:"VALIDATION_ERROR",message:"invalid_media_command"};
      const {bytes,asset}=await loadProductPhoto(this.mediaStore,command.productId,command.assetId);
      const existing=await this.getOutboundStatus(command.threadRef,command.idempotencyKey);
      if(existing.providerMessageId)return {ok:true,code:"SUCCESS",providerMessageId:existing.providerMessageId};
      if(!await this.mayDispatch(command.threadRef,command.authorizeDispatch))return {ok:false,code:"FORBIDDEN"};
      const article=await this.client.createArticle({ticketId:command.threadRef.threadId,body:command.caption,type:this.whatsappArticleType,internal:false,preferences:{yubie_delivery_key:command.idempotencyKey},attachments:[{filename:`${command.productId}.${asset.mimeType==="image/png"?"png":"jpg"}`,data:bytes.toString("base64"),"mime-type":asset.mimeType}]});
      return {ok:true,code:"SUCCESS",providerMessageId:String(article.id)};
    } catch(error) {
      if(error instanceof Error && /media_|ENOENT/.test(error.message))return {ok:false,code:"VALIDATION_ERROR",message:"approved_media_unavailable"};
      return toErrorResult(error);
    }
  }

  async getOutboundStatus(ref: SupportThreadRef, deliveryKey: string): Promise<OutboundDeliveryStatus> {
    const articles=await this.client.getTicketArticles(ref.threadId);
    const matches=articles.filter(a=>a.preferences?.yubie_delivery_key===deliveryKey);
    if(matches.length>1)throw new Error("zammad_ambiguous");
    if(matches.length!==1)return {state:"unknown"};
    const a=matches[0]!;const w=a.preferences?.whatsapp as Record<string,unknown>|undefined;
    return {providerMessageId:String(a.id),state:w?.timestamp_delivered||w?.timestamp_read?"delivered":w?.delivery_status==="fail"?"failed":w?.timestamp_sent?"sent":"accepted"};
  }

  async getCurrentHumanState(ref: SupportThreadRef): Promise<HumanControlState> {
    const [ticket,states,articles,botId]=await Promise.all([this.client.getTicket(ref.threadId),this.client.getStates(),this.client.getTicketArticles(ref.threadId),this.botId()]);
    const thread=mapTicket(ref,ticket,states,botId);
    const closed=["closed","merged","removed"].includes(thread.stateLabel.toLowerCase());
    const customers=articles.filter(a=>a.sender==="Customer" && !a.internal && a.type===this.whatsappArticleType).sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at));
    const lastCustomerAt=customers[0]?.created_at;
    const mode=ticket.yubie_bot_mode?.toUpperCase();
    return {
      lifecycle:closed?"closed":"open",
      humanActive: thread.humanActive,
      automationDisabled: closed || (mode ? mode!=="AUTO" : ["production","staging"].includes(process.env.YUBIE_ENV??"")),
      ...(lastCustomerAt?{lastCustomerAt}:{}),
      serviceWindowOpen: !closed && !!lastCustomerAt && Date.parse(lastCustomerAt)<=Date.now()+60_000 && Date.now()-Date.parse(lastCustomerAt)<24*60*60*1000,
      ...(thread.humanActive ? { reason: `zammad_state_${thread.stateLabel}` } : {}),
    };
  }

  async resolveLifecycleState(stateRef: string) {
    const state=(await this.client.getStates()).find(s=>String(s.id)===stateRef);
    if(!state)return "unknown" as const;
    return ["closed","merged","removed"].includes(state.name.toLowerCase())?"closed" as const:"open" as const;
  }

  async handoff(command: HandoffCommand): Promise<ProviderSendResult> {
    try {
      const safety=command.labels.includes("handoff:food-safety");
      const allowed=async()=>safety || (!(await this.getCurrentHumanState(command.threadRef)).humanActive && (!command.authorizeDispatch || await command.authorizeDispatch()));
      if(!safety && ["production","staging"].includes(process.env.YUBIE_ENV??"") && !command.authorizeDispatch)return {ok:false,code:"FORBIDDEN"};
      if(!await allowed())return {ok:false,code:"FORBIDDEN"};
      const patch: Record<string, unknown> = {};
      if (command.groupId) patch.group_id = Number(command.groupId);
      if (command.priorityId) patch.priority_id = Number(command.priorityId);
      if (command.botModeOff) {
        patch.yubie_bot_mode = "OFF";
      }
      const ticket=await this.client.updateTicket(command.threadRef.threadId, patch);
      if(command.groupId && ticket.group_id!==Number(command.groupId))return {ok:false,code:"AMBIGUOUS"};
      if(command.priorityId && ticket.priority_id!==Number(command.priorityId))return {ok:false,code:"AMBIGUOUS"};
      for (const label of command.labels) {
        if(!await allowed())return {ok:false,code:"FORBIDDEN"};
        await this.client.addTag(command.threadRef.threadId, label);
      }
      if(command.summary?.consent===true && command.idempotencyKey) {
        const key=command.idempotencyKey+":summary";
        const exists=await this.getOutboundStatus(command.threadRef,key);
        if(!exists.providerMessageId) {
          if(!await allowed())return {ok:false,code:"FORBIDDEN"};
          const summary=Object.fromEntries(["category","company","need","product","city","volume"].filter(k=>k in command.summary!).map(k=>[k,String(command.summary![k]??"").slice(0,256)]));
          await this.client.createArticle({ticketId:command.threadRef.threadId,type:"note",internal:true,body:JSON.stringify(summary),preferences:{yubie_delivery_key:key}});
        }
      }
      return { ok: true, code: "SUCCESS" };
    } catch (error) {
      return toErrorResult(error);
    }
  }

  async listThreadsUpdatedSince(sinceIso: string) {
    const rows = await this.client.searchTicketsUpdatedSince(sinceIso);
    return rows.map((r) => ({ threadId: r.id, updatedAt: r.updatedAt }));
  }
}
