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
  /** Rebuilt by the worker; never deserialized from customer/provider input. */
  authorizeDispatch?: () => Promise<boolean>;
  handoffReceipt?: boolean;
  threadRef: SupportThreadRef;
  content: string;
  idempotencyKey: string;
}

export interface SendProductMediaCommand {
  authorizeDispatch?: () => Promise<boolean>;
  threadRef: SupportThreadRef;
  productId: string;
  assetId: string;
  caption: string;
  websiteUrl: string;
  idempotencyKey: string;
  correlationId: string;
}
export interface OutboundDeliveryStatus {
  state: "accepted" | "sent" | "delivered" | "failed" | "unknown";
  providerMessageId?: string;
}

export interface HandoffCommand {
  /** Worker authorization, checked before each routine remote mutation. Safety routing is internal. */
  authorizeDispatch?: () => Promise<boolean>;
  summary?: Record<string,unknown>;
  idempotencyKey?: string;
  threadRef: SupportThreadRef;
  labels: string[];
  groupId?: string;
  priorityId?: string;
  botModeOff?: boolean;
}

export interface HumanControlState {
  lifecycle?: "open" | "closed" | "unknown";
  humanActive: boolean;
  automationDisabled?: boolean;
  lastCustomerAt?: string;
  serviceWindowOpen?: boolean;
  reason?: string;
}

export interface SupportConversationProvider {
  readonly provider: SupportProviderKind;
  getThread(ref: SupportThreadRef): Promise<SupportThread>;
  getRecentMessages(ref: SupportThreadRef, options?: { limit?: number }): Promise<SupportMessage[]>;
  sendReply(command: SendReplyCommand): Promise<ProviderSendResult>;
  sendProductMedia?(command: SendProductMediaCommand): Promise<ProviderSendResult>;
  getOutboundStatus?(ref: SupportThreadRef, deliveryKey: string): Promise<OutboundDeliveryStatus>;
  getCurrentHumanState(ref: SupportThreadRef): Promise<HumanControlState>;
  /** Resolves an opaque signed event state reference using the provider's state catalog. */
  resolveLifecycleState?(stateRef: string): Promise<"open" | "closed" | "unknown">;
  handoff(command: HandoffCommand): Promise<ProviderSendResult>;
  listThreadsUpdatedSince(sinceIso: string): Promise<Array<{ threadId: string; updatedAt: string }>>;
  getArticle?(ref: SupportThreadRef, articleId: string): Promise<SupportMessage | null>;
}

export function threadRef(provider: SupportProviderKind, threadId: string): SupportThreadRef {
  return { provider, threadId };
}
