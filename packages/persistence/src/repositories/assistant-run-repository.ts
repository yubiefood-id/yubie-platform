import { randomUUID } from "node:crypto";
import { ok } from "@yubie/domain";
import type { Database } from "../client.js";
import { assistantActions, assistantRuns } from "../schema/index.js";

export interface AssistantRunRecord {
  id: string;
  sessionId: string;
  inboxEventId: string;
  conversationRef?: string;
  messageRef?: string;
  intent?: string;
  risk?: string;
  classifierVersion?: string;
  policyVersion?: string;
  knowledgeVersion?: string;
  modelProvider: string;
  modelName?: string;
  promptVersion: string;
  toolNames?: string;
  validatorOutcome?: string;
  handoffReason?: string;
  latencyMs?: number;
  tokenUsage?: number;
  outcome: string;
  createdAt: string;
}

export class PostgresAssistantRunRepository {
  constructor(private readonly database: Database) {}

  async insert(run: AssistantRunRecord) {
    await this.database.db.insert(assistantRuns).values({
      id: run.id,
      sessionId: run.sessionId,
      inboxEventId: run.inboxEventId,
      conversationRef: run.conversationRef ?? null,
      messageRef: run.messageRef ?? null,
      intent: run.intent ?? null,
      risk: run.risk ?? null,
      classifierVersion: run.classifierVersion ?? null,
      policyVersion: run.policyVersion ?? null,
      knowledgeVersion: run.knowledgeVersion ?? null,
      modelProvider: run.modelProvider,
      modelName: run.modelName ?? null,
      promptVersion: run.promptVersion,
      toolNames: run.toolNames ?? null,
      validatorOutcome: run.validatorOutcome ?? null,
      handoffReason: run.handoffReason ?? null,
      latencyMs: run.latencyMs ?? null,
      tokenUsage: run.tokenUsage ?? null,
      outcome: run.outcome,
      createdAt: run.createdAt,
    });
    return ok(undefined);
  }

  async insertAction(action: {
    runId: string;
    actionType: string;
    toolName?: string;
    detailsJson?: string;
    createdAt: string;
  }) {
    const id = `action-${randomUUID()}`;
    await this.database.db.insert(assistantActions).values({
      id,
      runId: action.runId,
      actionType: action.actionType,
      toolName: action.toolName ?? null,
      detailsJson: action.detailsJson ?? null,
      createdAt: action.createdAt,
    });
    return ok(id);
  }

  nextRunId() {
    return `run-${randomUUID()}`;
  }
}
