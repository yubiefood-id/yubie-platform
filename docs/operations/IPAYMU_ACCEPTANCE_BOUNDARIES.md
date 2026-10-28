# Batas bukti penerimaan iPaymu

Dokumentasi resmi diperiksa kembali 28 Oktober 2026. Tidak ada charge, sesi
payable, pembelian, atau refund produksi yang dibuat dalam implementasi admin.

[Redirect Payment resmi](https://docs.ipaymu.com/id/docs/payment/redirect-payment)
menjelaskan hosted checkout, POST `/api/v2/payment`, kredensial per environment,
signature request, referenceId dan URL return/notify/cancel. Adapter tetap
menggunakan hosted Redirect Payment dan memverifikasi jumlah baris server.

[Callback resmi](https://docs.ipaymu.com/id/docs/callback) mendokumentasikan
X-Signature dengan VA sebagai kunci, normalisasi JSON/form, angka/boolean,
additional_info, pengurutan key dan escaped slash. Implementasi mempertahankan
verifikasi constant-time, durable notification inbox sebelum acknowledgement,
lookup authoritative dan deduplikasi. Pengujian lokal mencakup signature salah,
duplicate/out-of-order, amount/reference/merchant mismatch dan kegagalan storage.
Contoh resmi tidak memberikan signature penuh yang bisa dipakai sebagai oracle
byte-for-byte; vector lokal tidak dinyatakan sebagai acceptance provider nyata.

[Validasi IP/domain resmi](https://docs.ipaymu.com/en/docs/ip-domain-validation)
memerlukan IP statis server dan domain aplikasi terdaftar pada lingkungan live.
Keberhasilan balance read tidak membuktikan semua URL checkout diterima merchant.

## Bukti yang tersedia dan yang belum tersedia

| Sumbu | Bukti / batas |
|---|---|
| Autentikasi produksi | Receipt pemilik 27 Oktober 07:04:47 UTC: balance HTTP/provider 200, identitas cocok; tidak diulang dan saldo tidak disimpan |
| Runtime produksi | API/worker 3d533079, provider ipaymu, admission disabled, pasangan secret hadir; hanya metadata/aggregate dibaca |
| Keamanan callback | Penolakan signature salah dan kontrak lokal diuji; callback provider positif nyata belum diterima |
| Rekonsiliasi Finance | Lookup per ID memakai port authenticated provider; pending belum expired tetap diperiksa; outage tetap retryable |
| Provenance | Poll dicatat sebagai ipaymu.poll / payment-reconciliation, bukan callback bertanda tangan |
| Refund | Catatan manual tidak mengubah status uang; konfirmasi membutuhkan refund authoritative dan Finance berbeda; tidak restock otomatis |
| Outcome create unknown | Tidak ada retry create otomatis; identity dan reservasi ditahan. Kemampuan lookup reference/session dan pembatalan harus dibuktikan pada kontrak merchant sebelum dinyatakan siap |
| Acceptance nyata | Hosted session, callback sukses, crash/recovery dan settlement/Finance nyata masih BLOCKED_EXTERNAL |
| Pilot | Memerlukan stock/QC, shipping sah, pembeli merchant, batas nominal/jumlah, periode UTC dan prosedur Finance yang disetujui |

Kesimpulan kode bukan otorisasi live. Jangan mengubah signature untuk menerima
payload yang gagal, mengubah provider ke preview selama recovery, atau memakai
poll/test lokal sebagai bukti callback/sandbox positif. Gerbang merchant, biaya
transaksi, refund owner, data fisik, pengiriman dan release tetap independen.
