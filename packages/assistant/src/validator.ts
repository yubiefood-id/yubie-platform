import type { ResponseValidator, ValidationContext, DraftReply } from "./ports.js";

const PROHIBITED = [
  /jamin (turun|langsing)/i,
  /obat/i,
  /menyembuhkan/i,
  /api[_-]?key/i,
  /password/i,
  /system prompt/i,
];

export class DefaultResponseValidator implements ResponseValidator {
  validate(draft: DraftReply, ctx: ValidationContext) {
    if (ctx.conversationState === "HUMAN_ACTIVE") {
      return { ok: false, reason: "human_active" };
    }
    if (ctx.risk === "RED") {
      return { ok: false, reason: "red_risk" };
    }
    if (ctx.risk === "AMBER") {
      return { ok: false, reason: "amber_risk" };
    }
    if (draft.text.length > 2000) {
      return { ok: false, reason: "too_long" };
    }
    for (const pattern of PROHIBITED) {
      if (pattern.test(draft.text)) {
        return { ok: false, reason: "prohibited_claim" };
      }
    }
    if (ctx.intent === "WHERE_TO_BUY" && ctx.toolResults.length === 0) {
      return { ok: false, reason: "missing_purchase_tool" };
    }
    return { ok: true };
  }
}
