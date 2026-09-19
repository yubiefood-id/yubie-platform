import type {
  HandoffCommand,
  HumanControlState,
  ProviderSendResult,
  SendReplyCommand,
  SupportConversationProvider,
  SupportMessage,
  SupportThread,
  SupportThreadRef,
} from "@yubie/application";
import type { ZammadClient } from "./client.js";
import { mapArticle, mapTicket } from "./mapper.js";

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
    private readonly whatsappArticleType = process.env.ZAMMAD_WHATSAPP_ARTICLE_TYPE ?? "whatsapp",
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
      const article = await this.client.createArticle({
        ticketId: command.threadRef.threadId,
        body: command.content,
        type: this.whatsappArticleType,
        internal: false,
      });
      return { ok: true, code: "SUCCESS", providerMessageId: String(article.id) };
    } catch (error) {
      return toErrorResult(error);
    }
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
