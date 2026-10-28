# Operasi Yubie: intake, persetujuan, dan pekerjaan harian

PostgreSQL tetap menjadi sumber kebenaran. Workbook hanya alat penyiapan intake.
Dashboard privat memakai aplikasi Google staf terpisah, cookie HttpOnly 15 menit,
CSRF, pemeriksaan Origin, dan hak staf yang dibaca ulang dari database. Dashboard
tidak menerima kredensial iPaymu, token proxy pelanggan, atau akses ERPNext.

## Intake awal

Target pemilik sudah diterima: **20 unit fisik per keluarga, 80 total**.
Usulan Flour 15×250g + 5×1kg, Shake 20 sachet, Ppang 15 mini + 5 maxi, dan Mie
20 satuan belum merupakan verifikasi stok. Kapasitas multipack berasal dari
komponen yang sama, bukan tambahan unit: Shake 7 sachet, Ppang 5 mini, Mie 3 satuan.
Pengemasan independen tetap memerlukan persetujuan fisik tersendiri.

Siapkan salinan baru; berkas sumber dan sepuluh lembar aslinya dipertahankan:

```bash
python3 -m venv /tmp/yubie-intake
/tmp/yubie-intake/bin/pip install -r scripts/operations/requirements.txt
/tmp/yubie-intake/bin/python scripts/operations/workbook_intake.py prepare \
  /path/workbook-asli.xlsx --output /path/intake-PENDING.xlsx
```

Isi hanya fakta asli pada empat lembar tambahan. Kolom **Usulan (bukan stok)**
tidak dipakai untuk menghitung stok. Konfirmasi setiap mode SKU dan referensi
pengemasan; isi kuantitas fisik terkonfirmasi, lot, UOM, expiry, bukti/nama QC,
saldo tersedia database, dan waktu hitung. Hitung tidak mencakup stok yang sudah
direservasi. Satu lot hanya boleh muncul sekali. Bundle derived tidak boleh
memiliki lot independen. `initial_inventory` mensyaratkan total 20 per keluarga;
`operational_count` untuk hitung ulang berikutnya tidak mengembalikan stok ke 20.

Waktu hitung wajib asli, UTC, dan tidak lebih dari 15 menit saat penerapan.
Jika pemeriksaan membutuhkan waktu lebih lama, hitung ulang; jangan memperbarui
timestamp tanpa hitung fisik. `VERIFIED` adalah pernyataan operator berdasarkan
bukti nyata, bukan hasil otomatis dari spreadsheet.

```bash
/tmp/yubie-intake/bin/python scripts/operations/workbook_intake.py convert \
  /path/intake-terverifikasi.xlsx --scope inventory --output /path/intake.json
```

Konverter menolak proposal JSON, placeholder, formula pada lembar intake,
macro/external links, SKU/lot duplikat, konversi salah, dan jumlah fisik yang
tidak cocok. JSON diuji dengan Zod serta domain yang sama dengan server. Tidak
ada koneksi database atau payment dari konverter. SHA-256 workbook disimpan
sebagai provenance; bukti asli tetap harus direview manusia.

Di **Lot dan stok**, unggah JSON → dry-run → ajukan draft. QC berbeda membaca
bukti lengkap di **Persetujuan**, lalu menyetujui. Operator menerapkan versi
yang disetujui saat admission checkout dinonaktifkan. Perubahan stok, ledger,
audit, outbox, dan receipt idempotensi commit bersama. Hitung yang sama memakai
identitas operasi yang sama; mencoba ulang tidak menambah stok lagi.

## Pengiriman

Kabupaten Bogor / free_promotional IDR 0 masih **usulan**, bukan cakupan aktif.
Isi kota/kabupaten yang disetujui, layanan/batas wilayah, penanggung biaya,
waktu mulai/akhir, pemberi persetujuan dan referensi asli. Hanya kebijakan
free_promotional dengan ongkir 0 didukung schema ini. Ongkir berbayar memerlukan
implementasi dan review baru. Tidak ada fallback pengiriman gratis nasional.

