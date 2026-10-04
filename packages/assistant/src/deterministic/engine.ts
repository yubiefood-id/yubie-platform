import type { KnowledgeLookup } from "../knowledge-tools.js";
import { V1_FLOW } from "./flows.js";
import {
  isSensitiveNode,
  resolveCatalogProductDescription,
  resolveProductFact,
  resolvePublishedRecipes,
} from "./guards.js";
import { preRoute } from "./pre-router.js";
import { selectHandoffTemplateId } from "./business-hours.js";
import { renderTemplate } from "./templates.js";
import { assertValidFlow } from "./validation.js";
import {
  FLOW_VERSION,
  type DeterministicAction,
  type DeterministicTurnInput,
  type DeterministicTurnResult,
  type FlowContext,
  type HandoffDestination,
  type PersistedFlowState,
} from "./types.js";

assertValidFlow(V1_FLOW);

export interface PurchaseOptionView {
  marketplace: string;
  label: string;
  redirectPath: string;
}

export interface DeterministicEngineDeps {
  knowledge: KnowledgeLookup;
  getPurchaseOptions?: (productSlug: string) => Promise<{ options: PurchaseOptionView[] } | null>;
}

const B2B_PROMPTS: Record<string, string> = {
  company: "Nama perusahaan / brand Anda?",
  useCase: "Use case / kebutuhan sample?",
  product: "Produk / root yang diminati?",
  location: "Kota / lokasi?",
  businessType: "Jenis bisnis?",
  city: "Kota operasional?",
  volume: "Perkiraan volume / range?",
  timeline: "Timeline kebutuhan?",
  application: "Aplikasi produk yang diinginkan?",
};

function handoffAction(
  destination: HandoffDestination,
  reason: string,
  intent: import("@yubie/domain").AssistantIntent,
  risk: import("@yubie/domain").RiskLevel,
  nodeId: string,
  text: string,
): DeterministicAction {
  return { kind: "handoff", destination, reason, intent, risk, nodeId, text };
}

async function renderNode(
  nodeId: string,
  context: FlowContext,
  deps: DeterministicEngineDeps,
): Promise<{ text: string; handoff?: DeterministicAction }> {
  const node = V1_FLOW.nodes[nodeId];
  if (!node) throw new Error(`unknown_node:${nodeId}`);

  if (node.action === "handoff") {
    const templateId =
      node.templateId ??
      (node.handoffDestination === "FOOD_SAFETY" ? "handoff.food_safety.v1" : selectHandoffTemplateId());
    const text = renderTemplate(templateId, context);
    return {
      text,
      handoff: handoffAction(
        node.handoffDestination ?? "CUSTOMER_SUPPORT",
        node.handoffReason ?? nodeId,
        node.intent ?? "OTHER",
        node.risk ?? "AMBER",
        nodeId,
        text,
      ),
    };
  }

  if (node.action === "collect") {
    const prompt = B2B_PROMPTS[node.contextField ?? ""] ?? "Mohon informasikan:";
    return { text: renderTemplate(node.templateId ?? "b2b.collect.v1", { prompt, ...context }) };
  }

  let templateCtx: Record<string, unknown> = { ...context };

  if (nodeId === "buy.flour.shopee" || nodeId === "buy.flour.tokopedia") {
    const marketplace = nodeId.endsWith("shopee") ? "shopee" : "tokopedia";
    const options = deps.getPurchaseOptions ? await deps.getPurchaseOptions("yubie-flour") : null;
    const match = options?.options.find((o) => o.marketplace === marketplace);
    templateCtx = {
      marketplaceLabel: match?.label ?? (marketplace === "shopee" ? "Shopee" : "Tokopedia"),
      redirectPath: match?.redirectPath ?? `/go/${marketplace}/yubie-flour`,
    };
  }

  if (nodeId === "buy.shake" || nodeId === "buy.ppang" || nodeId === "buy.mie") {
    templateCtx.productName = nodeId.includes("shake") ? "Yubie Shake" : nodeId.includes("ppang") ? "Yubie Ppang" : "Yubie Mie";
  }

  if (nodeId === "product.description") {
    const fact = await resolveProductFact(deps.knowledge, "product", "flour", "Yubie Flour");
    const catalog = resolveCatalogProductDescription("yubie-flour");
    templateCtx = { title: fact.ok ? fact.title : catalog.title, body: fact.ok ? fact.body : catalog.body };
  }

  if (nodeId === "product.usage") {
    const fact = await resolveProductFact(deps.knowledge, "product", "flour", "Cara pakai");
    templateCtx = fact.ok
      ? { title: fact.title, body: fact.body }
      : { title: "Cara pakai", body: "Gunakan sesuai petunjuk pada kemasan produk yang Anda beli." };
  }

  if (nodeId === "product.recipes") {
    const fact = resolvePublishedRecipes("flour");
    templateCtx = { title: fact.title, body: fact.body };
  }

  if (nodeId === "product.roots") {
    templateCtx = {
      title: "Root / varian",
      body: "Yubie mengeksplorasi berbagai varietas ubi Indonesia. Detail varian komersial tersedia melalui tim kami.",
    };
  }

  if (isSensitiveNode(nodeId)) {
    const fact = await resolveProductFact(deps.knowledge, "product", "flour", "Informasi sensitif");
    if (!fact.ok) {
      return {
        text: renderTemplate("product.sensitive_missing.v1"),
        handoff: handoffAction(
          "CUSTOMER_SUPPORT",
          "sensitive_fact_missing",
          "ALLERGEN_OR_HEALTH",
          "RED",
          nodeId,
          renderTemplate("product.sensitive_missing.v1"),
        ),
      };
    }
    templateCtx = { title: fact.title, body: fact.body };
  }

  if (nodeId === "order.guidance.shipping") {
    templateCtx.guidance =
      "Untuk status pengiriman, cek halaman pesanan di marketplace tempat Anda membeli. Yubie tidak memiliki akses status live tanpa integrasi pesanan.";
  }
  if (nodeId === "order.guidance.payment") {
    templateCtx.guidance =
      "Masalah pembayaran ditangani oleh marketplace. Gunakan fitur bantuan di aplikasi marketplace terkait.";
  }

  const templateId = node.templateId ?? "home.v1";
  return { text: renderTemplate(templateId, templateCtx) };
}

