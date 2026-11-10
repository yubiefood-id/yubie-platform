import {z} from "zod";
const actor=z.string().regex(/^[A-Za-z0-9_.-]{1,64}$/);
export const yubiReentrySchema=z.object({provider:z.enum(["zammad","chatwoot"]),threadId:z.string().regex(/^[1-9]\d{0,19}$/),changedBy:actor}).strict();
export const yubiFlowVersionSchema=z.object({flowVersion:z.enum(["deterministic-v1","deterministic-v2"]),releaseSha:z.string().regex(/^[a-f0-9]{40}$/),approvalRef:z.string().min(1).max(128),changedBy:actor}).strict();
// WA-02: operator-safe per-conversation mode reset (audit trail in
// conversation_mode_events; Zammad ownership is unaffected).
export const whatsappModeResetSchema=z.object({provider:z.enum(["zammad","chatwoot"]),threadId:z.string().regex(/^[1-9]\d{0,19}$/),changedBy:actor}).strict();
// WA-03: bounded AI policy. Enabling requires complete limits — the owner-held
// global day token budget is mandatory (fail closed at configuration time as
// well as at reservation time).
export const whatsappAiPolicySchema=z.object({
  mode:z.enum(["off","live"]),
  limits:z.object({
    maxCallsPerConversation:z.number().int().min(1).max(10),
    maxCallsPerContactDay:z.number().int().min(1).max(20),
    maxInputTokens:z.number().int().min(100).max(4000),
    maxOutputTokens:z.number().int().min(50).max(1000),
    timeoutMs:z.number().int().min(1000).max(30000),
    contextTurns:z.number().int().min(1).max(8),
    globalDayTokens:z.number().int().min(1),
    globalMonthCostMicrousd:z.number().int().min(0),
    priceMicrousdPerToken:z.number().int().min(0),
    priceVersion:z.string().min(1).max(64),
  }),
  approvalRef:z.string().min(1).max(128),
  changedBy:actor,
}).strict();
// WA-05: outbound template drafts and operator approval. Approval binds to the
// immutable content hash and always carries an expiry; nothing sends implicitly.
export const outboundDraftCreateSchema=z.object({
  templateId:z.string().min(8).max(64),
  purpose:z.literal("b2b_followup"),
  contactId:z.string().min(8).max(64),
  variables:z.record(z.string(),z.string().min(1).max(200)).refine(entries=>Object.keys(entries).length<=10,{message:"too_many_variables"}),
  createdBy:actor,
  costCapMicrousd:z.number().int().min(0).max(1_000_000).optional(),
  expiresAt:z.string().datetime().optional(),
}).strict();
export const outboundApproveSchema=z.object({
  contentHash:z.string().regex(/^[a-f0-9]{64}$/),
  expiresInHours:z.number().int().min(1).max(168),
  changedBy:actor,
}).strict();
