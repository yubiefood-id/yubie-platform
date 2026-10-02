/**
 * Runtime configuration contract for the Yubie platform.
 *
 * Single fail-closed validation boundary for environment selection, bot engine
 * and support-provider wiring (ADR-009, ADR-011). Staging and production must
 * never silently run on fake providers, placeholder Zammad routing IDs, or a
 * guessed WhatsApp article type; development and test may use fakes explicitly.
 *
 * Error messages name configuration variables only — never their values when a
 * value could be a secret (tokens, webhook secrets). Enum-like variables
 * (YUBIE_ENV, BOT_ENGINE, SUPPORT_PROVIDER) echo the offending value because
 * they are operator-owned and not secrets, which makes typos diagnosable.
 */

export type YubieEnvName = "development" | "test" | "staging" | "production";
export type BotEngineName = "deterministic" | "legacy";
export type SupportProviderName = "fake" | "chatwoot" | "zammad";

export type RuntimeEnvSource = Record<string, string | undefined>;

const ENV_NAMES: readonly YubieEnvName[] = ["development", "test", "staging", "production"];
const BOT_ENGINE_NAMES: readonly BotEngineName[] = ["deterministic", "legacy"];
const SUPPORT_PROVIDER_NAMES: readonly SupportProviderName[] = ["fake", "chatwoot", "zammad"];

const ZAMMAD_GROUP_VARS = {
  botQueue: "ZAMMAD_GROUP_BOT_QUEUE",
  customerSupport: "ZAMMAD_GROUP_CUSTOMER_SUPPORT",
  salesPartnership: "ZAMMAD_GROUP_SALES_PARTNERSHIP",
  foodSafety: "ZAMMAD_GROUP_FOOD_SAFETY",
} as const;

/**
 * Fixture routing IDs used by FakeZammadClient-backed tests and local
 * development only. They are never a fallback for staging/production: a real
 * Zammad installation whose IDs happen to be 1–4 must set them explicitly.
 */
export const DEV_FIXTURE_ZAMMAD_GROUP_IDS = {
  botQueue: "1",
  customerSupport: "2",
  salesPartnership: "3",
  foodSafety: "4",
} as const;

/** Development/test-only article type default; staging/production must set the discovered value. */
export const DEV_DEFAULT_ZAMMAD_WHATSAPP_ARTICLE_TYPE = "whatsapp";

export class RuntimeConfigError extends Error {
  readonly code = "CONFIG_ERROR";

  constructor(message: string) {
    super(`CONFIG_ERROR: ${message}`);
    this.name = "RuntimeConfigError";
  }
}

export interface ZammadRuntimeConfig {
  baseUrl: string;
  apiToken: string;
  webhookSecret?: string;
  webhookBearer?: string;
  whatsappArticleType: string;
  groupIds: {
    botQueue: string;
    customerSupport: string;
    salesPartnership: string;
    foodSafety: string;
  };
  priorityHigh?: string;
}

export interface RuntimeConfig {
  env: YubieEnvName;
  botEngine: BotEngineName;
  supportProvider: SupportProviderName;
  /** Which variable selected the support provider — for diagnostics only. */
  supportProviderSource: "SUPPORT_PROVIDER" | "CHAT_PROVIDER" | "unset";
  /** Present whenever supportProvider === "zammad". */
  zammad?: ZammadRuntimeConfig;
}

export type RuntimeConfigInspection =
  | { ok: true; config: RuntimeConfig }
  | { ok: false; errors: string[] };

function isDeploymentEnv(env: YubieEnvName): boolean {
  return env === "staging" || env === "production";
}

function isDeploymentEnvFor(env: YubieEnvName, provider: SupportProviderName): boolean {
  return isDeploymentEnv(env) && provider === "zammad";
}

export function parseYubieEnvName(raw: string | undefined): YubieEnvName {
  if (raw === undefined || raw === "") return "development";
  const value = raw.toLowerCase();
  const match = ENV_NAMES.find((name) => name === value);
  if (!match) {
    throw new RuntimeConfigError(
      `YUBIE_ENV must be one of: ${ENV_NAMES.join(", ")} (received "${raw}")`,
    );
  }
  return match;
}

