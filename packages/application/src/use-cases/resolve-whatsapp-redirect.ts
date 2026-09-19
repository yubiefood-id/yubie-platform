import { err, ok, type AttributionContext } from "@yubie/domain";
import type {
  AttributionPolicy,
  Clock,
  IdGenerator,
  OutboundIntentRepository,
  WhatsAppIntentRepository,
} from "../ports.js";

const ANALYTICS_TIMEOUT_MS = 200;

export async function resolveWhatsAppRedirect(
  intentKey: string,
  attributionInput: Partial<AttributionContext>,
  deps: {
    intents: WhatsAppIntentRepository;
    outbound: OutboundIntentRepository;
    attribution: AttributionPolicy;
    clock: Clock;
    ids: IdGenerator;
    requestId: string;
  },
): Promise<import("@yubie/domain").UseCaseResult<{ destinationUrl: string }>> {
  const { requestId } = deps;

  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(intentKey)) {
    return err({ code: "validation", message: "Invalid intent key", retryable: false, requestId });
  }

  const intentResult = await deps.intents.findByKey(intentKey);
  if (!intentResult.ok) return intentResult;

  const intent = intentResult.value;
  if (!intent || intent.status !== "active") {
    return err({ code: "unavailable", message: "WhatsApp destination not configured", retryable: false, requestId });
  }

  let parsed: URL;
  try {
    parsed = new URL(intent.destinationUrl);
  } catch {
    return err({ code: "unavailable", message: "WhatsApp destination invalid", retryable: false, requestId });
  }
  if (parsed.protocol !== "https:") {
    return err({ code: "unavailable", message: "WhatsApp destination must be HTTPS", retryable: false, requestId });
  }

  const attributionResult = deps.attribution.sanitize(attributionInput);
  if (!attributionResult.ok) return attributionResult;

  const outbound = {
    id: deps.ids.nextId(),
    ...(intent.productId ? { productId: intent.productId } : {}),
    destinationKind: "whatsapp" as const,
    channel: "whatsapp" as const,
    intentKey: intent.intentKey,
    attribution: attributionResult.value,
    requestId,
    createdAt: deps.clock.now(),
  };

  try {
    await Promise.race([
      deps.outbound.append(outbound),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ANALYTICS_TIMEOUT_MS)),
    ]);
  } catch {
    // Non-blocking analytics
  }

  return ok({ destinationUrl: intent.destinationUrl });
}