export class DeterministicConversationEngine {
  constructor(private readonly deps: DeterministicEngineDeps) {}

  async processTurn(input: DeterministicTurnInput): Promise<DeterministicTurnResult> {
    const metrics: string[] = ["deterministic_message_total"];
    let state: PersistedFlowState = { ...input.persisted, flowVersion: FLOW_VERSION };
    const route = preRoute(V1_FLOW, state, input.text, input.conversationState);

    if (route.kind === "noop_human_active") {
      return {
        action: { kind: "noop", nodeId: state.nodeId, intent: "OTHER", risk: "GREEN" },
        nextState: state,
        metrics,
      };
    }

    if (route.kind === "handoff_human") {
      metrics.push("deterministic_handoff_total", "deterministic_handoff_human_request_total");
      const rendered = await renderNode("handoff.cs", state.context, this.deps);
      return {
        action: rendered.handoff ?? handoffAction("CUSTOMER_SUPPORT", "human_request", "HUMAN_REQUEST", "RED", "handoff.cs", rendered.text),
        nextState: { ...state, nodeId: "handoff.cs", fallbackCount: 0 },
        metrics,
      };
    }

    if (route.kind === "handoff_food_safety") {
      metrics.push("deterministic_handoff_total", "deterministic_handoff_food_safety_total");
      const rendered = await renderNode("handoff.food_safety", state.context, this.deps);
      return {
        action: rendered.handoff!,
        nextState: { ...state, nodeId: "handoff.food_safety", fallbackCount: 0 },
        metrics,
      };
    }

    if (route.kind === "handoff_health") {
      metrics.push("deterministic_handoff_total");
      const rendered = await renderNode("handoff.cs", state.context, this.deps);
      return {
        action: handoffAction("CUSTOMER_SUPPORT", "health_escalation", "ALLERGEN_OR_HEALTH", "RED", "handoff.cs", rendered.text),
        nextState: { ...state, nodeId: "handoff.cs", fallbackCount: 0 },
        metrics,
      };
    }

    if (route.kind === "goto") {
      metrics.push("deterministic_transition_total");
      state = { ...state, nodeId: route.nodeId, fallbackCount: 0 };
      const rendered = await renderNode(state.nodeId, state.context, this.deps);
      if (rendered.handoff) {
        metrics.push("deterministic_handoff_total");
        return { action: rendered.handoff, nextState: state, metrics };
      }
      return { action: { kind: "reply", text: rendered.text, nodeId: state.nodeId }, nextState: state, metrics };
    }

    if (route.kind === "collect") {
      const node = V1_FLOW.nodes[state.nodeId];
      const field = node?.contextField ?? "value";
      const context = { ...state.context, [field]: route.value };
      const nextId = node?.nextAfterCollect ?? "handoff.sales";
      metrics.push("deterministic_transition_total");
      state = { ...state, context, nodeId: nextId, fallbackCount: 0 };
      const rendered = await renderNode(nextId, context, this.deps);
      if (rendered.handoff) {
        metrics.push("deterministic_b2b_handoff_total", "deterministic_handoff_total");
        return { action: rendered.handoff, nextState: state, metrics };
      }
      return { action: { kind: "reply", text: rendered.text, nodeId: state.nodeId }, nextState: state, metrics };
    }

    if (route.kind === "choice") {
      metrics.push("deterministic_transition_total");
      state = { ...state, nodeId: route.targetNodeId, fallbackCount: 0 };
      if (route.targetNodeId.includes("shopee") || route.targetNodeId.includes("tokopedia")) {
        metrics.push("deterministic_purchase_option_total");
      }
      const rendered = await renderNode(state.nodeId, state.context, this.deps);
      if (rendered.handoff) {
        metrics.push("deterministic_handoff_total");
        return { action: rendered.handoff, nextState: state, metrics };
      }
      return { action: { kind: "reply", text: rendered.text, nodeId: state.nodeId }, nextState: state, metrics };
    }

    // unknown
    metrics.push("deterministic_unknown_total");
    const nextFallback = state.fallbackCount + 1;
    if (nextFallback >= 2) {
      metrics.push("deterministic_fallback_total", "deterministic_handoff_total");
      const rendered = await renderNode("handoff.cs", state.context, this.deps);
      return {
        action: handoffAction("CUSTOMER_SUPPORT", "unknown_fallback", "OTHER", "AMBER", "handoff.cs", rendered.text),
        nextState: { ...state, nodeId: "handoff.cs", fallbackCount: 0 },
        metrics,
      };
    }

    const current = V1_FLOW.nodes[state.nodeId];
    const hint = current?.choices?.map((c) => `${c.key} — ${c.label}`).join("\n") ?? "";
    return {
      action: {
        kind: "reply",
        text: renderTemplate("unknown.v1", { hint }),
        nodeId: state.nodeId,
      },
      nextState: { ...state, fallbackCount: nextFallback },
      metrics,
    };
  }
}