export function parseBotEngineName(raw: string | undefined): BotEngineName {
  if (raw === undefined || raw === "") return "deterministic";
  const value = raw.toLowerCase();
  const match = BOT_ENGINE_NAMES.find((name) => name === value);
  if (!match) {
    throw new RuntimeConfigError(
      `BOT_ENGINE must be one of: ${BOT_ENGINE_NAMES.join(", ")} (received "${raw}")`,
    );
  }
  return match;
}

/**
 * Resolve the support provider with finite values only. Unknown values fail
 * instead of falling back to "fake": a typo like SUPPORT_PROVIDER=zamamd must
 * stop the deployment, not silently select a fake backend.
 */
export function parseSupportProviderName(env: RuntimeEnvSource): {
  name: SupportProviderName;
  source: RuntimeConfig["supportProviderSource"];
} {
  const explicit = env.SUPPORT_PROVIDER ?? "";
  const aliased = env.CHAT_PROVIDER ?? "";
  const raw = explicit || aliased;
  const source: RuntimeConfig["supportProviderSource"] = explicit
    ? "SUPPORT_PROVIDER"
    : aliased
      ? "CHAT_PROVIDER"
      : "unset";
  if (!raw) return { name: "fake", source };
  const match = SUPPORT_PROVIDER_NAMES.find((name) => name === raw.toLowerCase());
  if (!match) {
    throw new RuntimeConfigError(
      `${source} must be one of: ${SUPPORT_PROVIDER_NAMES.join(", ")} (received "${raw}")`,
    );
  }
  return { name: match, source };
}

function isNumericId(value: string): boolean {
  return /^\d+$/.test(value);
}

/**
 * Resolve Zammad routing IDs. Explicit values are always validated as numeric
 * Zammad IDs. Missing values fall back to the dev fixture IDs only outside
 * staging/production-zammad; inside staging/production every ID (including the
 * high priority used for food-safety routing) must be explicit.
 */
export function resolveZammadRouting(env: RuntimeEnvSource): {
  groupIds: ZammadRuntimeConfig["groupIds"];
  priorityHigh?: string;
} {
  const yubieEnv = parseYubieEnvName(env.YUBIE_ENV);
  const provider = parseSupportProviderName(env).name;
  const strict = isDeploymentEnvFor(yubieEnv, provider);

  const groupIds: ZammadRuntimeConfig["groupIds"] = { ...DEV_FIXTURE_ZAMMAD_GROUP_IDS };
  const missing: string[] = [];
  for (const key of Object.keys(ZAMMAD_GROUP_VARS) as Array<keyof typeof ZAMMAD_GROUP_VARS>) {
    const varName = ZAMMAD_GROUP_VARS[key];
    const value = env[varName] ?? "";
    if (value === "") {
      if (strict) missing.push(varName);
      continue;
    }
    if (!isNumericId(value)) {
      throw new RuntimeConfigError(`${varName} must be a numeric Zammad group id`);
    }
    groupIds[key] = value;
  }

  const priorityRaw = env.ZAMMAD_PRIORITY_HIGH ?? "";
  if (priorityRaw !== "") {
    if (!isNumericId(priorityRaw)) {
      throw new RuntimeConfigError("ZAMMAD_PRIORITY_HIGH must be a numeric Zammad priority id");
    }
    if (missing.length > 0) {
      throw new RuntimeConfigError(
        missing.map((v) => `SUPPORT_PROVIDER=zammad in ${yubieEnv} requires ${v}`).join("; "),
      );
    }
    return { groupIds, priorityHigh: priorityRaw };
  }
  if (strict) {
    missing.push("ZAMMAD_PRIORITY_HIGH (food-safety routing)");
  }
  if (missing.length > 0) {
    throw new RuntimeConfigError(
      missing.map((v) => `SUPPORT_PROVIDER=zammad in ${yubieEnv} requires ${v}`).join("; "),
    );
  }
  return { groupIds };
}

