import type { NormalizedMessage } from "@yubie/domain";

export interface AgentBotWebhookEvent {
  event: string;
  id?: number;
  content?: string;
  message_type?: string;
  conversation?: {
    id: number;
    inbox_id: number;
    status?: string;
  };
  sender?: { id: number };
  created_at?: string;
}

export function parseAgentBotEvent(raw: AgentBotWebhookEvent): NormalizedMessage | null {
  if (raw.event !== "message_created" || raw.message_type !== "incoming") {
    return null;
  }
  if (!raw.conversation?.id || !raw.sender?.id || !raw.content) {
    return null;
  }
  return {
    conversationId: String(raw.conversation.id),
    messageId: String(raw.id ?? `${raw.conversation.id}-${Date.now()}`),
    contactId: String(raw.sender.id),
    inboxId: String(raw.conversation.inbox_id),
    text: raw.content,
    locale: "id",
    receivedAt: raw.created_at ?? new Date().toISOString(),
  };
}
