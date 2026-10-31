# Paket Verifikasi Merchant iPaymu — Halaman Legal & Identitas Usaha

Tanggal: 2026-10-31 (UTC) · Cabang: `feat/ipaymu-merchant-compliance-pages` · Dokumen ini adalah paket operator untuk pengajuan verifikasi merchant iPaymu serta gerbang rilis yang menyertainya.

## 1. Status (harus dibaca dulu)

| Tahap | Status | Bukti |
|---|---|---|
| IMPLEMENTED | YA — 5 halaman legal + footer + link checkout + modul identitas | Kode pada cabang fitur |
| TESTED | YA — `npm run check` hijau; `test:catalog` terverifikasi; e2e mock+catalog lulus | log CI pada PR |
| MERGED | Menunggu review + 5 check PR | tautan PR (lihat laporan sesi) |
| RC | `commerce-release-<SHA>` setelah merge + approval staging | workflow release-candidate |
| DEPLOYED | BELUM — terblokir gerbang identitas + approval rilis frontend terpisah | lihat §4 |
| IPAYMU-READY | BELUM — menunggu identitas terisi, deploy, dan verifikasi URL publik | lihat §6 |

Prinsip: halaman tidak dinyatakan "live" hanya karena build hijau. Deploy storefront adalah aksi operator terpisah sesuai `docs/production/2026-10-26/CONTROLLED_RELEASE.md`.

## 2. Nilai yang diisikan ke form verifikasi iPaymu

1. FAQ: `https://yubiefood.com/faq`
2. Terms & Conditions: `https://yubiefood.com/terms`
3. Refund Policy: `https://yubiefood.com/refund-policy`
4. Contact: `https://yubiefood.com/contact`
5. Kotak "aplikasi mobile": **TIDAK dicentang** — Yubie adalah situs web, bukan aplikasi Android/iOS native.

Catatan untuk reviewer iPaymu (tempelkan bila form menyediakan kolom keterangan):

- Katalog dan harga produk (Rupiah) dapat dilihat publik di `https://yubiefood.com/products` dan halaman tiap produk — 4 keluarga produk, 9 varian ukuran/pack.
- Checkout tersedia sebagai tamu (tanpa akun): pilih produk → keranjang → isi kontak & pengiriman → total terverifikasi server → diarahkan ke halaman pembayaran iPaymu.
- Bila saat pengecekan pembayaran baru sedang dinonaktifkan sementara (pemeliharaan/keselamatan transaksi), halaman checkout menampilkan status "Checkout belum tersedia" secara jujur — pengujian pembayaran dapat diatur dengan tim Yubie lewat email resmi.

## 3. Audit jumlah produk & harga (persyaratan merchant iPaymu)

Jangan berasumsi 4 keluarga = cukup; iPaymu menilai katalog produk nyata. Kondisi publik saat ini: **9 varian dapat dibeli** dengan harga IDR tertera:

| Produk | Varian | SKU | Harga |
|---|---|---|---|
| Yubie Flour | 250 g | YBF-250 | Rp35.000 |
| Yubie Flour | 1 kg | YBF-1000 | Rp120.000 |
| Yubie Shake | 1 sachet 45 g | YBS-045 | Rp19.500 |
| Yubie Shake | Pack 7 sachet | YBS-7X45 | Rp129.000 |
| Yubie Ppang | 1 Mini 35 g | YBP-MINI-035 | Rp9.000 |
| Yubie Ppang | 1 Maxi | YBP-MAXI | Rp19.000 |
| Yubie Ppang | Pack 5 Mini | YBP-MINI-5 | Rp42.000 |
| Yubie Mie | 1 bungkus 75 g | YBM-075 | Rp16.000 |
| Yubie Mie | Pack 3 bungkus | YBM-3X75 | Rp45.000 |

Bila reviewer menghendaki jumlah SKU tampil lebih banyak, opsinya adalah menambah varian katalog lewat proses persetujuan produk (bukan menyalin halaman).

## 4. Gerbang DEPLOY — data identitas yang masih dibutuhkan dari owner

Halaman sudah merender identitas secara bersyarat. Lima field wajib berikut masih `null` di `apps/web/config/merchant-identity.ts` dan **tidak boleh dikarang**:

1. Nama badan usaha — persis seperti profil merchant iPaymu.
2. Jenis badan usaha (PT/CV/UD/Perorangan).
3. Alamat usaha terdaftar lengkap (termasuk kode pos bila ada).
4. Nomor telepon layanan pelanggan (+ format `tel:+62…`).
5. Jam layanan pelanggan (mis. "Senin–Jumat, 09.00–17.00").
6. (Opsional) Nomor WhatsApp bisnis resmi — **bukan** link komunitas.

Langkah owner (setelah data siap):

