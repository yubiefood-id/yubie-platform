import type { ConversationState } from "@yubie/domain";
import type { ConversationContext, ConversationContextProvider, ConversationTurn } from "../conversation/types.js";
import type { ZammadClient } from "./client.js";
import { mapArticle } from "./mapper.js";

const DEFAULT_MAX_TURNS = 10;
const DEFAULT_MAX_CHARS = 4000;

function detectLanguage(texts: string[]): "id" | "en" | "mixed" {
  const sample = texts.join(" ").toLowerCase();
  const idMarkers = ["ada", "berapa", "gimana", "mau", "bisa", "tolong", "terima kasih", "kak"];
  const enMarkers = ["how", "what", "price", "buy", "hello", "thanks", "please"];
  const idHits = idMarkers.filter((m) => sample.includes(m)).length;
  const enHits = enMarkers.filter((m) => sample.includes(m)).length;
  if (idHits > 0 && enHits > 0) return "mixed";
  if (enHits > idHits) return "en";
  return "id";
}

function mapStatus(humanActive: boolean, stateLabel: string): ConversationState {
  if (humanActive) return "HUMAN_ACTIVE";
  if (stateLabel.toLowerCase() === "closed") return "RESOLVED";
  return "BOT_ELIGIBLE";
}

export class ZammadConversationContextProvider implements ConversationContextProvider {
  constructor(private readonly client: ZammadClient) {}

  async fetchContext(
    conversationId: string,
    limits: { maxTurns?: number; maxChars?: number } = {},
  ): Promise<ConversationContext> {
    const maxTurns = limits.maxTurns ?? DEFAULT_MAX_TURNS;
    const maxChars = limits.maxChars ?? DEFAULT_MAX_CHARS;
    const [ticket, states, articles] = await Promise.all([
      this.client.getTicket(conversationId),
      this.client.getStates(),
      this.client.getTicketArticles(conversationId),
    ]);

    const state = states.find((s) => s.id === ticket.state_id);
    const humanActive = state?.name.toLowerCase() === "open" || ticket.owner_id > 0;

    const turns: ConversationTurn[] = [];
    let charCount = 0;
    for (const article of articles.filter((a) => !a.internal).slice(-maxTurns)) {
      const mapped = mapArticle(article);
      if (mapped.role === "system") continue;
      if (charCount + mapped.text.length > maxChars) break;
      turns.push({
        role: mapped.role === "customer" ? "customer" : mapped.role === "bot" ? "bot" : "agent",
        text: mapped.text,
      });
      charCount += mapped.text.length;
    }

    return {
      recentTurns: turns,
      customerLanguage: detectLanguage(turns.map((t) => t.text)),
      providerConversationId: conversationId,
      status: mapStatus(humanActive, state?.name ?? "new"),
    };
  }
}
