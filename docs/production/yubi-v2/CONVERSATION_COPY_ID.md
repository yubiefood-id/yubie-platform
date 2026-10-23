# Indonesian conversation copy

Generated from V2_COPY and B2B_COPY. Copy IDs below are stable documentation IDs;
runtime IDs select the node/fact/fallback as described per entry. Static text is
reviewable engineering copy; Product/Brand and Support operator acceptance remains
required. No final image or exact-SKU sensitive claim is approved by this document.

Every customer text ≤4096 UTF-16 units including footer; media caption ≤1024.
Approved fact summary ≤3900 before footer, otherwise unavailable. B2B inputs ≤256;
they appear only in consented private Sales notes, never echoed in public copy or
metrics. Product names, descriptions and variant rows come from the approved
catalog resolver. Yubi gives neutral promotion navigation and never reveals a code or grants
entitlement; the website resolves approved campaign eligibility server-side.

### v2.copy.home

Context: none. Base length: 362 UTF-16 units.
Runtime selection: V2_NODES.copy or processV2 guard; runtime effect ID is
v2.<lowercase node>, v2.fallback.<count>, or v2.fact.<category>.

```text
Halo! 👋 Aku Yubi, asisten virtual Yubie 💜

Aku bisa bantu kamu mengenal produk Yubie, melihat website resmi, atau menghubungkanmu ke tim kami.

1. 🛍️ Lihat Produk
2. 🌱 Tentang Yubie
3. 📦 Pesanan & Pengiriman
4. 🎁 Promo & Diskon
5. 💬 Bantuan & Komplain
6. 🤝 Bisnis & Partnership
0. 👩‍💻 Customer Service

Ketik angka pilihanmu atau ketik menu kapan saja.
```

### v2.copy.products

Context: none. Base length: 95 UTF-16 units.
Runtime selection: V2_NODES.copy or processV2 guard; runtime effect ID is
v2.<lowercase node>, v2.fallback.<count>, or v2.fact.<category>.

```text
Mau lihat produk Yubie yang mana? 💜

1. Yubie Flour
2. Yubie Shake
3. Yubie Ppang
4. Yubie Mie
```

### v2.copy.about

Context: none. Base length: 138 UTF-16 units.
Runtime selection: V2_NODES.copy or processV2 guard; runtime effect ID is
v2.<lowercase node>, v2.fallback.<count>, or v2.fact.<category>.

```text
Kenalan dengan Yubie 🌱

1. Cerita Yubie
2. Ubi ungu
3. Produk dan penggunaannya
4. Petunjuk penyiapan
5. Nutrisi & alergen
6. Sertifikasi
```

### v2.copy.orders

Context: none. Base length: 138 UTF-16 units.
Runtime selection: V2_NODES.copy or processV2 guard; runtime effect ID is
v2.<lowercase node>, v2.fallback.<count>, or v2.fact.<category>.

```text
Mau dibantu soal pesananmu? 📦

1. Lihat Status Pesanan
2. Alamat Pengiriman
3. Bantuan Pembayaran
4. Retur atau Refund
5. Masalah Pesanan
```

### v2.copy.order_unavailable

Context: none. Base length: 113 UTF-16 units.
Runtime selection: V2_NODES.copy or processV2 guard; runtime effect ID is
v2.<lowercase node>, v2.fallback.<count>, or v2.fact.<category>.

```text
Portal pesanan website belum tersedia untuk layanan ini. Tim Customer Service bisa membantu pertanyaan pesananmu.
```

### v2.copy.order_available

Context: none. Base length: 157 UTF-16 units.
Runtime selection: V2_NODES.copy or processV2 guard; runtime effect ID is
v2.<lowercase node>, v2.fallback.<count>, or v2.fact.<category>.

```text
Lihat status pesanan melalui akun yang kamu gunakan saat membeli:
https://yubiefood.com/account/orders

Yubi tidak membuka data pesanan pribadi melalui chat.
```

### v2.copy.address

