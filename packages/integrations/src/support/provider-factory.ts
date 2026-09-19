import type { SupportConversationProvider } from "@yubie/application";
import { FakeChatwootClient, HttpChatwootClient } from "../chatwoot/client.js";
import { FakeZammadClient, HttpZammadClient } from "../zammad/client.js";
import { ZammadSupportProvider } from "../zammad/support-provider.js";
import { ChatwootSupportProvider } from "./chatwoot-support-provider.js";
import { FakeSupportProvider } from "./fake-support-provider.js";

export type SupportProviderName = "fake" | "chatwoot" | "zammad";

export function resolveSupportProviderName(): SupportProviderName {
  const raw = process.env.SUPPORT_PROVIDER ?? process.env.CHAT_PROVIDER ?? "fake";
  if (raw === "zammad" || raw === "chatwoot" || raw === "fake") return raw;
  return "fake";
}

export function createSupportProvider(): SupportConversationProvider {
  const name = resolveSupportProviderName();
  if (name === "zammad") {
    if (!process.env.ZAMMAD_API_TOKEN) {
      return new ZammadSupportProvider(new FakeZammadClient());
    }
    return new ZammadSupportProvider(
      new HttpZammadClient(
        process.env.ZAMMAD_BASE_URL ?? "http://localhost:8080",
        process.env.ZAMMAD_API_TOKEN,
      ),
    );
  }
  if (name === "chatwoot") {
    if (process.env.CHAT_PROVIDER === "fake" || !process.env.CHATWOOT_API_TOKEN) {
      return new ChatwootSupportProvider(new FakeChatwootClient());
    }
    return new ChatwootSupportProvider(
      new HttpChatwootClient(
        process.env.CHATWOOT_BASE_URL ?? "http://localhost:3000",
        process.env.CHATWOOT_API_TOKEN ?? "",
        process.env.CHATWOOT_ACCOUNT_ID ?? "1",
      ),
    );
  }
  return new FakeSupportProvider();
}

export function createZammadClient() {
  if (!process.env.ZAMMAD_API_TOKEN) return new FakeZammadClient();
  return new HttpZammadClient(
    process.env.ZAMMAD_BASE_URL ?? "http://localhost:8080",
    process.env.ZAMMAD_API_TOKEN,
  );
}

export function createChatwootClient() {
  if (process.env.CHAT_PROVIDER === "fake" || !process.env.CHATWOOT_API_TOKEN) {
    return new FakeChatwootClient();
  }
  return new HttpChatwootClient(
    process.env.CHATWOOT_BASE_URL ?? "http://localhost:3000",
    process.env.CHATWOOT_API_TOKEN ?? "",
    process.env.CHATWOOT_ACCOUNT_ID ?? "1",
  );
}
