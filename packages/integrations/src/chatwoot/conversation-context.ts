import type { ConversationState } from "@yubie/domain";
import type { ChatwootClient } from "./client.js";

export interface ConversationTurn {
  role: "customer" | "agent" | "bot";
  text: string;
}

export interface ConversationContext {
  recentTurns: ConversationTurn[];
  customerLanguage: "id" | "en" | "mixed";
  providerConversationId: string;
  status: ConversationState;
}

export interface ConversationContextProvider {
  fetchContext(conversationId: string, limits?: { maxTurns?: number; maxChars?: number }): Promise<ConversationContext>;
}

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

function mapStatus(status: string): ConversationState {
  if (status === "open") return "HUMAN_ACTIVE";
  if (status === "resolved") return "RESOLVED";
  return "BOT_ELIGIBLE";
}

export class ChatwootConversationContextProvider implements ConversationContextProvider {
  constructor(private readonly client: ChatwootClient) {}

  async fetchContext(
    conversationId: string,
    limits: { maxTurns?: number; maxChars?: number } = {},
  ): Promise<ConversationContext> {
    const maxTurns = limits.maxTurns ?? DEFAULT_MAX_TURNS;
    const maxChars = limits.maxChars ?? DEFAULT_MAX_CHARS;
    const status = await this.client.getConversationStatus(conversationId);
    const messages = await this.client.getRecentMessages(conversationId, maxTurns);

    const turns: ConversationTurn[] = [];
    let charCount = 0;
    for (const msg of messages) {
      if (msg.private) continue;
      if (charCount + msg.content.length > maxChars) break;
      turns.push({
        role: msg.messageType === "incoming" ? "customer" : msg.messageType === "outgoing" ? "bot" : "agent",
        text: msg.content,
      });
      charCount += msg.content.length;
    }

    return {
      recentTurns: turns,
      customerLanguage: detectLanguage(turns.map((t) => t.text)),
      providerConversationId: conversationId,
      status: mapStatus(status.status),
    };
  }
}

export class FakeConversationContextProvider implements ConversationContextProvider {
  constructor(private readonly turns: ConversationTurn[] = []) {}

  async fetchContext(conversationId: string): Promise<ConversationContext> {
    return {
      recentTurns: this.turns,
      customerLanguage: "id",
      providerConversationId: conversationId,
      status: "BOT_ELIGIBLE",
    };
  }
}
