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
  if (message.includes("rate_limited")) return { ok: false, code: "RATE_LIMITED", message };
  if (message.includes("unauthorized")) return { ok: false, code: "UNAUTHORIZED", message };
  if (message.includes("forbidden")) return { ok: false, code: "FORBIDDEN", message };
  if (message.includes("not_found")) return { ok: false, code: "NOT_FOUND", message };
  if (message.includes("5xx")) return { ok: false, code: "UNAVAILABLE", message };
  return { ok: false, code: "UNAVAILABLE", message };
}

export class ZammadSupportProvider implements SupportConversationProvider {
  readonly provider = "zammad" as const;

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
    return mapTicket(ref, ticket, states);
  }

  async getRecentMessages(ref: SupportThreadRef, options?: { limit?: number }): Promise<SupportMessage[]> {
    const limit = options?.limit ?? 10;
    const articles = await this.client.getTicketArticles(ref.threadId);
    return articles
      .filter((a) => !a.internal)
      .slice(-limit)
      .map(mapArticle);
  }

  async getArticle(ref: SupportThreadRef, articleId: string): Promise<SupportMessage | null> {
    try {
      const article = await this.client.getArticle(articleId);
      if (String(article.ticket_id) !== ref.threadId) return null;
      return mapArticle(article);
    } catch {
      return null;
    }
  }

  async sendReply(command: SendReplyCommand): Promise<ProviderSendResult> {
    try {
      const existing=await this.getOutboundStatus(command.threadRef,command.idempotencyKey);
      if(existing.providerMessageId)return {ok:true,code:"SUCCESS",providerMessageId:existing.providerMessageId};
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
    if(matches.length!==1)return {state:"unknown"};
    const a=matches[0]!;const w=a.preferences?.whatsapp as Record<string,unknown>|undefined;
    return {providerMessageId:String(a.id),state:w?.timestamp_delivered||w?.timestamp_read?"delivered":w?.delivery_status==="fail"?"failed":w?.timestamp_sent?"sent":"accepted"};
  }

  async getCurrentHumanState(ref: SupportThreadRef): Promise<HumanControlState> {
    const thread = await this.getThread(ref);
    return {
      humanActive: thread.humanActive,
      ...(thread.humanActive ? { reason: `zammad_state_${thread.stateLabel}` } : {}),
    };
  }

  async handoff(command: HandoffCommand): Promise<ProviderSendResult> {
    try {
      const patch: Record<string, unknown> = {};
      if (command.groupId) patch.group_id = Number(command.groupId);
      if (command.priorityId) patch.priority_id = Number(command.priorityId);
      if (command.botModeOff) {
        patch.yubie_bot_mode = "OFF";
      }
      await this.client.updateTicket(command.threadRef.threadId, patch);
      for (const label of command.labels) {
        await this.client.addTag(command.threadRef.threadId, label);
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