function parseZammadConfig(env: RuntimeEnvSource, yubieEnv: YubieEnvName): ZammadRuntimeConfig {
  const errors: string[] = [];
  const deployment = isDeploymentEnv(yubieEnv);

  const baseUrl = (env.ZAMMAD_BASE_URL ?? "").trim();
  if (!baseUrl) {
    errors.push("SUPPORT_PROVIDER=zammad requires ZAMMAD_BASE_URL");
  } else {
    try {
      const parsed = new URL(baseUrl);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        errors.push("ZAMMAD_BASE_URL must be an http(s) URL");
      }
    } catch {
      errors.push("ZAMMAD_BASE_URL must be a valid URL");
    }
  }

  const apiToken = env.ZAMMAD_API_TOKEN ?? "";
  if (!apiToken) {
    errors.push("SUPPORT_PROVIDER=zammad requires ZAMMAD_API_TOKEN");
  }

  const whatsappArticleType = env.ZAMMAD_WHATSAPP_ARTICLE_TYPE ?? "";
  if (deployment && !whatsappArticleType) {
    errors.push(
      `SUPPORT_PROVIDER=zammad in ${yubieEnv} requires ZAMMAD_WHATSAPP_ARTICLE_TYPE (discover from the real Zammad instance)`,
    );
  }

  const webhookSecret = env.ZAMMAD_WEBHOOK_SECRET ?? "";
  const webhookBearer = env.ZAMMAD_WEBHOOK_BEARER ?? "";
  if (deployment && !webhookSecret && !webhookBearer) {
    errors.push(
      `Zammad webhook authentication is unconfigured: set ZAMMAD_WEBHOOK_SECRET and/or ZAMMAD_WEBHOOK_BEARER in ${yubieEnv}`,
    );
  }

  let routing: ReturnType<typeof resolveZammadRouting> | undefined;
  try {
    routing = resolveZammadRouting(env);
  } catch (error) {
    // Merge routing failures with the other collected problems so operators
    // see every missing variable in one report.
    errors.push(configMessage(error));
  }

  if (errors.length > 0 || !routing) {
    throw new RuntimeConfigError(errors.join("; "));
  }

  return {
    baseUrl,
    apiToken,
    ...(webhookSecret ? { webhookSecret } : {}),
    ...(webhookBearer ? { webhookBearer } : {}),
    whatsappArticleType: whatsappArticleType || DEV_DEFAULT_ZAMMAD_WHATSAPP_ARTICLE_TYPE,
    groupIds: routing.groupIds,
    ...(routing.priorityHigh ? { priorityHigh: routing.priorityHigh } : {}),
  };
}

/**
 * Validate the full runtime configuration. Throws {@link RuntimeConfigError}
 * with every problem found (aggregated), naming variables — never values.
 */
export function parseRuntimeConfig(env: RuntimeEnvSource = process.env): RuntimeConfig {
  const errors: string[] = [];

  const yubieEnv = parseYubieEnvName(env.YUBIE_ENV);

  let botEngine: BotEngineName = "deterministic";
  try {
    botEngine = parseBotEngineName(env.BOT_ENGINE);
  } catch (error) {
    errors.push(configMessage(error));
  }

  let supportProvider: SupportProviderName = "fake";
  let supportProviderSource: RuntimeConfig["supportProviderSource"] = "unset";
  try {
    const resolved = parseSupportProviderName(env);
    supportProvider = resolved.name;
    supportProviderSource = resolved.source;

    if (isDeploymentEnv(yubieEnv) && resolved.name === "fake") {
      errors.push(
        "SUPPORT_PROVIDER=fake is not allowed in staging/production (fake support backends are limited to development/test)",
      );
    }
    if (isDeploymentEnv(yubieEnv) && resolved.name === "chatwoot") {
      // Chatwoot stays available as the documented ADR-009 rollback path, but
      // never with a silently substituted fake client.
      if (!env.CHATWOOT_API_TOKEN) {
        errors.push("SUPPORT_PROVIDER=chatwoot in staging/production requires CHATWOOT_API_TOKEN");
      }
      if (!env.CHATWOOT_BASE_URL) {
        errors.push("SUPPORT_PROVIDER=chatwoot in staging/production requires CHATWOOT_BASE_URL");
      }
    }
  } catch (error) {
    errors.push(configMessage(error));
  }

  let zammad: ZammadRuntimeConfig | undefined;
  if (supportProvider === "zammad") {
    try {
      zammad = parseZammadConfig(env, yubieEnv);
    } catch (error) {
      errors.push(configMessage(error));
    }
  }

  if (errors.length > 0) {
    throw new RuntimeConfigError(errors.join("; "));
  }

  return {
    env: yubieEnv,
    botEngine,
    supportProvider,
    supportProviderSource,
    ...(zammad ? { zammad } : {}),
  };
}

