import type { ZammadArticle, ZammadGroup, ZammadTicket, ZammadTicketState } from "./types.js";

export interface ZammadClient {
  getTicket(ticketId: string): Promise<ZammadTicket>;
  getArticle(articleId: string): Promise<ZammadArticle>;
  getTicketArticles(ticketId: string): Promise<ZammadArticle[]>;
  createArticle(input: {
    ticketId: string;
    body: string;
    contentType?: string;
    type?: string;
    internal?: boolean;
  }): Promise<ZammadArticle>;
  updateTicket(ticketId: string, patch: Record<string, unknown>): Promise<ZammadTicket>;
  searchTicketsUpdatedSince(sinceIso: string): Promise<Array<{ id: string; updatedAt: string }>>;
  getGroups(): Promise<ZammadGroup[]>;
  getStates(): Promise<ZammadTicketState[]>;
  addTag(ticketId: string, tag: string): Promise<void>;
}

export class HttpZammadClient implements ZammadClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiToken: string,
    private readonly timeoutMs = 15000,
  ) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Token token=${this.apiToken}`,
          ...(init.headers ?? {}),
        },
      });
      if (response.status === 429) throw new Error("zammad_rate_limited");
      if (response.status === 401) throw new Error("zammad_unauthorized");
      if (response.status === 403) throw new Error("zammad_forbidden");
      if (response.status === 404) throw new Error("zammad_not_found");
      if (response.status >= 500) throw new Error(`zammad_5xx_${response.status}`);
      if (!response.ok) throw new Error(`zammad_http_${response.status}`);
      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("zammad_timeout");
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async getTicket(ticketId: string) {
    return this.request<ZammadTicket>(`/api/v1/tickets/${ticketId}`);
  }

  async getArticle(articleId: string) {
    return this.request<ZammadArticle>(`/api/v1/ticket_articles/${articleId}`);
  }

  async getTicketArticles(ticketId: string) {
    return this.request<ZammadArticle[]>(`/api/v1/ticket_articles/by_ticket/${ticketId}`);
  }

  async createArticle(input: {
    ticketId: string;
    body: string;
    contentType?: string;
    type?: string;
    internal?: boolean;
  }) {
    return this.request<ZammadArticle>("/api/v1/ticket_articles", {
      method: "POST",
      body: JSON.stringify({
        ticket_id: Number(input.ticketId),
        body: input.body,
        content_type: input.contentType ?? "text/plain",
        type: input.type ?? "web",
        internal: input.internal ?? false,
        subject: "Reply",
        to: "",
      }),
    });
  }

  async updateTicket(ticketId: string, patch: Record<string, unknown>) {
    return this.request<ZammadTicket>(`/api/v1/tickets/${ticketId}`, {
      method: "PUT",
      body: JSON.stringify(patch),
    });
  }

  async searchTicketsUpdatedSince(sinceIso: string) {
    const query = encodeURIComponent(`updated_at:>${sinceIso}`);
    const results = await this.request<Array<{ id: number; updated_at: string }>>(
      `/api/v1/tickets/search?query=${query}&sort_by=updated_at&order_by=asc`,
    );
    return results.map((t) => ({ id: String(t.id), updatedAt: t.updated_at }));
  }

  async getGroups() {
    return this.request<ZammadGroup[]>("/api/v1/groups");
  }

  async getStates() {
    return this.request<ZammadTicketState[]>("/api/v1/ticket_states");
  }

  async addTag(ticketId: string, tag: string) {
    await this.request(`/api/v1/tags/add`, {
      method: "POST",
      body: JSON.stringify({ object: "Ticket", item: ticketId, o_id: Number(ticketId), value: tag }),
    });
  }
}

export class FakeZammadClient implements ZammadClient {
  tickets = new Map<string, ZammadTicket>();
  articles = new Map<string, ZammadArticle>();
  articlesByTicket = new Map<string, ZammadArticle[]>();
  tags = new Map<string, Set<string>>();

  async getTicket(ticketId: string) {
    const ticket = this.tickets.get(ticketId);
    if (!ticket) throw new Error("zammad_not_found");
    return ticket;
  }

  async getArticle(articleId: string) {
    const article = this.articles.get(articleId);
    if (!article) throw new Error("zammad_not_found");
    return article;
  }

  async getTicketArticles(ticketId: string) {
    return this.articlesByTicket.get(ticketId) ?? [];
  }

  async createArticle(input: {
    ticketId: string;
    body: string;
    contentType?: string;
    type?: string;
    internal?: boolean;
  }) {
    const id = this.articles.size + 1;
    const article: ZammadArticle = {
      id,
      ticket_id: Number(input.ticketId),
      from: "bot@yubie.id",
      to: "customer",
      subject: "Reply",
      body: input.body,
      content_type: input.contentType ?? "text/plain",
      internal: input.internal ?? false,
      sender: "Agent",
      type: input.type ?? "web",
      type_id: 1,
      created_at: new Date().toISOString(),
      created_by_id: 1,
    };
    this.articles.set(String(id), article);
    const list = this.articlesByTicket.get(input.ticketId) ?? [];
    list.push(article);
    this.articlesByTicket.set(input.ticketId, list);
    return article;
  }

  async updateTicket(ticketId: string, patch: Record<string, unknown>) {
    const ticket = await this.getTicket(ticketId);
    const updated = { ...ticket, ...patch } as ZammadTicket;
    this.tickets.set(ticketId, updated);
    return updated;
  }

  async searchTicketsUpdatedSince(_sinceIso: string) {
    return Array.from(this.tickets.values()).map((t) => ({
      id: String(t.id),
      updatedAt: t.updated_at,
    }));
  }

  async getGroups() {
    return [
      { id: 1, name: "Yubie Bot Queue", active: true },
      { id: 2, name: "Customer Support", active: true },
      { id: 3, name: "Sales / Partnership", active: true },
      { id: 4, name: "Food Safety", active: true },
    ];
  }

  async getStates() {
    return [
      { id: 1, name: "new", state_type_id: 1 },
      { id: 2, name: "open", state_type_id: 2 },
      { id: 4, name: "closed", state_type_id: 5 },
    ];
  }

  async addTag(ticketId: string, tag: string) {
    const set = this.tags.get(ticketId) ?? new Set();
    set.add(tag);
    this.tags.set(ticketId, set);
  }
}
