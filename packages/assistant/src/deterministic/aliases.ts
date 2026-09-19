import { normalizeInput } from "./normalizer.js";

const HUMAN_ALIASES = new Set([
  "0",
  "cs",
  "admin",
  "customer service",
  "manusia",
  "operator",
  "bicara dengan admin",
  "hubungi tim",
  "hubungi cs",
  "customer service",
]);

const MENU_ALIASES = new Set(["menu", "mulai", "start", "halo", "hai"]);

const BACK_ALIASES = new Set(["9", "kembali", "back"]);

const FOOD_SAFETY_PATTERNS = [
  /adverse reaction/i,
  /reaksi (buruk|alergi)/i,
  /tercemar/i,
  /kontaminasi/i,
  /beracun/i,
  /busuk/i,
  /jamur/i,
  /\bmold\b/i,
  /bau (aneh|tidak biasa)/i,
  /benda asing/i,
  /kemasan (terbuka|rusak|terkontaminasi)/i,
  /tercatat busuk/i,
  /muntah/i,
  /sakit perut/i,
];

const HEALTH_PATTERNS = [
  /alergi/i,
  /diabetes/i,
  /obesitas/i,
  /turun berat/i,
  /penyakit/i,
  /medis/i,
  /kolesterol/i,
  /hamil/i,
  /anak kecil/i,
  /bayi/i,
  /meal replacement/i,
  /pengganti makan/i,
  /terapi/i,
  /obat/i,
];

export function isHumanAlias(text: string): boolean {
  const n = normalizeInput(text);
  return HUMAN_ALIASES.has(n);
}

export function isMenuAlias(text: string): boolean {
  return MENU_ALIASES.has(normalizeInput(text));
}

export function isBackAlias(text: string): boolean {
  return BACK_ALIASES.has(normalizeInput(text));
}

export function matchesFoodSafety(text: string): boolean {
  const n = text.trim();
  return FOOD_SAFETY_PATTERNS.some((p) => p.test(n));
}

export function matchesHealthEscalation(text: string): boolean {
  const n = text.trim();
  return HEALTH_PATTERNS.some((p) => p.test(n));
}

export function matchChoice(input: string, choices: Array<{ key: string; aliases?: string[] }>): string | null {
  const n = normalizeInput(input);
  for (const choice of choices) {
    if (n === normalizeInput(choice.key)) return choice.key;
    for (const alias of choice.aliases ?? []) {
      if (n === normalizeInput(alias)) return choice.key;
    }
  }
  if (/^\d+$/.test(n)) {
    const byNumber = choices.find((c) => c.key === n);
    if (byNumber) return byNumber.key;
  }
  return null;
}
