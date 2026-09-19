export interface ChatwootConversationStatus {
  id: number;
  status: "open" | "resolved" | "pending" | "snoozed";
}

export interface ChatwootClient {
  sendMessage(conversationId: string, content: string, idempotencyKey?: string): Promise<void>;
  requestHandoff(conversationId: string, labels: string[]): Promise<void>;
  getConversationStatus(conversationId: string): Promise<ChatwootConversationStatus>;
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

  async sendMessage(conversationId: string, content: string) {
    await this.request(`/conversations/${conversationId}/messages`, {
      method: "POST",
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
}