Context: none. Base length: 178 UTF-16 units.
Runtime selection: V2_NODES.copy or processV2 guard; runtime effect ID is
v2.<lowercase node>, v2.fallback.<count>, or v2.fact.<category>.

```text
Alamat pengiriman diisi melalui website saat checkout tersedia. Untuk perubahan alamat pesanan yang sudah dibuat, hubungi Customer Service agar tim memeriksa status pemenuhannya.
```

### v2.copy.payment_unavailable

Context: none. Base length: 196 UTF-16 units.
Runtime selection: V2_NODES.copy or processV2 guard; runtime effect ID is
v2.<lowercase node>, v2.fallback.<count>, or v2.fact.<category>.

```text
Pembayaran website belum tersedia untuk layanan ini. Untuk kendala pembayaran pesanan yang sudah ada, hubungi Customer Service.

Yubi tidak meminta PIN, OTP, password, atau nomor kartu lewat chat.
```

### v2.copy.payment_available

Context: none. Base length: 169 UTF-16 units.
Runtime selection: V2_NODES.copy or processV2 guard; runtime effect ID is
v2.<lowercase node>, v2.fallback.<count>, or v2.fact.<category>.

```text
Lanjutkan pembelian melalui website resmi Yubie. Untuk kendala pembayaran, hubungi Customer Service.

Yubi tidak meminta PIN, OTP, password, atau nomor kartu lewat chat.
```

### v2.copy.promo

Context: none. Base length: 119 UTF-16 units.
Runtime selection: V2_NODES.copy or processV2 guard; runtime effect ID is
v2.<lowercase node>, v2.fallback.<count>, or v2.fact.<category>.

```text
Belum ada informasi promo aktif yang terverifikasi untuk chat ini. Kamu bisa melihat katalog resmi Yubie saat tersedia.
```

### v2.copy.support

Context: none. Base length: 139 UTF-16 units.
Runtime selection: V2_NODES.copy or processV2 guard; runtime effect ID is
v2.<lowercase node>, v2.fallback.<count>, or v2.fact.<category>.

```text
Kami bantu, ya 💜

1. Pertanyaan umum
2. Masalah pesanan / refund
3. Kualitas produk / kemasan
4. Keamanan pangan / reaksi setelah konsumsi
```

### v2.copy.support_faq

Context: none. Base length: 100 UTF-16 units.
Runtime selection: V2_NODES.copy or processV2 guard; runtime effect ID is
v2.<lowercase node>, v2.fallback.<count>, or v2.fact.<category>.

```text
Pilih bantuan yang kamu butuhkan:

1. Pesanan dan pengiriman
2. Informasi produk
3. Customer Service
```

### v2.copy.b2b

Context: none. Base length: 132 UTF-16 units.
Runtime selection: V2_NODES.copy or processV2 guard; runtime effect ID is
v2.<lowercase node>, v2.fallback.<count>, or v2.fact.<category>.

```text
Tertarik bekerja sama dengan Yubie? 🤝

1. Pembelian grosir
2. Reseller / distributor
3. Sampel / pengembangan produk
4. Partnership
```

### v2.copy.consent

Context: none. Base length: 200 UTF-16 units.
Runtime selection: V2_NODES.copy or processV2 guard; runtime effect ID is
v2.<lowercase node>, v2.fallback.<count>, or v2.fact.<category>.

```text
Boleh aku mencatat informasi singkat kebutuhan bisnismu untuk diteruskan ke tim Sales? Informasi ini hanya digunakan untuk menangani permintaanmu.

1. Ya, lanjut
2. Langsung ke tim Sales tanpa mengisi
```

### v2.copy.product_info

Context: none. Base length: 96 UTF-16 units.
Runtime selection: V2_NODES.copy or processV2 guard; runtime effect ID is
v2.<lowercase node>, v2.fallback.<count>, or v2.fact.<category>.

```text
Informasi produk:

1. Deskripsi produk
2. Petunjuk penyiapan
3. Nutrisi & alergen
4. Sertifikasi
```

### v2.copy.unavailable

