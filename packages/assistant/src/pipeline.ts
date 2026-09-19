import type { AssistantOutcome, NormalizedMessage } from "@yubie/domain";
import type { AssistantPipelineDeps } from "./ports.js";

export async function runAssistantPipeline(
  msg: NormalizedMessage,
  conversationState: string,
  deps: AssistantPipelineDeps,
): Promise<AssistantOutcome> {
  const intent = deps.classifier.classify(msg);
  const risk = deps.riskPolicy.route(intent);

  if (risk === "RED") {
    return { kind: "handoff", handoffReason: intent, intent, risk };
  }

  if (risk === "AMBER") {
    return { kind: "handoff", handoffReason: `amber:${intent}`, intent, risk };
  }

  if (conversationState === "HUMAN_ACTIVE" || conversationState === "HANDOFF_REQUESTED") {
    return { kind: "noop", intent, risk };
  }

  const modelResponse = await deps.model.generate({
    systemPrompt: deps.systemPrompt,
    userMessage: msg.text,
    tools: [
      { name: "get_product", description: "Get approved product information" },
      { name: "get_purchase_options", description: "Get marketplace purchase links" },
      { name: "get_business_hours", description: "Get business hours" },
      { name: "request_handoff", description: "Escalate to human agent" },
    ],
    maxTokens: 512,
  });

  for (const call of modelResponse.toolCalls) {
    if (call.name === "request_handoff") {
      return { kind: "handoff", handoffReason: String(call.args.reason ?? intent), intent, risk };
    }
    await deps.tools.execute(call.name, call.args, { conversationId: msg.conversationId });
  }

  const toolResults = [];
  for (const call of modelResponse.toolCalls) {
    if (call.name !== "request_handoff") {
      toolResults.push(await deps.tools.execute(call.name, call.args, { conversationId: msg.conversationId }));
    }
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
    return { kind: "handoff", handoffReason: validation.reason ?? "validation_failed", intent, risk };
  }

  if (deps.mode === "shadow") {
    return { kind: "noop", intent, risk };
  }

  if (!deps.autoReplyEnabled || !deps.allowedGreenIntents.has(intent)) {
    return { kind: "noop", intent, risk };
  }

  return { kind: "reply", text: draft.text, intent, risk };
}
