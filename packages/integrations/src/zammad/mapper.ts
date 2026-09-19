import type { SupportMessage, SupportThread, SupportThreadRef } from "@yubie/application";
import type { ZammadArticle, ZammadTicket, ZammadTicketState } from "./types.js";

const HUMAN_STATE_NAMES = new Set(["open", "pending reminder", "pending close"]);

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function mapArticle(article: ZammadArticle): SupportMessage {
  const text = article.content_type === "text/html" ? stripHtml(article.body) : article.body;
  const role =
    article.sender === "Customer"
      ? "customer"
      : article.sender === "Agent"
        ? "bot"
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

export function isHumanActiveTicket(ticket: ZammadTicket, states: ZammadTicketState[]): boolean {
  const state = states.find((s) => s.id === ticket.state_id);
  if (!state) return ticket.owner_id > 0;
  if (HUMAN_STATE_NAMES.has(state.name.toLowerCase())) return true;
  return ticket.owner_id > 0 && state.state_type_id === 2;
}

export function mapTicket(
  ref: SupportThreadRef,
  ticket: ZammadTicket,
  states: ZammadTicketState[],
): SupportThread {
  return {
    ref,
    customerId: String(ticket.customer_id),
    inboxOrChannelId: String(ticket.group_id),
    humanActive: isHumanActiveTicket(ticket, states),
    stateLabel: states.find((s) => s.id === ticket.state_id)?.name ?? "unknown",
    groupId: String(ticket.group_id),
  };
}
