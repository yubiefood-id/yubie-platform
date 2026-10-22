export const V2_VERSION = "deterministic-v2";
export interface V2Node {
  parent: string;
  copy: string;
  choices: Record<string, string>;
}
const node = (parent: string, copy: string, choices: Record<string,string> = {}): V2Node => ({parent,copy,choices});
export const V2_NODES: Record<string,V2Node> = {
  HOME: node("HOME","home",{"1":"PRODUCT_MENU","2":"ABOUT_MENU","3":"ORDER_MENU","4":"PROMO_MENU","5":"SUPPORT_MENU","6":"B2B_MENU"}),
  PRODUCT_MENU: node("HOME","products",{"1":"PRODUCT_DETAIL","2":"PRODUCT_DETAIL","3":"PRODUCT_DETAIL","4":"PRODUCT_DETAIL"}),
  PRODUCT_DETAIL: node("PRODUCT_MENU","product",{"1":"WEBSITE_HANDOFF","2":"PRODUCT_INFO","3":"PRODUCT_MENU"}),
  PRODUCT_INFO: node("PRODUCT_DETAIL","product_info",{"1":"product_description","2":"product_preparation","3":"product_nutrition_allergens","4":"product_certification"}),
  WEBSITE_HANDOFF: node("PRODUCT_DETAIL","website"),
  ABOUT_MENU: node("HOME","about",{"1":"story","2":"root_education","3":"applications","4":"preparation","5":"nutrition_allergens","6":"certification"}),
  ABOUT_DETAIL: node("ABOUT_MENU","fact"),
  ORDER_MENU: node("HOME","orders",{"1":"ORDER_PORTAL","2":"ADDRESS_GUIDANCE","3":"PAYMENT_GUIDANCE","4":"HUMAN_HANDOFF","5":"HUMAN_HANDOFF"}),
  ORDER_PORTAL: node("ORDER_MENU","order_unavailable"),
  ADDRESS_GUIDANCE: node("ORDER_MENU","address"),
  PAYMENT_GUIDANCE: node("ORDER_MENU","payment_unavailable"),
  PROMO_MENU: node("HOME","promo"),
  SUPPORT_MENU: node("HOME","support",{"1":"SUPPORT_FAQ","2":"HUMAN_HANDOFF","3":"HUMAN_HANDOFF","4":"FOOD_SAFETY_HANDOFF"}),
  SUPPORT_FAQ: node("SUPPORT_MENU","support_faq",{"1":"ORDER_MENU","2":"PRODUCT_MENU","3":"HUMAN_HANDOFF"}),
  B2B_MENU: node("HOME","b2b",{"1":"B2B_CONSENT","2":"B2B_CONSENT","3":"B2B_CONSENT","4":"B2B_CONSENT"}),
  B2B_CONSENT: node("B2B_MENU","consent",{"1":"B2B_COLLECT","2":"SALES_HANDOFF"}),
  B2B_COLLECT: node("B2B_MENU","collect"),
  HUMAN_HANDOFF: node("HOME","handoff"),
  FOOD_SAFETY_HANDOFF: node("HOME","safety"),
  SALES_HANDOFF: node("B2B_MENU","sales"),
};

