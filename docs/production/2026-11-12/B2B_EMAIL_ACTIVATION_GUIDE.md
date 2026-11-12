# Panduan Aktivasi Email Enquiry B2B — Notifikasi ke hello@yubiefood.com

Tanggal: 2026-11-12 · Prasyarat: hosting email Namecheap Private Email untuk domain yubiefood.com sudah aktif (MX `mx1/mx2.privateemail.com`). Kode fitur sudah di-deploy **fail-closed** — tanpa konfigurasi SMTP, tidak ada email yang dikirim, form tetap jalan dan data enquiry tetap tersimpan aman di database (menunggu di antrean, tidak hilang).

> **Gate sebelum aktivasi:** pastikan *controlled release* yang menyertakan pemetaan `B2B_EMAIL_DELIVERY` dan seluruh `SMTP_*` ke **worker** pada `infrastructure/docker-compose.prod.yml` sudah deployed. Release PR #93 sebelumnya mengaktifkan kode namun **belum meneruskan env ke container worker**. Jangan hanya menambah env lalu recreate worker dengan compose lama: email akan tetap dormant. Jangan mengedit rendered compose production secara manual karena dilindungi chain-of-custody release.

Setelah aktivasi: setiap submit form `/b2b` otomatis mengirim **(1)** email notifikasi berisi semua isian form ke `hello@yubiefood.com` (Reply-To = email pengirim, tinggal tekan Reply untuk menjawab) dan **(2)** email tanda terima otomatis ke bisnis yang mengisi form.

## Bagian A — Siapkan mailbox khusus di Namecheap (jangan pakai akun pribadi)