Context: none. Base length: 144 UTF-16 units.
Runtime selection: V2_NODES.copy or processV2 guard; runtime effect ID is
v2.<lowercase node>, v2.fallback.<count>, or v2.fact.<category>.

```text
Informasi yang disetujui untuk pertanyaan ini belum tersedia. Aku tidak ingin memberikan informasi yang keliru. Ketik 0 untuk bantuan tim Yubie.
```

### v2.copy.product_unavailable

Context: none. Base length: 93 UTF-16 units.
Runtime selection: V2_NODES.copy or processV2 guard; runtime effect ID is
v2.<lowercase node>, v2.fallback.<count>, or v2.fact.<category>.

```text
Informasi produk ini belum tersedia untuk publikasi di chat. Ketik 0 untuk bantuan tim Yubie.
```

### v2.copy.media_unavailable

Context: none. Base length: 56 UTF-16 units.
Runtime selection: V2_NODES.copy or processV2 guard; runtime effect ID is
v2.<lowercase node>, v2.fallback.<count>, or v2.fact.<category>.

```text
Foto produk final yang disetujui belum tersedia di chat.
```

### v2.copy.migration

Context: none. Base length: 71 UTF-16 units.
Runtime selection: V2_NODES.copy or processV2 guard; runtime effect ID is
v2.<lowercase node>, v2.fallback.<count>, or v2.fact.<category>.

```text
Menu Yubi sudah diperbarui. Silakan pilih lagi dari menu berikut, ya 💜
```

### v2.copy.handoff

Context: none. Base length: 109 UTF-16 units.
Runtime selection: V2_NODES.copy or processV2 guard; runtime effect ID is
v2.<lowercase node>, v2.fallback.<count>, or v2.fact.<category>.

```text
Permintaan bantuanmu dicatat untuk tim Customer Service Yubie. Tim akan meninjau sesuai ketersediaan layanan.
```

### v2.copy.sales

Context: none. Base length: 137 UTF-16 units.
Runtime selection: V2_NODES.copy or processV2 guard; runtime effect ID is
v2.<lowercase node>, v2.fallback.<count>, or v2.fact.<category>.

```text
Permintaan bisnismu dicatat untuk tim Sales Yubie. Tim akan meninjau kebutuhanmu; harga, MOQ, dan syarat kerja sama perlu konfirmasi tim.
```

### v2.copy.safety

Context: none. Base length: 106 UTF-16 units.
Runtime selection: V2_NODES.copy or processV2 guard; runtime effect ID is
v2.<lowercase node>, v2.fallback.<count>, or v2.fact.<category>.

```text
Terima kasih sudah memberi tahu. Laporan keamanan produk ini dicatat untuk penanganan prioritas tim Yubie.
```

### v2.copy.after_hours

Context: none. Base length: 107 UTF-16 units.
Runtime selection: V2_NODES.copy or processV2 guard; runtime effect ID is
v2.<lowercase node>, v2.fallback.<count>, or v2.fact.<category>.

```text
Di luar jam operasional, permintaan tetap masuk antrean. Tim akan meninjau pada jam operasional berikutnya.
```

### v2.copy.unknown

Context: none. Base length: 106 UTF-16 units.
Runtime selection: V2_NODES.copy or processV2 guard; runtime effect ID is
v2.<lowercase node>, v2.fallback.<count>, or v2.fact.<category>.

```text
Aku belum mengenali pilihanmu. Pilih angka yang tersedia, ketik menu, atau ketik 0 untuk Customer Service.
```

### v2.copy.unknown_again

Context: none. Base length: 91 UTF-16 units.
Runtime selection: V2_NODES.copy or processV2 guard; runtime effect ID is
v2.<lowercase node>, v2.fallback.<count>, or v2.fact.<category>.

```text
Biar lebih mudah, ketik menu untuk pilihan utama atau 0 agar tim Customer Service membantu.
```

### v2.copy.unsupported

Context: none. Base length: 99 UTF-16 units.
Runtime selection: V2_NODES.copy or processV2 guard; runtime effect ID is
v2.<lowercase node>, v2.fallback.<count>, or v2.fact.<category>.

