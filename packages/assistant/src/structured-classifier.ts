import type { AssistantIntent, NormalizedMessage } from "@yubie/domain";
import type { ModelProvider } from "./ports.js";
import { RuleBasedIntentClassifier } from "./intent-classifier.js";

export const CLASSIFIER_VERSION = "structured-v1";

export interface StructuredClassification {
  intent: AssistantIntent;
  confidence: number;
  entities: Record<string, unknown>;
  requiresHandoff: boolean;
  reasonCode: string;
}

const CLASSIFICATION_SCHEMA = `Respond with JSON only:
{
  "intent": "PRODUCT_INFO|PRODUCT_DISCOVERY|USAGE_RECIPE|WHERE_TO_BUY|BUSINESS_HOURS|B2B_INTRO|OTHER",
  "confidence": 0.0-1.0,
  "entities": {},
  "requires_handoff": boolean,
  "reason_code": "string"
}`;

export class StructuredIntentClassifier {
  constructor(
    private readonly model: ModelProvider,
    private readonly redPrefilter: RuleBasedIntentClassifier = new RuleBasedIntentClassifier(),
    private readonly minConfidence = 0.7,
  ) {}

  async classify(msg: NormalizedMessage): Promise<StructuredClassification> {
    const prefilterIntent = this.redPrefilter.classify(msg);
    const redIntents = new Set<AssistantIntent>([
      "FOOD_SAFETY", "ALLERGEN_OR_HEALTH", "REFUND_OR_COMPENSATION",
      "HUMAN_REQUEST", "PROMPT_INJECTION", "SPAM",
    ]);
    if (redIntents.has(prefilterIntent)) {
      return {
        intent: prefilterIntent,
        confidence: 1,
        entities: {},
        requiresHandoff: true,
        reasonCode: "red_prefilter",
      };
    }

    try {
      const response = await this.model.generate({
        systemPrompt: `You classify Indonesian customer messages for Yubie food brand. ${CLASSIFICATION_SCHEMA}`,
        userMessage: msg.text,
        tools: [],
        maxTokens: 256,
      });

      const parsed = JSON.parse(response.text) as {
        intent?: string;
        confidence?: number;
        entities?: Record<string, unknown>;
        requires_handoff?: boolean;
        reason_code?: string;
      };

      const intent = (parsed.intent ?? "OTHER") as AssistantIntent;
      const confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0;

      if (confidence < this.minConfidence || parsed.requires_handoff) {
        return {
          intent: "OTHER",
          confidence,
          entities: parsed.entities ?? {},
          requiresHandoff: true,
          reasonCode: parsed.reason_code ?? "low_confidence",
        };
      }

      return {
        intent,
        confidence,
        entities: parsed.entities ?? {},
        requiresHandoff: false,
        reasonCode: parsed.reason_code ?? "classified",
      };
    } catch {
      return {
        intent: "OTHER",
        confidence: 0,
        entities: {},
        requiresHandoff: true,
        reasonCode: "classifier_error",
      };
    }
  }
}

export class RuleOnlyStructuredClassifier {
  private readonly rules = new RuleBasedIntentClassifier();

  async classify(msg: NormalizedMessage): Promise<StructuredClassification> {
    const intent = this.rules.classify(msg);
    const redIntents = new Set<AssistantIntent>([
      "FOOD_SAFETY", "ALLERGEN_OR_HEALTH", "REFUND_OR_COMPENSATION",
      "HUMAN_REQUEST", "PROMPT_INJECTION", "SPAM",
    ]);
    return {
      intent,
      confidence: redIntents.has(intent) ? 1 : 0.85,
      entities: {},
      requiresHandoff: redIntents.has(intent),
      reasonCode: redIntents.has(intent) ? "red_prefilter" : "rule_classifier",
    };
  }
}
