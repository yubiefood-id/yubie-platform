import type { RuntimeEnvSource } from "./index.js";

/**
 * Outbound B2B enquiry email (worker-only consumer). Fail-closed and inert by
 * default: without B2B_EMAIL_DELIVERY=enabled nothing sends, no queue is
 * created and pending outbox events simply wait — activation is a pure env
 * change plus a worker recreate (ADR-016).
 */
export interface B2bEmailRuntimeConfig {
  host: string;
  port: number;
  /** 465 = implicit TLS; 587 = STARTTLS (nodemailer opportunistic upgrade). */
  secure: boolean;
  user: string;
  password: string;
  /** Envelope/display sender, e.g. the dedicated enquiry mailbox. */
  from: string;
  /** Internal recipients of the enquiry notification (the team inbox). */
  notifyTo: string[];
  /** Customer acknowledgment copy on/off, independent of the notification. */
  ackEnabled: boolean;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{1,}$/;

function validEmail(value: string): boolean {
  return value.length <= 254 && !/[\r\n]/.test(value) && EMAIL_PATTERN.test(value);
}

/** Returns null when delivery is disabled (the default); throws on bad values. */
export function parseEmailRuntimeConfig(env: RuntimeEnvSource, scope: "worker"): B2bEmailRuntimeConfig | null {
  const mode = env.B2B_EMAIL_DELIVERY;
  if (!mode || mode === "disabled") return null;
  if (mode !== "enabled") throw new Error("CONFIG_ERROR: B2B_EMAIL_DELIVERY must be 'enabled' or 'disabled'");
  if (scope !== "worker") throw new Error("CONFIG_ERROR: B2B_EMAIL_DELIVERY is a worker-scope setting");
  const invalid = (name: string): never => {
    throw new Error("CONFIG_ERROR: " + name + " is required or invalid for B2B enquiry email delivery");
  };
  const host = env.SMTP_HOST ?? "";
  if (!/^[A-Za-z0-9.-]{1,253}$/.test(host) || !host.includes(".")) invalid("SMTP_HOST");
  const portRaw = env.SMTP_PORT ?? "465";
  if (!/^[0-9]{2,5}$/.test(portRaw)) invalid("SMTP_PORT");
  const port = Number(portRaw);
  if (port !== 465 && port !== 587) invalid("SMTP_PORT");
  const user = env.SMTP_USER ?? "";
  if (!user || user.length > 320 || /[\r\n\s]/.test(user)) invalid("SMTP_USER");
  const password = env.SMTP_PASSWORD ?? "";
  if (!password || password.length > 500) invalid("SMTP_PASSWORD");
  const from = env.B2B_ENQUIRY_EMAIL_FROM ?? "";
  if (!validEmail(from)) invalid("B2B_ENQUIRY_EMAIL_FROM");
  const notifyRaw = (env.B2B_ENQUIRY_NOTIFY_TO ?? "hello@yubiefood.com").split(",").map((value) => value.trim()).filter(Boolean);
  if (!notifyRaw.length || notifyRaw.length > 5 || notifyRaw.some((value) => !validEmail(value))) invalid("B2B_ENQUIRY_NOTIFY_TO");
  const ackMode = env.B2B_ENQUIRY_ACK ?? "enabled";
  if (ackMode !== "enabled" && ackMode !== "disabled") throw new Error("CONFIG_ERROR: B2B_ENQUIRY_ACK must be 'enabled' or 'disabled'");
  return { host, port, secure: port === 465, user, password, from, notifyTo: notifyRaw, ackEnabled: ackMode === "enabled" };
}