export const V2_COPY: Record<string,string> = {
  home: "Halo! 👋 Aku Yubi, asisten virtual Yubie 💜\n\nAku bisa bantu kamu mengenal produk Yubie, melihat website resmi, atau menghubungkanmu ke tim kami.\n\n1. 🛍️ Lihat Produk\n2. 🌱 Tentang Yubie\n3. 📦 Pesanan & Pengiriman\n4. 🎁 Promo & Diskon\n5. 💬 Bantuan & Komplain\n6. 🤝 Bisnis & Partnership\n0. 👩‍💻 Customer Service\n\nKetik angka pilihanmu atau ketik menu kapan saja.",
  products: "Mau lihat produk Yubie yang mana? 💜\n\n1. Yubie Flour\n2. Yubie Shake\n3. Yubie Ppang\n4. Yubie Mie",
  about: "Kenalan dengan Yubie 🌱\n\n1. Cerita Yubie\n2. Ubi ungu\n3. Produk dan penggunaannya\n4. Petunjuk penyiapan\n5. Nutrisi & alergen\n6. Sertifikasi",
  orders: "Mau dibantu soal pesananmu? 📦\n\n1. Lihat Status Pesanan\n2. Alamat Pengiriman\n3. Bantuan Pembayaran\n4. Retur atau Refund\n5. Masalah Pesanan",
  order_unavailable: "Portal pesanan website belum tersedia untuk layanan ini. Tim Customer Service bisa membantu pertanyaan pesananmu.",
  order_available: "Lihat status pesanan melalui akun yang kamu gunakan saat membeli:\nhttps://yubiefood.com/account/orders\n\nYubi tidak membuka data pesanan pribadi melalui chat.",
  address: "Alamat pengiriman diisi melalui website saat checkout tersedia. Untuk perubahan alamat pesanan yang sudah dibuat, hubungi Customer Service agar tim memeriksa status pemenuhannya.",
  payment_unavailable: "Pembayaran website belum tersedia untuk layanan ini. Untuk kendala pembayaran pesanan yang sudah ada, hubungi Customer Service.\n\nYubi tidak meminta PIN, OTP, password, atau nomor kartu lewat chat.",
  payment_available: "Lanjutkan pembelian melalui website resmi Yubie. Untuk kendala pembayaran, hubungi Customer Service.\n\nYubi tidak meminta PIN, OTP, password, atau nomor kartu lewat chat.",
  promo: "Belum ada informasi promo aktif yang terverifikasi untuk chat ini. Kamu bisa melihat katalog resmi Yubie saat tersedia.",
  support: "Kami bantu, ya 💜\n\n1. Pertanyaan umum\n2. Masalah pesanan / refund\n3. Kualitas produk / kemasan\n4. Keamanan pangan / reaksi setelah konsumsi",
  support_faq: "Pilih bantuan yang kamu butuhkan:\n\n1. Pesanan dan pengiriman\n2. Informasi produk\n3. Customer Service",
  b2b: "Tertarik bekerja sama dengan Yubie? 🤝\n\n1. Pembelian grosir\n2. Reseller / distributor\n3. Sampel / pengembangan produk\n4. Partnership",
  consent: "Boleh aku mencatat informasi singkat kebutuhan bisnismu untuk diteruskan ke tim Sales? Informasi ini hanya digunakan untuk menangani permintaanmu.\n\n1. Ya, lanjut\n2. Langsung ke tim Sales tanpa mengisi",
  product_info: "Informasi produk:\n\n1. Deskripsi produk\n2. Petunjuk penyiapan\n3. Nutrisi & alergen\n4. Sertifikasi",
  unavailable: "Informasi yang disetujui untuk pertanyaan ini belum tersedia. Aku tidak ingin memberikan informasi yang keliru. Ketik 0 untuk bantuan tim Yubie.",
  product_unavailable: "Informasi produk ini belum tersedia untuk publikasi di chat. Ketik 0 untuk bantuan tim Yubie.",
  media_unavailable: "Foto produk final yang disetujui belum tersedia di chat.",
  migration: "Menu Yubi sudah diperbarui. Silakan pilih lagi dari menu berikut, ya 💜",
  handoff: "Permintaan bantuanmu dicatat untuk tim Customer Service Yubie. Tim akan meninjau sesuai ketersediaan layanan.",
  sales: "Permintaan bisnismu dicatat untuk tim Sales Yubie. Tim akan meninjau kebutuhanmu; harga, MOQ, dan syarat kerja sama perlu konfirmasi tim.",
  safety: "Terima kasih sudah memberi tahu. Laporan keamanan produk ini dicatat untuk penanganan prioritas tim Yubie.",
  unknown: "Aku belum mengenali pilihanmu. Pilih angka yang tersedia, ketik menu, atau ketik 0 untuk Customer Service.",
  unknown_again: "Biar lebih mudah, ketik menu untuk pilihan utama atau 0 agar tim Customer Service membantu.",
  unsupported: "Aku belum bisa membaca gambar atau pesan suara di chat ini. Ketik 0 untuk bantuan Customer Service.",
};

export const B2B_FIELDS = ["company","need","product","city","volume"] as const;
export const B2B_COPY = ["Nama bisnis / brand kamu?","Kebutuhan bisnismu secara singkat?","Produk Yubie yang diminati?","Kota operasional kamu?","Perkiraan volume (opsional, ketik lewati untuk melewati)?"];
export const navigationFooter = "\n\n9. Kembali\n0. Customer Service\nKetik menu untuk menu utama.";
