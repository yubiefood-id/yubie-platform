// WA-05: provider-neutral outbound template transport port. Business-initiated
// template messages NEVER travel through the Zammad native reply channel and
// never send without the full recheck chain (consent, approval, template,
// caps) executed by the dispatching worker immediately before each attempt.

export type OutboundTemplateSendResult =
  | { ok: true; providerMessageId: string; costMicrousd?: number }
  | { ok: false; code: "TIMEOUT" | "AMBIGUOUS" | "UNAVAILABLE" | "VALIDATION_ERROR"; message?: string };

export interface OutboundTemplateSendCommand {
  toWhatsapp: string;
  templateName: string;
  templateVersion: string;
  language: string;
  bodyText: string;
  idempotencyKey: string;
}

export type OutboundMessageStatus = "sent" | "delivered" | "failed" | "unknown";

export interface OutboundTemplateTransport {
  readonly name: string;
  send(command: OutboundTemplateSendCommand): Promise<OutboundTemplateSendResult>;
  getMessageStatus?(providerMessageId: string): Promise<OutboundMessageStatus>;
}
