import type { ConversationState } from "@yubie/domain";

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
