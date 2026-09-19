export interface ChatwootConversationStatus {
  id: number;
  status: "open" | "resolved" | "pending" | "snoozed";
}

export interface ChatwootMessage {
  id: number;
  content: string;
  messageType: "incoming" | "outgoing" | "activity";
  private: boolean;
  createdAt: string;
}

export interface ChatwootClient {
  sendMessage(conversationId: string, content: string, idempotencyKey?: string): Promise<void>;
  requestHandoff(conversationId: string, labels: string[]): Promise<void>;
  getConversationStatus(conversationId: string): Promise<ChatwootConversationStatus>;
  getRecentMessages(conversationId: string, limit: number): Promise<ChatwootMessage[]>;
  listConversationsUpdatedSince(sinceIso: string): Promise<Array<{ id: string; updatedAt: string }>>;
}

export class HttpChatwootClient implements ChatwootClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiToken: string,
    private readonly accountId: string,
  ) {}

  private async request(path: string, init: RequestInit) {
    const response = await fetch(`${this.baseUrl}/api/v1/accounts/${this.accountId}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        api_access_token: this.apiToken,
        ...(init.headers ?? {}),
      },
    });
    if (!response.ok) {
      throw new Error(`chatwoot_http_${response.status}`);
    }
    return response;
  }

  async sendMessage(conversationId: string, content: string, idempotencyKey?: string) {
    const headers: Record<string, string> = {};
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
    await this.request(`/conversations/${conversationId}/messages`, {
      method: "POST",
      headers,
      body: JSON.stringify({ content, message_type: "outgoing", private: false }),
    });
  }

  async requestHandoff(conversationId: string, labels: string[]) {
    await this.request(`/conversations/${conversationId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "open" }),
    });
    for (const label of labels) {
      await this.request(`/conversations/${conversationId}/labels`, {
        method: "POST",
        body: JSON.stringify({ labels: [label] }),
      });
    }
  }

  async getConversationStatus(conversationId: string) {
    const response = await this.request(`/conversations/${conversationId}`, { method: "GET" });
    const body = (await response.json()) as { id: number; status: ChatwootConversationStatus["status"] };
    return { id: body.id, status: body.status };
  }

  async getRecentMessages(conversationId: string, limit: number) {
    const response = await this.request(`/conversations/${conversationId}/messages`, { method: "GET" });
    const body = (await response.json()) as {
      payload?: Array<{
        id: number;
        content: string;
        message_type: number;
        private: boolean;
        created_at: string;
      }>;
    };
    const payload = body.payload ?? [];
    return payload
      .slice(-limit)
      .map((m): ChatwootMessage => ({
        id: m.id,
        content: m.content,
        messageType: m.message_type === 0 ? "incoming" : m.message_type === 1 ? "outgoing" : "activity",
        private: m.private,
        createdAt: m.created_at,
      }));
  }

  async listConversationsUpdatedSince(sinceIso: string) {
    const response = await this.request(`/conversations?since=${encodeURIComponent(sinceIso)}`, { method: "GET" });
    const body = (await response.json()) as {
      data?: { payload?: Array<{ id: number; updated_at: string }> };
      payload?: Array<{ id: number; updated_at: string }>;
    };
    const payload = body.data?.payload ?? body.payload ?? [];
    return payload.map((c) => ({ id: String(c.id), updatedAt: c.updated_at }));
  }
}

export class FakeChatwootClient implements ChatwootClient {
  messages: Array<{ conversationId: string; content: string }> = [];
  handoffs: Array<{ conversationId: string; labels: string[] }> = [];
  statuses = new Map<string, ChatwootConversationStatus["status"]>();

  async sendMessage(conversationId: string, content: string) {
    this.messages.push({ conversationId, content });
  }

  async requestHandoff(conversationId: string, labels: string[]) {
    this.handoffs.push({ conversationId, labels });
    this.statuses.set(conversationId, "open");
  }

  async getConversationStatus(conversationId: string) {
    return { id: Number(conversationId), status: this.statuses.get(conversationId) ?? "pending" };
  }

  messagesByConversation = new Map<string, ChatwootMessage[]>();

  async getRecentMessages(conversationId: string, limit: number) {
    const msgs = this.messagesByConversation.get(conversationId) ?? [];
    return msgs.slice(-limit);
  }

  async listConversationsUpdatedSince(_sinceIso: string) {
    return Array.from(this.messagesByConversation.keys()).map((id) => ({
      id,
      updatedAt: new Date().toISOString(),
    }));
  }
}
