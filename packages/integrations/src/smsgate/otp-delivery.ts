import type { OtpDeliveryPort } from "@yubie/application";

export interface SmsgateOptions {
  baseUrl: string; username: string; password: string; deviceId: string; simNumber: number;
  fetchFn?: typeof fetch;
}
/** Private configured endpoint only. No customer can select a URL, SIM or device. */
export class SmsgateOtpDelivery implements OtpDeliveryPort {
  private readonly base: string;
  private readonly fetchFn: typeof fetch;
  private readonly authorization: string;
  constructor(private readonly options: SmsgateOptions) {
    let url: URL;
    try { url = new URL(options.baseUrl); } catch { throw new Error("SMSGATE_CONFIG_INVALID"); }
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || !["/", "/3rdparty/v1"].includes(url.pathname) || !options.username || !options.password || !/^[A-Za-z0-9_-]{1,96}$/.test(options.deviceId) || !Number.isInteger(options.simNumber) || options.simNumber < 1 || options.simNumber > 4) throw new Error("SMSGATE_CONFIG_INVALID");
    this.base = url.origin + "/3rdparty/v1";
    this.fetchFn = options.fetchFn ?? fetch;
    this.authorization = "Basic " + Buffer.from(options.username + ":" + options.password).toString("base64");
  }
  private validId(id: string): boolean { return /^otp_[A-Za-z0-9_-]{1,96}$/.test(id); }
  async send(command: { id: string; phone: string; code: string; ttlSeconds: number }): Promise<{ status: "accepted" | "delivered" | "failed" }> {
    if (!this.validId(command.id) || !/^\+[1-9]\d{7,14}$/.test(command.phone) || !/^\d{6}$/.test(command.code) || !Number.isInteger(command.ttlSeconds) || command.ttlSeconds < 1 || command.ttlSeconds > 300) throw new Error("SMS_COMMAND_INVALID");
    let response: Response;
    try {
      response = await this.fetchFn(this.base + "/messages", { method: "POST", redirect: "error", signal: AbortSignal.timeout(5000), headers: { authorization: this.authorization, "content-type": "application/json" }, body: JSON.stringify({ id: command.id, textMessage: { text: `Kode Yubie: ${command.code}. Gunakan sebelum waktu verifikasi habis. Jangan bagikan kode.` }, phoneNumbers: [command.phone], deviceId: this.options.deviceId, simNumber: this.options.simNumber, ttl: command.ttlSeconds, withDeliveryReport: true, priority: 100 }) });
    } catch { throw new Error("SMS_SEND_UNCERTAIN"); }
    if (response.status >= 400 && response.status < 500 && ![408, 409, 429].includes(response.status)) return { status: "failed" };
    if (!response.ok) throw new Error("SMS_SEND_UNCERTAIN");
    try {
      const data = await response.json() as { id?: string; state?: string };
      if (data.id !== command.id) throw new Error();
      return { status: data.state === "Delivered" ? "delivered" : data.state === "Failed" || data.state === "Cancelled" ? "failed" : "accepted" };
    } catch { throw new Error("SMS_SEND_UNCERTAIN"); }
  }
  async lookup(id: string): Promise<{ status: "accepted" | "delivered" | "failed" | "unknown" }> {
    if (!this.validId(id)) return { status: "unknown" };
    try {
      const response = await this.fetchFn(this.base + "/messages/" + id, { method: "GET", redirect: "error", signal: AbortSignal.timeout(5000), headers: { authorization: this.authorization } });
      if (!response.ok) return { status: "unknown" };
      const data = await response.json() as { id?: string; state?: string };
      if (data.id !== id) return { status: "unknown" };
      return { status: data.state === "Delivered" ? "delivered" : ["Failed", "Cancelled"].includes(data.state ?? "") ? "failed" : ["Pending", "Processed", "Sent"].includes(data.state ?? "") ? "accepted" : "unknown" };
    } catch { return { status: "unknown" }; }
  }
}
