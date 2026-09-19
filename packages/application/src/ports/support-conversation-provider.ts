export type SupportProviderKind = "fake" | "chatwoot" | "zammad";

export interface SupportThreadRef {
  provider: SupportProviderKind;
  threadId: string;
}

export interface SupportMessage {
  id: string;
  role: "customer" | "agent" | "bot" | "system";
  text: string;
  internal: boolean;
  createdAt: string;
}

export interface SupportThread {
  ref: SupportThreadRef;
  customerId: string;
  inboxOrChannelId: string;
  humanActive: boolean;
  stateLabel: string;
  groupId?: string;
}

export type ProviderResultCode =
  | "SUCCESS"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "UNAVAILABLE"
  | "AMBIGUOUS";

export type ProviderSendResult =
  | { ok: true; code: "SUCCESS"; providerMessageId?: string }
  | { ok: false; code: Exclude<ProviderResultCode, "SUCCESS">; message?: string };

export interface SendReplyCommand {
  threadRef: SupportThreadRef;
  content: string;
  idempotencyKey: string;
}

export interface HandoffCommand {
  threadRef: SupportThreadRef;
  labels: string[];
  groupId?: string;
  priorityId?: string;
  botModeOff?: boolean;
}

export interface HumanControlState {
  humanActive: boolean;
  reason?: string;
}

export interface SupportConversationProvider {
  readonly provider: SupportProviderKind;
  getThread(ref: SupportThreadRef): Promise<SupportThread>;
  getRecentMessages(ref: SupportThreadRef, options?: { limit?: number }): Promise<SupportMessage[]>;
  sendReply(command: SendReplyCommand): Promise<ProviderSendResult>;
  getCurrentHumanState(ref: SupportThreadRef): Promise<HumanControlState>;
  handoff(command: HandoffCommand): Promise<ProviderSendResult>;
  listThreadsUpdatedSince(sinceIso: string): Promise<Array<{ threadId: string; updatedAt: string }>>;
  getArticle?(ref: SupportThreadRef, articleId: string): Promise<SupportMessage | null>;
}

export function threadRef(provider: SupportProviderKind, threadId: string): SupportThreadRef {
  return { provider, threadId };
}
