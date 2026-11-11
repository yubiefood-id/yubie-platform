// M2 (operator-AI pass): provider-neutral operator assistant. This is NOT the
// customer pipeline: outputs go only to a privileged operator, the model has
// NO tools and NO send capability, and every call is budgeted + audited by the
// /ops/ai endpoint. Fail-closed by default (ThrowingOpsAIProvider).

export interface OpsAIRequest {
  systemPrompt: string;
  userMessage: string;
  maxOutputTokens: number;
  timeoutMs: number;
}

export type OpsAIResult =
  | { ok: true; text: string; usage: { inputTokens: number; outputTokens: number } }
  | { ok: false; code: "TIMEOUT" | "UNAVAILABLE" | "INVALID_OUTPUT"; message?: string };

export interface OpsAIProvider {
  readonly name: string;
  generate(request: OpsAIRequest): Promise<OpsAIResult>;
}

export const OPS_AI_SYSTEM_PROMPT = [
  "Kamu adalah asisten operasional internal Yubie (ops copilot) untuk staf, BUKAN untuk pelanggan.",
  "Semua jawabanmu adalah DRAFT untuk operator — tidak pernah terkirim ke pelanggan secara otomatis.",
  "Untuk fakta produk Yubie, gunakan hanya FAKTA DISETUJUI yang diberikan; jika tidak ada, katakan tidak tersedia.",
  "Jangan mengaku bisa mengirim pesan, mengubah konfigurasi, atau melakukan tindakan apa pun — kamu hanya menghasilkan teks.",
  "Ringkas dengan ringkas dan faktual dalam Bahasa Indonesia; tandai ketidakpastian secara eksplisit.",
].join(" ");

export class ThrowingOpsAIProvider implements OpsAIProvider {
  readonly name = "throwing";
  async generate(): Promise<OpsAIResult> {
    throw new Error("ops_ai_invoked_without_configuration");
  }
}

export class FakeOpsAIProvider implements OpsAIProvider {
  readonly name = "fake";
  public calls = 0;
  public lastRequest: OpsAIRequest | null = null;
  constructor(private readonly script: Array<OpsAIResult> = []) {}
  async generate(request: OpsAIRequest): Promise<OpsAIResult> {
    this.calls += 1;
    this.lastRequest = request;
    const next = this.script.shift();
    if (next) return next;
    return { ok: true, text: "Ringkasan DRAFT (fake).", usage: { inputTokens: 80, outputTokens: 20 } };
  }
}

/**
 * Any OpenAI-compatible chat-completions endpoint. Default configuration
 * targets z.ai's open platform (GLM), configurable to any provider via env.
 */
export class OpenAICompatibleOpsAIProvider implements OpsAIProvider {
  constructor(
    readonly name: string,
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly model: string,
    private readonly timeoutMs = 20_000,
  ) {}
  async generate(request: OpsAIRequest): Promise<OpsAIResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), request.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({
          model: this.model,
          max_tokens: request.maxOutputTokens,
          temperature: 0.2,
          messages: [
            { role: "system", content: request.systemPrompt },
            { role: "user", content: request.userMessage },
          ],
        }),
        signal: controller.signal,
      });
      if (!response.ok) return { ok: false, code: "UNAVAILABLE", message: `${this.name}_http_${response.status}` };
      const body = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const text = body.choices?.[0]?.message?.content?.trim();
      if (!text) return { ok: false, code: "INVALID_OUTPUT", message: "empty_completion" };
      return {
        ok: true,
        text,
        usage: {
          inputTokens: body.usage?.prompt_tokens ?? Math.ceil((request.systemPrompt.length + request.userMessage.length) / 4),
          outputTokens: body.usage?.completion_tokens ?? Math.ceil(text.length / 4),
        },
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return { ok: false, code: "TIMEOUT" };
      return { ok: false, code: "UNAVAILABLE", message: error instanceof Error ? error.message : "network" };
    } finally {
      clearTimeout(timer);
    }
  }
}

export const ZAI_DEFAULT_BASE_URL = "https://api.z.ai/api/paas/v4";
export const ZAI_DEFAULT_MODEL = "glm-4.6";

/** Fail-closed: without an explicit provider AND key, nothing can be called. */
export function createOpsAIProviderFromEnv(env: NodeJS.ProcessEnv = process.env): OpsAIProvider {
  const provider = env.OPS_AI_PROVIDER ?? "throwing";
  if (provider === "fake") return new FakeOpsAIProvider();
  if (provider === "zai" || provider === "openai-compatible") {
    const apiKey = env.ZAI_API_KEY ?? env.OPS_AI_API_KEY;
    if (!apiKey) return new ThrowingOpsAIProvider();
    return new OpenAICompatibleOpsAIProvider(
      provider === "zai" ? `zai:${env.OPS_AI_MODEL ?? ZAI_DEFAULT_MODEL}` : `openai-compatible:${env.OPS_AI_MODEL ?? "default"}`,
      env.ZAI_BASE_URL ?? (provider === "zai" ? ZAI_DEFAULT_BASE_URL : "http://127.0.0.1:8000/v1"),
      apiKey,
      env.OPS_AI_MODEL ?? (provider === "zai" ? ZAI_DEFAULT_MODEL : "default"),
    );
  }
  return new ThrowingOpsAIProvider();
}

// Internal (operator-only) output rules: softer than the customer validator —
// operators may see quoted prices/complaints — but injection echoes and secret
// patterns are still hard-rejected.
const OPS_FORBIDDEN: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /(ignore (all )?(previous|above) instructions|system prompt|instruksi sistem|abaikan instruksi)/i, reason: "prompt_injection" },
  { pattern: /(sk-[a-z0-9]{8,}|api[_ ]?key\s*[:=]\s*\S{8,}|bearer\s+[a-z0-9._-]{16,})/i, reason: "secret_leak" },
];

export function validateOpsInternalText(text: string, maxChars = 4000): { valid: boolean; reason?: string } {
  const trimmed = text.trim();
  if (!trimmed) return { valid: false, reason: "empty" };
  if (trimmed.length > maxChars) return { valid: false, reason: "too_long" };
  for (const rule of OPS_FORBIDDEN) if (rule.pattern.test(trimmed)) return { valid: false, reason: rule.reason };
  return { valid: true };
}
