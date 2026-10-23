import type { SupportMessage, SupportThread, SupportThreadRef } from "@yubie/application";
import type { ZammadArticle, ZammadTicket, ZammadTicketState } from "./types.js";

const HUMAN_STATE_NAMES = new Set(["open", "pending reminder", "pending close"]);

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function mapArticle(article: ZammadArticle, botUserId?: number): SupportMessage {
  const text = article.content_type === "text/html" ? stripHtml(article.body) : article.body;
  const role =
    article.sender === "Customer"
      ? "customer"
      : article.sender === "Agent"
        ? article.created_by_id === botUserId ? "bot" : "agent"
        : article.sender === "System"
          ? "system"
          : "agent";
  return {
    id: String(article.id),
    role,
    text,
    internal: article.internal,
    createdAt: article.created_at,
  };
}

export function isHumanActiveTicket(ticket: ZammadTicket, states: ZammadTicketState[], botUserId?: number): boolean {
  // Zammad's system/unassigned owner is id 1. Ticket lifecycle alone is not ownership.
  return ticket.owner_id > 1 && ticket.owner_id !== botUserId;
}

export function mapTicket(
  ref: SupportThreadRef,
  ticket: ZammadTicket,
  states: ZammadTicketState[],
  botUserId?: number,
): SupportThread {
  return {
    ref,
    customerId: String(ticket.customer_id),
    inboxOrChannelId: String(ticket.group_id),
    humanActive: isHumanActiveTicket(ticket, states, botUserId),
    stateLabel: states.find((s) => s.id === ticket.state_id)?.name ?? "unknown",
    groupId: String(ticket.group_id),
  };
}