```text
Aku belum bisa membaca gambar atau pesan suara di chat ini. Ketik 0 untuk bantuan Customer Service.
```

### v2.footer

Appended to navigation and ordinary information replies (not handoff receipts).
Length: 61. No variables.

```text
9. Kembali
0. Customer Service
Ketik menu untuk menu utama.
```

### v2.b2b_collect.0

Runtime ID: v2.b2b_collect; collectIndex=0. Length: 25 before footer.
Dependency: consent=true, structured field order.

```text
Nama bisnis / brand kamu?
```

### v2.b2b_collect.1

Runtime ID: v2.b2b_collect; collectIndex=1. Length: 34 before footer.
Dependency: consent=true, structured field order.

```text
Kebutuhan bisnismu secara singkat?
```

### v2.b2b_collect.2

Runtime ID: v2.b2b_collect; collectIndex=2. Length: 27 before footer.
Dependency: consent=true, structured field order.

```text
Produk Yubie yang diminati?
```

### v2.b2b_collect.3

Runtime ID: v2.b2b_collect; collectIndex=3. Length: 22 before footer.
Dependency: consent=true, structured field order.

```text
Kota operasional kamu?
```

### v2.b2b_collect.4

Runtime ID: v2.b2b_collect; collectIndex=4. Length: 57 before footer.
Dependency: consent=true, structured field order.

```text
Perkiraan volume (opsional, ketik lewati untuk melewati)?
```

### v2.product_detail

Variables: product_name, approved_short_description, approved_variant_and_price_rows,
product_url, checkout_available. Resolver owns all data and the fixed-origin URL.
Approved final photo requires exact manifest hash and Product/Brand approval.
Absent photo prefixes v2.copy.media_unavailable. Unpublished product uses
v2.copy.product_unavailable. Caption ≤1024; fallback text ≤4096.

```text
{product_name}

{approved_short_description}

Varian:
{approved_variant_and_price_rows}

{product_url when catalog_available}

1. {Beli when checkout_available; otherwise Lihat} di Website
2. Info Produk
3. Lihat Produk Lain
{v2.footer}
```

### v2.website_handoff

Variables: product_url; catalog_available; checkout_available. Max 4096 with footer.
Requires accepted website artifact and exact allowlisted PDP. Missing evidence
uses v2.copy.product_unavailable. Selection labels follow the capability.

```text
Siap! 💜

{checkout_available: Kamu bisa memilih varian, jumlah, dan melanjutkan pembelian melalui website resmi Yubie.}
{otherwise: Kamu bisa melihat detail produk melalui katalog resmi Yubie. Checkout website belum tersedia untuk layanan ini.}

{product_url}
{v2.footer}
```

### v2.fact.<category>

Variables: approved_fact_summary. Scope is exact product ID or brand:yubie.
Only effective APPROVED_PUBLIC versions, string or summary field, are rendered.
Nutrition/allergen/preparation/certification require their own category evidence.
Missing evidence uses v2.copy.unavailable; unsupported category metric is bounded.

### v2.promo_menu.website_verification

Variables: account_available, catalog_available. Commerce V3 requires verified
website eligibility; chat never reveals a code/percentage or grants entitlement.
Max4096 including footer. Customer ownership/safety guards still run first.

```text
{account_available}
Kelayakan promo diperiksa melalui akun di website resmi Yubie. Verifikasi nomor diperlukan; Yubi tidak menerbitkan kode atau menjanjikan diskon lewat chat.
{otherwise}
Verifikasi promo melalui akun website belum tersedia untuk layanan ini. Yubi tidak menerbitkan kode atau menjanjikan diskon lewat chat.
{https://yubiefood.com/products only when catalog_available}
{v2.footer}
```

Handoff receipt variants use v2.copy.handoff/sales/safety, optionally append
v2.copy.after_hours from the existing business-hours configuration. These acknowledge
a durable request, never an agent's acceptance. Human-owned/OFF → no customer copy.
