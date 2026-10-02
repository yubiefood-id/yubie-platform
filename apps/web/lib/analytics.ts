export type YubieAnalyticsEvent =
  | "product_family_view"
  | "root_discovery_view"
  | "root_selector_change"
  | "application_select"
  | "application_recipe_click"
  | "recipe_filter_change"
  | "recipe_product_click"
  | "product_variant_select"
  | "marketplace_click"
  | "whatsapp_intent_click"
  | "b2b_sample_click"
  | "b2b_product_development_click"
  | "product_waitlist_submit"
  | "hero_cta_click"
  | "add_to_cart"
  | "view_cart"
  | "begin_checkout"
  | "add_payment_info"
  | "purchase"
  | "login_start"
  | "login_success"
  | "login_failed"
  | "account_view";

type SafeValue = string | number | boolean;

const forbiddenKeys = /email|phone|whatsapp|name|address|message|free.?text/i;

export function trackEvent(event: YubieAnalyticsEvent, properties: Record<string, SafeValue> = {}) {
  if (typeof window === "undefined") return;
  const safeProperties = Object.fromEntries(
    Object.entries(properties).filter(([key, value]) => !forbiddenKeys.test(key) && ["string", "number", "boolean"].includes(typeof value)),
  );
  window.dispatchEvent(new CustomEvent("yubie:analytics", { detail: { event, properties: safeProperties, version: 1 } }));
}
