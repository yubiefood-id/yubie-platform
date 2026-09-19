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

export class FakeSupportProvider implements SupportConversationProvider {
  readonly provider = "fake" as const;
  messages: Array<{ threadId: string; content: string }> = [];
  handoffs: Array<{ threadId: string; labels: string[] }> = [];
  humanActive = new Set<string>();
  articles = new Map<string, SupportMessage>();

  async getThread(ref: SupportThreadRef): Promise<SupportThread> {
    return {
      ref,
      customerId: "1",
      inboxOrChannelId: "1",
      humanActive: this.humanActive.has(ref.threadId),
      stateLabel: this.humanActive.has(ref.threadId) ? "open" : "pending",
    };
  }

  async getRecentMessages(ref: SupportThreadRef): Promise<SupportMessage[]> {
    return this.messages
      .filter((m) => m.threadId === ref.threadId)
      .map((m, i) => ({
        id: String(i + 1),
        role: "customer",
        text: m.content,
        internal: false,
        createdAt: new Date().toISOString(),
      }));
  }

  async getArticle(ref: SupportThreadRef, articleId: string): Promise<SupportMessage | null> {
    const article = this.articles.get(`${ref.threadId}:${articleId}`);
    return article ?? null;
  }

  async sendReply(command: SendReplyCommand): Promise<ProviderSendResult> {
    this.messages.push({ threadId: command.threadRef.threadId, content: command.content });
    return { ok: true, code: "SUCCESS", providerMessageId: String(this.messages.length) };
  }

  async getCurrentHumanState(ref: SupportThreadRef): Promise<HumanControlState> {
    return {
      humanActive: this.humanActive.has(ref.threadId),
      ...(this.humanActive.has(ref.threadId) ? { reason: "fake_human" } : {}),
    };
  }

  async handoff(command: HandoffCommand): Promise<ProviderSendResult> {
    this.handoffs.push({ threadId: command.threadRef.threadId, labels: command.labels });
    this.humanActive.add(command.threadRef.threadId);
    return { ok: true, code: "SUCCESS" };
  }

  async listThreadsUpdatedSince(_sinceIso: string) {
    return Array.from(this.humanActive).map((id) => ({
      threadId: id,
      updatedAt: new Date().toISOString(),
    }));
  }
}
