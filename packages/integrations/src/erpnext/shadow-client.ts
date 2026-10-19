export type ErpShadowResult =
  | { ok: true; value: unknown }
  | { ok: false; code: "refused" | "unavailable" };

export interface ErpNextShadowOptions {
  baseUrl: string;
  apiKey: string;
  apiSecret: string;
  fetchImpl?: typeof fetch;
}

/**
 * Read-only ERPNext / Frappe resource client. Writes always refuse.
 * Credentials stay in the process that constructs the client. They are not
 * returned in results and this module is not imported by the storefront.
 */
export class ErpNextShadowClient {
  constructor(private readonly options: ErpNextShadowOptions) {}

  async read(resourcePath: string): Promise<ErpShadowResult> {
    const target = this.allowedUrl(resourcePath);
    if (!target) return { ok: false, code: "refused" };
    const fetchImpl = this.options.fetchImpl ?? fetch;
    try {
      const response = await fetchImpl(target, {
        method: "GET",
        redirect: "error",
        headers: {
          Accept: "application/json",
          Authorization: `token ${this.options.apiKey}:${this.options.apiSecret}`,
        },
      });
      if (!response.ok) return { ok: false, code: "unavailable" };
      return { ok: true, value: await response.json() };
    } catch {
      return { ok: false, code: "unavailable" };
    }
  }

  write(): ErpShadowResult {
    return { ok: false, code: "refused" };
  }

  private allowedUrl(resourcePath: string): URL | null {
    let base: URL;
    let target: URL;
    try {
      base = new URL(this.options.baseUrl);
      target = new URL(resourcePath, base);
    } catch {
      return null;
    }
    if (base.protocol !== "https:" || target.protocol !== "https:") return null;
    if (target.origin !== base.origin) return null;
    if (target.username !== "" || target.password !== "") return null;
    if (!target.pathname.startsWith("/api/resource/")) return null;
    return target;
  }
}
