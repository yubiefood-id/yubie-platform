import type {
  OutboundMessageStatus,
  OutboundTemplateSendCommand,
  OutboundTemplateSendResult,
  OutboundTemplateTransport,
} from "@yubie/application";

/** Deterministic test double with scripted outcomes and call recording. */
export class FakeOutboundTransport implements OutboundTemplateTransport {
  readonly name = "fake";
  public calls: OutboundTemplateSendCommand[] = [];
  public statuses = new Map<string, OutboundMessageStatus>();
  constructor(
    private readonly script: Array<OutboundTemplateSendResult> = [],
    private readonly defaultCostMicrousd = 0,
  ) {}
  async send(command: OutboundTemplateSendCommand): Promise<OutboundTemplateSendResult> {
    this.calls.push(command);
    const next = this.script.shift();
    if (next) {
      if (next.ok && next.providerMessageId) this.statuses.set(next.providerMessageId, "delivered");
      return next;
    }
    const providerMessageId = `fake-wamid-${this.calls.length}`;
    this.statuses.set(providerMessageId, "delivered");
    return { ok: true, providerMessageId, ...(this.defaultCostMicrousd ? { costMicrousd: this.defaultCostMicrousd } : {}) };
  }
  async getMessageStatus(providerMessageId: string): Promise<OutboundMessageStatus> {
    return this.statuses.get(providerMessageId) ?? "unknown";
  }
}

/**
 * Meta WhatsApp Cloud API template transport. Fail-closed: constructs only
 * with explicit credentials and the worker additionally gates every dispatch
 * behind the audited runtime switch — this class is never reachable in tests
 * or default configuration.
 */
export class MetaCloudApiTemplateTransport implements OutboundTemplateTransport {
  readonly name = "meta-cloud-api";
  constructor(
    private readonly phoneNumberId: string,
    private readonly accessToken: string,
    private readonly apiBaseUrl = "https://graph.facebook.com",
    private readonly apiVersion = "v21.0",
    private readonly timeoutMs = 10_000,
  ) {}
  async send(command: OutboundTemplateSendCommand): Promise<OutboundTemplateSendResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.apiBaseUrl}/${this.apiVersion}/${this.phoneNumberId}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${this.accessToken}` },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: command.toWhatsapp,
          type: "template",
          template: {
            name: command.templateName,
            language: { code: command.language },
            components: [{ type: "body", parameters: [{ type: "text", text: command.bodyText }] }],
          },
        }),
        signal: controller.signal,
      });
      if (response.status === 401 || response.status === 403) return { ok: false, code: "VALIDATION_ERROR", message: `meta_http_${response.status}` };
      // A 5xx/timeout after acceptance is indistinguishable from failure before
      // send: treat as ambiguous and reconcile — never blind-resend.
      if (response.status >= 500) return { ok: false, code: "AMBIGUOUS", message: `meta_http_${response.status}` };
      if (!response.ok) return { ok: false, code: "VALIDATION_ERROR", message: `meta_http_${response.status}` };
      const body = (await response.json()) as { messages?: Array<{ id?: string }> };
      const providerMessageId = body.messages?.[0]?.id;
      if (!providerMessageId) return { ok: false, code: "AMBIGUOUS", message: "meta_no_message_id" };
      return { ok: true, providerMessageId };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return { ok: false, code: "TIMEOUT" };
      return { ok: false, code: "UNAVAILABLE", message: error instanceof Error ? error.message : "network" };
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Fail-closed factory: nothing is configured by default, nothing can send. */
export function createOutboundTransportFromEnv(env: NodeJS.ProcessEnv = process.env): OutboundTemplateTransport {
  if (env.OUTBOUND_WHATSAPP_PROVIDER === "fake") return new FakeOutboundTransport();
  if (env.OUTBOUND_WHATSAPP_PROVIDER === "meta" && env.META_CLOUD_PHONE_NUMBER_ID && env.META_CLOUD_ACCESS_TOKEN) {
    return new MetaCloudApiTemplateTransport(env.META_CLOUD_PHONE_NUMBER_ID, env.META_CLOUD_ACCESS_TOKEN);
  }
  return new FailClosedOutboundTransport();
}

export class FailClosedOutboundTransport implements OutboundTemplateTransport {
  readonly name = "fail-closed";
  async send(): Promise<OutboundTemplateSendResult> {
    return { ok: false, code: "UNAVAILABLE", message: "outbound_transport_not_configured" };
  }
}
