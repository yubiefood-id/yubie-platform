import type { AssistantIntent, NormalizedMessage } from "@yubie/domain";
import type { IntentClassifier } from "./ports.js";

const PATTERNS: Array<{ intent: AssistantIntent; patterns: RegExp[] }> = [
  { intent: "PROMPT_INJECTION", patterns: [/system prompt/i, /ignore (previous|all) instructions/i, /reveal.*secret/i, /api[_ ]?key/i] },
  { intent: "HUMAN_REQUEST", patterns: [/bicara (dengan |sama )?(manusia|admin|cs)/i, /hubungi (tim|staff)/i, /mau (chat|ngobrol|bicara) sama (orang|manusia)/i] },
  { intent: "FOOD_SAFETY", patterns: [/kontaminasi/i, /beracun/i, /busuk/i, /tercemar/i] },
  { intent: "ALLERGEN_OR_HEALTH", patterns: [/alergi/i, /diabetes/i, /obesitas/i, /turun berat/i, /penyakit/i, /medis/i, /kolesterol/i] },
  { intent: "REFUND_OR_COMPENSATION", patterns: [/refund/i, /pengembalian dana/i, /ganti rugi/i, /kompensasi/i] },
  { intent: "COMPLAINT", patterns: [/komplain/i, /keluhan/i, /kecewa/i, /rusak/i] },
  { intent: "PRICE_OR_PROMO", patterns: [/harga/i, /promo/i, /diskon/i, /berapa.*rp/i] },
  { intent: "STOCK_AVAILABILITY", patterns: [/stok/i, /ready/i, /habis/i, /masih ada/i] },
  { intent: "CERTIFICATION", patterns: [/halal/i, /bpom/i, /sertifik/i, /p-irt/i] },
  { intent: "WHERE_TO_BUY", patterns: [/beli\s+(di\s+)?mana/i, /shopee/i, /tokopedia/i, /order/i, /beli\s+dimana/i] },
  { intent: "USAGE_RECIPE", patterns: [/resep/i, /cara (pakai|masak)/i, /bikin/i] },
  { intent: "PRODUCT_DISCOVERY", patterns: [/produk apa/i, /varian/i, /jenis ubi/i, /root/i] },
  { intent: "BUSINESS_HOURS", patterns: [/jam (buka|kerja|operasional)/i, /buka sampai/i] },
  { intent: "B2B_BULK", patterns: [/bulk/i, /grosir/i, /volume besar/i] },
  { intent: "B2B_SAMPLE", patterns: [/sample/i, /contoh produk/i] },
  { intent: "B2B_PRODUCT_DEVELOPMENT", patterns: [/pengembangan produk/i, /co-?develop/i, /r&d/i] },
  { intent: "B2B_INTRO", patterns: [/kerja sama/i, /partnership/i, /b2b/i, /distributor/i] },
  { intent: "PRODUCT_INFO", patterns: [/yubie flour/i, /tepung/i, /produk/i, /apa itu yubie/i] },
];

export class RuleBasedIntentClassifier implements IntentClassifier {
  classify(msg: NormalizedMessage): AssistantIntent {
    const text = msg.text.trim();
    if (!text) return "OTHER";
    for (const { intent, patterns } of PATTERNS) {
      if (patterns.some((p) => p.test(text))) return intent;
    }
    return "OTHER";
  }
}