Form **Pengiriman** membuat draft. Finance berbeda menyetujui, kemudian operator
menerapkan saat checkout beku. Alternatif konversi lembar pengiriman:

```bash
/tmp/yubie-intake/bin/python scripts/operations/workbook_intake.py convert \
  /path/intake-terverifikasi.xlsx --scope shipping --output /path/pengiriman.json
```

Output berisi daftar request terverifikasi; setiap persetujuan tetap melalui
workflow server. Berkas konversi tidak otomatis menulis database.

## Peran dan pekerjaan harian

| Peran | Kewenangan utama |
|---|---|
| viewer | Pesanan tanpa data pengiriman pribadi, stok, pengiriman, ringkasan |
| operator | Draft/penerapan stok dan pengiriman, catatan internal |
| qc | Review/persetujuan stok, pemeriksaan QC dan audit |
| fulfillment | Data pengiriman yang diperlukan, packing, resi, delivered |
| finance | Pembayaran, pengecualian, rekonsiliasi, pengiriman, refund penuh |
| admin | Hak staf, audit, ringkasan; tidak otomatis memiliki izin QC/Finance |

Satu staf dapat memiliki beberapa peran. Pembuat dan penyetuju stok/pengiriman/
refund harus berbeda. Pencabutan hak berlaku untuk cookie aktif dan percobaan
ulang receipt. Admin tidak boleh mengubah hak dirinya sendiri atau menghapus
admin terakhir. Bootstrap staf awal menggunakan dokumen pemilik yang asli dan
CLI operator privat; tidak ada akun staf bawaan.

Fulfillment: buka ID pesanan → packing → packed → shipped dengan kurir/resi →
delivered. Status pembayaran, jumlah, mata uang, hold, recall, dan expiry
diperiksa server. Tidak ada tombol paksa lunas. Catatan internal tidak masuk
payload notifikasi pelanggan.

Finance: antrekan rekonsiliasi hanya menjalankan pencarian status yang sudah
ada; tidak membuat sesi payable. Triage merupakan catatan penanganan, bukan
penghapusan financial exception. Status resolved ditolak selama ledger belum
konsisten. Refund hanya penuh dan manual: ajukan → Finance kedua setuju →
handoff → catat referensi merchant → konfirmasi Finance berbeda setelah status
refund provider tercermin pada ledger. Pencatatan manual tidak mengirim uang,
tidak memaksa status `refunded`, dan tidak merestok barang. Jika provider belum
memberikan bukti refund yang dapat direkonsiliasi, kasus tetap terbuka.

Ringkasan memakai hari bisnis Asia/Jakarta. Angka pembayaran adalah **status
terkini pembayaran yang dibuat pada tanggal tersebut**, bukan settlement bank
harian. Stok tersedia sudah dikurangi reservasi; jangan menguranginya dua kali.
Outbox internal memakai lease dan retry terbatas; kegagalan tidak diakui sukses.

## Fakta yang masih harus diisi pemilik/operator

| Bidang | Data yang belum tersedia |
|---|---|
| Stok | Alokasi fisik SKU sebenarnya; mode kemasan dan referensi persetujuan |
| Lot/QC | Lot, UOM, expiry, waktu hitung, saldo tersedia, bukti/nama rilis QC |
| Pengiriman | Kota/cakupan, penanggung biaya, periode berlaku, referensi persetujuan |
| Staf | Client Google khusus staf dan named subject/peran yang disetujui |
| Pembayaran | Bukti sesi hosted, callback positif, recovery/settlement; penanggung jawab refund dan Finance |
| Pilot uang nyata | Batas nominal/jumlah transaksi, pelaksana, dan prosedur rekonsiliasi Finance yang disetujui |

Total keluarga tidak perlu dikonfirmasi ulang. Autentikasi balance iPaymu dan
provider switch yang telah berhasil tidak membuktikan penerimaan checkout.
Checkout tetap disabled sampai seluruh gerbang independen terpenuhi.