1. Edit `apps/web/config/merchant-identity.ts`; isi kelima field dengan `provenance: "owner-approved-ipaymu-profile"` dan `verifiedAt` tanggal konfirmasi.
2. Pastikan `legalPolicy.effectiveDate` = tanggal peresmian yang diinginkan (default tercantum `2026-11-02`).
3. Jalankan `npm run build --workspace @yubie/web && npm run verify:merchant-identity --workspace @yubie/web`. Gate harus menjawab `MERCHANT_IDENTITY_GATE: OK` (exit 0).
4. Commit (`feat(web): owner-verified merchant identity`), PR, tunggu 5 check hijau, merge.
5. Lanjut ke §5.

Keamanan: jangan menyalin-buat commit berisi dokumen identitas (KTP, dsb.). Yang disimpan hanya nilai publik di atas. Jangan pernah menaruh VA/API key di file ini.

## 5. Runbook rilis storefront (setelah identitas lengkap)

1. Pastikan PR identitas sudah merge dan 5 check (`quality`, `persistence`, `security`, `browser`, `containers`) hijau di `main`.
2. Terbitkan RC: jalankan workflow `release-candidate.yml` untuk SHA `main` → approval lingkungan `staging` → artifact `commerce-release-<SHA>` terbit.
3. Minta **approval frontend terpisah** untuk digest sumber/artifact persis (aturan CONTROLLED_RELEASE — approval RC tidak mencakup deploy).
4. Dari checkout bersih SHA tersebut:
   1. `npm ci`
   2. `npm run build --workspace @yubie/web` (profil `DIRECT_COMMERCE_PRODUCTION` via script build)
   3. `npm run verify:merchant-identity --workspace @yubie/web` → harus `OK`
   4. `cd apps/web && npx wrangler deploy -c wrangler.prod.jsonc` (wrangler 4.151.0; pertahankan `yubie-web-production`, kedua custom domain, binding `ASSETS`).
5. Jangan menyentuh: `COMMERCE_PROVIDER`, `IPAYMU_*`, `YUBIE_CHECKOUT_ADMISSION`, callback, DNS. Pembayaran tetap aktif apa adanya — deploy halaman legal bukan aktivasi pembayaran.
6. Rollback bila perlu: deploy ulang versi worker terverifikasi sebelumnya dengan wrangler + config yang sama (lihat `docs/production/2026-10-24/ROLLBACK.md` §R3). Jangan mengubah DNS/domain.

## 6. Verifikasi pasca-deploy (wajib sebelum klaim IPAYMU-READY)

Untuk setiap URL `https://yubiefood.com/{faq,terms,refund-policy,contact,privacy}`:

1. HTTP 200 tanpa login.
2. Judul & canonical benar (`… · Yubie`).
3. Footer menampilkan: email, telepon terverifikasi, alamat usaha terdaftar, wilayah.
4. `/contact` menampilkan 5 field identitas (nama badan, jenis, alamat, telepon, jam layanan).
5. Nilai alamat/telepon identik di `/contact`, `/terms`, `/refund-policy`, dan footer (bisa sekalian jalankan gate terhadap domain publik).
6. Checkout menampilkan kalimat persetujuan + tautan S&K/Privasi/Refund sebelum tombol bayar.
7. Tanpa error konsol peramban; uji lebar 320px/375px/768px/1024px/1440px.
8. Catat: SHA, versi worker, digest artifact, waktu UTC verifikasi — masukkan ke receipt `docs/production/<tanggal>/…`.

## 7. Asumsi legal untuk direview (catatan PR)

1. **PP 80/2019 Pasal 69** ditafsirkan sebagai hak pembatalan transaksi yang memenuhi syarat paling lambat 2 hari kerja sejak barang diterima, dengan pengecualian menurut peraturan — BUKAN fasilitas retur produk pangan tanpa alasan. Kalimat pada halaman refund sengaja menyerahkan tafsir final kepada perlindungan konsumen bila berbeda. **Perlu konfirmasi peninjau hukum/owner.**
2. **Timeline refund** (respon ≤1×24 jam kerja; investigasi ≤3 hari kerja; eksekusi ≤5 hari kerja; settlement estimasi) disetujui owner pada 2026-10-31 sesuai kemampuan nyata (refund manual, full-refund only, dual approval Finance).
3. **FAQPage JSON-LD sengaja tidak ditambahkan** — Google membatasi FAQ rich results ke situs pemerintah/kesehatan otoritatif; structured data Organization saja yang dipakai, hanya dengan data terverifikasi.
4. Tidak ada klaim sertifikasi/halal/BPOM/gizi baru; batas klaim lama tetap berlaku pada semua halaman baru.
5. Refund tetap proses merchant/Finance — tidak ada status REFUNDED palsu, tidak ada perubahan state uang, tidak ada panggilan PSP baru.