1. Login ke Namecheap → menu **Private Email** (atau https://privateemail.namecheap.com/ ) dengan akun admin domain.
2. Periksa kuota mailbox dalam subscription terlebih dahulu. Mailbox tambahan **mungkin berbayar**; alias bukan mailbox terisolasi dengan autentikasi sendiri. Buat mailbox khusus mesin (setup → **Mail** → create mailbox):
   - Email: **`enquiry@yubiefood.com`**
   - Password: buat password master yang kuat untuk mailbox, lalu login ke https://privateemail.com/ → **Settings → Launch Security Center → App passwords → Create new password**. Beri label misalnya `yubie-production-worker`; simpan password aplikasi sekali tampil sebagai `SMTP_PASSWORD` (jangan tempel ke chat, GitHub, atau log). Di pengaturan **Connect third-party apps**, pastikan SMTP aktif.
3. (Disarankan) Di pengaturan mailbox, aktifkan **DKIM** untuk domain (Email → Authentication/DKIM → enable, lalu pastikan record DNS yang diminta sudah ada di Cloudflare DNS). Ini meningkatkan kepercayaan inbox untuk email tanda terima ke pelanggan. Tidak memblokir aktivasi jika dilewati.
4. Cek kuota pengiriman mailbox (Private Email punya limit per jam per mailbox). Volume enquiry B2B sangat kecil; batas bawaan cukup.
5. Simpan nilai-nilai berikut untuk Bagian B:
   - `SMTP_USER` = `enquiry@yubiefood.com`
   - `SMTP_PASSWORD` = application password untuk SMTP (sesuai pengaturan Private Email Anda)
   - `SMTP_HOST` = `mail.privateemail.com` (hostname resmi; `smtp.privateemail.com` adalah alternatif), `SMTP_PORT` = `465`

## Bagian B — Pasang konfigurasi di VPS (butuh nilai dari Bagian A)

> PENTING: `B2B_EMAIL_DELIVERY=enabled` HARUS diset BERSAMA semua variabel SMTP. Kalau hanya sebagian, worker akan menolak start (fail-closed by design) — itu memang perilaku amannya.

### B0. Pre-flight konektivitas (sekali saja)

1. SSH ke VPS: `ssh yubie-vps`.
2. Tes port keluar: `nc -zv mail.privateemail.com 465` → harus `succeeded`/`open`. (Kalau gagal, hentikan di sini dan laporkan — jangan lanjut.)

### B1. Aktifkan pengiriman email

1. Masih di VPS, edit env produksi: `sudo nano /etc/yubie/production.env` — tambahkan blok:
   ```text
   B2B_EMAIL_DELIVERY=enabled
   SMTP_HOST=mail.privateemail.com
   SMTP_PORT=465
   SMTP_USER=enquiry@yubiefood.com
   SMTP_PASSWORD=<SMTP_PASSWORD>
   B2B_ENQUIRY_EMAIL_FROM=enquiry@yubiefood.com
   B2B_ENQUIRY_NOTIFY_TO=hello@yubiefood.com
   B2B_ENQUIRY_ACK=enabled
   ```
2. Pastikan rendered compose yang baru benar-benar memuat `B2B_EMAIL_DELIVERY` dan `SMTP_PASSWORD` **di bawah `worker.environment`**, tanpa menampilkan nilainya. Jika tidak ada, **STOP**: controlled release compose fix belum diterapkan.
3. Recreate container **WORKER saja**, wajib dengan project name dan env-file (API, postgres, admission & pembayaran tidak disentuh):
   ```bash
   cd /opt/yubie/production
   sudo docker compose -p yubie-prod --env-file /etc/yubie/production.env -f docker-compose.prod.yml up -d --no-deps worker
   ```
4. Periksa status efektif tanpa mencetak rahasia:
   ```bash
   sudo docker exec yubie-prod-worker-1 node -e "console.log('B2B_EMAIL_CONFIG=' + (process.env.B2B_EMAIL_DELIVERY === 'enabled' && !!process.env.SMTP_HOST && !!process.env.SMTP_USER && !!process.env.SMTP_PASSWORD ? 'READY' : 'NOT_READY'))"
   ```
   Wajib menunjukkan `B2B_EMAIL_CONFIG=READY`.
5. Verifikasi worker hidup dengan fitur aktif:
   `sudo docker logs --since 2m yubie-prod-worker-1 2>&1 | grep worker.started`
   → harus muncul `worker.started` (bukan `worker.config_error`; kalau config_error, berarti ada variabel yang kurang/typo — periksa lagi langkah 1).

### B2. Verifikasi end-to-end dengan enquiry uji

1. Buka https://yubiefood.com/b2b , isi form dengan data uji (mis. nama "Tes Aktivasi", bisnis "Tes Bakery", email yang bisa Anda cek inbox-nya, produk "Yubie Flour") → tekan kirim.
2. Dalam ±1 menit, cek dua kotak masuk:
   - **hello@yubiefood.com**: email berjudul `[B2B Enquiry] …` berisi seluruh isian form; tombol Reply di mailbox harus otomatis tertuju ke email pengirim.
   - **inbox email uji**: email `Terima kasih — enquiry B2B Anda sudah kami terima`.
3. Kalau belum sampai setelah ±5 menit: `sudo docker logs --since 10m yubie-prod-worker-1 2>&1 | grep -i growth` untuk melihat error (jangan sembarang retry konfigurasi tanpa membaca error-nya).

### B3. (Opsional) Kirim enquiry lama yang belum ternotifikasi

**Perhatikan dua generasi enquiry:** enquiry yang masuk **setelah** deploy PR #93 sudah memiliki dua event email dan akan di-drain setelah fitur aktif. Enquiry yang masuk **sebelum** PR #93 hanya punya event lead lama, sehingga **tidak** otomatis mendapat email tanpa backfill. Lakukan backfill hanya untuk lead yang consent-nya sah, dengan pemeriksaan deduplikasi dan operator approval. Untuk menotifikasikan secara selektif:

1. Di VPS: `sudo docker exec -it yubie-prod-postgres-1 psql -U yubie_prod -d yubie`
2. Lihat daftar: `SELECT id, business, created_at FROM b2b_leads WHERE created_at > now() - interval '30 days' ORDER BY created_at DESC;`
3. Untuk setiap id yang mau dikirim (ganti `<ID>`; satu baris per enquiry, dedupe bawaan mencegah dobel):
   `INSERT INTO outbox_events (id, event_type, aggregate_type, aggregate_id, schema_version, payload_json, dedupe_key, status, available_at, attempt_count) VALUES ('outbox_backfill_' || substr(md5(random()::text),1,12), 'growth.b2b_enquiry_email_requested', 'b2b_lead', '<ID>', 1, json_build_object('leadId','<ID>')::text, 'b2b_enquiry_email:<ID>', 'pending', now(), 0);`
4. Tunggu ±1 menit (drain otomatis), lalu ulangi verifikasi ala B2. Keluar psql dengan `\q`.

## Bagian C — Batasan, biaya, dan rollback

- **Rate limit sudah terpasang di kode**: maks 3 enquiry per email pengirim per jam, 50 per jam global, plus honeypot anti-bot. Email tidak bisa dijadikan saluran spam oleh orang luar.
- **Email tanda terima ke pelanggan** memakai mailbox yang sama; gagal kirim tanda terima TIDAK membatalkan enquiry (notifikasi ke hello@ adalah jalur utama).
- **Biaya**: menggunakan hosting Namecheap yang ada, **namun mailbox tambahan dapat berbayar** bila kuota subscription habis.
- **Matikan fitur (rollback)**: di `/etc/yubie/production.env` ubah `B2B_EMAIL_DELIVERY=disabled` lalu `cd /opt/yubie/production && sudo docker compose -p yubie-prod --env-file /etc/yubie/production.env -f docker-compose.prod.yml up -d --no-deps worker`. Enquiry yang masuk saat fitur mati tetap tersimpan dan mengantre; akan terkirim saat diaktifkan lagi.
- **Jangan** mengubah DNS apex/web — fitur ini tidak menyentuh DNS situs.
