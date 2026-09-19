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
import type { ChatwootClient } from "../chatwoot/client.js";

export class ChatwootSupportProvider implements SupportConversationProvider {
  readonly provider = "chatwoot" as const;

  constructor(private readonly client: ChatwootClient) {}

  async getThread(ref: SupportThreadRef): Promise<SupportThread> {
    const status = await this.client.getConversationStatus(ref.threadId);
    return {
      ref,
      customerId: "",
      inboxOrChannelId: "",
      humanActive: status.status === "open",
      stateLabel: status.status,
    };
  }

  async getRecentMessages(ref: SupportThreadRef, options?: { limit?: number }): Promise<SupportMessage[]> {
    const messages = await this.client.getRecentMessages(ref.threadId, options?.limit ?? 10);
    return messages.map((m) => ({
      id: String(m.id),
      role: m.messageType === "incoming" ? "customer" : m.messageType === "outgoing" ? "bot" : "system",
      text: m.content,
      internal: m.private,
      createdAt: m.createdAt,
    }));
  }

  async sendReply(command: SendReplyCommand): Promise<ProviderSendResult> {
    try {
      await this.client.sendMessage(command.threadRef.threadId, command.content, command.idempotencyKey);
      return { ok: true, code: "SUCCESS" };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("timeout")) return { ok: false, code: "TIMEOUT", message };
      return { ok: false, code: "UNAVAILABLE", message };
    }
  }

  async getCurrentHumanState(ref: SupportThreadRef): Promise<HumanControlState> {
    const status = await this.client.getConversationStatus(ref.threadId);
    return {
      humanActive: status.status === "open",
      ...(status.status === "open" ? { reason: "chatwoot_open" } : {}),
    };
  }

  async handoff(command: HandoffCommand): Promise<ProviderSendResult> {
    try {
      await this.client.requestHandoff(command.threadRef.threadId, command.labels);
      return { ok: true, code: "SUCCESS" };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, code: "UNAVAILABLE", message };
    }
  }

  async listThreadsUpdatedSince(sinceIso: string) {
    const rows = await this.client.listConversationsUpdatedSince(sinceIso);
    return rows.map((r) => ({ threadId: r.id, updatedAt: r.updatedAt }));
  }
}