/** Non-throwing variant for readiness endpoints and operator tooling. */
export function inspectRuntimeConfig(env: RuntimeEnvSource = process.env): RuntimeConfigInspection {
  try {
    return { ok: true, config: parseRuntimeConfig(env) };
  } catch (error) {
    if (error instanceof RuntimeConfigError) {
      return { ok: false, errors: [error.message] };
    }
    return { ok: false, errors: [String(error)] };
  }
}

function configMessage(error: unknown): string {
  if (error instanceof RuntimeConfigError) return error.message.replace("CONFIG_ERROR: ", "");
  return String(error);
}

// --- ADR-012: first-party commerce selection (fail-closed) ---

export type CommerceProviderName = "preview" | "xendit" | "disabled";
export type PurchaseOptionsSourceName = "static" | "database";
export type InventoryModeName = "none" | "lots";

const COMMERCE_PROVIDER_NAMES: readonly CommerceProviderName[] = ["preview", "xendit", "disabled"];
const PURCHASE_OPTIONS_SOURCE_NAMES: readonly PurchaseOptionsSourceName[] = ["static", "database"];
const INVENTORY_MODE_NAMES: readonly InventoryModeName[] = ["none", "lots"];

export interface CommerceRuntimeConfig {
  provider: CommerceProviderName;
  purchaseOptionsSource: PurchaseOptionsSourceName;
  /** "lots" gates checkout on released, unexpired lot stock (food-safety). */
  inventoryMode: InventoryModeName;
  /** Whether DATABASE_URL is present. The value itself never leaves this boundary. */
  databaseConfigured: boolean;
  /** Public web origin used for Xendit return URLs; validated https when xendit. */
  appOrigin: string | null;
}

export type CommerceRuntimeConfigInspection =
  | { ok: true; config: CommerceRuntimeConfig }
  | { ok: false; errors: string[] };

/**
 * Resolve the commerce provider with finite values only. Unknown values fail
 * instead of silently degrading to preview: a typo like COMMERCE_PROVIDER=xendti
 * must stop the deployment, not leave payments half-configured.
 */
export function parseCommerceProviderName(raw: string | undefined): CommerceProviderName {
  if (raw === undefined || raw === "") return "preview";
  const match = COMMERCE_PROVIDER_NAMES.find((name) => name === raw.toLowerCase());
  if (!match) {
    throw new RuntimeConfigError(
      `COMMERCE_PROVIDER must be one of: ${COMMERCE_PROVIDER_NAMES.join(", ")} (received "${raw}")`,
    );
  }
  return match;
}

/**
 * Resolve the purchase-options source. Unset defaults to database when
 * DATABASE_URL is present, else static. "database" without DATABASE_URL fails:
 * a typo must not silently drop transactional persistence to memory.
 */
export function parsePurchaseOptionsSourceName(env: RuntimeEnvSource): PurchaseOptionsSourceName {
  const raw = env.PURCHASE_OPTIONS_SOURCE ?? "";
  if (raw === "") return env.DATABASE_URL ? "database" : "static";
  const match = PURCHASE_OPTIONS_SOURCE_NAMES.find((name) => name === raw.toLowerCase());
  if (!match) {
    throw new RuntimeConfigError(
      `PURCHASE_OPTIONS_SOURCE must be one of: ${PURCHASE_OPTIONS_SOURCE_NAMES.join(", ")} (received "${raw}")`,
    );
  }
  if (match === "database" && !env.DATABASE_URL) {
    throw new RuntimeConfigError(
      "PURCHASE_OPTIONS_SOURCE=database requires DATABASE_URL (never fall back to in-memory repositories)",
    );
  }
  return match;
}

