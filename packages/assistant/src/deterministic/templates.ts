export const TEMPLATE_VERSION = "tpl-v1";

const templates: Record<string, (ctx?: Record<string, unknown>) => string> = {
  "home.v1": () =>
    `Halo! Selamat datang di Yubie.\n\n` +
    `0 — Customer Service\n` +
    `1 — BELI\n` +
    `2 — INFO PRODUK\n` +
    `3 — BANTUAN PESANAN\n` +
    `4 — BISNIS / B2B\n` +
    `5 — KOMPLAIN\n` +
    `6 — LAINNYA\n\n` +
    `Ketik nomor pilihan atau *menu* untuk kembali ke menu utama.`,
  "buy.v1": () =>
    `Pilih produk:\n\n` +
    `0 — Customer Service\n` +
    `1 — Yubie Flour\n` +
    `2 — Yubie Shake (coming soon)\n` +
    `3 — Yubie Ppang (coming soon)\n` +
    `9 — Kembali`,
  "buy.flour.v1": () =>
    `Yubie Flour — pilih marketplace:\n\n` +
    `0 — Customer Service\n` +
    `1 — Shopee\n` +
    `2 — Tokopedia\n` +
    `9 — Kembali`,
  "buy.flour.marketplace.v1": (ctx) =>
    `Beli Yubie Flour di ${String(ctx?.marketplaceLabel ?? "marketplace")}:\n${String(ctx?.redirectPath ?? "")}\n\n` +
    `Harga/promo/stok terbaru dapat dilihat di marketplace.\n\n` +
    `0 — Customer Service\n` +
    `9 — Kembali`,
  "buy.coming_soon.v1": (ctx) =>
    `${String(ctx?.productName ?? "Produk")} masih coming soon untuk pembelian publik.\n\n` +
    `0 — Customer Service\n` +
    `1 — Info B2B / sample\n` +
    `9 — Kembali`,
  "product.v1": () =>
    `Info produk Yubie:\n\n` +
    `0 — Customer Service\n` +
    `1 — Apa produk ini?\n` +
    `2 — Cara pakai\n` +
    `3 — Resep\n` +
    `4 — Root / varian\n` +
    `5 — Bahan / nutrisi / alergen\n` +
    `6 — Sertifikasi\n` +
    `7 — Beli di mana\n` +
    `9 — Kembali`,
  "product.fact.v1": (ctx) =>
    `${String(ctx?.title ?? "Info")}:\n${String(ctx?.body ?? "Informasi belum tersedia untuk publikasi.")}\n\n` +
    `0 — Customer Service\n` +
    `9 — Kembali`,
  "product.sensitive_missing.v1": () =>
    `Untuk informasi ini, tim Customer Service Yubie akan membantu dengan data resmi yang sudah disetujui.\n\n` +
    `0 — Customer Service`,
  "order.v1": () =>
    `Bantuan pesanan — pilih marketplace:\n\n` +
    `0 — Customer Service\n` +
    `1 — Shopee\n` +
    `2 — Tokopedia\n` +
    `9 — Kembali`,
  "order.issue.v1": () =>
    `Pilih kategori masalah:\n\n` +
    `0 — Customer Service\n` +
    `1 — Pengiriman / status\n` +
    `2 — Pembayaran\n` +
    `3 — Pembatalan / refund\n` +
    `4 — Barang salah\n` +
    `5 — Produk rusak\n` +
    `6 — Masalah kualitas\n` +
    `7 — Lainnya\n` +
    `9 — Kembali`,
  "order.guidance.v1": (ctx) =>
    `${String(ctx?.guidance ?? "")}\n\n` +
    `Status pesanan live hanya tersedia di marketplace. Untuk bantuan lebih lanjut:\n` +
    `0 — Customer Service`,
  "business.v1": () =>
    `Bisnis / B2B:\n\n` +
    `0 — Customer Service / Sales\n` +
    `1 — Sample\n` +
    `2 — Bulk ingredients\n` +
    `3 — Product development\n` +
    `4 — Wholesale / distributor\n` +
    `5 — Partnership / licensing\n` +
    `9 — Kembali`,
  "b2b.collect.v1": (ctx) =>
    `${String(ctx?.prompt ?? "Mohon informasikan:")}\n\n` +
    `0 — Hubungi tim sales`,
  "complaint.v1": () =>
    `Komplain — pilih kategori:\n\n` +
    `0 — Customer Service\n` +
    `1 — Produk rusak\n` +
    `2 — Barang salah\n` +
    `3 — Rasa/aroma/tampilan tidak biasa\n` +
    `4 — Masalah kemasan\n` +
    `5 — Keamanan pangan / reaksi buruk\n` +
    `6 — Lainnya\n` +
    `9 — Kembali`,
  "complaint.collect.v1": () =>
    `Terima kasih sudah menghubungi kami. Tim Customer Service akan membantu.\n` +
    `Jika ada, mohon siapkan info produk, channel pembelian, dan nomor pesanan.\n\n` +
    `0 — Customer Service`,
  "other.v1": () =>
    `Terima kasih sudah menghubungi Yubie. Tim Customer Service siap membantu.\n\n` +
    `0 — Customer Service`,
  "unknown.v1": (ctx) =>
    `Maaf, pilihan tidak dikenali.\n${String(ctx?.hint ?? "")}\n\n` +
    `Ketik nomor yang tersedia, *menu* untuk menu utama, atau *0* untuk Customer Service.`,
  "handoff.queued.v1": () =>
    `Permintaan Anda sudah diteruskan ke tim Customer Service Yubie. Mohon tunggu sebentar.`,
  "handoff.in_hours.v1": () =>
    `Baik, kami hubungkan ke Customer Service Yubie.`,
  "handoff.after_hours.v1": () =>
    `Pesanmu sudah diteruskan ke tim Yubie dan akan ditangani pada jam operasional berikutnya.`,
  "handoff.food_safety.v1": () =>
    `Terima kasih sudah memberi tahu. Tim Food Safety Yubie akan segera menindaklanjuti.`,
};

export function renderTemplate(templateId: string, ctx?: Record<string, unknown>): string {
  const fn = templates[templateId];
  if (!fn) throw new Error(`missing_template:${templateId}`);
  return fn(ctx);
}

export function listTemplateIds(): string[] {
  return Object.keys(templates);
}
