import type { AssistantOutcome, NormalizedMessage } from "@yubie/domain";
import type { StructuredClassification } from "./structured-classifier.js";
import type { AssistantPipelineDeps } from "./ports.js";

export interface ConversationTurn {
  role: "customer" | "agent" | "bot";
  text: string;
}

export interface PipelineConversationContext {
  recentTurns: ConversationTurn[];
  customerLanguage: "id" | "en" | "mixed";
}

export interface ExtendedPipelineDeps extends AssistantPipelineDeps {
  classifyStructured?: (msg: NormalizedMessage) => Promise<StructuredClassification>;
  conversationContext?: PipelineConversationContext;
}

export type PipelineResult = AssistantOutcome & {
  suggestionText?: string;
  classification?: StructuredClassification;
};

function withClassification(
  outcome: AssistantOutcome & { suggestionText?: string },
  classification?: StructuredClassification,
): PipelineResult {
  if (classification) return { ...outcome, classification };
  return outcome;
}

export async function runAssistantPipeline(
  msg: NormalizedMessage,
  conversationState: string,
  deps: ExtendedPipelineDeps,
): Promise<PipelineResult> {
  let intent = deps.classifier.classify(msg);
  let classification: StructuredClassification | undefined;

  if (deps.classifyStructured) {
    classification = await deps.classifyStructured(msg);
    if (classification.requiresHandoff) {
      return withClassification(
        {
          kind: "handoff",
          handoffReason: classification.reasonCode,
          intent: classification.intent,
          risk: "RED",
        },
        classification,
      );
    }
    intent = classification.intent;
  }

  const risk = deps.riskPolicy.route(intent);

  if (risk === "RED") {
    return withClassification({ kind: "handoff", handoffReason: intent, intent, risk }, classification);
  }

  if (risk === "AMBER") {
    return withClassification({ kind: "handoff", handoffReason: `amber:${intent}`, intent, risk }, classification);
  }

  if (conversationState === "HUMAN_ACTIVE" || conversationState === "HANDOFF_REQUESTED") {
    return withClassification({ kind: "noop", intent, risk }, classification);
  }

  const contextPrefix = deps.conversationContext?.recentTurns.length
    ? deps.conversationContext.recentTurns
        .map((t) => `${t.role}: ${t.text}`)
        .join("\n")
    : "";
  const userMessage = contextPrefix ? `${contextPrefix}\ncustomer: ${msg.text}` : msg.text;

  const modelResponse = await deps.model.generate({
    systemPrompt: deps.systemPrompt,
    userMessage,
    tools: [
      { name: "get_product", description: "Get approved product information" },
      { name: "get_purchase_options", description: "Get marketplace purchase links" },
      { name: "get_business_hours", description: "Get business hours" },
      { name: "request_handoff", description: "Escalate to human agent" },
    ],
    maxTokens: 512,
  });

  const toolResults = [];
  for (const call of modelResponse.toolCalls) {
    if (call.name === "request_handoff") {
      return withClassification(
        {
          kind: "handoff",
          handoffReason: String(call.args.reason ?? intent),
          intent,
          risk,
        },
        classification,
      );
    }
    toolResults.push(await deps.tools.execute(call.name, call.args, { conversationId: msg.conversationId }));
  }

  const draft = {
    text: modelResponse.text,
    intent,
    risk,
    toolResults,
  };

  const validation = deps.validator.validate(draft, {
    conversationState,
    intent,
    risk,
    toolResults,
  });

  if (!validation.ok) {
    return withClassification(
      {
        kind: "handoff",
        handoffReason: validation.reason ?? "validation_failed",
        intent,
        risk,
      },
      classification,
    );
  }

  if (deps.mode === "shadow") {
    return withClassification({ kind: "noop", intent, risk }, classification);
  }

  if (deps.mode === "suggestion") {
    return withClassification({ kind: "noop", intent, risk, suggestionText: draft.text }, classification);
  }

  if (!deps.autoReplyEnabled || !deps.allowedGreenIntents.has(intent)) {
    return withClassification({ kind: "noop", intent, risk }, classification);
  }

  return withClassification({ kind: "reply", text: draft.text, intent, risk }, classification);
}
