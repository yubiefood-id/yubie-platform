import type { AssistantIntent } from "@yubie/domain";

const GREEN_AUTO_INTENTS: AssistantIntent[] = [
  "PRODUCT_INFO",
  "PRODUCT_DISCOVERY",
  "USAGE_RECIPE",
  "WHERE_TO_BUY",
  "BUSINESS_HOURS",
  "B2B_INTRO",
];

export function loadAssistantConfig() {
  const mode = (process.env.ASSISTANT_MODE ?? "shadow") as "shadow" | "suggestion" | "auto";
  const autoReplyEnabled = process.env.ASSISTANT_AUTO_REPLY === "true";
  const allowedGreenIntents = new Set(
    GREEN_AUTO_INTENTS.filter((intent) => {
      const key = `ASSISTANT_AUTO_REPLY_${intent}`;
      const override = process.env[key];
      if (override === "false") return false;
      if (override === "true") return true;
      return autoReplyEnabled;
    }),
  );
  return { mode, autoReplyEnabled, allowedGreenIntents };
}

import { FakeModelProvider, VllmModelProvider } from "./model-providers.js";

export function createModelProviderFromEnv() {
  const provider = process.env.MODEL_PROVIDER ?? "fake";
  if (provider === "vllm") {
    const baseUrl = process.env.VLLM_BASE_URL ?? "http://127.0.0.1:8000";
    const apiKey = process.env.VLLM_API_KEY ?? "local";
    const model = process.env.VLLM_MODEL ?? "Qwen/Qwen2.5-7B-Instruct";
    return new VllmModelProvider(baseUrl, apiKey, model);
  }
  return new FakeModelProvider();
}
