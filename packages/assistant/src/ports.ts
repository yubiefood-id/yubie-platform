import type {
  AllowedTool,
  AssistantIntent,
  AssistantOutcome,
  NormalizedMessage,
  RiskLevel,
} from "@yubie/domain";

export interface ModelRequest {
  systemPrompt: string;
  userMessage: string;
  tools: ToolSchema[];
  maxTokens: number;
}

export interface ModelResponse {
  text: string;
  toolCalls: Array<{ name: AllowedTool; args: Record<string, unknown> }>;
}

export interface ModelProvider {
  generate(req: ModelRequest): Promise<ModelResponse>;
}

export interface ToolSchema {
  name: AllowedTool;
  description: string;
}

export interface ToolResult {
  name: AllowedTool;
  data: unknown;
}

export interface ToolContext {
  conversationId: string;
  productId?: string;
}

export interface ToolRegistry {
  execute(name: AllowedTool, args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>;
}

export interface IntentClassifier {
  classify(msg: NormalizedMessage): AssistantIntent;
}

export interface RiskPolicy {
  route(intent: AssistantIntent): RiskLevel;
}

export interface DraftReply {
  text: string;
  intent: AssistantIntent;
  risk: RiskLevel;
  toolResults: ToolResult[];
}

export interface ValidationContext {
  conversationState: string;
  intent: AssistantIntent;
  risk: RiskLevel;
  toolResults: ToolResult[];
}

export interface ValidationResult {
  ok: boolean;
  reason?: string;
}

export interface ResponseValidator {
  validate(draft: DraftReply, ctx: ValidationContext): ValidationResult;
}

export interface AssistantPipelineDeps {
  classifier: IntentClassifier;
  riskPolicy: RiskPolicy;
  tools: ToolRegistry;
  model: ModelProvider;
  validator: ResponseValidator;
  systemPrompt: string;
  autoReplyEnabled: boolean;
  allowedGreenIntents: Set<AssistantIntent>;
  mode: "shadow" | "suggestion" | "auto";
}

export type PipelineResult = AssistantOutcome;
