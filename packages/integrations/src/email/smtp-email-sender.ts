import { createTransport, type Transporter } from "nodemailer";
import type { EmailSendInput, EmailSendResult, EmailSender } from "@yubie/application";

export interface SmtpEmailSenderOptions {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  /** Connect/greeting/socket timeouts in ms (socket gets 3x). */
  timeoutMs?: number;
  /** Injectable for tests; defaults to nodemailer.createTransport. */
  createTransportFn?: typeof createTransport;
}

const ADDRESS_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{1,}$/;

/**
 * SMTP submission adapter (Namecheap Private Email or any standard relay).
 * Only operator-configured hosts/credentials ever reach this class; recipients
 * are the team inbox and the submitting business — never an arbitrary list.
 */
export class SmtpEmailSender implements EmailSender {
  private readonly transporter: Transporter;

  constructor(options: SmtpEmailSenderOptions) {
    if (!/^[A-Za-z0-9.-]{1,253}$/.test(options.host) || !options.host.includes(".")) throw new Error("SMTP_CONFIG_INVALID");
    if (options.port !== 465 && options.port !== 587) throw new Error("SMTP_CONFIG_INVALID");
    if (!options.user || options.user.length > 320 || /[\r\n\s]/.test(options.user)) throw new Error("SMTP_CONFIG_INVALID");
    if (!options.password || options.password.length > 500 || /[\r\n]/.test(options.password)) throw new Error("SMTP_CONFIG_INVALID");
    const timeoutMs = options.timeoutMs ?? 10_000;
    this.transporter = (options.createTransportFn ?? createTransport)({
      host: options.host,
      port: options.port,
      secure: options.secure,
      auth: { user: options.user, pass: options.password },
      connectionTimeout: timeoutMs,
      greetingTimeout: timeoutMs,
      socketTimeout: timeoutMs * 3,
      pool: true,
      maxConnections: 1,
      maxMessages: 50,
    });
  }

  async send(input: EmailSendInput): Promise<EmailSendResult> {
    const clean = (value: string) => !/[\r\n]/.test(value);
    if (!input.to.length || input.to.length > 5 || input.to.some((address) => !ADDRESS_PATTERN.test(address) || !clean(address))) {
      return { status: "failed", errorCode: "EMAIL_INPUT_INVALID" };
    }
    if (!ADDRESS_PATTERN.test(input.from) || !clean(input.from)) return { status: "failed", errorCode: "EMAIL_INPUT_INVALID" };
    if (input.replyTo !== undefined && (!ADDRESS_PATTERN.test(input.replyTo) || !clean(input.replyTo))) return { status: "failed", errorCode: "EMAIL_INPUT_INVALID" };
    if (!input.subject || input.subject.length > 200 || !clean(input.subject)) return { status: "failed", errorCode: "EMAIL_INPUT_INVALID" };
    if (!input.text || input.text.length > 20_000) return { status: "failed", errorCode: "EMAIL_INPUT_INVALID" };
    try {
      const info = await this.transporter.sendMail({
        from: input.from,
        to: input.to.join(", "),
        subject: input.subject,
        text: input.text,
        ...(input.replyTo ? { replyTo: input.replyTo } : {}),
        ...(input.html ? { html: input.html } : {}),
      });
      return { status: "accepted", providerMessageId: typeof info?.messageId === "string" ? info.messageId : null };
    } catch (error) {
      // nodemailer exposes the numeric SMTP response code on protocol-level
      // rejections; 5xx is a definitive refusal, everything else (timeouts,
      // resets, 4xx, TLS failures) stays uncertain — a retry may duplicate.
      const responseCode = (error as { responseCode?: unknown }).responseCode;
      if (typeof responseCode === "number" && responseCode >= 500) return { status: "failed", errorCode: "SMTP_REJECTED_PERMANENT" };
      return { status: "ambiguous", errorCode: "SMTP_OUTCOME_UNCERTAIN" };
    }
  }

  async close(): Promise<void> {
    this.transporter.close();
  }
}
