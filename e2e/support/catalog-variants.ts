// Hand-checked commercial-brief expectations, never computed by the catalog.
// Software parity is separate from Product/Finance approval.
export const variants = [
  ["flour", "250g", "250 g", "35.000", "YBF-250"],
  ["flour", "1kg", "1 kg", "120.000", "YBF-1000"],
  ["shake", "sachet", "1 sachet · 45 g", "19.500", "YBS-045"],
  ["shake", "pack-7", "Pack · 7 sachet", "129.000", "YBS-7X45"],
  ["ppang", "mini", "1 Mini Ppang · 35 g", "9.000", "YBP-MINI-035"],
  ["ppang", "maxi", "1 Maxi Ppang", "19.000", "YBP-MAXI"],
  ["ppang", "mini-pack-5", "Pack · 5 Mini Ppang", "42.000", "YBP-MINI-5"],
  ["mie", "single", "1 bungkus · 75 g", "16.000", "YBM-075"],
  ["mie", "pack-3", "Pack · 3 bungkus", "45.000", "YBM-3X75"],
] as const;

export const escapePattern = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
