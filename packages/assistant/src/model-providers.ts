import type { ModelProvider, ModelRequest, ModelResponse } from "./ports.js";

export class FakeModelProvider implements ModelProvider {
  async generate(req: ModelRequest): Promise<ModelResponse> {
    const lower = req.userMessage.toLowerCase();
    if (lower.includes("handoff") || lower.includes("alergi")) {
      return { text: "", toolCalls: [{ name: "request_handoff", args: { reason: "test" } }] };
    }
    if (lower.includes("beli")) {
      return {
        text: "Kamu bisa beli Yubie Flour di marketplace resmi kami.",
        toolCalls: [{ name: "get_purchase_options", args: { productId: "flour" } }],
      };
    }
    return {
      text: "Halo! Yubie Flour adalah tepung ubi serbaguna dari Yubie. Ada yang bisa dibantu?",
      toolCalls: [],
    };
  }
}

export class VllmModelProvider implements ModelProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly model: string,
    private readonly timeoutMs = 30000,
  ) {}

  async generate(req: ModelRequest): Promise<ModelResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: "system", content: req.systemPrompt },
            { role: "user", content: req.userMessage },
          ],
          max_tokens: req.maxTokens,
          tools: req.tools.map((t) => ({
            type: "function",
            function: { name: t.name, description: t.description, parameters: { type: "object", properties: {} } },
          })),
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`vllm_error_${response.status}`);
      }
      const body = (await response.json()) as {
        choices?: Array<{ message?: { content?: string; tool_calls?: Array<{ function: { name: string; arguments: string } }> } }>;
      };
      const message = body.choices?.[0]?.message;
      const toolCalls = (message?.tool_calls ?? []).map((call) => ({
        name: call.function.name as ModelResponse["toolCalls"][number]["name"],
        args: JSON.parse(call.function.arguments || "{}") as Record<string, unknown>,
      }));
      return { text: message?.content ?? "", toolCalls };
    } finally {
      clearTimeout(timer);
    }
  }
}
