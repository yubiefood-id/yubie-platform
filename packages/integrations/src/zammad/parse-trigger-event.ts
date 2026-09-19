import type { NormalizedMessage } from "@yubie/domain";
import type { ZammadTriggerPayload } from "./types.js";

export function parseZammadTriggerPayload(raw: ZammadTriggerPayload): {
  eventType: string;
  ticketId: string;
  articleId?: string;
  customerId?: string;
  groupId?: string;
  stateId?: string;
} | null {
  if (!raw.ticket_id) return null;
  return {
    eventType: raw.event ?? "ticket_update",
    ticketId: String(raw.ticket_id),
    ...(raw.article_id ? { articleId: String(raw.article_id) } : {}),
    ...(raw.customer_id ? { customerId: String(raw.customer_id) } : {}),
    ...(raw.group_id ? { groupId: String(raw.group_id) } : {}),
    ...(raw.state_id ? { stateId: String(raw.state_id) } : {}),
  };
}

export function toNormalizedMessage(input: {
  ticketId: string;
  articleId: string;
  customerId: string;
  groupId: string;
  text: string;
  receivedAt: string;
}): NormalizedMessage {
  return {
    conversationId: input.ticketId,
    messageId: input.articleId,
    contactId: input.customerId,
    inboxId: input.groupId,
    text: input.text,
    locale: "id",
    receivedAt: input.receivedAt,
  };
}

export function isCustomerInboundArticle(article: { sender: string; internal: boolean }): boolean {
  return article.sender === "Customer" && !article.internal;
}
