import type { KnowledgeLookup } from "../knowledge-tools.js";
import { getProductFamily, filterRecipes } from "@yubie/domain";

export interface ApprovedFactResult {
  ok: boolean;
  title: string;
  body: string;
}

export async function resolveProductFact(
  knowledge: KnowledgeLookup,
  type: string,
  scopeId: string,
  fallbackTitle: string,
): Promise<ApprovedFactResult> {
  const approved = await knowledge.getEffectivePublicKnowledge(type, scopeId);
  if (!approved) {
    return { ok: false, title: fallbackTitle, body: "" };
  }
  const data = approved.data as Record<string, unknown> | string;
  const body = typeof data === "string" ? data : String(data.summary ?? data.description ?? JSON.stringify(data));
  return { ok: true, title: fallbackTitle, body };
}

export function resolveCatalogProductDescription(productSlug: string): ApprovedFactResult {
  const product = getProductFamily(productSlug);
  if (!product) return { ok: false, title: "Produk", body: "" };
  return {
    ok: true,
    title: product.name,
    body: `${product.descriptor}\n\n${product.story ?? ""}`.trim(),
  };
}

export function resolvePublishedRecipes(productId: string): ApprovedFactResult {
  const recipes = filterRecipes(productId).filter((r) => r.publicationStatus === "published");
  if (recipes.length === 0) {
    return { ok: false, title: "Resep", body: "Belum ada resep yang dipublikasikan untuk konsumen." };
  }
  const lines = recipes.map((r) => `• ${r.title} (${r.category})`);
  return { ok: true, title: "Resep", body: lines.join("\n") };
}

export function isSensitiveNode(nodeId: string): boolean {
  return nodeId === "product.sensitive" || nodeId === "product.certification";
}
