# Runbook Onboarding Nomor WhatsApp Business 085282141733 (+62 852-8214-1733)

**Status:** OWNER_ACTIONS_REQUIRED — semua kode siap (PR #89 + pass operator-AI); langkah di bawah ini hanya bisa dilakukan OWNER dari web/HP, bukan dari repo.
**Tujuan akhir:** bot deterministik Yubi aktif di nomor ini via Zammad; AI pelanggan TETAP nonaktif; AI operator (GLM z.ai) aktif untuk staf.

> Prinsip: setiap TAHAP punya "Tanda Selesai". Jangan lanjut sebelum tandanya terpenuhi.
> Semua login pakai akun owner (mAsyamJ). Jangan pernah menaruh token/password di chat atau Git — selalu pakai baris perintah satu-linu di TAHAP 5.

---

## TAHAP 0 — Pre-check nomor di HP (5 menit)

1. Buka **WhatsApp** (bukan WhatsApp Business) atau **WhatsApp Business** di HP tempat nomor 085282141733 dipakai.
2. Cek: Settings → Business tools / Pengaturan bisnis. Jika ada profil bisnis aktif → nomor SEDANG terdaftar di aplikasi.
3. **Keputusan (wajib):**
   - **3a. Lanjut dengan nomor ini** → setelah TAHAP 2, aplikasi di HP akan BERHENTI berfungsi untuk nomor ini (chat pindah ke Zammad + bot). Jalankan TAHAP 2 di jam sepi (mis. di luar 09:00–17:00).
   - **3b. Pakai nomor lain dulu untuk staging** (disarankan jika ragu) → ulangi runbook ini dengan nomor staging; nomor utama baru menyusul.
4. Catat juga: apakah nomor ini terdaftar dengan Google Drive backup (untuk cadangan riwayat sebelum migrasi — backup tidak ikut pindah ke Zammad).

**Tanda Selesai:** keputusan 3a/3b sudah dipilih dan dicatat.

## TAHAP 1 — Meta Business Manager + Aplikasi (15–30 menit; skip jika sudah ada)

1. Buka https://business.facebook.com → login dengan akun Facebook owner.
2. Klik **Create an account / Buat akun** → isi: Business name: `Yubie Food Indonesia` (samakan dengan badan usaha resmi), email owner, nama owner.
3. Verifikasi email masuk dari Meta.
4. Di Business Settings → **Security Center** → mulai **Business Verification** ( uploads: KTP/NPWP badan usaha, alamat, dokumen usaha). Verifikasi bisa 1–3 hari — LANJUTKAN tahap lain sambil menunggu.
5. Ke https://developers.facebook.com → **My Apps → Create App** → tipe **Business** → nama: `Yubie Production` → buat.
6. Di dashboard app, tambahkan produk **WhatsApp** (WhatsApp Business API).

**Tanda Selesai:** punya Business Manager ID (angka, di Business Settings → Business info) + App ID.

## TAHAP 2 — WABA + Registrasi Nomor (20–30 menit, TIDAK bisa dibatalkan mudah — pastikan TAHAP 0 sudah diputuskan)

1. Dalam app Meta (TAHAP 1 langkah 6) → tab **WhatsApp → Getting Started**.
2. Buat/temukan **WhatsApp Business Account (WABA)**: nama `Yubie Food`.
3. Bagian **Phone numbers → Add phone number**:
   - Country: `Indonesia (+62)`, nomor: `85282141733` (tanpa awalan 0).
   - Verifikasi via **SMS/telepon ke nomor itu** (nomor harus aktif menerima SMS/call saat ini).
   - Tampilkan nama bisnis: `Yubie` (profile name sesuai merek).
4. Selesaikan **Business verification** bila diminta (dari TAHAP 1 langkah 4).
5. **Payment method**: WhatsApp Manager → account overview → tambahkan metode pembayaran (kartu). Percakapan pelanggan-initiated (service window 24 jam) yang dibalas ≤24 jam umumnya gratis; template marketing/utility berbayar — cukup isi saldo kecil dulu.
6. Setelah nomor tampil **Connected/Active**: di HP, aplikasi lama untuk nomor ini otomatis terputus.

**Tanda Selesai:** nomor berstatus Connected di WhatsApp Manager, dan Test message bawaan Meta (di tab WhatsApp → API Setup) berhasil dikirim/diterima di HP lain.

## TAHAP 3 — Token Cloud API (5 menit)

1. Masih di tab **WhatsApp → API Setup**: salin **Phone number ID** dan **WhatsApp Business Account ID** (catat di tempat aman pribadi — BUKAN di repo).
2. **Settings → Basic** di app: buat/hapus-rilis **System User token**? — Untuk Zammad native cukup token dari API Setup **temporary token** untuk uji; untuk produksi buat token permanen:
   - Business Settings → **Users → System users → Add** → nama `zammad-production`, role `Admin`.
   - **Generate token** → beri izin `whatsapp_business_messaging`, `whatsapp_business_management` → salin token (hanya sekali tampil).

**Tanda Selesai:** punya 3 nilai: Phone number ID, WABA ID, token permanen System User.

## TAHAP 4 — Zammad channel + webhook (20–30 menit, di UI Zammad)

1. Login `https://support.yubiefood.com` sebagai admin → **Admin → Channels → WhatsApp** (butuh Zammad 7.1 — sudah sesuai pin).
2. Connect dengan akun Meta (login Facebook owner, izinkan app) → pilih WABA `Yubie Food` + nomor `+62 852-8214-1733`.
3. Setelah tersambung, buka **Admin → Triggers / Webhook**: tambah **Webhook** baru:
   - Endpoint: `https://bot-staging.yubie.id/webhooks/zammad` (staging dulu).
   - Method POST; beri **token bearer** (nilai acak ≥32 karakter — simpan sementara untuk TAHAP 5).
   - Event: article created + ticket updated.
4. Pastikan grup & prioritas ada: jalankan `npm run zammad:provision` dari repo (dry-run dulu: `ZAMMAD_BASE_URL=… ZAMMAD_API_TOKEN=… npm run zammad:provision -- --dry-run`). Grup yang harus ada: `Yubie Bot Queue`, `Customer Support`, `Sales / Partnership`, `Food Safety` + prioritas tinggi.
5. Buat atribut tiket `yubie_bot_mode` (Text) bila belum ada (Admin → Objects → Ticket).

**Tanda Selesai:** Webhook tersimpan di Zammad; provision check lulus semua.

## TAHAP 5 — Provision secrets di VPS (per secret: 1 baris perintah)

Untuk SETIAP nilai di bawah, jalankan SATU baris di VPS (jangan multi-baris — paste blok bisa tertelan `read`). Pola:

```
sudo bash -c 'read -r -s -p "ZAMMAD_WEBHOOK_BEARER: " V && [ -n "$V" ] || { echo KOSONG; exit 1; } && printf "%s" "$V" > /etc/yubie/secrets/ZAMMAD_WEBHOOK_BEARER && chmod 600 /etc/yubie/secrets/ZAMMAD_WEBHOOK_BEARER && echo OK'
```

Nilai yang perlu di-provision (nama file sesuai):
1. `ZAMMAD_WEBHOOK_SECRET` atau `ZAMMAD_WEBHOOK_BEARER` (dari TAHAP 4 langkah 3)
2. `ZAMMAD_API_TOKEN` (token System User dari TAHAP 3 — untuk worker)
3. `OPS_API_TOKEN` (token ops yang sudah dipakai — pastikan sama di api/worker)
4. `ZAI_API_KEY` (dari TAHAP 6)
5. `ZAMMAD_GROUP_*` dan `ZAMMAD_PRIORITY_HIGH` — ID angka dari provision (TAHAP 4)

Setelah semua masuk, minta engineering sesi berikutnya memasangkannya ke compose env staging (`SUPPORT_PROVIDER=zammad` + `--profile bot`).

**Tanda Selesai:** `sudo ls /etc/yubie/secrets/` menampilkan semua nama file di atas.

## TAHAP 6 — Kunci z.ai untuk AI operator (10 menit)

1. Buka https://z.ai → login akun owner → masuk **API / Open Platform** (api.z.ai — INI yang dipakai backend; berbeda dari langganan chat/Coding Plan desktop).
2. Buat **API key** baru: nama `yubie-ops-copilot`. Salin sekali (simpan tempat aman pribadi).
3. Isi saldo kecil (mis. USD 5) — pemakaian operator sangat kecil (ringkasan/draf).
4. Model default yang dipakai kode: `glm-4.6` (bisa diganti `OPS_AI_MODEL=glm-4.5-air` untuk lebih murah).
5. Provision ke VPS: baris `ZAI_API_KEY` di TAHAP 5.

**Tanda Selesai:** key aktif di dashboard z.ai + file `ZAI_API_KEY` ada di VPS.

## TAHAP 7 — Validasi staging (engineering + owner)

1. Engineering deploy staging dengan `--profile bot` + env lengkap.
2. Jalankan harness: `node scripts/whatsapp/validate-channel.mjs` → semua baris harus PASS.
3. **Uji fisik (owner, satu-satunya langkah HP):**
   1. Dari HP pribadi (nomor lain), kirim `menu` ke 085282141733.
   2. Harapan: balasan menu Yubi dalam <1 menit; tiket muncul di Zammad.
   3. Di Zammad, ambil alih tiket (assign ke diri) → balas sebagai agen.
   4. Harapan: balasan manusia sampai ke HP; bot TIDAK ikut membalas selama manusia aktif.
   4b. Coba kirim pesan berisi kata "busuk"/"jamur" → harus langsung rute Food Safety.
4. Owner kirim hasil (screenshot/timestamp) ke engineering → engineering verifikasi server-side (tiket, artikel bot, mode state).

**Tanda Selesai:** round-trip fisik tercatat + receipt staging ditulis.

## TAHAP 8 — Rilis produksi terkendali (engineering, butuh GO owner)

1. Owner bilang "GO produksi" tercatat (chat/disposisi).
2. Engineering jalankan alur rilis standar repo (RC image → CI hijau → migrate → deploy `--profile bot` produksi).
3. Aktifkan fitur SATU-SATU bertahap: (a) bot deterministik mode shadow → auto; (b) AI operator `POST /ops/ai/…` enable; (c) pelanggan AI **TETAP OFF** (default).
4. Pasca-rilis: pantau `/ops/whatsapp/status` + metrik 48 jam.

**Tanda Selesai:** receipt DEPLOYED_LIVE ditulis.

## ROLLBACK (jika ada masalah)

- **Bot terlalu aktif / salah balas:** `POST /ops/assistant/emergency-off` (semua otomasi pelanggan berhenti seketika; tim tetap bisa membalas dari Zammad).
- **Kembali ke aplikasi HP:** di WhatsApp Manager, hapus nomor dari WABA → daftarkan ulang nomor di aplikasi WhatsApp Business HP (verifikasi ulang SMS). Catatan: riwayat chat lama TIDAK kembali (backup Drive lama tidak menyusul) — pertimbangkan export dulu.
- **AI operator bermasalah:** set `ops_ai_enabled=false` (atau hapus `ZAI_API_KEY` dari env lalu restart api) — pelanggan tidak terdampak sama sekali.