/**
 * Resolve the inventory mode. First-party payments in staging/production must
 * be lot-gated: sellability requires a released, unexpired lot, and a typo
 * must stop startup rather than silently selling unproven stock.
 */
export function parseInventoryModeName(raw: string | undefined): InventoryModeName {
  if (raw === undefined || raw === "") return "none";
  const match = INVENTORY_MODE_NAMES.find((name) => name === raw.toLowerCase());
  if (!match) {
    throw new RuntimeConfigError(
      `INVENTORY_MODE must be one of: ${INVENTORY_MODE_NAMES.join(", ")} (received "${raw}")`,
    );
  }
  return match;
}

/**
 * Validate commerce runtime configuration. First-party payments (xendit) fail
 * closed: they require durable PostgreSQL, the provider secret, the webhook
 * callback token, the business id used for webhook validation, and an https
 * APP_ORIGIN (Xendit return URLs must be HTTPS). In staging/production, xendit
 * additionally requires lot-gated inventory. Error messages name variables
 * only — never secret values.
 */
export function parseCommerceRuntimeConfig(env: RuntimeEnvSource = process.env): CommerceRuntimeConfig {
  const errors: string[] = [];

  let provider: CommerceProviderName = "preview";
  try {
    provider = parseCommerceProviderName(env.COMMERCE_PROVIDER);
  } catch (error) {
    errors.push(configMessage(error));
  }

  let purchaseOptionsSource: PurchaseOptionsSourceName = "static";
  try {
    purchaseOptionsSource = parsePurchaseOptionsSourceName(env);
  } catch (error) {
    errors.push(configMessage(error));
  }

  let inventoryMode: InventoryModeName = "none";
  try {
    inventoryMode = parseInventoryModeName(env.INVENTORY_MODE);
  } catch (error) {
    errors.push(configMessage(error));
  }

  const databaseConfigured = Boolean(env.DATABASE_URL);
  const appOrigin = (env.APP_ORIGIN ?? "").trim() || null;

  const deployment = parseYubieEnvName(env.YUBIE_ENV) === "staging" || parseYubieEnvName(env.YUBIE_ENV) === "production";

  if (provider === "xendit") {
    if (!databaseConfigured) {
      errors.push(
        "COMMERCE_PROVIDER=xendit requires DATABASE_URL (first-party orders/payments must be durable; in-memory commerce is never a payments fallback)",
      );
    }
    for (const varName of ["XENDIT_SECRET_KEY", "XENDIT_WEBHOOK_TOKEN", "XENDIT_BUSINESS_ID"] as const) {
      if (!env[varName]) {
        errors.push(`COMMERCE_PROVIDER=xendit requires ${varName}`);
      }
    }
    if (!appOrigin) {
      errors.push("COMMERCE_PROVIDER=xendit requires APP_ORIGIN");
    } else {
      try {
        const parsed = new URL(appOrigin);
        if (parsed.protocol !== "https:") {
          errors.push("APP_ORIGIN must be an https URL when COMMERCE_PROVIDER=xendit (Xendit return URLs must be HTTPS)");
        }
      } catch {
        errors.push("APP_ORIGIN must be a valid URL when COMMERCE_PROVIDER=xendit");
      }
    }
    if (deployment && inventoryMode !== "lots") {
      errors.push(
        `COMMERCE_PROVIDER=xendit in ${parseYubieEnvName(env.YUBIE_ENV)} requires INVENTORY_MODE=lots (direct commerce must not sell without released, unexpired lots)`,
      );
    }
  }

  if (errors.length > 0) {
    throw new RuntimeConfigError(errors.join("; "));
  }

  return { provider, purchaseOptionsSource, inventoryMode, databaseConfigured, appOrigin };
}

/** Non-throwing variant for readiness endpoints and operator tooling. */
export function inspectCommerceRuntimeConfig(env: RuntimeEnvSource = process.env): CommerceRuntimeConfigInspection {
  try {
    return { ok: true, config: parseCommerceRuntimeConfig(env) };
  } catch (error) {
    if (error instanceof RuntimeConfigError) {
      return { ok: false, errors: [error.message] };
    }
    return { ok: false, errors: [String(error)] };
  }
}
